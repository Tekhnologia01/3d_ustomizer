import React, { useState } from 'react';
import {
  AlignCenter,
  Download,
  FlipHorizontal,
  FlipVertical,
  ImageDown,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Wand2,
  Layers,
} from 'lucide-react';
import type { Product, DesignZone } from '../types';
import { getSideImageUrl, resolveImageUrl } from '../utils/productImages';

interface Props {
  product: Product;
  zones: DesignZone[];
  currentSide: string;
  onSideChange: (side: string) => void;
  selectedObject: any;
  opacity: number;
  onOpacityChange: (v: number) => void;
  removeBgEnabled: boolean;
  onToggleRemoveBg: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onCenterSelected: () => void;
  onFitSelected: () => void;
  onDeleteObject: () => void;
  onDownload3D: () => void;
  onDownload2D: () => void;
  onClearSide: () => void;
  onResetAll: () => void;
  layers: { id: string; name: string; type: string; isSelected: boolean }[];
  onSelectLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onMoveLayer: (id: string, dir: 'up' | 'down') => void;
  getPhysicalStats?: (actualZoneW: number, actualZoneH: number) => { width: number; height: number; left: number; top: number } | null;
  setPhysicalSize?: (w: number, h: number, lockProportions: boolean, actualZoneW: number, actualZoneH: number) => void;
  setPhysicalPlacement?: (left: number, top: number, actualZoneW: number, actualZoneH: number) => void;
  viewMode?: '2d' | '3d';
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string) => void;
}


function readNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next) : fallback;
}

