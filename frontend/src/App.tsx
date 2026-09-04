import React, { useState, useEffect, useRef } from 'react';
import { useParams, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type { Product, DesignZone } from './types';
import ProductCustomizer, { type CustomizationData } from './components/ProductCustomizer';
import SetupPage from './components/SetupPage';
import ProductManager from './components/ProductManager';
import ClientManager from './components/ClientManager';

import { apiFetch } from './utils/apiConfig';

// ------ Client context -----------------------------------------------------------------------
interface ClientInfo {
  slug: string;
  name?: string;
  primary_color?: string;
  isEmbed: boolean;
}

// ------ Inner app logic (shared between embed & standalone) ----------------------------------------------
function AppShell({ clientInfo }: { clientInfo: ClientInfo }) {
  type Page = 'gallery' | 'setup' | 'customizer' | 'manage-products' | 'manage-clients';
  const [currentPage, setCurrentPage] = useState<Page>('setup');
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

            {currentPage !== 'setup' && (
              <span className="nav-link nav-setup" onClick={goSetup}>
                Setup Zones
              </span>
            )}
            {currentPage !== 'manage-products' && (
              <span className="nav-link nav-manage" onClick={() => setCurrentPage('manage-products')}>
                Manage Products
              </span>
            )}
            {currentPage !== 'manage-clients' && (
              <span className="nav-link nav-manage" onClick={() => setCurrentPage('manage-clients')}>
                Manage Clients
              </span>
            )}
          </nav>
        </header>
      )}

      <div className={`app ${['customizer', 'manage-products'].includes(currentPage) ? 'app--customizer' : ''} ${clientInfo.isEmbed ? 'app--embed' : ''}`}>
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
      </div>


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
  const clientInfo: ClientInfo = { slug: '', isEmbed: false };
  return <AppShell clientInfo={clientInfo} />;
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

