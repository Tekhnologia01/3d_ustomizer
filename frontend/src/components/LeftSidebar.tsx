import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  ImagePlus,
  Layers,
  Palette,
  Type,
  Upload,
  Search,
  Wand2,
  X,
} from 'lucide-react';
import type { ImprintMethod, DesignZone, ProductColorVariant } from '../types';
import { ACCEPTED_IMAGE_TYPES } from '../utils/vectorToImage';
import { PANTONE_COLORS } from '../utils/pantoneColors';

interface Props {
  customText: string;
  setCustomText: (v: string) => void;
  textFont: string;
  setTextFont: (v: string) => void;
  textSize: number;
  setTextSize: (v: number) => void;
  textColor: string;
  setTextColor: (v: string) => void;
  onAddText: () => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedObject: any;
  opacity: number;
  onOpacityChange: (v: number) => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onDeleteObject: () => void;
  currentSide: string;
  onSideChange: (side: string) => void;
  productColorName: string;
  setProductColorName: (v: string) => void;
  imprintLocationCount: number;
  setImprintLocationCount: (v: number) => void;
  imprintLocations: Record<string, string>;
  setImprintLocations: (v: Record<string, string>) => void;
  imprintMethod: string;
  setImprintMethod: (v: string) => void;
  imprintColor: string;
  setImprintColor: (v: string) => void;
  pmsNumber: string;
  setPmsNumber: (v: string) => void;
  showImprintArea: boolean;
  setShowImprintArea: (v: boolean) => void;
  availableImprintMethods: ImprintMethod[];
  productMaterial?: string | null;
  placementMode: boolean;
  setPlacementMode: (v: boolean) => void;
  placeType: 'logo' | 'text';
  setPlaceType: (v: 'logo' | 'text') => void;
  placeText: string;
  setPlaceText: (v: string) => void;
  placeFont: string;
  setPlaceFont: (v: string) => void;
  placeColor: string;
  setPlaceColor: (v: string) => void;
  onLogo3DUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUndoDecal: () => void;
  onClearDecals: () => void;
  logo3DName: string;
  removeBgEnabled: boolean;
  setRemoveBgEnabled: (v: boolean) => void;
  isRemovingBg: boolean;
  zones: DesignZone[];
  colorVariants?: ProductColorVariant[];
}

type PanelKey = 'color' | 'location' | 'method' | 'upload' | 'text' | 'layers';

const PRODUCT_GROUPS = ['Classic', 'Tumbler', 'Water', 'Unisex'];
const LOCATION_OPTIONS = ['Standard/Front', 'Back', 'Left', 'Right', 'Top', 'Wraparound'];
const IMPRINT_COLORS = ['White', 'Black', 'Red', 'Blue', 'Gold', 'Silver', 'Custom'];
const FALLBACK_METHODS: ImprintMethod[] = [
  { id: 0, name: 'Pad Printing', visual_effect: 'standard', supports_color: true },
  { id: 1, name: 'Screen Print', visual_effect: 'standard', supports_color: true },
  { id: 2, name: 'Full Color Digital Print', visual_effect: 'full_color', supports_color: true },
  { id: 3, name: 'Laser Engraving', visual_effect: 'laser_engrave', supports_color: false },
  { id: 4, name: 'Debossing', visual_effect: 'deboss', supports_color: false },
];

function Panel({
  id,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  id: PanelKey;
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: (id: PanelKey) => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`studio-panel ${open ? 'is-open' : ''}`}>
      <button className="studio-panel-trigger" type="button" onClick={() => onToggle(id)}>
        <span className="studio-panel-title">
          {icon}
          {title}
        </span>
        <ChevronDown size={16} className="studio-panel-chevron" />
      </button>
      {open && <div className="studio-panel-body">{children}</div>}
    </section>
  );
}

