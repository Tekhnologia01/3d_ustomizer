import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Product, SetupZone } from '../types';
import { getSideImageUrl, resolveImageUrl, preloadProductImages } from '../utils/productImages';
import SetupThreePreview from './SetupThreePreview';
import { Loader2 } from 'lucide-react';

interface Props {
  products: Product[];
  showToast: (msg: string) => void;
  onBack: () => void;
}

// ── Types ────────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SetupViewMode = 'both' | '2d' | '3d';
type ZoneMode = 'logo' | 'text' | 'combined';
type ZoneFilter = 'all' | '2d' | '3d';

const SIDES = ['front', 'back', 'left', 'right', 'top'] as const;
const MODE_OPTIONS: { value: ZoneMode; label: string }[] = [
  { value: 'logo', label: 'Imprint' },
  { value: 'text', label: 'Text' },
  { value: 'combined', label: 'Combined' },
];

const GLOBAL_KEY = '__global__';
const RESULT_CAP = 40;

// ── Component ────────────────────────────────────────────────────────────────

const CornerBrackets = () => {
  const size = '20%';
  const thick = '2px';
  const innerC = '#0D6E63';
  const outerShadow = '0 0 0 2px #ffffff';
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, width: size, maxWidth: 32, minWidth: 12, height: thick, background: innerC, boxShadow: outerShadow }} />
      <div style={{ position: 'absolute', top: 0, left: 0, height: size, maxHeight: 32, minHeight: 12, width: thick, background: innerC, boxShadow: outerShadow }} />

      <div style={{ position: 'absolute', top: 0, right: 0, width: size, maxWidth: 32, minWidth: 12, height: thick, background: innerC, boxShadow: outerShadow }} />
      <div style={{ position: 'absolute', top: 0, right: 0, height: size, maxHeight: 32, minHeight: 12, width: thick, background: innerC, boxShadow: outerShadow }} />

      <div style={{ position: 'absolute', bottom: 0, right: 0, width: size, maxWidth: 32, minWidth: 12, height: thick, background: innerC, boxShadow: outerShadow }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, height: size, maxHeight: 32, minHeight: 12, width: thick, background: innerC, boxShadow: outerShadow }} />

      <div style={{ position: 'absolute', bottom: 0, left: 0, width: size, maxWidth: 32, minWidth: 12, height: thick, background: innerC, boxShadow: outerShadow }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, height: size, maxHeight: 32, minHeight: 12, width: thick, background: innerC, boxShadow: outerShadow }} />
    </>
  );
};

