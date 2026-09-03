import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Product, DesignZone } from '../types';
import type { ShapeType } from '../utils/threeBuilders';
import { getProductBaseColorHex } from '../utils/threeBuilders';
import { warpCylinder, renderTextToCanvas } from '../utils/canvasUtils';
import { preloadProductImages } from '../utils/productImages';
import { fabric } from 'fabric';
import FabricCanvas2D, { type FabricCanvasHandle } from './FabricCanvas2D';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import type { ThreeSceneRef } from './ThreeViewport';
import ThreeViewport from './ThreeViewport';
import { removeBackground, preload } from '@imgly/background-removal';
import { normaliseToImage } from '../utils/vectorToImage';
import { Download, LayoutGrid, Layers, Loader2 } from 'lucide-react';
import { generateProductSpecSheet } from '../utils/pdfGenerator';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

export interface CustomizationData {
  snapshotDataUrl: string;
  pdfDataUrl: string | null;
  colorName: string;
  colorHex: string;
  imprintMethod: string;
  imprintColor: string;
  pmsNumber: string;
  // quantity: number;
}

interface Props {
  product: Product;
  zones: DesignZone[];
  onBack: () => void;
  showToast: (msg: string) => void;
  isEmbed?: boolean;
  onFinishDesign?: (data: CustomizationData) => void;
}

const SIDE_ROTATIONS: Record<string, { x: number; y: number; z: number }> = {
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: Math.PI, z: 0 },
  left: { x: 0, y: Math.PI / 2, z: 0 },
  right: { x: 0, y: -Math.PI / 2, z: 0 },
  top: { x: Math.PI / 2, y: 0, z: 0 },
};

// ── Zone overlay helper (draws dashed zone boundary on any canvas) ────────────────
function drawZoneOverlay(
  ctx: CanvasRenderingContext2D,
  zones: DesignZone[],
  side: string,
  W: number,
  H: number
) {
  zones.filter(z => z.side === side).forEach((z) => {
    const px = (z.x_percent / 100) * W;
    const py = (z.y_percent / 100) * H;
    const pw = (z.width_percent / 100) * W;
    const ph = (z.height_percent / 100) * H;

    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.rotate(((z.angle ?? 0) * Math.PI) / 180);

    // Vibrant solid semi-opaque cyan/blue fill
    ctx.fillStyle = 'rgba(14, 165, 233, 0.45)';
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);

    // Thick solid border around zone
    ctx.setLineDash([]);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);

    // Bold corner brackets
    const cs = Math.max(16, Math.min(40, Math.min(pw, ph) * 0.20));
    const hw = pw / 2;
    const hh = ph / 2;

    ctx.beginPath();
    // Top-left
    ctx.moveTo(-hw, -hh + cs); ctx.lineTo(-hw, -hh); ctx.lineTo(-hw + cs, -hh);
    // Top-right
    ctx.moveTo(hw - cs, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -hh + cs);
    // Bottom-right
    ctx.moveTo(hw, hh - cs); ctx.lineTo(hw, hh); ctx.lineTo(hw - cs, hh);
    // Bottom-left
    ctx.moveTo(-hw + cs, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, hh - cs);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Center text badge: "IMPRINT ZONE"
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 6;
    ctx.fillText('IMPRINT ZONE', 0, 0);

    ctx.restore();
  });
}

/** Returns the display key used for side-tab matching for a zone: its name if set, else its physical side. */
function zoneKey(z: DesignZone): string {
  return (z.name && z.name.trim()) ? z.name.trim() : z.side;
}

