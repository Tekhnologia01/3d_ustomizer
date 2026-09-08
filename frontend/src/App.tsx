import React, { useState, useEffect, useRef } from 'react';
import { useParams, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type { Product, DesignZone } from './types';
import ProductCustomizer, { type CustomizationData } from './components/ProductCustomizer';
import SetupPage from './components/SetupPage';
import ProductManager from './components/ProductManager';
import ClientManager from './components/ClientManager';
import MemberManager from './components/MemberManager';
import UserProfile from './components/UserProfile';
import Login from './components/Login';
import { apiFetch } from './utils/apiConfig';
import './admin-theme.css';

// ------ Client context -----------------------------------------------------------------------
interface ClientInfo {
  slug: string;
  name?: string;
  primary_color?: string;
  isEmbed: boolean;
}

// ------ Inner app logic (shared between embed & standalone) ----------------------------------------------
function AppShell({ clientInfo, onLogout }: { clientInfo: ClientInfo, onLogout?: () => void }) {
  type Page = 'gallery' | 'setup' | 'customizer' | 'manage-products' | 'manage-clients' | 'manage-members' | 'user-profile';
  const [currentPage, setCurrentPage] = useState<Page>('setup');
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [zones, setZones] = useState<DesignZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 2800);
  };

  // Apply brand colour if provided
  useEffect(() => {
    if (clientInfo.primary_color) {
      document.documentElement.style.setProperty('--brand-color', clientInfo.primary_color);
    }
  }, [clientInfo.primary_color]);

  // Fetch product list scoped to client
  const location = useLocation();

  const fetchProducts = () => {
    const url = clientInfo.slug
      ? `/api/products/?client=${clientInfo.slug}`
      : '/api/products/';

    apiFetch(url)
      .then(res => res.json())
      .then(data => { setProducts(data); setLoading(false); })
      .catch(err => {
        console.error('Error fetching products:', err);
        showToast(' Failed to load products.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProducts();
  }, [clientInfo.slug]);

  const hasPendingTripo = products.some(p => p.tripo_status === 'pending');
  useEffect(() => {
    if (!hasPendingTripo) return;

    const intervalId = setInterval(() => {
      fetchProducts();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(intervalId);
  }, [hasPendingTripo, clientInfo.slug]);

  useEffect(() => {
    if (!clientInfo.isEmbed || products.length === 0 || selectedProduct) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const requestedProductId = params.get('product_id');
    const requestedExternalId = params.get('external_product_id');
    const requestedEmbedToken = params.get('embed_token');

    let matched = undefined as Product | undefined;
    if (requestedProductId) {
      matched = products.find(p => String(p.id) === requestedProductId);
    }
    if (!matched && requestedExternalId) {
      matched = products.find(p => p.external_product_id === requestedExternalId);
    }
    if (!matched && requestedEmbedToken) {
      matched = products.find(p => p.embed_token === requestedEmbedToken);
    }

    // If there is only one product and no identifier was supplied, auto-open it.
    if (!matched && clientInfo.isEmbed && products.length === 1) {
      matched = products[0];
    }

    if (matched) {
      handleSelectProduct(matched);
    }
  }, [clientInfo.isEmbed, location.search, products, selectedProduct]);

  useEffect(() => {
    if (clientInfo.isEmbed && currentPage !== 'gallery' && currentPage !== 'customizer') {
      setCurrentPage('gallery');
    }
  }, [clientInfo.isEmbed, currentPage]);

  const handleSelectProduct = (prod: Product) => {
    if (!clientInfo.isEmbed) {
      setCurrentPage('setup');
      return;
    }

    setLoading(true);
    setSelectedProduct(prod);

    apiFetch(`/api/zones/${prod.id}/`)
      .then(res => res.json())
      .then(data => {
        const parsedZones = (data.zones || []).map((z: any) => ({
          ...z,
          point3d: typeof z.point3d === 'string' ? JSON.parse(z.point3d) : z.point3d,
          normal3d: typeof z.normal3d === 'string' ? JSON.parse(z.normal3d) : z.normal3d,
          size3d: typeof z.size3d === 'string' ? JSON.parse(z.size3d) : z.size3d,
        }));
        setZones(parsedZones);
        setCurrentPage('customizer');
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching zones:', err);
        setZones([]);
        setCurrentPage('customizer');
        setLoading(false);
      });
  };

  const goSetup = () => {
    setCurrentPage('setup');
    setSelectedProduct(null);
    setZones([]);
  };

  // ── "Finish Design" handler – sends snapshot to parent via postMessage ─────
  const handleFinishDesign = async (data: CustomizationData) => {
    const payload = {
      event: 'DESIGN_COMPLETE',
      clientSlug: clientInfo.slug,
      productId: selectedProduct?.id,
      productName: selectedProduct?.name,
      designPreviewUrl: data.snapshotDataUrl,
      pdfSpecSheetDataUrl: data.pdfDataUrl,
      configuration: {
        colorName: data.colorName,
        colorHex: data.colorHex,
        imprintMethod: data.imprintMethod,
        imprintColor: data.imprintColor,
        pmsNumber: data.pmsNumber,
        // quantity: data.quantity,
      },
    };

    // Persist the design submission to the backend for order/preview tracking.
    try {
      const response = await apiFetch('/api/design-submissions/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        console.error('Design submission failed:', error);
      }
    } catch (error) {
      console.error('Error saving design submission:', error);
    }

    if (window.opener && window.opener !== window) {
      window.opener.postMessage(payload, '*');
      showToast('Design sent to cart!');
      setTimeout(() => window.close(), 1500); // Close popup after a delay
    } else if (window.parent !== window) {
      window.parent.postMessage(payload, '*');
      showToast('Design sent to cart!');
    } else {
      showToast('Design saved successfully.');
    }
  };

  return (
    <>
      {/* Header — hidden in embed mode for a clean iframe */}
      {!clientInfo.isEmbed && currentPage !== 'customizer' && (
        <header>
          <span className="logo" onClick={goSetup}>Neura 3D</span>
          <nav>
            <span className={`nav-link ${currentPage === 'setup' ? 'active' : ''}`} onClick={goSetup}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18m9-9H3"></path></svg> Setup Zones
            </span>
            <span className={`nav-link ${currentPage === 'manage-products' ? 'active' : ''}`} onClick={() => setCurrentPage('manage-products')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> Products
            </span>
            <span className={`nav-link ${currentPage === 'manage-clients' ? 'active' : ''}`} onClick={() => setCurrentPage('manage-clients')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Clients
            </span>
            <span className={`nav-link ${currentPage === 'manage-members' ? 'active' : ''}`} onClick={() => setCurrentPage('manage-members')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> Members
            </span>
            {onLogout && (
              <div className="profile-dropdown-container">
                <span className={`nav-link ${currentPage === 'user-profile' ? 'active' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Profile
                </span>
                <div className="profile-dropdown-menu">
                  <div className="dropdown-item" onClick={() => setCurrentPage('user-profile')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    Settings
                  </div>
                  <div className="dropdown-item dropdown-item-danger" onClick={() => setShowSignOutConfirm(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Sign Out
                  </div>
                </div>
              </div>
            )}
          </nav>
        </header>
      )}

      <div className={`app ${['customizer', 'manage-products'].includes(currentPage) ? 'app--customizer' : ''} ${['setup', 'manage-products', 'manage-clients', 'manage-members', 'user-profile'].includes(currentPage) ? 'app--admin' : ''} ${clientInfo.isEmbed ? 'app--embed' : ''}`}>
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Loading...</p>
          </div>
        )}

        {currentPage === 'setup' && !clientInfo.isEmbed && !loading && (
          <SetupPage
            products={products}
            showToast={showToast}
            onBack={goSetup}
          />
        )}

        {currentPage === 'customizer' && selectedProduct && !loading && (
          <ProductCustomizer
            product={selectedProduct}
            zones={zones}
            onBack={goSetup}
            showToast={showToast}
            isEmbed={clientInfo.isEmbed}
            clientName={clientInfo.name}
            onFinishDesign={handleFinishDesign}
          />
        )}

        {currentPage === 'manage-products' && !clientInfo.isEmbed && !loading && (
          <ProductManager
            products={products}
            onBack={goSetup}
            showToast={showToast}
            onProductsChange={setProducts}
          />
        )}
        {currentPage === 'manage-clients' && !clientInfo.isEmbed && !loading && (
          <ClientManager
            onBack={goSetup}
            showToast={showToast}
          />
        )}
        {currentPage === 'manage-members' && !clientInfo.isEmbed && !loading && (
          <MemberManager
            onBack={goSetup}
            showToast={showToast}
          />
        )}
        {currentPage === 'user-profile' && !clientInfo.isEmbed && !loading && (
          <UserProfile
            onBack={goSetup}
            showToast={showToast}
            onLogout={() => setShowSignOutConfirm(true)}
          />
        )}
      </div>

      {showSignOutConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSignOutConfirm(false)}>
          <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', maxWidth: '380px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '6px solid #f8717122', marginBottom: '16px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#0f172a', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>Ready to leave?</h2>
            <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, fontFamily: 'Inter, sans-serif' }}>Are you sure you want to sign out of your dashboard? You will need to sign back in to access these tools.</p>
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600, color: '#475569', fontSize: '0.875rem', transition: 'all 0.15s ease' }} onClick={() => setShowSignOutConfirm(false)}>Cancel</button>
              <button style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.15s ease', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }} onClick={onLogout}>Sign Out</button>
            </div>
          </div>
        </div>
      )}


      {toastMsg && <div className="toast-msg">{toastMsg}</div>}
    </>
  );
}

//  Embed route: /embed/:clientSlug 
function EmbedApp() {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    slug: clientSlug || '',
    isEmbed: true,
  });

  // Fetch client branding info
  useEffect(() => {
    if (!clientSlug) return;
    apiFetch(`/api/client/${clientSlug}/`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setClientInfo({
            slug: clientSlug,
            name: data.name,
            primary_color: data.primary_color,
            isEmbed: true,
          });
        }
      })
      .catch(() => { /* use defaults */ });
  }, [clientSlug]);

  return <AppShell clientInfo={clientInfo} />;
}

// Standalone (admin) app 
function StandaloneApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));

  useEffect(() => {
    const handleLogout = () => setIsAuthenticated(false);
    window.addEventListener('auth-logout', handleLogout);
    return () => window.removeEventListener('auth-logout', handleLogout);
  }, []);

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const handleManualLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
  };

  const clientInfo: ClientInfo = { slug: '', isEmbed: false };
  return <AppShell clientInfo={clientInfo} onLogout={handleManualLogout} />;
}

//  Root: handle both routes 
export default function App() {
  return (
    <Routes>
      <Route path="/embed/:clientSlug/*" element={<EmbedApp />} />
      <Route path="/*" element={<StandaloneApp />} />
    </Routes>
  );
}