export default function SetupPage({ products, showToast, onBack }: Props) {
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [currentSide, setCurrentSide] = useState<string>('front');
  const [mode, setMode] = useState<ZoneMode>('logo');
  const [zones, setZones] = useState<SetupZone[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [imagesReady, setImagesReady] = useState(false);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [preloadedImages, setPreloadedImages] = useState<Record<string, HTMLImageElement>>({});
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');

  // ── Client list + scalable product picker state ────────────────────────────
  const [clients, setClients] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [pickerClientKey, setPickerClientKey] = useState<string>('');
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => {
    fetch('/api/clients/')
      .then((res) => res.json())
      .then((data) => setClients(data || []))
      .catch((err) => {
        console.error('Failed to load clients:', err);
      });
  }, []);

  const clientsBySlug = useMemo(() => new Map(clients.map((c) => [c.slug, c])), [clients]);

  // Product counts per client — cheap to compute, used to label the client
  // dropdown and to warn the user before they search a huge catalogue.
  const clientOptions = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      const key = (p as any).client_slug || GLOBAL_KEY;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const known = clients
      .filter((c) => counts.has(c.slug))
      .map((c) => ({ key: c.slug, label: c.name, count: counts.get(c.slug) || 0 }));
    const unknown = Array.from(counts.keys())
      .filter((k) => k !== GLOBAL_KEY && !clientsBySlug.has(k))
      .map((slug) => ({ key: slug, label: slug, count: counts.get(slug) || 0 }));
    const all = [...known, ...unknown].sort((a, b) => a.label.localeCompare(b.label));
    if (counts.has(GLOBAL_KEY)) {
      all.push({ key: GLOBAL_KEY, label: 'Unassigned / Global', count: counts.get(GLOBAL_KEY) || 0 });
    }
    return all;
  }, [products, clients, clientsBySlug]);

  // Only compute + render matching products once the search is scoped enough
  // (a client picked, or a real search term) — never dump every product.
  const pickerHasScope = Boolean(pickerClientKey) || pickerSearch.trim().length >= 2;

  const pickerMatches = useMemo(() => {
    if (!pickerHasScope) return [];
    let list = products;
    if (pickerClientKey === GLOBAL_KEY) list = list.filter((p) => !(p as any).client_slug);
    else if (pickerClientKey) list = list.filter((p) => (p as any).client_slug === pickerClientKey);
    if (pickerSearch.trim()) {
      const q = pickerSearch.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, pickerClientKey, pickerSearch, pickerHasScope]);

  const pickerVisible = pickerMatches.slice(0, RESULT_CAP);
  const pickerTruncated = pickerMatches.length - pickerVisible.length;

  // ── 3D Selector state ──────────────────────────────────────────────────────
  const [select3DMode, setSelect3DMode] = useState(false);
  const [move3DMode, setMove3DMode] = useState(false);
  const [selectedZoneIndex, setSelectedZoneIndex] = useState<number | null>(null);
  const [zone3DWidth] = useState(30);
  const [zone3DHeight] = useState(30);

  const selectedProduct = products.find((p) => p.id === selectedId) ?? null;
  const selectedProductClientLabel = selectedProduct
    ? ((selectedProduct as any).client_slug
      ? clientsBySlug.get((selectedProduct as any).client_slug)?.name || (selectedProduct as any).client_slug
      : 'Unassigned / Global')
    : '';

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadProductZones = useCallback(async (productId: number) => {
    try {
      const res = await fetch(`/api/zones/${productId}/`);
      const data = await res.json();
      setZones(
        (data.zones || []).map((z: {
          side: string;
          zone_type: string;
          x_percent: number;
          y_percent: number;
          width_percent: number;
          height_percent: number;
          angle: number;
          source?: '2d' | '3d';
          name?: string;
        }) => ({
          side: (z.side || 'front') as string,
          type: z.zone_type as 'logo' | 'text' | 'combined',
          x: z.x_percent,
          y: z.y_percent,
          w: z.width_percent,
          h: z.height_percent,
          angle: z.angle || 0,
          source: z.source ?? '2d',
          actual_width: (z as any).actual_width ?? 12.0,
          actual_height: (z as any).actual_height ?? 12.0,
          name: z.name || '',
          point3d: (z as any).point3d,
          normal3d: (z as any).normal3d,
          size3d: (z as any).size3d,
        }))
      );
    } catch {
      setZones([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedProduct) {
      setImagesReady(false);
      setIsProductLoading(false);
      setPreloadedImages({});
      setDominantColor(null);
      return;
    }
    setImagesReady(false);
    setIsProductLoading(true);
    preloadProductImages(selectedProduct).then(({ images, dominantColor: color }) => {
      setPreloadedImages(images);
      setDominantColor(color);
      // Use setTimeout(0) to guarantee React flushes the loading state
      // before marking images as ready (cached images resolve synchronously
      // so without the timeout both state updates get batched into one render
      // and the spinner is never visible).
      setTimeout(() => {
        setImagesReady(true);
        setIsProductLoading(false);
      }, 0);
    });
  }, [selectedProduct]);

  // ── Product / side selection ───────────────────────────────────────────────

  const handleProductChange = (id: number | '') => {
    setSelectedId(id);
    setCurrentSide('front');
    setSaveState('idle');
    setSelect3DMode(false);
    if (id) loadProductZones(id as number);
    else setZones([]);
  };

  const selectProductFromPicker = (p: Product) => {
    handleProductChange(p.id);
    setPickerSearch('');
  };

  const changeProduct = () => {
    handleProductChange('');
    setPickerSearch('');
  };

  const handleSideChange = (side: string) => {
    setCurrentSide(side);
    // 3D rotation is handled inside SetupThreePreview via currentSide prop
  };

  // ── Zone manipulation ──────────────────────────────────────────────────────

  const deleteZone = (index: number) => {
    setZones((prev) => prev.filter((_, i) => i !== index));
    setSaveState('idle');
  };

  const updateZoneProp = (index: number, prop: keyof SetupZone, val: number) => {
    setZones((prev) => {
      const next = [...prev];
      const z = { ...next[index], [prop]: val };
      if (prop === 'x' || prop === 'w') z.x = Math.max(0, Math.min(100 - z.w, z.x));
      if (prop === 'y' || prop === 'h') z.y = Math.max(0, Math.min(100 - z.h, z.y));
      next[index] = z;
      return next;
    });
    setSaveState('idle');
  };

  const updateZoneAngle = (index: number, val: number) => {
    setZones((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], angle: val };
      return next;
    });
    setSaveState('idle');
  };

  const updateZoneName = (index: number, val: string) => {
    setZones((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: val };
      return next;
    });
    setSaveState('idle');
  };

  const clearAllZones = () => {
    setZones([]);
    setSaveState('idle');
    showToast('All zones cleared.');
  };

  const handleZonePlacedFrom3D = useCallback(
    (
      side: string, x: number, y: number, w: number, h: number,
      point3d?: [number, number, number],
      normal3d?: [number, number, number],
      size3d?: [number, number, number]
    ) => {
      const newZ = {
        side, type: mode, x, y, w, h, angle: 0,
        source: '3d' as const,
        actual_width: 12.0, actual_height: 12.0,
        point3d, normal3d, size3d,
        id: `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `${side.toUpperCase()} ${mode === 'logo' ? 'Imprint Area' : mode === 'combined' ? 'Combined Area' : 'Text Zone'}`,
      };
      setZones((prev) => {
        showToast(`${mode === 'logo' ? 'Imprint' : mode === 'text' ? 'Text' : 'Combined'} zone placed on ${side.toUpperCase()}.`);
        return [...prev, newZ];
      });
      setSaveState('idle');
    },
    [mode, showToast]
  );

  const handleZoneMovedFrom3D = useCallback(
    (
      zoneIndex: number,
      x: number, y: number,
      point3d?: [number, number, number],
      normal3d?: [number, number, number]
    ) => {
      setZones((prev) => {
        const next = [...prev];
        // zoneIndex is the index in the filtered 3D zones array, so we need to find the corresponding zone in the full array
        const zones3D = prev.filter(z => z.source === '3d');
        const targetZone = zones3D[zoneIndex];
        if (targetZone) {
          const originalIndex = prev.indexOf(targetZone);
          if (originalIndex !== -1) {
            next[originalIndex] = {
              ...next[originalIndex],
              x, y,
              point3d, normal3d,
            };
          }
        }
        return next;
      });
      setSaveState('idle');
    },
    []
  );

  // ── Viewport & 2D drawing state ───────────────────────────────────────────
  const [setupViewMode, setSetupViewMode] = useState<SetupViewMode>('both');
  const [isDrawing2D, setIsDrawing2D] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // ── 2D Image Drag-to-Draw Handler ──────────────────────────────────────────
  const handle2DMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgContainerRef.current) return;
    const rect = imgContainerRef.current.getBoundingClientRect();
    const startX = ((e.clientX - rect.left) / rect.width) * 100;
    const startY = ((e.clientY - rect.top) / rect.height) * 100;
    setIsDrawing2D(true);
    setDrawStart({ x: startX, y: startY });
    setDrawCurrent({ x: startX, y: startY });
  };

  const handle2DMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing2D || !imgContainerRef.current) return;
    const rect = imgContainerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setDrawCurrent({ x: currentX, y: currentY });
  };

  const handle2DMouseUp = () => {
    if (!isDrawing2D || !drawStart || !drawCurrent) return;
    setIsDrawing2D(false);
    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const w = Math.abs(drawCurrent.x - drawStart.x);
    const h = Math.abs(drawCurrent.y - drawStart.y);

    if (w > 3 && h > 3) {
      const newZ = {
        side: currentSide,
        type: mode,
        x,
        y,
        w,
        h,
        angle: 0,
        source: '2d' as const,
        actual_width: 12.0,
        actual_height: 12.0,
        name: `${currentSide.toUpperCase()} ${mode === 'logo' ? 'Imprint Area' : mode === 'combined' ? 'Combined Area' : 'Text Zone'}`
      };
      setZones((prev) => [...prev, newZ]);
      setSaveState('idle');
      showToast(`Drawn 2D setup zone on ${currentSide.toUpperCase()}`);
    }
    setDrawStart(null);
    setDrawCurrent(null);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveZones = async () => {
    if (!selectedId) {
      showToast('Select a product first');
      return;
    }
    setSaveState('saving');
    try {
      const res = await fetch('/api/save-zones/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedId,
          zones: zones.map((z) => ({
            side: z.side,
            zone_type: z.type,
            x_percent: z.x,
            y_percent: z.y,
            width_percent: z.w,
            height_percent: z.h,
            angle: z.angle ?? 0,
            source: z.source ?? '2d',
            name: z.name || '',
            actual_width: z.actual_width ?? 12.0,
            actual_height: z.actual_height ?? 12.0,
            point3d: z.point3d,
            normal3d: z.normal3d,
            size3d: z.size3d,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveState('saved');
        showToast(`${data.count} zone(s) saved.`);
      } else {
        setSaveState('error');
        showToast(`Error: ${data.error}`);
      }
    } catch {
      setSaveState('error');
      showToast('Network error saving zones');
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const sideZones = zones.filter((z) => z.side === currentSide);
  const zones2D = sideZones.filter((z) => z.source !== '3d');
  const zones3D = sideZones.filter((z) => z.source === '3d');
  const filteredZones = zoneFilter === 'all' ? sideZones : zoneFilter === '2d' ? zones2D : zones3D;

  const isSaveDisabled =
    !selectedId ||
    zones.length === 0 ||
    saveState === 'saving' ||
    saveState === 'saved';

  const saveLabel =
    saveState === 'saving' ? 'Saving…' :
      saveState === 'saved' ? 'Saved' :
        'Save zones';

  const currentImageUrl = selectedProduct ? getSideImageUrl(selectedProduct, currentSide) : '';

  // ── Render helpers ─────────────────────────────────────────────────────────

  const zoneTypeLabel = (t: string) => t === 'logo' ? 'Imprint area' : t === 'combined' ? 'Combined area' : 'Text zone';

  const renderZoneCard = (z: SetupZone, globalIndex: number) => (
    <div key={globalIndex} className="sp-zone-card">
      <div className="sp-zone-card-header">
        <span className={`sp-zone-dot ${z.type}`} />
        <span className="sp-zone-title">{zoneTypeLabel(z.type)}</span>
        <span className={`pm-tag ${z.source === '3d' ? 'pm-tag-accent' : ''}`}>{z.source === '3d' ? '3D' : '2D'}</span>
        <button type="button" className="pm-icon-btn sm danger" onClick={() => deleteZone(globalIndex)} aria-label="Delete zone">
          <CloseIcon />
        </button>
      </div>

      <div className="pm-field sp-zone-field">
        <input
          type="text"
          placeholder="View name (optional), e.g. Left chest"
          value={z.name || ''}
          onChange={(e) => updateZoneName(globalIndex, e.target.value)}
          className="pm-input pm-input-xs"
        />
      </div>

      <div className="sp-zone-sliders">
        {(['w', 'h', 'x', 'y'] as const).map((prop) => (
          <div key={prop} className="sp-slider-row">
            <label>{prop.toUpperCase()} <span>{z[prop].toFixed(0)}%</span></label>
            <input
              type="range"
              min={prop === 'x' || prop === 'y' ? 0 : 3}
              max={95}
              value={z[prop]}
              onChange={(e) => updateZoneProp(globalIndex, prop, parseFloat(e.target.value))}
              className="sp-range"
            />
          </div>
        ))}
      </div>

      <div className="sp-zone-numrow">
        <div>
          <label className="pm-label">Angle°</label>
          <input
            type="number"
            value={z.angle ?? 0}
            className="pm-input pm-input-xs"
            onChange={(e) => updateZoneAngle(globalIndex, parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="pm-label">W (in)</label>
          <input
            type="number"
            value={z.actual_width ?? 12.0}
            className="pm-input pm-input-xs"
            onChange={(e) => updateZoneProp(globalIndex, 'actual_width', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="pm-label">H (in)</label>
          <input
            type="number"
            value={z.actual_height ?? 12.0}
            className="pm-input pm-input-xs"
            onChange={(e) => updateZoneProp(globalIndex, 'actual_height', parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pm-root">
      <style>{SP_STYLES}</style>

      {/* ── Top bar ───────────────────────────── */}
      <header className="pm-topbar">
        <div className="pm-topbar-left">
          <div className="pm-topbar-title">
            <h1>Zone setup</h1>
            <p>{selectedProduct ? `${selectedProduct.name} · ${zones.length} zone${zones.length !== 1 ? 's' : ''}` : 'Select a product to begin'}</p>
          </div>
        </div>
        <div className="pm-topbar-right">
          <button type="button" className="pm-btn pm-btn-ghost" onClick={clearAllZones} disabled={zones.length === 0}>
            <TrashIcon />
            Clear all
          </button>
          <button
            type="button"
            className="pm-btn pm-btn-primary"
            disabled={isSaveDisabled}
            onClick={saveZones}
          >
            {saveState === 'saving' && <Spinner />}
            {saveLabel}
          </button>
        </div>
      </header>

      {/* ── Shell: control sidebar + viewport main ───────────────────────────── */}
      <div className="pm-shell">
        <aside className="pm-sidebar sp-sidebar">
          <div className="sp-sidebar-scroll">

            {/* Product picker — scales to thousands of products per client */}
            <div className="sp-section">
              <label className="pm-label">Product</label>

              {selectedProduct ? (
                <div className="sp-selected-chip">
                  <div className="sp-selected-chip-info">
                    <div className="sp-selected-chip-name" title={selectedProduct.name}>{selectedProduct.name}</div>
                    <div className="sp-selected-chip-client">{selectedProductClientLabel}</div>
                  </div>
                  <button type="button" className="pm-btn pm-btn-ghost sm" onClick={changeProduct}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <select
                    className="pm-input sp-picker-client"
                    value={pickerClientKey}
                    onChange={(e) => setPickerClientKey(e.target.value)}
                  >
                    <option value="">Filter by client…</option>
                    {clientOptions.map((c) => (
                      <option key={c.key} value={c.key}>{c.label} ({c.count.toLocaleString()})</option>
                    ))}
                  </select>

                  <div className="sp-picker-search">
                    <SearchIcon />
                    <input
                      placeholder="Search products by name…"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                    />
                    {pickerSearch && (
                      <button className="pm-search-clear" onClick={() => setPickerSearch('')} aria-label="Clear search">
                        <CloseIcon />
                      </button>
                    )}
                  </div>

                  {pickerHasScope ? (
                    <div className="sp-result-list">
                      {pickerVisible.length === 0 ? (
                        <p className="sp-zone-empty">No products match. Try a different search or client.</p>
                      ) : (
                        <>
                          {pickerVisible.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="sp-result-item"
                              onClick={() => selectProductFromPicker(p)}
                            >
                              <span className="sp-result-name">{p.name}</span>
                              {!pickerClientKey && (
                                <span className="sp-result-client">
                                  {(p as any).client_slug ? (clientsBySlug.get((p as any).client_slug)?.name || (p as any).client_slug) : 'Global'}
                                </span>
                              )}
                            </button>
                          ))}
                          {pickerTruncated > 0 && (
                            <p className="sp-result-truncated">+{pickerTruncated.toLocaleString()} more — keep typing to narrow it down</p>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="pm-field-help sp-hint-inline">Pick a client above, or type at least 2 characters to search.</p>
                  )}
                </>
              )}
            </div>

            {/* Drawing mode — compact row */}
            <div className="sp-section">
              <label className="pm-label">Zone mode</label>
              <div className="sp-mode-row">
                {MODE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`sp-mode-chip-sm ${mode === opt.value ? 'active' : ''}`}
                    onClick={() => setMode(opt.value)}
                    title={opt.label}
                  >
                    <span className={`sp-zone-dot ${opt.value}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3D selector — compact switch */}
            <div className="sp-section">
              <div className="sp-toggle-row">
                <div>
                  <div className="sp-toggle-label">3D placement</div>
                  <p className="pm-field-help">Click the 3D model to drop a zone</p>
                </div>
                <button
                  type="button"
                  className={`sp-switch ${select3DMode ? 'on' : ''}`}
                  role="switch"
                  aria-checked={select3DMode}
                  onClick={() => {
                    const next = !select3DMode;
                    setSelect3DMode(next);
                    setMove3DMode(false);
                    setSelectedZoneIndex(null);
                    if (next) showToast(`Click on the 3D model to place the ${zoneTypeLabel(mode).toLowerCase()}.`);
                  }}
                >
                  <span className="sp-switch-knob" />
                </button>
              </div>
            </div>

            {/* 3D move mode — compact switch */}
            {/* <div className="sp-section">
              <div className="sp-toggle-row">
                <div>
                  <div className="sp-toggle-label">3D move/edit</div>
                  <p className="pm-field-help">Select and drag zones to reposition</p>
                </div>
                <button
                  type="button"
                  className={`sp-switch ${move3DMode ? 'on' : ''}`}
                  role="switch"
                  aria-checked={move3DMode}
                  onClick={() => {
                    const next = !move3DMode;
                    setMove3DMode(next);
                    setSelect3DMode(false);
                    setSelectedZoneIndex(null);
                    if (next) showToast('Click a zone in 3D view to select it, then drag to move.');
                  }}
                >
                  <span className="sp-switch-knob" />
                </button>
              </div>
            </div> */}

            {/* Merged, filterable zone list */}
            <div className="sp-section">
              <div className="sp-zones-header">
                <label className="pm-label">Zones — {currentSide}</label>
                <div className="sp-filter-row">
                  <button className={`sp-filter-chip ${zoneFilter === 'all' ? 'active' : ''}`} onClick={() => setZoneFilter('all')}>All</button>
                  <button className={`sp-filter-chip ${zoneFilter === '2d' ? 'active' : ''}`} onClick={() => setZoneFilter('2d')}>2D</button>
                  <button className={`sp-filter-chip ${zoneFilter === '3d' ? 'active' : ''}`} onClick={() => setZoneFilter('3d')}>3D</button>
                </div>
              </div>
              <div className="sp-zone-list">
                {filteredZones.length === 0 ? (
                  <p className="sp-zone-empty">
                    {zoneFilter === '3d'
                      ? `No 3D zones for ${currentSide} yet. Use the 3D placement switch above.`
                      : zoneFilter === '2d'
                        ? `No 2D zones for ${currentSide} yet. Drag on the 2D image to draw one.`
                        : `No zones for ${currentSide} yet.`}
                  </p>
                ) : (
                  filteredZones.map((z) => renderZoneCard(z, zones.indexOf(z)))
                )}
              </div>
            </div>

            {/* How to use — collapsed by default */}
            <details className="sp-howto">
              <summary>How to use</summary>
              <ol>
                <li>Pick a client and/or search to find a product</li>
                <li>Choose a zone mode</li>
                <li>Drag on the 2D image or use 3D placement</li>
                <li>Click Save zones</li>
              </ol>
            </details>
          </div>
        </aside>

        {/* ── Main viewport area ── */}
        <main className="pm-main sp-main">
          {!selectedProduct ? (
            <div className="pm-empty">
              <div className="pm-empty-icon"><ImageIcon /></div>
              <h3>No product selected</h3>
              <p>Filter by client or search by name in the sidebar to find a product.</p>
            </div>
          ) : isProductLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: '#64748b' }}>
              <Loader2 size={52} style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>Loading product assets…</p>
              <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.7 }}>Preparing images and 3D model</p>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              <div className="sp-main-header">
                <div className="sp-side-tabs">
                  {SIDES.map((v) => {
                    const hasZones = zones.some(z => z.side === v);
                    return (
                      <button
                        key={v}
                        type="button"
                        className={`sp-side-tab ${currentSide === v ? 'active' : ''}`}
                        onClick={() => handleSideChange(v)}
                      >
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                        {hasZones && <span className="sp-side-tab-dot" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pm-view-toggle sp-view-toggle">
                  <button className={setupViewMode === '2d' ? 'active' : ''} onClick={() => setSetupViewMode('2d')}>2D</button>
                  <button className={setupViewMode === 'both' ? 'active' : ''} onClick={() => setSetupViewMode('both')}>Both</button>
                  <button className={setupViewMode === '3d' ? 'active' : ''} onClick={() => setSetupViewMode('3d')}>3D</button>
                </div>
              </div>

              <div className="sp-viewports">

                {/* ── 2D Image Editor Viewport ── */}
                {(setupViewMode === 'both' || setupViewMode === '2d') && (
                  <div className="sp-viewport-panel">
                    <div className="sp-viewport-panel-header">
                      <span>2D setup canvas — {currentSide.toUpperCase()}</span>
                    </div>
                    <div className="sp-canvas-frame" style={{ position: 'relative' }}>
                      {!imagesReady && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,247,250,0.85)', zIndex: 20, gap: '0.75rem', color: '#64748b' }}>
                          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontWeight: 500 }}>Loading product images…</span>
                          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                        </div>
                      )}
                      <div
                        ref={imgContainerRef}
                        onMouseDown={handle2DMouseDown}
                        onMouseMove={handle2DMouseMove}
                        onMouseUp={handle2DMouseUp}
                        className="sp-canvas"
                      >
                        {currentImageUrl ? (
                          <img
                            src={resolveImageUrl(currentImageUrl)}
                            alt={currentSide}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                          />
                        ) : (
                          <div className="sp-canvas-empty">No image</div>
                        )}

                        {isDrawing2D && drawStart && drawCurrent && (
                          <div
                            style={{
                              position: 'absolute',
                              left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
                              top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
                              width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
                              height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
                              background: 'rgba(13,110,99,0.12)',
                              pointerEvents: 'none',
                              zIndex: 20,
                            }}
                          >
                            <CornerBrackets />
                          </div>
                        )}

                        {zones2D.map((z, idx) => {
                          const globalIndex = zones.indexOf(z);
                          return (
                            <div
                              key={idx}
                              style={{
                                position: 'absolute',
                                left: `${z.x}%`,
                                top: `${z.y}%`,
                                width: `${z.w}%`,
                                height: `${z.h}%`,
                                transform: `rotate(${z.angle || 0}deg)`,
                                background: 'rgba(13,110,99,0.06)',
                                boxSizing: 'border-box',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: 4,
                                pointerEvents: 'auto',
                                zIndex: 10,
                              }}
                              onMouseDown={e => e.stopPropagation()}
                            >
                              <CornerBrackets />
                              {/* Zone type label */}
                              <span style={{
                                position: 'absolute',
                                bottom: 5,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0,0,0,0.55)',
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                              }}>
                                {z.type === 'logo' ? 'Imprint' : z.type === 'combined' ? 'Combined' : 'Text'}
                                {z.name ? ` · ${z.name}` : ''}
                              </span>
                              {/* Delete button */}
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); deleteZone(globalIndex); }}
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  right: 4,
                                  width: 20,
                                  height: 20,
                                  background: 'rgba(217,45,32,0.85)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                                  zIndex: 30,
                                }}
                                title="Delete zone"
                                aria-label="Delete zone"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}

                      </div>
                    </div>
                    <p className="sp-viewport-hint">Click &amp; drag on the 2D product image to create a setup zone.</p>
                  </div>
                )}

                {/* ── 3D Live Preview Viewport ── */}
                {(setupViewMode === 'both' || setupViewMode === '3d') && (
                  <div className="sp-viewport-panel">
                    <div className="sp-viewport-panel-header">
                      <span>3D live viewport</span>
                    </div>
                    <div className="sp-canvas-frame sp-canvas-frame-3d" style={{ position: 'relative' }}>
                      {!imagesReady && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,247,250,0.88)', zIndex: 20, gap: '0.75rem', color: '#64748b', borderRadius: 12 }}>
                          <Loader2 size={40} style={{ animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontWeight: 500, fontSize: '1rem' }}>Preparing 3D model…</span>
                        </div>
                      )}
                      <SetupThreePreview
                        product={selectedProduct}
                        zones={zones}
                        currentSide={currentSide}
                        dominantColor={dominantColor}
                        preloadedImages={preloadedImages}
                        imagesReady={imagesReady}
                        select3DMode={select3DMode}
                        zone3DWidth={zone3DWidth}
                        zone3DHeight={zone3DHeight}
                        zoneMode={mode}
                        onZonePlaced={handleZonePlacedFrom3D}
                        onDeleteZone={deleteZone}
                      />
                    </div>
                    <p className="sp-viewport-hint">
                      Drag to rotate · scroll to zoom.{' '}
                      {select3DMode ? 'Click on the 3D surface to place a zone.' : 'Zones render live on the 3D model.'}
                    </p>
                  </div>
                )}

              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons — small inline SVGs, no external dependency