export default function ProductCustomizer({ product, zones, onBack, showToast, isEmbed = false, onFinishDesign }: Props) {
  // ── Side state ──────────────────────────────────────────────────────────────
  const getDefaultTab = () => {
    const firstZone = zones[0];
    if (!firstZone) return 'front';
    return (firstZone.name && firstZone.name.trim()) ? firstZone.name.trim() : firstZone.side;
  };
  const [currentSide, setCurrentSide] = useState<string>(getDefaultTab);
  const [logoZone, setLogoZone] = useState<DesignZone | null>(null);
  const [textZone, setTextZone] = useState<DesignZone | null>(null);
  // Which specific zone the user wants to target when multiple zones exist on a side
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // ── Text controls ───────────────────────────────────────────────────────────
  const [customText, setCustomText] = useState('');
  const [textFont, setTextFont] = useState('Inter');
  const [textSize, setTextSize] = useState(28);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [opacity, setOpacity] = useState(100);
  // const [quantity, setQuantity] = useState(50);
  const [layers, setLayers] = useState<{ id: string; name: string; type: string; isSelected: boolean }[]>([]);

  // ── Imprint / Option states ──────────────────────────────────────────────────
  const [productColorName, setProductColorName] = useState('White');
  const [imprintLocationCount, setImprintLocationCount] = useState(2);
  const [imprintLocations, setImprintLocations] = useState<Record<string, string>>({
    'Location 1': 'Standard/Front',
    'Location 2': 'Back',
    'Location 3': 'Wraparound',
    'Location 4': 'Top',
  });
  const [imprintMethod, setImprintMethod] = useState(() => {
    return (product.imprint_methods && product.imprint_methods.length > 0)
      ? product.imprint_methods[0].name
      : 'Pad Printing';
  });
  const [imprintColor, setImprintColor] = useState('White');
  const [pmsNumber, setPmsNumber] = useState('PMS 485 C');
  const [showImprintArea, setShowImprintArea] = useState(true);

  const PRODUCT_COLORS: Record<string, string> = {
    'Blue': '#2563eb',
    'Navy': '#17324d',
    'Red': '#dc2626',
    'Black': '#111827',
    'Green': '#15803d',
    'White': '#ffffff',
    'Silver': '#9ca3af',
    'Yellow': '#fbbf24',
    'Orange': '#f97316',
    'Teal': '#0f9f91',
    'Violet': '#7c3aed',
    'Pink': '#ec4899',
  };

  const handleProductColorChange = (colorName: string) => {
    setProductColorName(colorName);
    const hex = PRODUCT_COLORS[colorName];
    if (hex) {
      setDominantColor(hex);
    }
  };

  // ── 3D Placement controls ───────────────────────────────────────────────────

  const [placementMode, setPlacementMode] = useState(false);
  const [placeType, setPlaceType] = useState<'logo' | 'text'>('logo');
  const [placeText, setPlaceText] = useState('');
  const [placeFont, setPlaceFont] = useState('Inter');
  const [placeColor, setPlaceColor] = useState('#ffffff');
  const [placeSize, setPlaceSize] = useState(120);
  const [placeRotation, setPlaceRotation] = useState(0);
  const [placeOpacity, setPlaceOpacity] = useState(100);
  const [logo3DName, setLogo3DName] = useState('');
  const [pendingLogoImg, setPendingLogoImg] = useState<HTMLImageElement | null>(null);

  // ── View Mode state (2D vs 3D) ──────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  // ── Background Removal state ────────────────────────────────────────────────
  const [removeBgEnabled, setRemoveBgEnabled] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  // ── Preloaded images ────────────────────────────────────────────────────────
  const [imagesReady, setImagesReady] = useState(false);
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [preloadedImages, setPreloadedImages] = useState<Record<string, HTMLImageElement>>({});

  // ── Shared data refs ────────────────────────────────────────────────────────
  const preloadedImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const sideObjects2DRef = useRef<Record<string, any[]>>({});
  const sideThumbnails2DRef = useRef<Record<string, HTMLImageElement>>({});
  const sideObjects3DRef = useRef<Record<string, any[]>>({});
  const sideThumbnails3DRef = useRef<Record<string, HTMLImageElement>>({});
  const texturesRef = useRef<Record<string, THREE.CanvasTexture>>({});
  const cylinderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shapeTypeRef = useRef<ShapeType>('flat');
  const isUpdating3DRef = useRef(false);
  const canvasRenderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Component refs ──────────────────────────────────────────────────────────
  const fabricHandle2DRef = useRef<FabricCanvasHandle>(null);
  const fabricHandle3DRef = useRef<FabricCanvasHandle>(null);
  const threeSceneRef = useRef<ThreeSceneRef | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);

  // Helper to get the correct active fabric handle based on view mode (always use 2D canvas as source of truth)
  const getActiveFabricHandle = () => fabricHandle2DRef.current;

  // ── Cylinder canvas helper ──────────────────────────────────────────────────
  const getCylinderCanvas = (): HTMLCanvasElement => {
    if (!cylinderCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 1024;
      cylinderCanvasRef.current = c;
    }
    return cylinderCanvasRef.current;
  };

  // ── Preload product images and extract color ────────────────────────────────
  React.useEffect(() => {
    setImagesReady(false);
    preloadedImagesRef.current = {};

    preloadProductImages(product).then(({ images, dominantColor: color }) => {
      preloadedImagesRef.current = images;
      setPreloadedImages(images);
      setDominantColor(color);
      setImagesReady(true);
    });

    preload({ model: 'isnet_fp16' }).catch((err: any) => console.log('Bg removal preload error:', err));
  }, [product]);

  // ── Global Toast Listener ───────────────────────────────────────────────────
  useEffect(() => {
    const handleToast = (e: any) => {
      if (e.detail) showToast(e.detail);
    };
    window.addEventListener('toast-msg', handleToast);
    return () => window.removeEventListener('toast-msg', handleToast);
  }, [showToast]);


  // Fingerprint of the last design canvas used to build decals – avoid rebuilding if nothing changed
  const lastDecalHashRef = useRef<string>('');

  const update3DTextures = useCallback(() => {
    if (isUpdating3DRef.current) return;
    const ref = threeSceneRef.current;
    if (!ref) return;
    isUpdating3DRef.current = true;

    try {
      const designCanvas = fabricHandle2DRef.current?.getDesignOnlyCanvas(true);

      // ── Fast canvas fingerprint: sample every 16th pixel ─────────────
      // Skip the expensive DecalGeometry rebuild if the canvas looks identical.
      let canvasHash = 'empty';
      if (designCanvas) {
        const ctx2 = designCanvas.getContext('2d');
        if (ctx2) {
          const probe = ctx2.getImageData(0, 0, designCanvas.width, designCanvas.height);
          let h = 0;
          for (let i = 0; i < probe.data.length; i += 64) { // sample every 16th pixel
            h = ((h << 5) - h + probe.data[i]) | 0;
            h = ((h << 5) - h + probe.data[i + 1]) | 0;
            h = ((h << 5) - h + probe.data[i + 3]) | 0; // alpha matters most
          }
          canvasHash = String(h);
        }
      }

      if (canvasHash === lastDecalHashRef.current) {
        isUpdating3DRef.current = false;
        return; // nothing changed — skip rebuild
      }
      lastDecalHashRef.current = canvasHash;

      const shape = shapeTypeRef.current;
      const baseColor = getProductBaseColorHex(product.name, dominantColor);

      // Handle original GLTF models using localized floating decals
      let hasOriginalModel = false;
      ref.modelGroup.traverse((child: any) => {
        if (child.userData?.isOriginalModel) hasOriginalModel = true;
      });

      if (hasOriginalModel) {
        // 1. Remove old customizer decals so we don't spam the scene on every change
        const oldDecals = ref.modelGroup.children.filter((c: any) => c.userData?.isCustomizerDecal);
        oldDecals.forEach((d: any) => {
          ref.modelGroup.remove(d);
          d.geometry.dispose();
          if (d.material) {
            if (Array.isArray(d.material)) d.material.forEach((m: any) => m.dispose());
            else d.material.dispose();
          }
        });

        // Ensure modelGroup's world matrix reflects the CURRENT side
        // rotation before converting stored local-space zone data into
        // world space below.
        ref.modelGroup.updateMatrixWorld(true);

        // 2. Build new decals for any zones mapped in 3D
        zones.forEach((z) => {
          const zAny = z as any;
          if (z.source === '3d' && zAny.point3d && zAny.normal3d && zAny.size3d) {
            // Display key used for side-tab matching (may be a friendly name like "BACK Imprint Area")
            const displayKey = zoneKey(z);
            // Canonical physical side key always used for cache lookup ("front", "back", etc.)
            const physicalSide = z.side;

            // Get source canvas for this zone's side (either active or from thumbnail cache)
            let src: HTMLCanvasElement | null = null;

            // Is this zone's physical side the one currently being edited?
            const isCurrentSide = physicalSide === currentSide || displayKey === currentSide;
            if (isCurrentSide && designCanvas) {
              src = designCanvas;
            } else {
              // Try canonical physical side key first, then display key as fallback
              const thumbImg =
                sideThumbnails3DRef.current[physicalSide] ||
                sideThumbnails3DRef.current[displayKey];
              if (thumbImg) {
                const t = document.createElement('canvas');
                t.width = 1024; t.height = 1024;
                const tCtx = t.getContext('2d');
                if (tCtx) tCtx.drawImage(thumbImg, 0, 0, 1024, 1024);
                src = t;
              }
            }

            if (!src) return;

            // Crop the 2D source EXACTLY to the 2D zone bounds so it perfectly fills the physical decal plane
            // We match strictly by `name` first to ensure multi-zone setups map correctly (Area 1 -> Area 1).
            const z2 =
              zones.find(zz => zz.side === z.side && zz.source !== '3d' && zz.name === z.name) ||
              zones.find(zz => zz.side === z.side && zz.source !== '3d') ||
              z;
            const sx = (z2.x_percent / 100) * src.width;
            const sy = (z2.y_percent / 100) * src.height;
            const sw = (z2.width_percent / 100) * src.width;
            const sh = (z2.height_percent / 100) * src.height;

            const decalCanvas = document.createElement('canvas');
            decalCanvas.width = 1024;
            decalCanvas.height = 1024;
            const ctx = decalCanvas.getContext('2d')!;
            ctx.drawImage(src, sx, sy, sw, sh, 0, 0, 1024, 1024);

            const tex = new THREE.CanvasTexture(decalCanvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;

            // ── point3d / normal3d are stored in the model's own default,
            // UNROTATED local frame — however the setup tool originally
            // captured them. `modelGroup` gets rotated per side tab (see
            // SIDE_ROTATIONS), so these values must be converted into the
            // model's CURRENT world space before being used for raycasting
            // or DecalGeometry, both of which operate in world space. Using
            // them raw only ever "worked" on the front tab, where
            // modelGroup's rotation is identity (local space == world
            // space there) — every other side was silently feeding the
            // raycast and decal box the wrong coordinate space entirely,
            // which is what produced the garbage/misplaced decals.
            const localPt = new THREE.Vector3(...zAny.point3d!);
            const localNrm = new THREE.Vector3(...zAny.normal3d!).normalize();
            const [sW, sH] = zAny.size3d!;

            const worldPt = localPt.clone().applyMatrix4(ref.modelGroup.matrixWorld);
            const worldNrm = localNrm.clone().transformDirection(ref.modelGroup.matrixWorld).normalize();

            const buildQuat = (nrm: THREE.Vector3) => {
              const zAxis = nrm.clone().normalize();
              let yAxis = new THREE.Vector3(0, 1, 0);
              if (Math.abs(zAxis.dot(yAxis)) > 0.95) yAxis.set(0, 0, 1);
              const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
              yAxis.crossVectors(zAxis, xAxis).normalize();
              const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
              const q = new THREE.Quaternion().setFromRotationMatrix(basis);
              if (z.angle) {
                const roll = new THREE.Quaternion().setFromAxisAngle(nrm, (z.angle * Math.PI) / 180);
                q.premultiply(roll);
              }
              return q;
            };

            // World-space orientation — feeds DecalGeometry, which needs its
            // position/orientation params in world space to match
            // targetMesh's current (possibly rotated) world pose.
            const worldQuat = buildQuat(worldNrm);
            // Local-space orientation — only used for the PlaneGeometry
            // fallback below, which stays in modelGroup's local frame.
            const localQuat = buildQuat(localNrm);

            // Raycast strictly to identify the specific child mesh (e.g. pocket vs strap) to wrap
            let targetMesh: THREE.Mesh | null = null;
            const raycaster = new THREE.Raycaster();
            const originPt = worldPt.clone().addScaledVector(worldNrm, 0.5);
            raycaster.set(originPt, worldNrm.clone().negate());
            const hits = raycaster.intersectObject(ref.modelGroup, true);
            targetMesh = hits.find(h => (h.object as any).isMesh)?.object as THREE.Mesh;

            if (!targetMesh) {
              ref.modelGroup.traverse(c => {
                if ((c as any).isMesh && !targetMesh) targetMesh = c as THREE.Mesh;
              });
            }

            let geo: THREE.BufferGeometry;
            let isWorldSpaceGeo = false;
            if (targetMesh) {
              const orientation = new THREE.Euler().setFromQuaternion(worldQuat);
              // Give the decal box enough depth to wrap around curved surfaces (like cylinders or wrinkles)
              // without punching entirely through the model. ~35% of the decal size is a safe safe-zone.
              const sDepth = Math.max(0.1, Math.max(sW, sH) * 0.35);
              const size = new THREE.Vector3(sW, sH, sDepth);
              try {
                geo = new DecalGeometry(targetMesh, worldPt, orientation, size);
                isWorldSpaceGeo = true;
              } catch (e) {
                console.error("Decal err", e);
                geo = new THREE.PlaneGeometry(sW, sH);
              }
            } else {
              geo = new THREE.PlaneGeometry(sW, sH);
            }

            const mat = new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              depthTest: true,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -4,
              polygonOffsetUnits: -4,
              // don't use FrontSide only, Decal mesh matches the original mesh normals
            });

            const decalMesh = new THREE.Mesh(geo, mat);
            decalMesh.userData.isCustomizerDecal = true;
            decalMesh.renderOrder = 999;

            if (isWorldSpaceGeo) {
              // DecalGeometry vertices are baked directly into WORLD space
              // (position/orientation above were world-space). `attach()` —
              // unlike plain `add()` — automatically compensates for
              // modelGroup's current rotation so the already-world-baked
              // vertices aren't transformed a SECOND time at render. That
              // double-transform (previously using plain `add()`) is what
              // was corrupting decals on every rotated side; it was invisible
              // on "front" only because modelGroup's rotation is identity
              // there, so double-applying it was harmless.
              ref.modelGroup.attach(decalMesh);
            } else {
              // PlaneGeometry fallback is built in LOCAL space, so a plain
              // local position/quaternion + regular `add()` is correct here.
              decalMesh.position.copy(localPt).addScaledVector(localNrm, 0.012);
              decalMesh.quaternion.copy(localQuat);
              ref.modelGroup.add(decalMesh);
            }
          }
        });

        isUpdating3DRef.current = false;
        requestRenderRef.current?.();
        return;
      }

      const drawDesignIntoImprint = (
        ctx: CanvasRenderingContext2D,
        side: string,
        W: number,
        H: number,
        src: HTMLCanvasElement | null,
        tabKey: string
      ) => {
        if (!src) return;

        // 3D imprint (where brackets are drawn on the model) — prefer the zone
        // that matches THIS tab first, so two zones sharing the same physical
        // side (e.g. "FRONT Imprint Area" and "FRONT Imprint Area1") don't get
        // cross-mapped into one another.
        const zone3D =
          zones.find(z => z.side === side && z.source === '3d' && zoneKey(z) === tabKey) ||
          zones.find(z => z.side === side && z.source === '3d') ||
          zones.find(z => {
            const n = ((z.name || '') as string).toLowerCase();
            return z.side === side && n.includes('imprint');
          });

        // 2D zone (where Fabric places the logo on the 2D canvas) — same name-first matching
        const zone2D =
          zones.find(z => z.side === side && z.source !== '3d' && zoneKey(z) === tabKey) ||
          zones.find(z => z.side === side && z.source !== '3d') ||
          zones.find(z => z.side === side && z.source === '2d') ||
          zone3D ||
          zones.find(z => z.side === side);

        if (zone3D && zone2D) {
          // Source = logo area on the design canvas (2D zone)
          const sx = (zone2D.x_percent / 100) * src.width;
          const sy = (zone2D.y_percent / 100) * src.height;
          const sw = (zone2D.width_percent / 100) * src.width;
          const sh = (zone2D.height_percent / 100) * src.height;

          // Dest = imprint brackets on the 3D texture
          const dx = (zone3D.x_percent / 100) * W;
          const dy = (zone3D.y_percent / 100) * H;
          const dw = (zone3D.width_percent / 100) * W;
          const dh = (zone3D.height_percent / 100) * H;

          // Map 2D zone content → 3D imprint (correct position + size)
          ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
        } else if (zone3D) {
          const dx = (zone3D.x_percent / 100) * W;
          const dy = (zone3D.y_percent / 100) * H;
          const dw = (zone3D.width_percent / 100) * W;
          const dh = (zone3D.height_percent / 100) * H;
          ctx.drawImage(src, dx, dy, dw, dh);
        } else {
          ctx.drawImage(src, 0, 0, W, H);
        }
      };

      if (shape === 'cylinder') {
        const cc = getCylinderCanvas();
        const ctx = cc.getContext('2d');
        if (!ctx) { isUpdating3DRef.current = false; return; }

        // Don't fill with base color for original models - preserve their textures
        // Only fill if we're using fallback shapes
        const hasOriginalModel = ref.modelGroup.children.some((child: any) => child.userData?.isOriginalModel);
        if (!hasOriginalModel) {
          ctx.fillStyle = baseColor;
          ctx.fillRect(0, 0, 2048, 1024);
        }

        const sidesToDraw = [
          { side: 'back', x: 0 },
          { side: 'right', x: 512 },
          { side: 'front', x: 1024 },
          { side: 'left', x: 1536 },
        ];

        sidesToDraw.forEach(item => {
          const tabKeysForSide: string[] = [];
          const seen = new Set<string>();
          zones.forEach(z => {
            if (z.side === item.side) {
              const key = zoneKey(z);
              if (!seen.has(key)) {
                seen.add(key);
                tabKeysForSide.push(key);
              }
            }
          });
          if (tabKeysForSide.length === 0) tabKeysForSide.push(item.side);

          const stripCanvas = document.createElement('canvas');
          stripCanvas.width = 512;
          stripCanvas.height = 1024;
          const sCtx = stripCanvas.getContext('2d');
          if (!sCtx) return;

          sCtx.fillStyle = baseColor;
          sCtx.fillRect(0, 0, 512, 1024);

          drawZoneOverlay(sCtx, zones, item.side, 512, 1024);

          tabKeysForSide.forEach(tabKey => {
            let src: HTMLCanvasElement | null = null;
            if (tabKey === currentSide && designCanvas) {
              src = designCanvas;
            } else {
              const thumbImg = sideThumbnails3DRef.current[tabKey];
              if (thumbImg) {
                const t = document.createElement('canvas');
                t.width = 512;
                t.height = 1024;
                const tCtx = t.getContext('2d');
                if (tCtx) tCtx.drawImage(thumbImg, 0, 0, 512, 1024);
                src = t;
              }
            }
            drawDesignIntoImprint(sCtx, item.side, 512, 1024, src, tabKey);
          });

          ctx.drawImage(stripCanvas, item.x, 0, 512, 1024);
        });

        ref.modelGroup.traverse((child: any) => {
          if (child.isMesh && child.material) {
            // Skip original GLTF model materials entirely to preserve their real textures
            if (child.userData?.isOriginalModel) return;

            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat: any) => {
              if (!mat.map || mat.map.image !== cc) {
                if (!texturesRef.current['cylinder']) {
                  texturesRef.current['cylinder'] = new THREE.CanvasTexture(cc);
                }
                mat.map = texturesRef.current['cylinder'];
              }
              mat.map.needsUpdate = true;
              // Don't override color - preserve original model color
            });
          }
        });
      } else {
        const getMaterialForSide = (sideName: string): any => {
          const child: any = ref.modelGroup.children.find((c: any) => c.name === sideName);
          if (child && child.material && !Array.isArray(child.material)) {
            return child.material;
          }

          const mainMesh: any = ref.modelGroup.children.find((c: any) => c.name === 'front' || c.isMesh);
          if (mainMesh && mainMesh.material) {
            if (Array.isArray(mainMesh.material)) {
              if (sideName === 'right') return mainMesh.material[0];
              if (sideName === 'left') return mainMesh.material[1];
              if (sideName === 'top') return mainMesh.material[2];
              if (sideName === 'front') return mainMesh.material[4];
              if (sideName === 'back') return mainMesh.material[5];
            } else {
              if (sideName === 'front') return mainMesh.material;
            }
          }
          return null;
        };

        const updateFaceForSide = (physicalSide: string, tabKeys: string[]) => {
          const mat = getMaterialForSide(physicalSide);
          if (!mat) return;

          // Check if this is an original model mesh
          const isOriginalModel = ref.modelGroup.children.some((child: any) =>
            child.userData?.isOriginalModel && child.name === physicalSide
          );

          // Don't override original model textures
          if (isOriginalModel) return;

          // Don't override color - preserve original model color

          const compositeCanvas = document.createElement('canvas');
          compositeCanvas.width = 1024;
          compositeCanvas.height = 1024;
          const cCtx = compositeCanvas.getContext('2d');
          if (!cCtx) return;

          cCtx.fillStyle = baseColor;
          cCtx.fillRect(0, 0, 1024, 1024);

          drawZoneOverlay(cCtx, zones, physicalSide, 1024, 1024);

          tabKeys.forEach(tabKey => {
            let src: HTMLCanvasElement | null = null;
            if (tabKey === currentSide && designCanvas) {
              src = designCanvas;
            } else {
              const thumbImg = sideThumbnails3DRef.current[tabKey];
              if (thumbImg) {
                const t = document.createElement('canvas');
                t.width = 1024;
                t.height = 1024;
                const tCtx = t.getContext('2d');
                if (tCtx) tCtx.drawImage(thumbImg, 0, 0, 1024, 1024);
                src = t;
              }
            }
            drawDesignIntoImprint(cCtx, physicalSide, 1024, 1024, src, tabKey);
          });

          if (!texturesRef.current[physicalSide]) {
            texturesRef.current[physicalSide] = new THREE.CanvasTexture(compositeCanvas);
          } else {
            const existingTexture = texturesRef.current[physicalSide];
            const existingCanvas = existingTexture.image as HTMLCanvasElement;
            const eCtx = existingCanvas.getContext('2d');
            if (eCtx) {
              eCtx.clearRect(0, 0, 1024, 1024);
              eCtx.drawImage(compositeCanvas, 0, 0);
            }
          }

          mat.map = texturesRef.current[physicalSide];
          texturesRef.current[physicalSide].needsUpdate = true;
          mat.needsUpdate = true;
        };

        const physicalToTabs: Record<string, string[]> = {};
        const seen = new Set<string>();
        zones.forEach(z => {
          const key = zoneKey(z);
          if (!seen.has(key)) {
            seen.add(key);
            if (!physicalToTabs[z.side]) physicalToTabs[z.side] = [];
            physicalToTabs[z.side].push(key);
          }
        });

        if (Object.keys(physicalToTabs).length > 0) {
          Object.entries(physicalToTabs).forEach(([physicalSide, tabKeys]) => {
            updateFaceForSide(physicalSide, tabKeys);
          });
        } else {
          ['front', 'back', 'left', 'right', 'top'].forEach(s => updateFaceForSide(s, [s]));
        }
      }
    } finally {
      isUpdating3DRef.current = false;
      // Signal the demand-driven render loop to draw one fresh frame
      requestRenderRef.current?.();
    }
  }, [currentSide, product.name, dominantColor, zones]);

  // Single shared debounce so we never rebuild 3D textures more than once per
  // burst of changes, whichever call site triggers it.
  const scheduleUpdate3D = useCallback(() => {
    if (canvasRenderDebounceRef.current) clearTimeout(canvasRenderDebounceRef.current);
    canvasRenderDebounceRef.current = setTimeout(() => {
      canvasRenderDebounceRef.current = null;
      update3DTextures();
    }, 60);
  }, [update3DTextures]);



  // ── Side tab change ──────────────────────────────────────────────────────────
  const changeSideTab = (tabKey: string) => {
    if (tabKey === currentSide) return;

    // Always cache both before changing the active side
    fabricHandle2DRef.current?.cacheCurrentSide();
    fabricHandle3DRef.current?.cacheCurrentSide();

    // Resolve physical side for 3D rotation
    const matchingZone = zones.find(z => zoneKey(z) === tabKey);
    const physicalSide = matchingZone ? matchingZone.side : tabKey;

    const ref = threeSceneRef.current;
    if (ref) {
      const rot = SIDE_ROTATIONS[physicalSide] || SIDE_ROTATIONS['front'];
      ref.modelGroup.rotation.set(rot.x, rot.y, rot.z);
      ref.controls.target.set(0, 0, 0);
      ref.camera.position.set(0, 1.5, 3.5);
    }

    setCurrentSide(tabKey);
    setSelectedObject(null);
    setLayers([]);

    // After React commits the new side, refresh layers + force 3D texture update
    queueMicrotask(() => {
      const handle = getActiveFabricHandle();
      if (handle) {
        setLayers(handle.getLayers());
      }
      update3DTextures();
    });
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleAddText = () => {
    if (!customText.trim()) {
      showToast(' Please enter some text!');
      return;
    }
    const id = Math.random().toString(36).substring(2, 11);

    // Add to both canvases
    fabricHandle2DRef.current?.addText(customText, textFont, textSize, textColor, textBold, textItalic, id);
    fabricHandle3DRef.current?.addText(customText, textFont, textSize, textColor, textBold, textItalic, id);

    // Force relative sync so the object lands inside the matching 3D imprint zone
    queueMicrotask(() => {
      const active = getActiveFabricHandle();
      const other = viewMode === '2d' ? fabricHandle3DRef.current : fabricHandle2DRef.current;

      if (active && other) {
        // Prefer the existing relative-stats API used by onObjectModified
        const stats = (active as any).getRelativeStats?.(id);
        if (stats) {
          other.applyRelativeStats(id, stats);
        }
      }

      fabricHandle2DRef.current?.cacheCurrentSide();
      fabricHandle3DRef.current?.cacheCurrentSide();
      scheduleUpdate3D();

      if (active) {
        setLayers(active.getLayers());
      }
    });

    setCustomText('');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    let file = rawFile;
    const isVector = rawFile.name.match(/\.(pdf|ai|eps)$/i);
    if (isVector) {
      showToast(' Rendering vector file...');
      try {
        file = await normaliseToImage(rawFile);
      } catch (err) {
        showToast(' Failed to render vector file.');
        console.error(err);
        return;
      }
    }

    const processLogo = (fileObj: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;

        const id = Math.random().toString(36).substring(2, 11);

        // Add to both canvases
        fabricHandle2DRef.current?.addLogoFile(dataUrl, id);
        fabricHandle3DRef.current?.addLogoFile(dataUrl, id);


        queueMicrotask(() => {
          // Force logo into the imprint zone on the 2D canvas
          fabricHandle2DRef.current?.fitSelectedToZone?.();
          fabricHandle2DRef.current?.centerSelected?.();

          fabricHandle2DRef.current?.cacheCurrentSide();
          fabricHandle3DRef.current?.cacheCurrentSide();
          scheduleUpdate3D();

          const active = getActiveFabricHandle();
          if (active) setLayers(active.getLayers());
        });
      };
      reader.readAsDataURL(fileObj);
    };

    if (removeBgEnabled) {
      setIsRemovingBg(true);
      showToast('Removing background... this may take a moment.');
      try {
        const blob = await removeBackground(file, { model: 'isnet_fp16' });
        const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".png", { type: "image/png" });
        processLogo(newFile);
        showToast('Background removed!');
      } catch (err) {
        console.error('Bg removal error:', err);
        showToast('Failed to remove background. Using original image.');
        processLogo(file);
      } finally {
        setIsRemovingBg(false);
      }
    } else {
      processLogo(file);
    }
    e.target.value = '';
  };

  const handleObjectModified = useCallback((id: string, stats: any) => {
    if (viewMode === '2d') {
      fabricHandle3DRef.current?.applyRelativeStats(id, stats);
    } else {
      fabricHandle2DRef.current?.applyRelativeStats(id, stats);
    }
    // Don't call update3DTextures() directly here — the object's own
    // fc.renderAll() already fires Fabric's 'after:render' event, which
    // routes through handleCanvasRender's debounce below. Calling it here too
    // meant every drag/resize triggered TWO full decal/texture rebuilds.
  }, [viewMode]);

  const handleOpacityChange = (v: number) => {
    setOpacity(v);
    getActiveFabricHandle()?.setOpacity(v);
  };

  const handleDownload2D = () => {
    const snap = fabricHandle2DRef.current?.getSnapshot();
    if (!snap) return;
    const link = document.createElement('a');
    link.download = `${product.name}_${currentSide}_custom.png`;
    link.href = snap;
    link.click();
    showToast('2D Design downloaded!');
  };

  const handleDownload3D = () => {
    const ref = threeSceneRef.current;
    if (!ref) return;
    ref.renderer.render(ref.scene, ref.camera);
    const dataURL = ref.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${product.name}_3d_preview.png`;
    link.href = dataURL;
    link.click();
    showToast(' 3D Preview downloaded!');
  };

  const handleDownloadPDF = async () => {
    try {
      showToast('Generating PDF proof...');

      let threeDSnapshotDataUrl: string | null = null;
      if (threeSceneRef.current) {
        threeSceneRef.current.renderer.render(threeSceneRef.current.scene, threeSceneRef.current.camera);
        threeDSnapshotDataUrl = threeSceneRef.current.renderer.domElement.toDataURL('image/jpeg', 0.70);
      }

      let twoDSnapshotDataUrl: string | null = null;
      if (fabricHandle2DRef.current) {
        const snap = fabricHandle2DRef.current.getSnapshot();
        if (snap) {
          twoDSnapshotDataUrl = await new Promise<string>(res => {
            const img = new Image();
            img.onload = () => {
              const maxPx = 600;
              const ratio = img.width / img.height;
              const w = ratio >= 1 ? maxPx : Math.round(maxPx * ratio);
              const h = ratio >= 1 ? Math.round(maxPx / ratio) : maxPx;
              const c = document.createElement('canvas');
              c.width = w; c.height = h;
              const ctx = c.getContext('2d')!;
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              res(c.toDataURL('image/jpeg', 0.70));
            };
            img.onerror = () => res(snap);
            img.src = snap;
          });
        }
      }

      // Only include 2D thumbnails in the PDF
      const sideThumbnailsDataUrls: Record<string, string> = {};
      Object.entries(sideThumbnails2DRef.current).forEach(([k, img]) => {
        if (img && img.src && img.src.startsWith('data:image/')) {
          sideThumbnailsDataUrls[k] = img.src;
        }
      });
      // Always use the freshest 2D snapshot for the current side
      if (twoDSnapshotDataUrl) {
        sideThumbnailsDataUrls[currentSide] = twoDSnapshotDataUrl;
      }

      await generateProductSpecSheet({
        product,
        colorName: productColorName || 'Default',
        colorHex: dominantColor || '#cccccc',
        imprintMethod,
        imprintColor,
        pmsNumber,
        imprintLocationCount,
        imprintLocations,
        // quantity,
        zones,
        twoDSnapshotDataUrl,
        threeDSnapshotDataUrl: null,
        sideThumbnails: sideThumbnailsDataUrls,
      });
      showToast('PDF downloaded successfully');
    } catch (e) {
      console.error(e);
      showToast('Failed to generate PDF');
    }
  };

  const handleFinishDesign = async () => {
    // ── Step 1: Capture fresh snapshots ──────────────────────────────────────
    // Always grab the 2D canvas snapshot first (this shows the logo placed by the user)
    let twoDSnapshotDataUrl: string | null = null;
    if (fabricHandle2DRef.current) {
      const snap = fabricHandle2DRef.current.getSnapshot();
      if (snap) twoDSnapshotDataUrl = snap;
    }

    // Try to grab the 3D snapshot if the 3D scene is active
    let threeDSnapshotDataUrl: string | null = null;
    const ref = threeSceneRef.current;
    if (ref) {
      ref.renderer.render(ref.scene, ref.camera);
      threeDSnapshotDataUrl = ref.renderer.domElement.toDataURL('image/png');
    }

    // ── Step 2: Build side thumbnails (stale cache + fresh current-side snap) ─
    // Only include 2D thumbnails in the PDF
    const sideThumbnailsDataUrls: Record<string, string> = {};
    Object.entries(sideThumbnails2DRef.current).forEach(([k, img]) => {
      if (img && img.src && img.src.startsWith('data:image/')) sideThumbnailsDataUrls[k] = img.src;
    });
    // Always overwrite with the freshest 2D snapshot for the current side
    if (twoDSnapshotDataUrl) {
      sideThumbnailsDataUrls[currentSide] = twoDSnapshotDataUrl;
    }

    // ── Step 3: Pick the best "main preview" image ────────────────────────────
    // Prefer 3D if available, else fall back to 2D (which always has the logo)
    const mainPreviewUrl = threeDSnapshotDataUrl || twoDSnapshotDataUrl || '';

    if (onFinishDesign) {
      showToast('Generating final design files...');
      let pdfResult: string | undefined = undefined;
      try {
        pdfResult = await generateProductSpecSheet({
          product,
          colorName: productColorName || 'Default',
          colorHex: dominantColor || '#cccccc',
          imprintMethod,
          imprintColor,
          pmsNumber,
          imprintLocationCount,
          imprintLocations,
          // quantity,
          zones,
          twoDSnapshotDataUrl,
          threeDSnapshotDataUrl: null,
          sideThumbnails: sideThumbnailsDataUrls,
        }, true);
      } catch (err) {
        console.error("Failed to generate PDF for finish", err);
      }

      onFinishDesign({
        snapshotDataUrl: mainPreviewUrl,
        pdfDataUrl: pdfResult || null,
        colorName: productColorName || 'Default',
        colorHex: dominantColor || '#cccccc',
        imprintMethod,
        imprintColor,
        pmsNumber,
        // quantity
      });
    } else {
      // Standalone mode: download the best available snapshot
      const link = document.createElement('a');
      link.download = `${product.name}_finished_design.png`;
      link.href = mainPreviewUrl;
      link.click();
      showToast('Design exported!');
    }
  };


  const handleClearSide = () => getActiveFabricHandle()?.clearSide();

  const handleResetAll = () => {
    const seen = new Set<string>();
    zones.forEach(z => {
      const key = zoneKey(z);
      if (!seen.has(key)) {
        seen.add(key);
        sideObjects2DRef.current[key] = [];
        sideObjects3DRef.current[key] = [];
      }
    });
    if (seen.size === 0) {
      ['front', 'back', 'left', 'right', 'top'].forEach(s => {
        sideObjects2DRef.current[s] = [];
        sideObjects3DRef.current[s] = [];
      });
    }
    sideThumbnails2DRef.current = {};
    sideThumbnails3DRef.current = {};
    fabricHandle2DRef.current?.clearSide();
    fabricHandle3DRef.current?.clearSide();
    update3DTextures();
    showToast('Reset complete.');
  };

  const handleLogo3DUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    setLogo3DName(rawFile.name);

    let file = rawFile;
    const isVector = rawFile.name.match(/\.(pdf|ai|eps)$/i);
    if (isVector) {
      showToast('Rendering vector file...');
      try {
        file = await normaliseToImage(rawFile);
      } catch (err) {
        showToast('Failed to render vector file.');
        console.error(err);
        return;
      }
    }

    let imageSource: File | Blob = file;

    if (removeBgEnabled) {
      setIsRemovingBg(true);
      showToast('Removing background... this may take a moment.');
      try {
        imageSource = await removeBackground(rawFile, { model: 'isnet_fp16' });
        showToast('Background removed!');
      } catch (err) {
        console.error('Bg removal error:', err);
        showToast('Failed to remove background. Using original image.');
      } finally {
        setIsRemovingBg(false);
      }
    }

    const url = URL.createObjectURL(imageSource);
    const img = new Image();
    img.onload = () => {
      setPendingLogoImg(img);
      showToast('Logo ready — click the 3D model!');
    };
    img.src = url;
    e.target.value = '';
  };

  const handleAdd3DEmoji = (emoji: string) => {
    const sz = 160;
    const ec = document.createElement('canvas');
    ec.width = sz; ec.height = sz;
    const ctx = ec.getContext('2d');
    if (ctx) {
      ctx.font = `${Math.floor(sz * 0.72)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(emoji, sz / 2, sz / 2);
    }
    const img = new Image();
    img.onload = () => {
      setPendingLogoImg(img);
      showToast('Preset selected — click the 3D model!');
    };
    img.src = ec.toDataURL();
  };

  const handleUndoDecal = () => {
    getActiveFabricHandle()?.undoDecal();
  };

  const handleClearDecals = () => {
    getActiveFabricHandle()?.clearDecals();
  };

  const handleStampDecal = (
    u: number,
    v: number,
    hitObject: THREE.Object3D,
    materialIndex: number | undefined,
    resolvedTargetSide?: string,
    resolvedLocalU?: number
  ) => {
    const shape = shapeTypeRef.current;
    let targetSide: string;
    let localU: number;

    if (resolvedTargetSide !== undefined && resolvedLocalU !== undefined) {
      targetSide = resolvedTargetSide;
      localU = resolvedLocalU;
    } else {
      targetSide = currentSide;
      localU = u;

      let fallbackHitSide = 'front';
      if (shape === 'cylinder') {
        if (u >= 0.0 && u < 0.25) fallbackHitSide = 'back';
        else if (u >= 0.25 && u < 0.5) fallbackHitSide = 'right';
        else if (u >= 0.5 && u < 0.75) fallbackHitSide = 'front';
        else fallbackHitSide = 'left';
        localU = (u % 0.25) / 0.25;
      } else {
        if (['front', 'back', 'left', 'right', 'top'].includes(hitObject.name)) {
          fallbackHitSide = hitObject.name;
        } else {
          const matIndex = materialIndex;
          if (matIndex === 0) fallbackHitSide = 'right';
          else if (matIndex === 1) fallbackHitSide = 'left';
          else if (matIndex === 2) fallbackHitSide = 'top';
          else if (matIndex === 4) fallbackHitSide = 'front';
          else if (matIndex === 5) fallbackHitSide = 'back';
        }
      }

      const currentZoneConfig = zones.find(z => zoneKey(z) === currentSide);

      if (currentZoneConfig && currentZoneConfig.side === fallbackHitSide) {
        targetSide = currentSide;
      } else {
        const matchingZone = zones.find(z => z.side === fallbackHitSide);
        if (matchingZone) {
          targetSide = zoneKey(matchingZone);
        } else {
          targetSide = fallbackHitSide;
        }
      }
    }

    // Physical side for imprint lookup
    const matchingZoneForSide = zones.find(z => zoneKey(z) === targetSide);
    const physicalSide = matchingZoneForSide ? matchingZoneForSide.side : targetSide;

    // 3D imprint zone = allowed print area on the model
    const imprintZone =
      zones.find(z => {
        const name = ((z.name || '') as string).toLowerCase();
        return (
          z.side === physicalSide &&
          (z.source === '3d' ||
            (z as any).zone_type === 'imprint' ||
            name.includes('imprint'))
        );
      }) ||
      zones.find(z => z.side === physicalSide && z.source === '3d') ||
      zones.find(z => z.side === physicalSide);

    // ── Always place at the center of the imprint zone ───────────────────────
    // Express the target position as FRACTIONS (0..1) of the imprint zone
    // rather than as raw pixels against *today's* canvas size. If this stamp
    // requires switching to a different side tab first, the canvas can be
    // rebuilt at a different pixel size (different background image aspect
    // ratio) before the object is actually added — resolving to raw pixels up
    // front used stale dimensions and could place (or clip) the decal in the
    // wrong spot, which is why 3D-placed logos sometimes failed to show up.
    let xFrac: number;
    let yFrac: number;

    if (imprintZone) {
      xFrac = (imprintZone.x_percent + imprintZone.width_percent / 2) / 100;
      yFrac = (imprintZone.y_percent + imprintZone.height_percent / 2) / 100;
    } else {
      // No zone defined — fall back to direct UV mapping
      xFrac = localU;
      yFrac = v;
    }

    const opacityVal = placeOpacity / 100;

    // Build and add the fabric object using whatever the canvas size is AT THE
    // MOMENT we actually add it (i.e. after any side switch has resolved).
    const buildAndAddFabricObject = () => {
      const canvasSize = fabricHandle2DRef.current?.getCanvasSize() ?? { width: 600, height: 600 };
      const canvasX = xFrac * canvasSize.width;
      const canvasY = yFrac * canvasSize.height;

      if (placeType === 'text') {
        const text = (placeText || 'Text').trim();
        const fontSize = Math.round(placeSize * 0.25);

        const unwarpedCanvas = renderTextToCanvas(text, placeFont, fontSize, placeColor, true, false);
        const warpedCanvas = shape === 'cylinder' ? warpCylinder(unwarpedCanvas, 0.90, 0.12) : unwarpedCanvas;

        const fObj = new fabric.Image(warpedCanvas, {
          left: canvasX,
          top: canvasY,
          originX: 'center',
          originY: 'center',
          scaleX: 0.5,
          scaleY: 0.5,
          angle: placeRotation,
          opacity: opacityVal,
          name: '__decal__'
        });
        (fObj as any)._unwarpedElement = unwarpedCanvas;

        fabricHandle2DRef.current?.addStampedObject(fObj);
        showToast(`Design stamped on ${targetSide.toUpperCase()}!`);
        scheduleUpdate3D();
      } else if (pendingLogoImg) {
        const unwarpedCanvas = document.createElement('canvas');
        unwarpedCanvas.width = pendingLogoImg.naturalWidth || pendingLogoImg.width;
        unwarpedCanvas.height = pendingLogoImg.naturalHeight || pendingLogoImg.height;
        const uCtx = unwarpedCanvas.getContext('2d');
        if (uCtx) uCtx.drawImage(pendingLogoImg, 0, 0);

        const warpedCanvas = shape === 'cylinder' ? warpCylinder(unwarpedCanvas, 0.90, 0.12) : unwarpedCanvas;
        const scale = (placeSize * 0.25) / Math.max(warpedCanvas.width, warpedCanvas.height);

        const fImg = new fabric.Image(warpedCanvas, {
          left: canvasX,
          top: canvasY,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          angle: placeRotation,
          opacity: opacityVal,
          name: '__decal__'
        });
        (fImg as any)._unwarpedElement = unwarpedCanvas;

        fabricHandle2DRef.current?.addStampedObject(fImg);
        showToast(`Design stamped on ${targetSide.toUpperCase()}!`);
        scheduleUpdate3D();
      } else {
        showToast('Choose a logo or type text first!');
      }
    };

    if (targetSide && targetSide !== currentSide) {
      changeSideTab(targetSide);
      // Wait for the side switch (async state update + canvas rebuild/restore)
      // to actually land before resolving canvas size and adding the object.
      setTimeout(buildAndAddFabricObject, 60);
    } else {
      buildAndAddFabricObject();
    }
  };


  const handleSelectionChange = (obj: any) => {
    setSelectedObject(obj);
    if (obj) {
      const v = Math.round((obj.opacity ?? 1) * 100);
      setOpacity(v);
    }
    const handle = getActiveFabricHandle();
    if (handle) {
      setLayers(handle.getLayers());
    }
  };

  const handleCanvasRender = useCallback(() => {
    // Debounce: only run 3D texture sync once canvas activity settles (80ms)
    if (canvasRenderDebounceRef.current) clearTimeout(canvasRenderDebounceRef.current);
    canvasRenderDebounceRef.current = setTimeout(() => {
      canvasRenderDebounceRef.current = null;

      // Update layers UI (cheap — just reads object list)
      const handle2D = fabricHandle2DRef.current;
      if (handle2D) setLayers(handle2D.getLayers());

      // Only sync 3D textures when the 3D viewport is visible
      if (viewMode === '3d') {
        update3DTextures();
      }
    }, 80);
  }, [update3DTextures, viewMode]);

  const handleSetZones = (logo: DesignZone | null, text: DesignZone | null) => {
    setLogoZone(logo);
    setTextZone(text);
  };

  const handleToggleRemoveBgQuick = () => {
    const next = !removeBgEnabled;
    setRemoveBgEnabled(next);
    showToast(next ? 'Background removal enabled for the next upload.' : 'Background removal disabled.');
  };

  const productCode = `TBL-${String(product.id).padStart(3, '0')}-STL`;
  const unitPrice = 14.24;
  const decorationPrice = 1.25;
  const setupFee = 35;
  const shippingEstimate = 4;
  // const totalPrice = quantity * unitPrice + setupFee + shippingEstimate;

  const zones2D = useMemo(() => zones.filter(z => z.source !== '3d'), [zones]);
  const zones3D = useMemo(() => zones.filter(z => z.source === '3d'), [zones]);

  return (
    <div className="studio-customizer">

      <header className="studio-topbar">
        <button type="button" className="studio-brand" onClick={onBack}>
          <span><Layers size={18} /></span>
          <strong>PromoStudio</strong>
        </button>
        <div className="studio-title-divider" />
        <div className="studio-product-heading">
          <strong>{product.name}</strong>
          <code>{productCode}</code>
        </div>

        {/* ── Centered 2D / 3D toggle ── */}
        <div className="topbar-view-toggle">
          <button
            type="button"
            className={`topbar-view-btn ${viewMode === '2d' ? 'active' : ''}`}
            onClick={() => {
              // Snapshot the live canvas state BEFORE toggling. FabricCanvas2D no
              // longer remounts on viewMode change (that was the source of the
              // "logo jumps on toggle" bug), but caching here keeps the side
              // thumbnails / 3D texture cache fresh regardless.
              fabricHandle2DRef.current?.cacheCurrentSide();
              fabricHandle3DRef.current?.cacheCurrentSide();
              setViewMode('2d');
            }}
          >
            2D View
          </button>
          <button
            type="button"
            className={`topbar-view-btn ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => {
              fabricHandle2DRef.current?.cacheCurrentSide();
              fabricHandle3DRef.current?.cacheCurrentSide();
              setViewMode('3d');
              queueMicrotask(() => update3DTextures());
            }}
          >
            3D View
          </button>
        </div>

        <div className="studio-top-actions">
          {!isEmbed && (
            <button type="button" className="studio-admin-btn" onClick={onBack}>
              <LayoutGrid size={15} />Admin
            </button>
          )}
          <span className="studio-toolbar-divider" />
          <button
            type="button"
            className="studio-pdf-btn"
            title="Export PDF Spec Sheet"
            onClick={handleFinishDesign}
          >
            <Download size={15} />Export
          </button>
        </div>
      </header>

      {!imagesReady ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%', gap: '1rem', color: '#64748b' }}>
          <Loader2 size={48} style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ fontWeight: 500, fontSize: '1.2rem' }}>Preparing Product Editor...</p>
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : (
        <><div className="studio-workspace">
          <LeftSidebar
            customText={customText}
            setCustomText={setCustomText}
            textFont={textFont}
            setTextFont={setTextFont}
            textSize={textSize}
            setTextSize={setTextSize}
            textColor={textColor}
            setTextColor={setTextColor}
            onAddText={handleAddText}
            onLogoUpload={handleLogoUpload}
            selectedObject={selectedObject}
            opacity={opacity}
            onOpacityChange={handleOpacityChange}
            onBringFront={() => getActiveFabricHandle()?.bringFront()}
            onSendBack={() => getActiveFabricHandle()?.sendBack()}
            onDeleteObject={() => getActiveFabricHandle()?.deleteSelected()}
            currentSide={currentSide}
            onSideChange={changeSideTab}
            productColorName={productColorName}
            setProductColorName={handleProductColorChange}
            imprintLocationCount={imprintLocationCount}
            setImprintLocationCount={setImprintLocationCount}
            imprintLocations={imprintLocations}
            setImprintLocations={setImprintLocations}
            imprintMethod={imprintMethod}
            setImprintMethod={setImprintMethod}
            imprintColor={imprintColor}
            setImprintColor={setImprintColor}
            pmsNumber={pmsNumber}
            setPmsNumber={setPmsNumber}
            showImprintArea={showImprintArea}
            setShowImprintArea={setShowImprintArea}
            availableImprintMethods={product.imprint_methods || []}
            productMaterial={product.material}
            placementMode={placementMode}
            setPlacementMode={setPlacementMode}
            placeType={placeType}
            setPlaceType={setPlaceType}
            placeText={placeText}
            setPlaceText={setPlaceText}
            placeFont={placeFont}
            setPlaceFont={setPlaceFont}
            placeColor={placeColor}
            setPlaceColor={setPlaceColor}
            onLogo3DUpload={handleLogo3DUpload}
            onUndoDecal={handleUndoDecal}
            onClearDecals={handleClearDecals}
            logo3DName={logo3DName}
            removeBgEnabled={removeBgEnabled}
            setRemoveBgEnabled={setRemoveBgEnabled}
            isRemovingBg={isRemovingBg}
            zones={zones} />

          <main className="studio-main">

            <div
              className="studio-2d-viewport-container"
              style={viewMode === '2d' ? { display: 'flex' } : { display: 'none' }}
            >
              <FabricCanvas2D
                ref={fabricHandle2DRef}
                product={product}
                currentSide={currentSide}
                selectedZoneId={selectedZoneId}
                zones={zones}
                sideObjects={sideObjects2DRef}
                sideThumbnails={sideThumbnails3DRef}
                onSelectionChange={handleSelectionChange}
                onCanvasRender={handleCanvasRender}
                onSetZones={handleSetZones}
                showToast={showToast}
                showImprintArea={showImprintArea}
                onBackgroundLoaded={() => {
                  if (!shapeTypeRef.current) {
                    shapeTypeRef.current = 'cylinder';
                  }
                }}
                onObjectModified={handleObjectModified}
                viewMode={viewMode} />
            </div>

            <div style={{ display: viewMode === '3d' ? 'block' : 'none', width: '100%', height: '100%' }}>
              <ThreeViewport
                product={product}
                currentSide={currentSide}
                zones={zones3D}
                dominantColor={dominantColor}
                preloadedImages={preloadedImages}
                imagesReady={imagesReady}
                cylinderCanvas={getCylinderCanvas()}
                textures={texturesRef}
                sideThumbnails={sideThumbnails3DRef}
                onThreeReady={(sceneRef) => { threeSceneRef.current = sceneRef; }}
                onShapeResolved={(shape) => { shapeTypeRef.current = shape; }}
                onModelBuilt={() => {
                  update3DTextures();
                }}
                onSideChange={changeSideTab}
                imprintMethod={imprintMethod}
                placementMode={placementMode}
                placeSize={placeSize}
                onStampDecal={handleStampDecal}
                onRequestRender={(fn) => { requestRenderRef.current = fn; }} />
            </div>
          </main>

          <RightSidebar
            product={product}
            zones={zones}
            currentSide={currentSide}
            onSideChange={changeSideTab}
            selectedObject={selectedObject}
            opacity={opacity}
            onOpacityChange={handleOpacityChange}
            removeBgEnabled={removeBgEnabled}
            onToggleRemoveBg={handleToggleRemoveBgQuick}
            onFlipHorizontal={() => getActiveFabricHandle()?.flipSelectedHorizontal()}
            onFlipVertical={() => getActiveFabricHandle()?.flipSelectedVertical()}
            onCenterSelected={() => getActiveFabricHandle()?.centerSelected()}
            onFitSelected={() => getActiveFabricHandle()?.fitSelectedToZone()}
            onDeleteObject={() => getActiveFabricHandle()?.deleteSelected()}
            onDownload3D={handleDownload3D}
            onDownload2D={handleDownload2D}
            onClearSide={handleClearSide}
            onResetAll={handleResetAll}
            layers={layers}
            onSelectLayer={(id) => getActiveFabricHandle()?.selectLayer(id)}
            onDeleteLayer={(id) => getActiveFabricHandle()?.deleteLayer(id)}
            onMoveLayer={(id, dir) => getActiveFabricHandle()?.moveLayer(id, dir)}
            getPhysicalStats={(w, h) => getActiveFabricHandle()?.getPhysicalStats(w, h) || null}
            setPhysicalSize={(w, h, lock, azw, azh) => getActiveFabricHandle()?.setPhysicalSize(w, h, lock, azw, azh)}
            setPhysicalPlacement={(l, t, azw, azh) => getActiveFabricHandle()?.setPhysicalPlacement(l, t, azw, azh)}
            viewMode={viewMode}
            selectedZoneId={selectedZoneId}
            onZoneSelect={setSelectedZoneId} />
        </div><footer className="studio-cartbar">
            <div className="studio-cartbar__inner">
              <div className="studio-cartbar__summary">
                <span className="studio-cartbar__product-name">{product.name}</span>
                <span className="studio-cartbar__meta">  Color: <strong>{productColorName}</strong> · Method: <strong>{imprintMethod}</strong></span>
              </div>
              <div className="studio-cartbar__actions">

                <button
                  type="button"
                  className="studio-finish-btn"
                  onClick={handleFinishDesign}
                >
                  {isEmbed ? '✅ Finish & Send to Cart' : '⬇ Export Design'}
                </button>
              </div>
            </div>
          </footer></>
      )}
    </div>
  );
}