export default function LeftSidebar({
  customText,
  setCustomText,
  textFont,
  setTextFont,
  textSize,
  setTextSize,
  textColor,
  setTextColor,
  onAddText,
  onLogoUpload,
  selectedObject,
  opacity,
  onOpacityChange,
  onBringFront,
  onSendBack,
  onDeleteObject,
  currentSide,
  onSideChange,
  productColorName,
  setProductColorName,
  imprintLocationCount,
  setImprintLocationCount,
  imprintLocations,
  setImprintLocations,
  imprintMethod,
  setImprintMethod,
  imprintColor,
  setImprintColor,
  pmsNumber,
  setPmsNumber,
  showImprintArea,
  setShowImprintArea,
  availableImprintMethods,
  productMaterial,
  placementMode,
  setPlacementMode,
  placeType,
  setPlaceType,
  placeText,
  setPlaceText,
  placeFont,
  setPlaceFont,
  placeColor,
  setPlaceColor,
  onLogo3DUpload,
  onUndoDecal,
  onClearDecals,
  logo3DName,
  removeBgEnabled,
  setRemoveBgEnabled,
  isRemovingBg,
  zones,
  colorVariants = [],
}: Props) {
  const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>({
    color: true,
    location: false,
    method: false,
    upload: false,
    text: false,
    layers: false,
  });
  const [showPantonePalette, setShowPantonePalette] = useState(false);
  const [pantoneSearch, setPantoneSearch] = useState('');
  const [pantoneTooltip, setPantoneTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const pantonePopoverRef = useRef<HTMLDivElement>(null);

  const fontsList = ['Inter', 'Arial', 'Georgia', 'Impact', 'Verdana', 'Courier New', 'Times New Roman'];
  const methodsList = availableImprintMethods.length > 0 ? availableImprintMethods : FALLBACK_METHODS;
  const selectedColor = useMemo(
    () => {
      const variant = colorVariants.find((c) => c.name === productColorName);
      return variant
        ? { name: variant.name, hex: variant.hex_code || '#ffffff' }
        : { name: 'Default', hex: '#ffffff' };
    },
    [colorVariants, productColorName]
  );
  const selectedMethod = methodsList.find((m) => m.name === imprintMethod);
  const supportsColor = selectedMethod?.supports_color ?? true;
  const selectedPantone = PANTONE_COLORS.find((color) => color.name.trim() === pmsNumber.trim() || color.name === pmsNumber);
  const filteredPantoneColors = PANTONE_COLORS.filter((color) =>
    color.name.toLowerCase().includes(pantoneSearch.toLowerCase())
  );

  useEffect(() => {
    if (!showPantonePalette) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (pantonePopoverRef.current && !pantonePopoverRef.current.contains(event.target as Node)) {
        setShowPantonePalette(false);
        setPantoneTooltip(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPantonePalette(false);
        setPantoneTooltip(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPantonePalette]);

  const togglePanel = (id: PanelKey) => {
    setOpenPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLocationValueChange = (locKey: string, value: string) => {
    setImprintLocations({ ...imprintLocations, [locKey]: value });
  };

  return (
    <aside className="studio-sidebar studio-sidebar-left">
      {/* <div className="studio-side-section studio-product-tabs" aria-label="Product categories">
        <div className="studio-section-kicker">Product</div>
        <div className="studio-chip-row">
          {PRODUCT_GROUPS.map((group) => (
            <button key={group} type="button" className={`studio-chip ${group === 'Tumbler' ? 'active' : ''}`}>
              {group}
            </button>
          ))}
        </div>
      </div> */}

      <Panel
        id="color"
        title="Color & Material"
        icon={<Palette size={16} />}
        open={openPanels.color}
        onToggle={togglePanel}
      >
        <div className="studio-swatch-grid" role="list" aria-label="Product colors">
          {([{ name: 'Default', hex_code: '#ffffff' }, ...colorVariants].map((color) => (
            <button
              key={color.id ?? color.name}
              type="button"
              className={`studio-swatch ${productColorName === color.name ? 'active' : ''}`}
              style={{ backgroundColor: color.hex_code || '#ffffff' }}
              onClick={() => setProductColorName(color.name)}
              title={color.name}
              aria-label={color.name}
            >
              {productColorName === color.name && <span className="studio-swatch-check" />}
            </button>
          )))}
        </div>
        <div className="studio-selected-color">
          <span className="studio-selected-dot" style={{ backgroundColor: selectedColor.hex }} />
          <span>
            <strong>{selectedColor.name}</strong>
            <small>{selectedColor.hex.toUpperCase()}</small>
          </span>
        </div>
        <div className="studio-material-line">
          <Box size={14} />
          <span>{productMaterial || 'Standard drinkware material'}</span>
        </div>
      </Panel>



      <Panel
        id="method"
        title="Decoration Method"
        icon={<Wand2 size={16} />}
        open={openPanels.method}
        onToggle={togglePanel}
      >
        <div className="studio-field-stack">
          <label>Method</label>
          <select value={imprintMethod} onChange={(e) => setImprintMethod(e.target.value)}>
            {methodsList.map((method) => (
              <option key={method.name} value={method.name}>{method.name}</option>
            ))}
          </select>
        </div>
        {supportsColor && (
          <>
            <div className="studio-field-stack">
              <label>Imprint Color</label>
              <select value={imprintColor} onChange={(e) => setImprintColor(e.target.value)}>
                {IMPRINT_COLORS.map((color) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </div>
            <div className="studio-field-stack studio-pms-field" ref={pantonePopoverRef}>
              <label>PMS Number</label>
              <div className="studio-pms-input-wrap">
                {selectedPantone ? (
                  <span className="studio-pms-dot" style={{ backgroundColor: selectedPantone.hex }} />
                ) : (
                  <Search size={14} className="studio-pms-search-icon" />
                )}
                <input
                  value={pmsNumber}
                  onChange={(e) => setPmsNumber(e.target.value)}
                  onFocus={() => setShowPantonePalette(true)}
                  onClick={() => setShowPantonePalette(true)}
                  placeholder="PANTONE 485"
                />
              </div>
              {showPantonePalette && (
                <div className="pantone-popover studio-pantone-popover">
                  <div className="pantone-header">
                    <span>PANTONE solid coated</span>
                    <X size={14} onClick={() => setShowPantonePalette(false)} />
                  </div>
                  <div className="pantone-search-container">
                    <Search className="pantone-search-icon" />
                    <input
                      type="text"
                      placeholder="Search color..."
                      value={pantoneSearch}
                      onChange={(e) => setPantoneSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="pantone-grid">
                    {filteredPantoneColors.map((color) => {
                      const isSelected = pmsNumber.trim() === color.name.trim();
                      return (
                        <div className="pantone-swatch-wrapper" key={color.name}>
                          <button
                            type="button"
                            className={`pantone-swatch ${isSelected ? 'selected' : ''}`}
                            style={{
                              backgroundColor: color.hex,
                              borderColor: isSelected ? '#fff' : undefined,
                              boxShadow: isSelected ? 'inset 0 0 0 1px #000, 0 0 0 2px #fff' : undefined,
                            }}
                            onMouseEnter={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              setPantoneTooltip({ text: color.name.trim(), x: rect.left + rect.width / 2, y: rect.top });
                            }}
                            onMouseLeave={() => setPantoneTooltip(null)}
                            onClick={() => {
                              setPmsNumber(color.name.trim());
                              setPantoneSearch('');
                              setPantoneTooltip(null);
                              setShowPantonePalette(false);
                            }}
                            aria-label={color.name.trim()}
                          />
                        </div>
                      );
                    })}
                    {filteredPantoneColors.length === 0 && (
                      <div className="studio-pantone-empty">No colors found</div>
                    )}
                  </div>
                </div>
              )}
              {pantoneTooltip && showPantonePalette && (
                <div
                  className="studio-pantone-tooltip"
                  style={{ left: pantoneTooltip.x, top: pantoneTooltip.y - 6 }}
                >
                  {pantoneTooltip.text}
                </div>
              )}
            </div>
          </>
        )}
        {/* <label className="studio-check-row">
          <input
            type="checkbox"
            checked={showImprintArea}
            onChange={(e) => setShowImprintArea(e.target.checked)}
          />
          Show imprint area
        </label> */}
      </Panel>

      <Panel
        id="upload"
        title="Upload Artwork"
        icon={<Upload size={16} />}
        open={openPanels.upload}
        onToggle={togglePanel}
      >
        <label className="studio-check-row">
          <input
            type="checkbox"
            checked={removeBgEnabled}
            onChange={(e) => setRemoveBgEnabled(e.target.checked)}
            disabled={isRemovingBg}
          />
          Remove background on upload
        </label>
        <label className={`studio-upload ${isRemovingBg ? 'disabled' : ''}`} htmlFor="logo-file">
          <ImagePlus size={18} />
          <span>{isRemovingBg ? 'Processing artwork...' : 'Choose artwork file'}</span>
          <small>JPG, PNG, GIF, BMP, TIF, PDF, AI, EPS</small>
          <input id="logo-file" type="file" accept={ACCEPTED_IMAGE_TYPES} hidden onChange={onLogoUpload} disabled={isRemovingBg} />
        </label>

        <div className="studio-divider" />


        {placementMode && (
          <div className="studio-stamp-options">
            <div className="studio-segmented">
              <button type="button" className={placeType === 'logo' ? 'active' : ''} onClick={() => setPlaceType('logo')}>Logo</button>
              <button type="button" className={placeType === 'text' ? 'active' : ''} onClick={() => setPlaceType('text')}>Text</button>
            </div>
            {placeType === 'logo' ? (
              <label className={`studio-upload slim ${isRemovingBg ? 'disabled' : ''}`} htmlFor="logo-file-3d">
                <ImagePlus size={16} />
                <span>{isRemovingBg ? 'Processing...' : logo3DName || 'Upload stamp image'}</span>
                <input id="logo-file-3d" type="file" accept={ACCEPTED_IMAGE_TYPES} hidden onChange={onLogo3DUpload} disabled={isRemovingBg} />
              </label>
            ) : (
              <div className="studio-field-stack">
                <label>Stamp Text</label>
                <textarea rows={2} value={placeText} onChange={(e) => setPlaceText(e.target.value)} placeholder="Type 3D text" />
                <div className="studio-two-col">
                  <select value={placeFont} onChange={(e) => setPlaceFont(e.target.value)}>
                    {fontsList.map((font) => <option key={font} value={font}>{font}</option>)}
                  </select>
                  <input type="color" value={placeColor} onChange={(e) => setPlaceColor(e.target.value)} />
                </div>
              </div>
            )}
            <div className="studio-two-col">
              <button type="button" className="studio-outline-btn" onClick={onUndoDecal}>Undo</button>
              <button type="button" className="studio-outline-btn danger" onClick={onClearDecals}>Clear</button>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        id="text"
        title="Text Editor"
        icon={<Type size={16} />}
        open={openPanels.text}
        onToggle={togglePanel}
      >
        <div className="studio-field-stack">
          <label>Text</label>
          <textarea rows={3} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Type text for the print area" />
        </div>
        <div className="studio-two-col">
          <div className="studio-field-stack">
            <label>Font</label>
            <select value={textFont} onChange={(e) => setTextFont(e.target.value)}>
              {fontsList.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div className="studio-field-stack">
            <label>Size</label>
            <input type="number" min={10} max={200} value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} />
          </div>
        </div>
        <div className="studio-two-col align-end">
          <div className="studio-field-stack">
            <label>Color</label>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
          </div>
          <button type="button" className="studio-primary-btn" onClick={onAddText}>Add Text</button>
        </div>
      </Panel>

      <Panel
        id="layers"
        title="Layers"
        icon={<Layers size={16} />}
        open={openPanels.layers}
        onToggle={togglePanel}
      >
        {selectedObject ? (
          <>
            <div className="studio-layer-card">
              <span className="studio-layer-dot" />
              <span>{selectedObject.name?.replaceAll('_', '') || 'Selected layer'}</span>
            </div>
            <div className="studio-field-stack">
              <label>Opacity {opacity}%</label>
              <input type="range" min={10} max={100} value={opacity} onChange={(e) => onOpacityChange(Number(e.target.value))} />
            </div>
            <div className="studio-three-col">
              <button type="button" className="studio-outline-btn" onClick={onBringFront}>Front</button>
              <button type="button" className="studio-outline-btn" onClick={onSendBack}>Back</button>
              <button type="button" className="studio-outline-btn danger" onClick={onDeleteObject}>Delete</button>
            </div>
          </>
        ) : (
          <p className="studio-empty-note">Add artwork or text to create editable layers.</p>
        )}
      </Panel>
    </aside>
  );
}