export default function RightSidebar({
  product,
  zones,
  currentSide,
  onSideChange,
  selectedObject,
  opacity,
  onOpacityChange,
  removeBgEnabled,
  onToggleRemoveBg,
  onFlipHorizontal,
  onFlipVertical,
  onCenterSelected,
  onFitSelected,
  onDeleteObject,
  onDownload3D,
  onDownload2D,
  onClearSide,
  onResetAll,
  layers = [],
  onSelectLayer,
  onDeleteLayer,
  onMoveLayer,
  getPhysicalStats,
  setPhysicalSize,
  setPhysicalPlacement,
  viewMode = '2d',
  selectedZoneId,
  onZoneSelect,
}: Props) {
  const [proportionsLocked, setProportionsLocked] = useState(true);
  const [, forceRender] = useState(0);

  // Derive zone actual sizes
  let actualZoneW = 12.0;
  let actualZoneH = 12.0;

  let currentZoneConfig: DesignZone | undefined;
  if (selectedZoneId) {
    currentZoneConfig = zones.find(z => String(z.id) === String(selectedZoneId));
  } else {
    currentZoneConfig = zones.find(z => {
      const key = (z.name && z.name.trim()) ? z.name.trim() : z.side;
      return key === currentSide;
    });
  }

  if (currentZoneConfig) {
    actualZoneW = currentZoneConfig.actual_width ?? 12.0;
    actualZoneH = currentZoneConfig.actual_height ?? 12.0;
  }

  // Get current stats - call every render so values stay live
  const stats = selectedObject && getPhysicalStats ? getPhysicalStats(actualZoneW, actualZoneH) : null;
  // When stats are unavailable, default W/H to max so panel is always meaningful
  const statW = stats ? Number(stats.width.toFixed(2)) : (selectedObject ? actualZoneW : 0);
  const statH = stats ? Number(stats.height.toFixed(2)) : (selectedObject ? actualZoneH : 0);
  const statLeft = stats ? Number(stats.left.toFixed(2)) : 0;
  const statTop = stats ? Number(stats.top.toFixed(2)) : 0;

  const handleWChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = parseFloat(e.target.value) || 0.01;
    if (v > actualZoneW) v = actualZoneW;

    let newH = statH;
    if (proportionsLocked && statW > 0) {
      newH = (v / statW) * statH;
      if (newH > actualZoneH) {
        newH = actualZoneH;
        v = (newH / statH) * statW;
      }
    }
    setPhysicalSize?.(v, newH, proportionsLocked, actualZoneW, actualZoneH);
    forceRender(x => x + 1);
  };

  const handleHChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = parseFloat(e.target.value) || 0.01;
    if (v > actualZoneH) v = actualZoneH;

    let newW = statW;
    if (proportionsLocked && statH > 0) {
      newW = (v / statH) * statW;
      if (newW > actualZoneW) {
        newW = actualZoneW;
        v = (newW / statW) * statH;
      }
    }
    setPhysicalSize?.(newW, v, proportionsLocked, actualZoneW, actualZoneH);
    forceRender(x => x + 1);
  };

  const handleLeftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhysicalPlacement?.(parseFloat(e.target.value) || 0, statTop, actualZoneW, actualZoneH);
    forceRender(x => x + 1);
  };

  const handleTopChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhysicalPlacement?.(statLeft, parseFloat(e.target.value) || 0, actualZoneW, actualZoneH);
    forceRender(x => x + 1);
  };

  return (
    <aside className="studio-sidebar studio-sidebar-right">
      <section className="studio-right-section">
        <div className="studio-section-kicker">Views</div>
        <div className="studio-view-grid">
          {(() => {
            const filteredZones = zones.filter(z => viewMode === '3d' ? z.source === '3d' : z.source !== '3d');
            // Only show tabs for zones that have at least one zone defined in the current mode
            const tabs: { key: string; label: string; physicalSide: string }[] = [];
            const seen = new Set<string>();
            filteredZones.forEach(z => {
              const label = (z.name && z.name.trim()) ? z.name.trim() : z.side.charAt(0).toUpperCase() + z.side.slice(1);
              const key = (z.name && z.name.trim()) ? z.name.trim() : z.side;
              if (!seen.has(key)) {
                seen.add(key);
                tabs.push({ key, label, physicalSide: z.side });
              }
            });
            // If no zones for the current mode, show front as default fallback
            if (tabs.length === 0) {
              tabs.push({ key: 'front', label: 'Front', physicalSide: 'front' });
            }
            return tabs.map(({ key, label, physicalSide }) => {
              const imageUrl = resolveImageUrl(getSideImageUrl(product, physicalSide), `${product.name} ${physicalSide}`);
              return (
                <button
                  type="button"
                  key={key}
                  className={`studio-view-tile ${currentSide === key ? 'active' : ''}`}
                  onClick={() => onSideChange(key)}
                >
                  <span className="studio-view-thumb">
                    <img src={imageUrl} alt={`${label} view`} />
                  </span>
                  <span>{label}</span>
                </button>
              );
            });
          })()}
        </div>
      </section>

      {/* ── Optional Zone Picker if multiple zones exist on this side ── */}
      {(() => {
        let relevantZones = zones.filter(z => {
          const zoneName = z.name && z.name.trim() ? z.name.trim() : z.side;
          return z.side === currentSide || zoneName === currentSide;
        });

        // Exclude 3D-only zones since we configure physics in 2D space
        const true2DZones = relevantZones.filter(z => z.source !== '3d');

        if (true2DZones.length > 1) {
          return (
            <section className="studio-right-section" style={{ paddingBottom: '8px' }}>
              <div className="studio-section-kicker">Select Imprint Area</div>
              <select
                className="studio-input"
                style={{ width: '100%', padding: '6px', fontSize: '12.5px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                value={selectedZoneId || true2DZones[0].id}
                onChange={(e) => onZoneSelect(e.target.value)}
              >
                {true2DZones.map((z, idx) => (
                  <option key={z.id} value={z.id}>
                    {z.name ? z.name : `Zone ${idx + 1}`} ({z.actual_width}" x {z.actual_height}")
                  </option>
                ))}
              </select>
            </section>
          );
        }
        return null;
      })()}

      {selectedObject && (
        <section className="studio-right-section">
          <div className="studio-section-kicker">
            Sizing & Placement
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, color: viewMode === '3d' ? '#8b5cf6' : '#3b82f6', background: viewMode === '3d' ? '#ede9fe' : '#eff6ff', padding: '1px 6px', borderRadius: 4 }}>
              {viewMode === '3d' ? '3D Canvas' : '2D Canvas'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Sizing: H"</label>
              <input
                type="number" step="0.01"
                min="0.01"
                max={actualZoneH}
                value={statH}
                onChange={handleHChange}
                style={{ width: '100%', padding: '4px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>W"</label>
              <input
                type="number" step="0.01"
                min="0.01"
                max={actualZoneW}
                value={statW}
                onChange={handleWChange}
                style={{ width: '100%', padding: '4px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              />
            </div>
            <button
              type="button"
              onClick={() => setProportionsLocked(!proportionsLocked)}
              style={{ padding: '6px', fontSize: '11px', background: proportionsLocked ? '#eff6ff' : 'transparent', color: proportionsLocked ? '#2563eb' : '#64748b', border: proportionsLocked ? '1px solid #bfdbfe' : '1px solid transparent', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {proportionsLocked ? 'Locked' : 'Unlock'}
            </button>
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '16px', textAlign: 'center' }}>
            Max Area {actualZoneW}" x {actualZoneH}"
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              <span>Left/Right Placement: {statLeft}"</span>
              <button type="button" onClick={() => { setPhysicalPlacement?.(0, statTop, actualZoneW, actualZoneH); forceRender(x => x + 1); }} disabled={actualZoneW - statW <= 0.1} style={{ color: actualZoneW - statW <= 0.1 ? '#94a3b8' : '#3b82f6', background: 'none', border: 'none', cursor: actualZoneW - statW <= 0.1 ? 'not-allowed' : 'pointer', padding: 0 }}>Reset</button>
            </div>
            <input
              type="range"
              min={-Math.max(0, (actualZoneW - statW) / 2)}
              max={Math.max(0, (actualZoneW - statW) / 2)}
              step="0.1"
              value={statLeft}
              onChange={handleLeftChange}
              disabled={actualZoneW - statW <= 0.1}
              style={{ width: '100%', opacity: actualZoneW - statW <= 0.1 ? 0.5 : 1, cursor: actualZoneW - statW <= 0.1 ? 'not-allowed' : 'pointer' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              <span>Up/Down Placement: {statTop}"</span>
              <button type="button" onClick={() => { setPhysicalPlacement?.(statLeft, 0, actualZoneW, actualZoneH); forceRender(x => x + 1); }} disabled={actualZoneH - statH <= 0.1} style={{ color: actualZoneH - statH <= 0.1 ? '#94a3b8' : '#3b82f6', background: 'none', border: 'none', cursor: actualZoneH - statH <= 0.1 ? 'not-allowed' : 'pointer', padding: 0 }}>Reset</button>
            </div>
            <input
              type="range"
              min={-Math.max(0, (actualZoneH - statH) / 2)}
              max={Math.max(0, (actualZoneH - statH) / 2)}
              step="0.1"
              value={statTop}
              onChange={handleTopChange}
              disabled={actualZoneH - statH <= 0.1}
              style={{ width: '100%', opacity: actualZoneH - statH <= 0.1 ? 0.5 : 1, cursor: actualZoneH - statH <= 0.1 ? 'not-allowed' : 'pointer' }}
            />
          </div>

        </section>
      )}

      <section className="studio-right-section">
        <div className="studio-section-kicker">Layers ({layers.length})</div>
        <div className="studio-layers-list">
          {layers.length === 0 ? (
            <div className="studio-layer-empty">No objects added to this view.</div>
          ) : (
            layers.map((layer, idx) => (
              <div key={layer.id} className={`studio-layer-item ${layer.isSelected ? 'active' : ''}`}>
                <div
                  className="studio-layer-info"
                  onClick={() => onSelectLayer(layer.id)}
                  style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Layers size={14} style={{ color: layer.isSelected ? '#6366f1' : '#94a3b8' }} />
                  <span style={{ fontSize: '12px', color: layer.isSelected ? '#1e293b' : '#475569', fontWeight: layer.isSelected ? 600 : 400 }}>
                    {layer.name}
                  </span>
                </div>
                <div className="studio-layer-actions" style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="studio-icon-btn"
                    title="Move Up"
                    onClick={() => onMoveLayer(layer.id, 'up')}
                    disabled={idx === 0}
                    style={{ padding: '4px', opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="studio-icon-btn"
                    title="Move Down"
                    onClick={() => onMoveLayer(layer.id, 'down')}
                    disabled={idx === layers.length - 1}
                    style={{ padding: '4px', opacity: idx === layers.length - 1 ? 0.3 : 1 }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="studio-icon-btn danger"
                    title="Delete"
                    onClick={() => onDeleteLayer(layer.id)}
                    style={{ padding: '4px', color: '#ef4444' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="studio-right-section">
        <div className="studio-section-kicker">Quick Actions</div>
        <div className="studio-action-grid">
          <button type="button" onClick={onFlipHorizontal}><FlipHorizontal size={16} />Flip H</button>
          <button type="button" onClick={onFlipVertical}><FlipVertical size={16} />Flip V</button>
          <button type="button" onClick={onCenterSelected}><AlignCenter size={16} />Center</button>
          <button type="button" onClick={onFitSelected}><Maximize2 size={16} />Fit Area</button>
          <button type="button" onClick={onToggleRemoveBg} className={removeBgEnabled ? 'active' : ''}><Wand2 size={16} />Remove BG</button>
          <button type="button" onClick={onDeleteObject} className="danger"><Trash2 size={16} />Delete</button>
        </div>
      </section>

      <section className="studio-right-section studio-output-section">
        <div className="studio-section-kicker">Output</div>
        <div className="studio-output-stack">
          <button type="button" className="studio-output-btn primary" onClick={onDownload3D}><ImageDown size={16} />Export 3D</button>
          <button type="button" className="studio-output-btn" onClick={onDownload2D}><Download size={16} />Export 2D</button>
          <div className="studio-two-col">
            <button type="button" className="studio-outline-btn" onClick={onClearSide}>Clear Side</button>
            <button type="button" className="studio-outline-btn" onClick={onResetAll}><RotateCcw size={14} />Reset</button>
          </div>
        </div>
        <div className="studio-properties-hint">
          <SlidersHorizontal size={14} />
          <span>{selectedObject ? 'Selected layer properties are synced from the design canvas.' : 'Add artwork or text to activate layer controls.'}</span>
        </div>
      </section>
    </aside>
  );
}