───────────────────────────────────────────────────────────── */
const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function ArrowLeftIcon() { return <svg {...iconProps}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; }
function CloseIcon() { return <svg {...iconProps} width={12} height={12}><path d="M18 6L6 18M6 6l12 12" /></svg>; }
function TrashIcon() { return <svg {...iconProps}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" /></svg>; }
function ImageIcon() { return <svg {...iconProps} width={28} height={28}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>; }
function SearchIcon() { return <svg {...iconProps} width={14} height={14}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>; }
function Spinner() { return <span className="pm-spinner" />; }

/* ─────────────────────────────────────────────────────────────
   Styles — shares the ProductManager design system (same tokens/atoms),
   plus setup-page-specific layout classes prefixed "sp-".
───────────────────────────────────────────────────────────── */
const SP_STYLES = `
.pm-root {
  --pm-bg: #F7F8FA;
  --pm-surface: #FFFFFF;
  --pm-surface-alt: #F1F3F6;
  --pm-border: #E3E6EB;
  --pm-border-strong: #D0D5DD;
  --pm-text: #14181F;
  --pm-text-muted: #667085;
  --pm-text-faint: #98A2B3;
  --pm-accent: #0D6E63;
  --pm-accent-hover: #0A5850;
  --pm-accent-soft: #E6F4F1;
  --pm-danger: #D92D20;
  --pm-danger-soft: #FEF3F2;
  --pm-warn: #B54708;
  --pm-warn-soft: #FFFAEB;
  --pm-radius: 10px;
  --pm-radius-sm: 7px;
  --pm-font: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --pm-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;

  font-family: var(--pm-font);
  color: var(--pm-text);
  background: var(--pm-bg);
  height: 100vh;
  max-height: 100vh;
  min-width: 90vw;
  padding:0px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.pm-root * { box-sizing: border-box; }
.pm-root button { font-family: inherit; cursor: pointer; }
.pm-root input, .pm-root select, .pm-root textarea { font-family: inherit; }

/* Topbar */
.pm-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 28px; border-bottom: 1px solid var(--pm-border); background: var(--pm-surface); flex-shrink: 0; }
.pm-topbar-left { display: flex; align-items: center; gap: 14px; }
.pm-topbar-title h1 { font-size: 1.25rem; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
.pm-topbar-title p { font-size: 0.8125rem; color: var(--pm-text-muted); margin: 2px 0 0; }
.pm-topbar-right { display: flex; gap: 10px; }

/* Buttons */
.pm-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: var(--pm-radius-sm); border: 1px solid transparent; font-size: 0.8125rem; font-weight: 550; text-decoration: none; transition: background .12s, border-color .12s, color .12s; white-space: nowrap; }
.pm-btn.sm { padding: 6px 11px; font-size: 0.75rem; }
.pm-btn-primary { background: var(--pm-accent); color: #fff; }
.pm-btn-primary:hover { background: var(--pm-accent-hover); }
.pm-btn-primary:disabled { background: var(--pm-border-strong); cursor: not-allowed; }
.pm-btn-ghost { background: var(--pm-surface); color: var(--pm-text); border-color: var(--pm-border); }
.pm-btn-ghost:hover { background: var(--pm-surface-alt); border-color: var(--pm-border-strong); }
.pm-btn-ghost:disabled { color: var(--pm-text-faint); cursor: not-allowed; }

.pm-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--pm-radius-sm); border: 1px solid var(--pm-border); background: var(--pm-surface); color: var(--pm-text-muted); transition: background .12s, color .12s, border-color .12s; flex-shrink: 0; }
.pm-icon-btn:hover { background: var(--pm-surface-alt); color: var(--pm-text); }
.pm-icon-btn.sm { width: 26px; height: 26px; }
.pm-icon-btn.danger:hover { background: var(--pm-danger-soft); color: var(--pm-danger); border-color: #FDA29B; }
.pm-icon-btn:disabled { opacity: .4; cursor: not-allowed; }

/* Shell layout */
.pm-shell { display: flex; flex: 1; min-height: 0; overflow: hidden; }

/* Sidebar (shared shell chrome) — independently scrollable */
.pm-sidebar { flex-shrink: 0; border-right: 1px solid var(--pm-border); background: var(--pm-surface); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.sp-sidebar { width: 280px; }
.sp-sidebar-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; }
.sp-section { margin-bottom: 18px; }
.sp-section:last-child { margin-bottom: 0; }
.sp-hint-inline { margin-top: 8px; }

/* Main — fixed to viewport, never scrolls; canvases size to fit */
.pm-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 18px 24px 20px; overflow: hidden; }
.sp-main { gap: 14px; }

/* Fields / inputs (shared) */
.pm-field { margin-bottom: 0; }
.sp-zone-field { margin-bottom: 10px; }
.pm-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--pm-text); margin-bottom: 6px; }
.pm-field-help { font-size: 0.75rem; color: var(--pm-text-muted); margin: 0; line-height: 1.4; }
.pm-input { width: 100%; padding: 9px 11px; border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); font-size: 0.8125rem; color: var(--pm-text); background: var(--pm-surface); outline: none; transition: border-color .12s, box-shadow .12s; }
.pm-input:focus { border-color: var(--pm-accent); box-shadow: 0 0 0 3px var(--pm-accent-soft); }
.pm-input-xs { padding: 6px 9px; font-size: 0.75rem; }

/* Tags (shared) */
.pm-tag { font-size: 0.6875rem; font-weight: 550; padding: 2px 8px; border-radius: 20px; background: var(--pm-surface-alt); color: var(--pm-text-muted); flex-shrink: 0; }
.pm-tag-accent { background: var(--pm-accent-soft); color: var(--pm-accent-hover); }

/* Empty state (shared) */
.pm-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; flex: 1; min-height: 0; padding: 72px 20px; text-align: center; background: var(--pm-surface); border: 1px dashed var(--pm-border-strong); border-radius: var(--pm-radius); }
.pm-empty-icon { color: var(--pm-text-faint); margin-bottom: 4px; }
.pm-empty h3 { margin: 0; font-size: 0.9375rem; }
.pm-empty p { margin: 0; font-size: 0.8125rem; color: var(--pm-text-muted); max-width: 320px; }

/* View toggle (shared) */
.pm-view-toggle { display: flex; border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); overflow: hidden; flex-shrink: 0; }
.pm-view-toggle button { display: flex; align-items: center; justify-content: center; padding: 0 14px; height: 34px; background: var(--pm-surface); color: var(--pm-text-faint); border: none; border-left: 1px solid var(--pm-border); font-size: 0.75rem; font-weight: 600; }
.pm-view-toggle button:first-child { border-left: none; }
.pm-view-toggle button.active { background: var(--pm-accent-soft); color: var(--pm-accent-hover); }

/* Spinner (shared) */
.pm-spinner { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: pm-spin .6s linear infinite; }
@keyframes pm-spin { to { transform: rotate(360deg); } }

/* ── Setup-page-specific ── */

/* Product picker */
.sp-picker-client { margin-bottom: 8px; }
.sp-picker-search { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--pm-surface); border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); color: var(--pm-text-faint); margin-bottom: 8px; }
.sp-picker-search:focus-within { border-color: var(--pm-accent); box-shadow: 0 0 0 3px var(--pm-accent-soft); color: var(--pm-text-muted); }
.sp-picker-search svg { flex-shrink: 0; }
.sp-picker-search input { flex: 1; border: none; outline: none; background: transparent; font-size: 0.8125rem; color: var(--pm-text); min-width: 0; }
.sp-picker-search input::placeholder { color: var(--pm-text-faint); }
.pm-search-clear { display: flex; color: var(--pm-text-faint); border: none; background: none; padding: 2px; flex-shrink: 0; }
.pm-search-clear:hover { color: var(--pm-text); }

.sp-result-list { max-height: 280px; overflow-y: auto; border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); }
.sp-result-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; border: none; border-bottom: 1px solid var(--pm-surface-alt); background: var(--pm-surface); text-align: left; font-size: 0.8125rem; color: var(--pm-text); }
.sp-result-item:last-child { border-bottom: none; }
.sp-result-item:hover { background: var(--pm-accent-soft); color: var(--pm-accent-hover); }
.sp-result-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-result-client { flex-shrink: 0; font-size: 0.6875rem; color: var(--pm-text-faint); }
.sp-result-truncated { margin: 0; padding: 7px 10px; font-size: 0.6875rem; color: var(--pm-text-faint); text-align: center; background: var(--pm-surface-alt); }

.sp-selected-chip { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--pm-accent); background: var(--pm-accent-soft); border-radius: var(--pm-radius-sm); }
.sp-selected-chip-info { min-width: 0; }
.sp-selected-chip-name { font-size: 0.8125rem; font-weight: 650; color: var(--pm-accent-hover); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-selected-chip-client { font-size: 0.6875rem; color: var(--pm-text-muted); margin-top: 1px; }

/* Compact mode chips */
.sp-mode-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.sp-mode-chip-sm { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 4px; border-radius: var(--pm-radius-sm); border: 1px solid var(--pm-border); background: var(--pm-surface); font-size: 0.6875rem; font-weight: 600; color: var(--pm-text-muted); }
.sp-mode-chip-sm:hover { border-color: var(--pm-border-strong); }
.sp-mode-chip-sm.active { border-color: var(--pm-accent); background: var(--pm-accent-soft); color: var(--pm-accent-hover); }

/* Zone type dots */
.sp-zone-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.sp-zone-dot.logo { background: #0D6E63; }
.sp-zone-dot.text { background: #2563EB; }
.sp-zone-dot.combined { background: #7C3AED; }

/* 3D toggle switch */
.sp-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sp-toggle-label { font-size: 0.8125rem; font-weight: 600; margin-bottom: 2px; }
.sp-switch { position: relative; width: 36px; height: 21px; border-radius: 20px; background: var(--pm-border-strong); border: none; flex-shrink: 0; transition: background .15s; }
.sp-switch.on { background: var(--pm-accent); }
.sp-switch-knob { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(16,24,40,0.25); transition: transform .15s; }
.sp-switch.on .sp-switch-knob { transform: translateX(15px); }

/* Zone list header + filter */
.sp-zones-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.sp-zones-header .pm-label { margin-bottom: 0; }
.sp-filter-row { display: flex; gap: 3px; background: var(--pm-surface-alt); border-radius: 20px; padding: 2px; }
.sp-filter-chip { padding: 3px 9px; border-radius: 16px; border: none; background: transparent; font-size: 0.6875rem; font-weight: 600; color: var(--pm-text-faint); }
.sp-filter-chip.active { background: var(--pm-surface); color: var(--pm-accent-hover); box-shadow: 0 1px 2px rgba(16,24,40,0.08); }

/* Zone lists / cards */
.sp-zone-list { display: flex; flex-direction: column; gap: 10px; }
.sp-zone-empty { font-size: 0.75rem; color: var(--pm-text-faint); line-height: 1.5; margin: 0; padding: 10px; background: var(--pm-surface-alt); border-radius: var(--pm-radius-sm); border: 1px dashed var(--pm-border-strong); }
.sp-zone-card { border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); padding: 10px; background: var(--pm-surface); }
.sp-zone-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.sp-zone-title { font-size: 0.8125rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-zone-sliders { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.sp-slider-row label { display: flex; justify-content: space-between; font-size: 0.6875rem; font-weight: 600; color: var(--pm-text-muted); margin-bottom: 3px; }
.sp-slider-row label span { color: var(--pm-text-faint); font-weight: 500; }
.sp-range { width: 100%; height: 4px; -webkit-appearance: none; appearance: none; background: var(--pm-border-strong); border-radius: 4px; outline: none; }
.sp-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--pm-accent); border: 2px solid #fff; box-shadow: 0 0 0 1px var(--pm-border-strong); cursor: pointer; }
.sp-range::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--pm-accent); border: 2px solid #fff; box-shadow: 0 0 0 1px var(--pm-border-strong); cursor: pointer; }
.sp-zone-numrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.sp-zone-numrow .pm-label { font-size: 0.6875rem; margin-bottom: 3px; }

/* How-to — native collapsible, closed by default */
.sp-howto { background: var(--pm-surface-alt); border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); padding: 10px 14px; font-size: 0.75rem; color: var(--pm-text-muted); line-height: 1.5; }
.sp-howto summary { cursor: pointer; font-weight: 600; color: var(--pm-text); font-size: 0.75rem; list-style: none; }
.sp-howto summary::-webkit-details-marker { display: none; }
.sp-howto summary::before { content: '›'; display: inline-block; margin-right: 6px; transition: transform .15s; font-weight: 700; }
.sp-howto[open] summary::before { transform: rotate(90deg); }
.sp-howto ol { margin: 8px 0 0; padding-left: 18px; }
.sp-howto li { margin-bottom: 2px; }

/* Main header row: side tabs + view toggle */
.sp-main-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; flex-shrink: 0; }
.sp-side-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.sp-side-tab { position: relative; padding: 7px 14px; border-radius: 20px; border: 1px solid var(--pm-border); background: var(--pm-surface); font-size: 0.8125rem; font-weight: 550; color: var(--pm-text-muted); }
.sp-side-tab:hover { border-color: var(--pm-border-strong); }
.sp-side-tab.active { background: var(--pm-accent); border-color: var(--pm-accent); color: #fff; }
.sp-side-tab-dot { position: absolute; top: 5px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: #F79009; box-shadow: 0 0 0 1.5px var(--pm-surface); }
.sp-side-tab.active .sp-side-tab-dot { background: #fff; box-shadow: 0 0 0 1.5px var(--pm-accent); }

/* Viewports — fill remaining space, never trigger page scroll */
.sp-viewports { display: flex; gap: 14px; flex: 1; min-height: 0; }
.sp-viewport-panel { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--pm-surface); border: 1px solid var(--pm-border); border-radius: var(--pm-radius); overflow: hidden; }
.sp-viewport-panel-header { padding: 8px 14px; border-bottom: 1px solid var(--pm-border); font-size: 0.75rem; font-weight: 650; color: var(--pm-text); background: var(--pm-surface-alt); flex-shrink: 0; }
.sp-canvas-frame { flex: 1; min-height: 0; background: #ffffffff; display: flex; align-items: center; justify-content: center; padding: 16px; overflow: hidden; }
.sp-canvas-frame-3d { padding: 0; position: relative; }
.sp-canvas { position: relative; height: 100%; width: auto; max-width: 100%; max-height: 100%; aspect-ratio: 1 / 1; user-select: none; cursor: crosshair; background: #ffffff; border-radius: 8px; overflow: hidden; }
.sp-canvas-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #667085; font-size: 0.8125rem; }
.sp-canvas-zone-label { background: rgba(0,0,0,0.85); color: #fff; font-size: 0.65rem; padding: 2px 4px; border-radius: 3px; line-height: 1.2; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; z-index: 1; }
.sp-canvas-zone-dim { background: rgba(0,0,0,0.85); color: #4CD9C0; font-size: 0.6rem; padding: 1px 3px; border-radius: 3px; align-self: flex-end; font-weight: 600; }
.sp-viewport-hint { margin: 0; padding: 7px 14px; font-size: 0.75rem; color: var(--pm-text-muted); border-top: 1px solid var(--pm-border); background: var(--pm-surface); flex-shrink: 0; }

/* Responsive */
@media (max-width: 900px) {
  .pm-root { height: auto; min-height: 100vh; overflow: visible; }
  .pm-shell { flex-direction: column; overflow: visible; }
  .sp-sidebar { width: 100%; max-height: 320px; border-right: none; border-bottom: 1px solid var(--pm-border); }
  .pm-main { overflow: visible; }
  .sp-viewports { flex-direction: column; }
  .sp-canvas-frame { min-height: 380px; }
}
@media (max-width: 640px) {
  .pm-topbar { padding: 16px; flex-wrap: wrap; }
  .pm-main { padding: 16px; }
}
`;