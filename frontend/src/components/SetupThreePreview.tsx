import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// @ts-ignore
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { Product, SetupZone, SideKey } from '../types';
import { resolveMediaUrl } from '../utils/apiConfig';
// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  product: Product;
  zones: SetupZone[];
  currentSide: string;
  dominantColor: string | null;
  preloadedImages: Record<string, HTMLImageElement>;
  imagesReady: boolean;
  // 3-D selector
  select3DMode: boolean;
  zone3DWidth: number;
  zone3DHeight: number;
  zoneMode: 'logo' | 'text' | 'combined';
  onZonePlaced: (
    side: SideKey,
    x: number, y: number, w: number, h: number,
    point3d?: [number, number, number],
    normal3d?: [number, number, number],
    size3d?: [number, number, number]
  ) => void;
  onDeleteZone?: (index: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIDES: SideKey[] = ['front', 'back', 'left', 'right', 'top'];

type ShapeType = 'flat' | 'box' | 'cylinder';

function getProductConfig(name: string, dominantColor?: string | null): {
  color: number;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
} {
  const colorNum = dominantColor ? new THREE.Color(dominantColor).getHex() : 0xffffff;
  return { color: colorNum, roughness: 0.6, metalness: 0.1 };
}

function getProductBaseHex(name: string, dominantColor?: string | null): string {
  return dominantColor || '#ffffff';
}

function detectShape(product: Product): ShapeType {
  if (product.model_3d_url || product.tripo_model_url) return 'cylinder';
  const n = (product.name || '').toLowerCase();
  const s = (product as any).shape_type || '';
  if (n.includes('bottle') || n.includes('flask') || n.includes('canteen') ||
    n.includes('thermos') || n.includes('mug') || n.includes('cup') ||
    n.includes('glass') || n.includes('can') || n.includes('tumbler') ||
    s === 'cylinder') return 'cylinder';
  if (n.includes('notebook') || n.includes('book') || n.includes('diary') ||
    n.includes('journal') || n.includes('phone') || n.includes('case') ||
    n.includes('mobile') || n.includes('cap') || n.includes('hat') ||
    s === 'box') return 'box';
  return 'flat';
}

// ── Composite canvas builder (zones overlay on product color) ─────────────────

function buildCompositeCanvas(
  sideName: string,
  zones: SetupZone[],
  productName: string,
  W = 1024,
  H = 1024,
  physicalSide?: string  // if provided, filter by physical side instead of sideName
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = getProductBaseHex(productName);
  ctx.fillRect(0, 0, W, H);

  // Filter by physical side (z.side) and render zone overlays
  const filterSide = physicalSide ?? sideName;
  zones.filter((z) => z.side === filterSide).forEach((z) => {
    const px = (z.x / 100) * W;
    const py = (z.y / 100) * H;
    const pw = (z.w / 100) * W;
    const ph = (z.h / 100) * H;

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

  return canvas;
}

// ── Composite canvas builder (Single Decal texture) ───────────────────────────

function buildDecalTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Clear background — fully transparent interior so you see the shirt underneath
  ctx.clearRect(0, 0, W, H);

  // Semi-transparent solid fill so the zone area is obvious
  ctx.fillStyle = 'rgba(14, 165, 233, 0.30)';
  ctx.fillRect(0, 0, W, H);

  // Thick solid border
  const bw = 24;
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = bw;
  ctx.strokeRect(bw / 2, bw / 2, W - bw, H - bw);

  // Bright white inner border for contrast against any shirt colour
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 8;
  ctx.strokeRect(bw + 4, bw + 4, W - (bw + 4) * 2, H - (bw + 4) * 2);

  // Corner brackets
  const cs = Math.round(W * 0.18);
  ctx.lineWidth = 28;
  ctx.lineCap = 'square';

  const drawBracket = (x: number, y: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * cs);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * cs, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 28;
    ctx.stroke();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 14;
    ctx.stroke();
  };

  drawBracket(bw, bw, 1, 1);                   // top-left
  drawBracket(W - bw, bw, -1, 1);              // top-right
  drawBracket(W - bw, H - bw, -1, -1);         // bottom-right
  drawBracket(bw, H - bw, 1, -1);              // bottom-left

  // Center label
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 80px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IMPRINT', W / 2, H / 2 - 46);
  ctx.fillText('ZONE', W / 2, H / 2 + 46);
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SetupThreePreview({
  product,
  zones,
  currentSide,
  dominantColor,
  preloadedImages,
  imagesReady,
  select3DMode,
  zone3DWidth,
  zone3DHeight,
  zoneMode,
  onZonePlaced,
  onDeleteZone,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const decalCursorRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);
  const shapeTypeRef = useRef<ShapeType>('flat');
  // Shared single decal texture ref to prevent allocating 1024x1024 textures on every frame
  const sharedDecalTexRef = useRef<THREE.CanvasTexture | null>(null);
  // PMREM-generated environment texture used for image-based lighting (IBL).
  // Disposed on unmount along with the generator itself.
  const envTextureRef = useRef<THREE.Texture | null>(null);
  const pmremGeneratorRef = useRef<THREE.PMREMGenerator | null>(null);

  // Cylinder combined canvas (2048×1024, 4 horizontal quadrants)
  const cylCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Per-face canvases for box / flat
  const faceCanvasRef = useRef<Record<string, HTMLCanvasElement>>({});
  // THREE textures
  const texturesRef = useRef<Record<string, THREE.CanvasTexture>>({});

  // Rotation transition
  const targetRotRef = useRef({ x: 0, y: 0, z: 0 });
  const transitionRef = useRef(false);

  // Raycaster
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Expose select3DMode & sizes to event listeners via refs (avoids stale closures)
  const select3DRef = useRef(select3DMode);
  const zoneWRef = useRef(zone3DWidth);
  const zoneHRef = useRef(zone3DHeight);
  const zoneModeRef = useRef(zoneMode);
  const currentSideRef = useRef(currentSide);
  const zonesRef = useRef(zones);
  const productRef = useRef(product);
  const onZonePlacedRef = useRef(onZonePlaced);
  const dominantColorRef = useRef(dominantColor);
  // Tracks whether the currently-loaded model came from a GLTF file (real
  // scanned textures/materials) vs. a built-in primitive fallback, so texture
  // updates know whether it's safe to overwrite mesh materials.
  const isGltfModelRef = useRef(false);

  // Bounding radius of the currently-loaded model (post-normalization scale),
  // used to size decal projection boxes relative to the model's real size
  // instead of a fixed constant that only worked for one particular scale.
  const modelRadiusRef = useRef<number>(1.75);

  // Zone marker meshes (flat planes parented to modelGroupRef, see
  // updateTextures()). Tracked here so they can be cleanly removed/disposed
  // on every texture update, on product change, and on unmount.
  const decalMeshesRef = useRef<THREE.Mesh[]>([]);

  // ── Drag state ─────────────────────────────────────────────────────────────
  const isDraggingRef = useRef(false);
  const dragStartHitRef = useRef<{ side: string, u: number, v: number, point?: [number, number, number], normal?: [number, number, number] } | null>(null);
  const dragStartScreenRef = useRef<{ x: number, y: number } | null>(null);
  const dragLastValidHitRef = useRef<{ side: string, u: number, v: number, point?: [number, number, number], normal?: [number, number, number] } | null>(null);

  // ── Keep refs in sync ──────────────────────────────────────────────────────
  useEffect(() => { select3DRef.current = select3DMode; }, [select3DMode]);
  useEffect(() => { zoneWRef.current = zone3DWidth; }, [zone3DWidth]);
  useEffect(() => { zoneHRef.current = zone3DHeight; }, [zone3DHeight]);
  useEffect(() => { zoneModeRef.current = zoneMode; }, [zoneMode]);
  useEffect(() => { currentSideRef.current = currentSide; }, [currentSide]);
  useEffect(() => { zonesRef.current = zones; }, [zones]);
  useEffect(() => { productRef.current = product; }, [product]);
  useEffect(() => { onZonePlacedRef.current = onZonePlaced; }, [onZonePlaced]);
  useEffect(() => {
    dominantColorRef.current = dominantColor;
    // Re-apply materials/textures now that we have (or updated) the real color.
    updateTextures();
  }, [dominantColor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Disable/enable OrbitControls when selection mode toggles ──────────────
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = !select3DMode;
    if (rendererRef.current) {
      rendererRef.current.domElement.style.cursor = select3DMode ? 'crosshair' : 'default';
    }
  }, [select3DMode, zoneMode]);

  // ── React to currentSide → animate 3D rotation ────────────────────────────
  useEffect(() => {
    const rotMap: Record<string, { x: number; y: number; z: number }> = {
      front: { x: 0, y: 0, z: 0 },
      back: { x: 0, y: Math.PI, z: 0 },
      left: { x: 0, y: Math.PI / 2, z: 0 },
      right: { x: 0, y: -Math.PI / 2, z: 0 },
      top: { x: Math.PI / 2, y: 0, z: 0 },
    };
    const matchingZone = zones.find(z => {
      const key = (z.name && z.name.trim()) ? z.name.trim() : z.side;
      return key === currentSide;
    });
    const mappedSide = matchingZone ? matchingZone.side : currentSide;
    targetRotRef.current = rotMap[mappedSide] || rotMap['front'];
    transitionRef.current = true;
  }, [currentSide, zones]);

  // ── Texture update whenever zones or imagesReady change ───────────────────
  useEffect(() => {
    updateTextures();
  }, [zones, imagesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init Three.js scene (once per product mount) ───────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eff1f4');
    sceneRef.current = scene;

    // ── Camera ──
    const w = el.clientWidth || 400;
    const h = el.clientHeight || 400;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 3, 8);
    cameraRef.current = camera;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    // Correct output color space — without this, PBR textures/colors can
    // render darker/duller than intended, compounding the "black metallic
    // model" issue below.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    // ── Environment map (image-based lighting) ──
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGeneratorRef.current = pmremGenerator;
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    envTextureRef.current = envTexture;
    scene.environment = envTexture;

    // ── Controls ──
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.addEventListener('start', () => { transitionRef.current = false; });
    controlsRef.current = controls;

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dir1.position.set(4, 7, 4);
    dir1.castShadow = true;
    dir1.shadow.mapSize.set(1024, 1024);
    dir1.shadow.camera.near = 0.5;
    dir1.shadow.camera.far = 15;
    dir1.shadow.camera.left = dir1.shadow.camera.bottom = -4;
    dir1.shadow.camera.right = dir1.shadow.camera.top = 4;
    dir1.shadow.bias = -0.0005;
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.2);
    dir2.position.set(-4, 5, -4);
    scene.add(dir2);



    // ── Build model ──
    buildModel(scene, product);

    // ── Resize: observe the container itself (not window) ──
    const onResize = () => {
      const W = el.clientWidth || 400;
      const H = el.clientHeight || 400;
      if (W === 0 || H === 0) return;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    };
    window.addEventListener('resize', onResize);
    // Also trigger once after mount to handle initial height
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(el);

    // ── Animation loop ──
    const SPEED = 0.08;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();

      const grp = modelGroupRef.current;
      if (grp && transitionRef.current) {
        const t = targetRotRef.current;
        grp.rotation.x += (t.x - grp.rotation.x) * SPEED;
        grp.rotation.y += (t.y - grp.rotation.y) * SPEED;
        grp.rotation.z += (t.z - grp.rotation.z) * SPEED;
        if (
          Math.abs(t.x - grp.rotation.x) < 0.01 &&
          Math.abs(t.y - grp.rotation.y) < 0.01 &&
          Math.abs(t.z - grp.rotation.z) < 0.01
        ) {
          grp.rotation.set(t.x, t.y, t.z);
          transitionRef.current = false;
        }
      }

      // Update 3D zone delete buttons positions without React re-renders
      if (isGltfModelRef.current && camera && grp && renderer) {
        const rect = renderer.domElement.getBoundingClientRect();
        zonesRef.current.forEach((z, idx) => {
          if (z.source === '3d' && z.point3d) {
            const btn = buttonRefs.current[idx];
            if (btn) {
              const pt = new THREE.Vector3(...z.point3d);
              pt.applyMatrix4(grp.matrixWorld);

              // Lightweight occlusion check: is the surface pointing away from the camera?
              let isFacingAway = false;
              if (z.normal3d) {
                const normal = new THREE.Vector3(...z.normal3d).transformDirection(grp.matrixWorld).normalize();
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir); // vector pointing INTO the scene (away from camera)
                // If the normal is pointing in the same direction as the camera's look vector, it's on the back side.
                if (normal.dot(camDir) > 0.15) {
                  isFacingAway = true;
                }
              }

              pt.project(camera);
              if (pt.z > 1.0 || pt.z < -1.0 || isFacingAway) {
                btn.style.display = 'none';
              } else {
                const sx = (pt.x * 0.5 + 0.5) * rect.width;
                const sy = (-(pt.y * 0.5) + 0.5) * rect.height;
                btn.style.display = 'flex';
                btn.style.left = `${sx}px`;
                btn.style.top = `${sy}px`;
              }
            }
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // ── Mouse events for 3D selection ──
    const canvas = renderer.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (!select3DRef.current || !modelGroupRef.current) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = ((e.clientY - rect.top) / rect.height) * -2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(modelGroupRef.current.children, true);

      if (hits.length > 0 && hits[0].uv) {
        isDraggingRef.current = true;
        const hitDetails = getHitDetails(hits[0]);
        dragStartHitRef.current = hitDetails;
        dragLastValidHitRef.current = hitDetails;
        dragStartScreenRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        if (decalCursorRef.current) {
          decalCursorRef.current.style.display = 'block';
          decalCursorRef.current.style.left = dragStartScreenRef.current.x + 'px';
          decalCursorRef.current.style.top = dragStartScreenRef.current.y + 'px';
          decalCursorRef.current.style.width = '0px';
          decalCursorRef.current.style.height = '0px';

          const zm = zoneModeRef.current;
          const color = zm === 'logo' ? '#ff6584' : (zm === 'combined' ? '#9b59b6' : '#43e97b');
          const bgColor = zm === 'logo' ? 'rgba(255,101,132,0.2)' : (zm === 'combined' ? 'rgba(155,89,182,0.2)' : 'rgba(67,233,123,0.2)');

          decalCursorRef.current.style.borderColor = color;
          decalCursorRef.current.style.borderStyle = 'dashed';
          decalCursorRef.current.style.borderWidth = '2px';
          decalCursorRef.current.style.backgroundColor = bgColor;
          decalCursorRef.current.style.pointerEvents = 'none';
          decalCursorRef.current.style.position = 'absolute';
          decalCursorRef.current.style.zIndex = '20';
          decalCursorRef.current.style.transform = 'none'; // Remove the -50% translation for freeform drawing
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!select3DRef.current || !modelGroupRef.current) return;

      if (isDraggingRef.current && dragStartScreenRef.current && decalCursorRef.current) {
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        const startX = dragStartScreenRef.current.x;
        const startY = dragStartScreenRef.current.y;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        decalCursorRef.current.style.left = left + 'px';
        decalCursorRef.current.style.top = top + 'px';
        decalCursorRef.current.style.width = width + 'px';
        decalCursorRef.current.style.height = height + 'px';

        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = ((e.clientY - rect.top) / rect.height) * -2 + 1;
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const hits = raycasterRef.current.intersectObjects(modelGroupRef.current.children, true);
        if (hits.length > 0 && hits[0].uv) {
          dragLastValidHitRef.current = getHitDetails(hits[0]);
        }
      }
    };

    const onMouseLeave = () => {
      if (decalCursorRef.current && !isDraggingRef.current) {
        decalCursorRef.current.style.display = 'none';
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      if (decalCursorRef.current) decalCursorRef.current.style.display = 'none';

      if (!select3DRef.current || !modelGroupRef.current || !dragStartHitRef.current) return;

      const endHit = dragLastValidHitRef.current;
      const startHit = dragStartHitRef.current;

      // Depth of the decal projection box: must be shallow enough to only
      // clip the outermost mesh surface — too deep and it captures the inner
      // surface polygons of the scanned garment and adds them to the geometry.
      // 0.008 world-units ≈ ~2mm on a model normalised to 3.5-unit radius.
      const depth = 0.008;

      if (endHit && startHit && endHit.side === startHit.side) {
        const uMin = Math.min(startHit.u, endHit.u);
        const uMax = Math.max(startHit.u, endHit.u);
        const vMin = Math.min(startHit.v, endHit.v);
        const vMax = Math.max(startHit.v, endHit.v);
        const w = uMax - uMin;
        const h = vMax - vMin;

        // ── World-space size from screen-pixel drag ────────────────────────
        // UV percentages are unreliable on non-uniform scanned meshes.
        // Instead we project the screen-pixel drag size through the camera
        // FOV at the hit point's depth to get an accurate world-space size.
        let sizeW: number;
        let sizeH: number;

        const rect = canvas.getBoundingClientRect();
        const upX = e.clientX - rect.left;
        const upY = e.clientY - rect.top;
        const startX = dragStartScreenRef.current?.x ?? upX;
        const startY = dragStartScreenRef.current?.y ?? upY;
        const pxW = Math.abs(upX - startX);
        const pxH = Math.abs(upY - startY);

        // World units per pixel at the hit-point depth
        let worldPerPx = 0.01; // fallback
        if (startHit.point && cameraRef.current) {
          const worldHit = modelGroupRef.current
            ? modelGroupRef.current.localToWorld(new THREE.Vector3(...startHit.point))
            : new THREE.Vector3(...startHit.point);
          const camDist = cameraRef.current.position.distanceTo(worldHit);
          const halfFovTan = Math.tan((cameraRef.current.fov * Math.PI) / 360);
          worldPerPx = (2 * camDist * halfFovTan) / rect.height;
        }

        const isDrag = w > 2 && h > 2 && startHit.point && endHit.point;

        if (isDrag) {
          sizeW = Math.max(0.05, pxW * worldPerPx);
          sizeH = Math.max(0.05, pxH * worldPerPx);

          // Center point = midpoint of start + end hit in local space
          const p0 = new THREE.Vector3(...startHit.point!);
          const p1 = new THREE.Vector3(...endHit.point!);
          const centerLocal = p0.clone().add(p1).multiplyScalar(0.5);

          // Average normals from both ends
          const n0 = startHit.normal ? new THREE.Vector3(...startHit.normal) : new THREE.Vector3(0, 0, 1);
          const n1 = endHit.normal ? new THREE.Vector3(...endHit.normal) : n0.clone();
          const centerNormal = n0.clone().add(n1).normalize();

          const centerPoint: [number, number, number] = [centerLocal.x, centerLocal.y, centerLocal.z];
          const centerNrm: [number, number, number] = [centerNormal.x, centerNormal.y, centerNormal.z];

          onZonePlacedRef.current(currentSideRef.current as any, uMin, vMin, w, h, centerPoint, centerNrm, [sizeW, sizeH, 0.008]);
        } else {
          // Simple click — use default zone size
          const defW = zoneWRef.current;
          const defH = zoneHRef.current;
          const x = Math.max(0, Math.min(100 - defW, startHit.u - defW / 2));
          const y = Math.max(0, Math.min(100 - defH, startHit.v - defH / 2));
          // Default size = ~20% of model radius in each dimension
          sizeW = Math.max(0.1, modelRadiusRef.current * defW / 100);
          sizeH = Math.max(0.1, modelRadiusRef.current * defH / 100);
          onZonePlacedRef.current(currentSideRef.current as any, x, y, defW, defH, startHit.point, startHit.normal, [sizeW, sizeH, 0.008]);
        }
      }

      dragStartHitRef.current = null;
      dragStartScreenRef.current = null;
      dragLastValidHitRef.current = null;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mouseup', onMouseUp);
      resizeObserver.disconnect();

      // Clean up any zone marker meshes before disposing the renderer/scene.
      decalMeshesRef.current.forEach((decalMesh) => {
        decalMesh.parent?.remove(decalMesh);
        decalMesh.geometry.dispose();
        if (Array.isArray(decalMesh.material)) {
          decalMesh.material.forEach((m) => m.dispose());
        } else {
          decalMesh.material.dispose();
        }
      });
      decalMeshesRef.current = [];

      // Clean up the shared decal texture and face textures
      sharedDecalTexRef.current?.dispose();
      sharedDecalTexRef.current = null;
      Object.values(texturesRef.current).forEach((t) => t.dispose());
      texturesRef.current = {};

      // Clean up the environment map + PMREM generator.
      envTextureRef.current?.dispose();
      envTextureRef.current = null;
      pmremGeneratorRef.current?.dispose();
      pmremGeneratorRef.current = null;

      renderer.dispose();
      if (el.contains(canvas)) el.removeChild(canvas);
      rendererRef.current = null;
    };
  }, [product]); // re-init when product changes

  // ── Place zone from a raycaster hit ───────────────────────────────────────

  function getHitDetails(hit: THREE.Intersection) {
    const uv = hit.uv!;
    const shape = shapeTypeRef.current;

    // Always use the active side tab while placing — angle heuristics on
    // scanned GLTFs systematically mis-tag the side (often as "right").
    let targetSide = currentSideRef.current || 'front';
    let localU = uv.x;
    let localV = uv.y;

    // Procedural cylinders only: derive localU from azimuth for texture unwrap.
    // Do NOT override targetSide.
    if (shape === 'cylinder' && !isGltfModelRef.current) {
      const rootGroup = modelGroupRef.current;
      const modelPt = rootGroup
        ? rootGroup.worldToLocal(hit.point.clone())
        : hit.object.worldToLocal(hit.point.clone());
      let angle = Math.atan2(modelPt.x, modelPt.z) - Math.PI * 0.75;
      if (angle > Math.PI) angle -= 2 * Math.PI;
      if (angle < -Math.PI) angle += 2 * Math.PI;

      if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
        localU = (angle + Math.PI / 4) / (Math.PI / 2);
      } else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) {
        localU = (angle - Math.PI / 4) / (Math.PI / 2);
      } else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) {
        localU = (angle + 3 * Math.PI / 4) / (Math.PI / 2);
      } else {
        let a = angle;
        if (a < 0) a += 2 * Math.PI;
        localU = (a - 3 * Math.PI / 4) / (Math.PI / 2);
      }
    }

    let pt: [number, number, number] | undefined;
    let nrm: [number, number, number] | undefined;

    if (hit.point && hit.face && hit.object) {
      if (modelGroupRef.current) {
        const localPt = modelGroupRef.current.worldToLocal(hit.point.clone());
        pt = [localPt.x, localPt.y, localPt.z];

        // Transform face normal all the way into model-group local space
        // using the full inverse matrix (handles scale + nested hierarchy
        // more accurately than quaternion-only inversion).
        const normal = hit.face.normal.clone();
        normal.transformDirection(hit.object.matrixWorld);
        const invMat = new THREE.Matrix4().copy(modelGroupRef.current.matrixWorld).invert();
        normal.transformDirection(invMat);
        normal.normalize();
        nrm = [normal.x, normal.y, normal.z];
      } else {
        pt = [hit.point.x, hit.point.y, hit.point.z];
        const normal = hit.face.normal.clone();
        normal.transformDirection(hit.object.matrixWorld);
        normal.normalize();
        nrm = [normal.x, normal.y, normal.z];
      }
    }

    return {
      side: targetSide,
      u: localU * 100,
      v: (1 - localV) * 100,
      point: pt,
      normal: nrm
    };
  }

  // ── Texture helpers ────────────────────────────────────────────────────────

  function getCylCanvas(): HTMLCanvasElement {
    if (!cylCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 1024;
      cylCanvasRef.current = c;
    }
    return cylCanvasRef.current;
  }

  function clearDecals() {
    decalMeshesRef.current.forEach((zonePlane) => {
      // Zone planes are parented to modelGroupRef — remove from wherever
      // they actually live rather than assuming the parent.
      zonePlane.parent?.remove(zonePlane);
      zonePlane.geometry.dispose();
      if (Array.isArray(zonePlane.material)) {
        zonePlane.material.forEach((m) => m.dispose());
      } else {
        zonePlane.material.dispose();
      }
    });
    decalMeshesRef.current = [];
  }

  function updateTextures() {
    if (!modelGroupRef.current) return;
    const pName = productRef.current?.name ?? '';

    // Handle GLTF models with real scanned textures/materials
    if (isGltfModelRef.current) {
      // Remove any previously placed zone planes before rebuilding
      clearDecals();

      if (!modelGroupRef.current) return;

      // Un-rotate the model temporarily so World === Local space for Raycaster and DecalGeometry
      const savedRot = modelGroupRef.current.rotation.clone();
      modelGroupRef.current.rotation.set(0, 0, 0);
      modelGroupRef.current.updateMatrixWorld(true);

      if (!sharedDecalTexRef.current) {
        sharedDecalTexRef.current = buildDecalTexture();
      }
      const decalTex = sharedDecalTexRef.current;

      zonesRef.current.filter((z) => z.source === '3d' && z.point3d && z.normal3d && z.size3d).forEach((z) => {
        // All coordinates are stored in MODEL-GROUP LOCAL SPACE.
        // Using local space (not world space) means the zone plane is
        // parented to modelGroupRef and rotates with the model for free —
        // no per-frame rebuild needed.
        const localPt = new THREE.Vector3(...z.point3d!);
        const localNrm = new THREE.Vector3(...z.normal3d!).normalize();
        const [sW, sH] = z.size3d!;

        const zAxis = localNrm.clone().normalize();
        let yAxis = new THREE.Vector3(0, 1, 0);
        if (Math.abs(zAxis.dot(yAxis)) > 0.95) yAxis.set(0, 0, 1);
        const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
        yAxis.crossVectors(zAxis, xAxis).normalize();

        const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

        if (z.angle) {
          const roll = new THREE.Quaternion().setFromAxisAngle(localNrm, (z.angle * Math.PI) / 180);
          quat.premultiply(roll);
        }

        if (!modelGroupRef.current) return;
        let targetMesh: THREE.Mesh | null = null;
        const raycaster = new THREE.Raycaster();
        const originPt = localPt.clone().addScaledVector(localNrm, 0.5);
        raycaster.set(originPt, localNrm.clone().negate());
        const hits = raycaster.intersectObject(modelGroupRef.current, true);
        targetMesh = hits.find(h => (h.object as any).isMesh)?.object as THREE.Mesh;

        if (!targetMesh) {
          modelGroupRef.current!.traverse(c => {
            if ((c as any).isMesh && !targetMesh) targetMesh = c as THREE.Mesh;
          });
        }

        let geo: THREE.BufferGeometry;
        if (targetMesh) {
          const orientation = new THREE.Euler().setFromQuaternion(quat);
          const size = new THREE.Vector3(sW, sH, Math.max(sW, sH) * 2.0);
          try {
            geo = new DecalGeometry(targetMesh, localPt, orientation, size);
          } catch (e) {
            console.error("Decal err", e);
            geo = new THREE.PlaneGeometry(sW, sH);
          }
        } else {
          geo = new THREE.PlaneGeometry(sW, sH);
        }

        const mat = new THREE.MeshBasicMaterial({
          map: decalTex,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });

        const decalMesh = new THREE.Mesh(geo, mat);
        decalMesh.userData.isDecal = true;
        decalMesh.renderOrder = 999;

        if (!(geo instanceof DecalGeometry)) {
          decalMesh.position.copy(localPt).addScaledVector(localNrm, 0.012);
          decalMesh.quaternion.copy(quat);
        }

        modelGroupRef.current!.add(decalMesh);
        decalMeshesRef.current.push(decalMesh);
      });

      // Restore the rotation so the model doesn't snap back to front visually
      modelGroupRef.current.rotation.copy(savedRot);
      modelGroupRef.current.updateMatrixWorld(true);

      return;
    }

    if (shapeTypeRef.current === 'cylinder') {
      const cyl = getCylCanvas();
      const ctx = cyl.getContext('2d')!;
      ctx.fillStyle = getProductBaseHex(pName, dominantColorRef.current);
      ctx.fillRect(0, 0, 2048, 1024);

      const order: { side: string; x: number }[] = [
        { side: 'back', x: 0 },
        { side: 'right', x: 512 },
        { side: 'front', x: 1024 },
        { side: 'left', x: 1536 },
      ];
      order.forEach(({ side, x }) => {
        const matchingZone = zonesRef.current.find(z => z.side === side);
        const viewName = (matchingZone && matchingZone.name && matchingZone.name.trim()) ? matchingZone.name.trim() : side;
        const comp = buildCompositeCanvas(viewName, zonesRef.current, pName, 512, 1024, side);
        ctx.drawImage(comp, x, 0, 512, 1024);
      });

      // Propagate to all cylinder mesh materials — but never touch meshes that
      // came from a loaded GLTF, since those already carry the real scanned
      // color/texture and overwriting them is what was causing everything to
      // render gray/white.
      modelGroupRef.current.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.userData?.isOriginalModel) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat: any) => {
          if (!mat.map || mat.map.image !== cyl) {
            if (mat.map && typeof mat.map.dispose === 'function') {
              mat.map.dispose();
            }
            mat.map = new THREE.CanvasTexture(cyl);
          }
          mat.map.needsUpdate = true;
          // Don't override color - preserve original model color
        });
      });

    } else {
      const faceSlots: { index: number; side: string }[] = [
        { index: 4, side: 'front' },
        { index: 5, side: 'back' },
        { index: 1, side: 'left' },
        { index: 0, side: 'right' },
        { index: 2, side: 'top' },
      ];

      faceSlots.forEach(({ index, side }) => {
        const matchingZone = zonesRef.current.find(z => z.side === side);
        const viewName = (matchingZone && matchingZone.name && matchingZone.name.trim()) ? matchingZone.name.trim() : side;
        const comp = buildCompositeCanvas(viewName, zonesRef.current, pName, 1024, 1024, side);
        let tex = texturesRef.current[viewName];
        if (!tex) {
          tex = new THREE.CanvasTexture(comp);
          texturesRef.current[viewName] = tex;
          faceCanvasRef.current[viewName] = comp;
        } else {
          // Re-draw into the existing canvas so the texture ref stays the same
          const existing = faceCanvasRef.current[viewName];
          if (existing) {
            const c = existing.getContext('2d')!;
            c.clearRect(0, 0, existing.width, existing.height);
            c.drawImage(comp, 0, 0);
          }
          tex.needsUpdate = true;
        }

        // Apply to mesh
        modelGroupRef.current?.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mesh.userData?.isOriginalModel) return; // preserve loaded GLTF's real materials

          // Named patch meshes (cap, t-shirt, box sides)
          if (mesh.name === side) {
            const mat = mesh.material as any;
            mat.map = tex;
            // Don't override color - preserve original model color
            mat.needsUpdate = true;
            return;
          }

          // Multi-material meshes (BoxGeometry)
          if (Array.isArray(mesh.material)) {
            const mat = (mesh.material as any[])[index];
            if (mat) {
              mat.map = tex;
              // Don't override color - preserve original model color
              mat.needsUpdate = true;
            }
          }
        });
      });
    }
  }

  // ── Model builders (ported from HTML verbatim) ────────────────────────────

  function buildModel(scene: THREE.Scene, prod: Product) {
    // Remove old model
    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current);
      modelGroupRef.current = null;
    }

    // Clear zone markers from the previous product before building the new
    // one — they're keyed to the old model's geometry/local space.
    clearDecals();

    const group = new THREE.Group();
    scene.add(group);
    modelGroupRef.current = group;

    const name = (prod.name || '').toLowerCase();
    const shape = (prod as any).shape_type || '';
    const model3dUrl = resolveMediaUrl((prod as any).model_3d_url || '');

    // Helper to finalize group after build
    const finalize = () => {
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      if (floorRef.current) {
        const box = new THREE.Box3().setFromObject(group);
        floorRef.current.position.y = box.min.y - 0.01;
      }

      // Frame the camera to fit the model
      const box = new THREE.Box3().setFromObject(group);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = sphere.radius || 2.4;

      // Capture the model's real bounding radius so decal sizing/depth can
      // scale relative to this specific model instead of a fixed constant
      // that only worked for one particular scale.
      modelRadiusRef.current = radius;

      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.target.copy(sphere.center);
        cameraRef.current.position.set(
          sphere.center.x,
          sphere.center.y + radius * 0.25,
          sphere.center.z + radius * 2.4
        );
        controlsRef.current.update();
      }

      updateTextures();
    };

    if (model3dUrl) {
      // Detect actual shape type from product name instead of hardcoding to 'cylinder'
      const name = (prod.name || '').toLowerCase();
      const shape = (prod as any).shape_type || '';

      if (name.includes('bottle') || name.includes('flask') || name.includes('canteen') ||
        name.includes('thermos') || name.includes('mug') || name.includes('cup') ||
        name.includes('glass') || name.includes('can') || name.includes('tumbler') ||
        shape === 'cylinder') {
        shapeTypeRef.current = 'cylinder';
      } else if (name.includes('notebook') || name.includes('book') || name.includes('diary') ||
        name.includes('journal') || name.includes('phone') || name.includes('case') ||
        name.includes('mobile') || name.includes('cap') || name.includes('hat') ||
        shape === 'box') {
        shapeTypeRef.current = 'box';
      } else {
        shapeTypeRef.current = 'flat';
      }

      const loader = new GLTFLoader();
      loader.load(
        model3dUrl,
        (gltf: any) => {
          const model = gltf.scene;

          // ── Normalize scale + center ──────────────────────────────────────
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const scale = 3.5 / Math.max(size.x, size.y, size.z);
          model.scale.setScalar(scale);
          const center = box.getCenter(new THREE.Vector3());
          model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

          // ── Bake a front-facing orientation ───────────────────────────────
          // App assumes group rotation (0,0,0) = product FRONT faces camera (+Z).
          // Many Tripo/AI bag GLTFs arrive with a different yaw.
          //
          // For bag-8k specifically:
          //   0°     → right side faces camera
          //   +90°   → back faces camera
          //   -90°   → front faces camera  ← correct
          //
          // Override with product.model_rotation_y (radians) when needed.
          const explicitYaw = (prod as any).model_rotation_y;
          const n = (prod.name || '').toLowerCase();
          const isBagLike =
            n.includes('bag') || n.includes('backpack') || n.includes('tote') ||
            n.includes('handbag') || n.includes('sack') || n.includes('pack');

          let yaw = 0;
          if (typeof explicitYaw === 'number' && Number.isFinite(explicitYaw)) {
            yaw = explicitYaw;
          } else if (isBagLike) {
            yaw = -Math.PI / 2;
          }
          if (yaw !== 0) {
            model.rotation.y = yaw;
            model.updateMatrixWorld(true);
            const box2 = new THREE.Box3().setFromObject(model);
            const c2 = box2.getCenter(new THREE.Vector3());
            model.position.sub(c2);
          }

          model.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // Keep original Tripo materials and textures exactly as provided —
              // flag them so updateTextures() never overwrites .map/.color below.
              child.userData.isOriginalModel = true;
            }
          });
          isGltfModelRef.current = true;
          group.add(model);
          finalize();
        },
        undefined,
        () => { isGltfModelRef.current = false; buildFallback(name, shape, group, finalize); }
      );
    } else {
      isGltfModelRef.current = false;
      buildFallback(name, shape, group, finalize);
    }
  }

  function buildFallback(name: string, shape: string, group: THREE.Group, finalize: () => void) {
    if (name.includes('cap') || name.includes('hat')) {
      shapeTypeRef.current = 'box'; buildCap(group);
    } else if (name.includes('tumbler')) {
      shapeTypeRef.current = 'cylinder'; buildTumbler(group);
    } else if (name.includes('bottle') || name.includes('flask') || name.includes('canteen') || name.includes('thermos')) {
      shapeTypeRef.current = 'cylinder'; buildBottle(group);
    } else if (name.includes('mug') || name.includes('cup') || name.includes('glass') || name.includes('can')) {
      shapeTypeRef.current = 'cylinder'; buildMug(group);
    } else if (name.includes('notebook') || name.includes('book') || name.includes('diary') || name.includes('journal')) {
      shapeTypeRef.current = 'box'; buildNotebook(group);
    } else if (name.includes('phone') || name.includes('case') || name.includes('mobile')) {
      shapeTypeRef.current = 'box'; buildPhoneCase(group);
    } else if (name.includes('tote') || name.includes('bag') || name.includes('handbag') || name.includes('backpack') || name.includes('sack')) {
      shapeTypeRef.current = 'box'; buildBag(group);
    } else if (name.includes('tshirt') || name.includes('t-shirt') || name.includes('shirt') || name.includes('polo')) {
      shapeTypeRef.current = 'flat'; buildTShirt(group);
    } else if (name.includes('blazer') || name.includes('jacket') || name.includes('suit') || name.includes('coat')) {
      shapeTypeRef.current = 'flat'; buildBlazer(group);
    } else if (shape === 'cylinder') {
      shapeTypeRef.current = 'cylinder'; buildMug(group);
    } else if (shape === 'box') {
      shapeTypeRef.current = 'box'; buildNotebook(group);
    } else {
      shapeTypeRef.current = 'flat'; buildFlatCard(group);
    }
    finalize();
  }

  function makeCylMat() {
    const cfg = getProductConfig(productRef.current?.name ?? '', dominantColorRef.current);
    return new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      map: new THREE.CanvasTexture(getCylCanvas()),
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      clearcoat: cfg.clearcoat ?? 0,
      clearcoatRoughness: cfg.clearcoatRoughness ?? 0,
    });
  }

  function makePlainMat() {
    const cfg = getProductConfig(productRef.current?.name ?? '', dominantColorRef.current);
    return new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
    });
  }

  // ── Shape builders ─────────────────────────────────────────────────────────

  function buildFlatCard(group: THREE.Group) {
    const geo = new THREE.BoxGeometry(3, 3, 0.08);
    const mats = Array.from({ length: 6 }, (_, i) =>
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.5, metalness: 0.1,
        transparent: true, alphaTest: 0.05,
      })
    );
    const mesh = new THREE.Mesh(geo, mats);
    group.add(mesh);
  }

  function buildBottle(group: THREE.Group) {
    const pts = [
      new THREE.Vector2(0.00, -2.30), new THREE.Vector2(0.52, -2.25),
      new THREE.Vector2(0.70, -2.05), new THREE.Vector2(0.88, -1.60),
      new THREE.Vector2(0.95, -0.60), new THREE.Vector2(0.93, 0.60),
      new THREE.Vector2(0.88, 1.30), new THREE.Vector2(0.68, 1.75),
      new THREE.Vector2(0.36, 1.95), new THREE.Vector2(0.33, 2.10),
      new THREE.Vector2(0.38, 2.18), new THREE.Vector2(0.38, 2.30),
    ];
    group.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 96).rotateY(Math.PI * 0.75), makeCylMat()));
  }

  function buildMug(group: THREE.Group) {
    const bodyMat = makeCylMat();
    (bodyMat as any).side = THREE.DoubleSide;
    const plainMat = makePlainMat();

    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3, 64, 1, true).rotateY(Math.PI * 0.75), bodyMat);
    group.add(outer);
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 2.8, 64, 1, true), plainMat));
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.87, 0.95, 64), plainMat);
    rim.rotation.x = -Math.PI / 2; rim.position.y = 1.5; group.add(rim);
    const bot = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64), plainMat);
    bot.rotation.x = Math.PI / 2; bot.position.y = -1.5; group.add(bot);

    // Handle
    const hPts = [
      new THREE.Vector3(0.94, 0.95, 0), new THREE.Vector3(1.22, 0.80, 0),
      new THREE.Vector3(1.66, 0.40, 0), new THREE.Vector3(1.74, 0.00, 0),
      new THREE.Vector3(1.66, -0.40, 0), new THREE.Vector3(1.22, -0.80, 0),
      new THREE.Vector3(0.94, -0.95, 0),
    ];
    const handleGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hPts), 24, 0.09, 10, false);
    group.add(new THREE.Mesh(handleGeo, plainMat));
  }

  function buildTumbler(group: THREE.Group) {
    const pts = [
      new THREE.Vector2(0.0, -2.1), new THREE.Vector2(0.72, -2.1),
      new THREE.Vector2(0.75, -1.5), new THREE.Vector2(0.80, -0.5),
      new THREE.Vector2(0.88, 0.5), new THREE.Vector2(0.92, 1.6),
      new THREE.Vector2(0.92, 1.8), new THREE.Vector2(0.0, 1.8),
    ];
    group.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 64).rotateY(Math.PI * 0.75), makeCylMat()));
    const lidMat = new THREE.MeshPhysicalMaterial({ color: 0x5a636a, roughness: 0.35, metalness: 0.1 });
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.94, 0.94, 0.5, 32), lidMat);
    lid.position.y = 2.05; group.add(lid);
  }

  function buildNotebook(group: THREE.Group) {
    const coverMat = new THREE.MeshPhysicalMaterial({ color: 0xc29b70, roughness: 0.85, metalness: 0.05 });
    const spineMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1c1c, roughness: 0.7, metalness: 0.1 });
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xfbfbf9, roughness: 0.9 });
    const spiralMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.8 });

    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.18), spineMat);
    spine.position.set(-1.25, 0, 0); group.add(spine);

    const front = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.2, 0.18), coverMat);
    front.position.set(0.25, 0, 0); front.name = 'front'; group.add(front);

    const back = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.2, 0.18), coverMat.clone());
    back.position.set(0.25, 0, -0.5); back.name = 'back'; group.add(back);

    const pages = new THREE.Mesh(new THREE.BoxGeometry(2.9, 4.1, 0.34), paperMat);
    pages.position.set(0.05, 0, -0.25); group.add(pages);

    const torusGeo = new THREE.TorusGeometry(0.15, 0.025, 8, 24);
    for (let y = -1.9; y <= 1.9; y += 0.24) {
      const ring = new THREE.Mesh(torusGeo, spiralMat);
      ring.rotation.y = Math.PI / 2; ring.position.set(-1.5, y, -0.25); group.add(ring);
    }
  }

  function buildPhoneCase(group: THREE.Group) {
    const cfg = getProductConfig(productRef.current?.name ?? '', dominantColorRef.current);
    const mats = Array.from({ length: 6 }, () =>
      new THREE.MeshPhysicalMaterial({ color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness })
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.8, 0.22), mats);
    mesh.name = 'front'; group.add(mesh);
  }

  function buildCap(group: THREE.Group) {
    const cfg = getProductConfig(productRef.current?.name ?? '', dominantColorRef.current);
    const capMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness, side: THREE.DoubleSide,
    });
    const plainMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.1 });

    const crownGeo = new THREE.SphereGeometry(1.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    crownGeo.scale(1.0, 0.95, 1.05);
    const crown = new THREE.Mesh(crownGeo, capMat);
    crown.rotation.x = -0.05; group.add(crown);

    const patchConfigs = [
      { name: 'front', phiStart: Math.PI * 0.35, phiLength: Math.PI * 0.3 },
      { name: 'back', phiStart: Math.PI * 1.35, phiLength: Math.PI * 0.3 },
      { name: 'right', phiStart: -Math.PI * 0.15, phiLength: Math.PI * 0.3 },
      { name: 'left', phiStart: Math.PI * 0.85, phiLength: Math.PI * 0.3 },
    ];
    patchConfigs.forEach((conf) => {
      const geo = new THREE.SphereGeometry(1.41, 32, 16, conf.phiStart, conf.phiLength, Math.PI * 0.18, Math.PI * 0.28);
      geo.scale(1.0, 0.95, 1.05);
      const mat = new THREE.MeshPhysicalMaterial({
        color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness,
        transparent: true, side: THREE.DoubleSide,
      });
      const patch = new THREE.Mesh(geo, mat);
      patch.name = conf.name; patch.rotation.x = -0.05; group.add(patch);
    });

    // Visor
    const visorGeo = new THREE.PlaneGeometry(2.0, 1.4, 16, 16);
    const pos = visorGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const xv = pos.getX(i), yv = pos.getY(i);
      pos.setZ(i, -0.16 * Math.sin((yv + 0.7) / 1.4 * Math.PI) - 0.22 * xv * xv);
    }
    visorGeo.computeVertexNormals();
    const visor = new THREE.Mesh(visorGeo, capMat);
    visor.rotation.x = -Math.PI / 2 + 0.15; visor.position.set(0, -0.08, 0.72); group.add(visor);

    const button = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), plainMat);
    button.position.set(0, 1.32, -0.05); group.add(button);
  }

  function buildBag(group: THREE.Group) {
    const cfg = getProductConfig(productRef.current?.name ?? '', dominantColorRef.current);

    // Main bag body - slightly trapezoidal (wider at top)
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness,
    });

    // Front panel (named 'front' for texture mapping)
    const frontGeo = new THREE.BoxGeometry(2.8, 3.6, 0.06);
    const frontMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness,
    });
    const front = new THREE.Mesh(frontGeo, frontMat);
    front.name = 'front';
    front.position.set(0, 0, 0.75);
    group.add(front);

    // Back panel
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.6, 0.06), bodyMat.clone());
    back.name = 'back';
    back.position.set(0, 0, -0.75);
    group.add(back);

    // Left side panel
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.6, 1.5), bodyMat.clone());
    left.name = 'left';
    left.position.set(-1.4, 0, 0);
    group.add(left);

    // Right side panel
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.6, 1.5), bodyMat.clone());
    right.name = 'right';
    right.position.set(1.4, 0, 0);
    group.add(right);

    // Bottom panel
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 1.5), bodyMat.clone());
    bottom.position.set(0, -1.8, 0);
    group.add(bottom);

    // Handles (two round tubes)
    const handleMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness + 0.05, metalness: cfg.metalness,
    });
    const handleCurveL = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.85, 1.8, 0.75),
      new THREE.Vector3(-0.85, 2.9, 0.5),
      new THREE.Vector3(-0.85, 3.2, 0),
      new THREE.Vector3(-0.85, 2.9, -0.5),
      new THREE.Vector3(-0.85, 1.8, -0.75),
    ]);
    const handleCurveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.85, 1.8, 0.75),
      new THREE.Vector3(0.85, 2.9, 0.5),
      new THREE.Vector3(0.85, 3.2, 0),
      new THREE.Vector3(0.85, 2.9, -0.5),
      new THREE.Vector3(0.85, 1.8, -0.75),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(handleCurveL, 32, 0.07, 8, false), handleMat));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(handleCurveR, 32, 0.07, 8, false), handleMat));
  }

  function buildTShirt(group: THREE.Group) {
    const cfg = getProductConfig(productRef.current?.name ?? '', dominantColorRef.current);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness, side: THREE.DoubleSide,
    });
    const frontMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness, side: THREE.DoubleSide,
    });

    // Main body - front panel (texturable)
    const body = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.4), frontMat);
    body.name = 'front';
    body.position.set(0, -0.1, 0.01);
    group.add(body);

    // Left sleeve
    const leftSleeveShape = new THREE.Shape();
    leftSleeveShape.moveTo(0, 0);
    leftSleeveShape.lineTo(-1.5, 0.6);
    leftSleeveShape.lineTo(-1.5, -0.5);
    leftSleeveShape.lineTo(0, -0.9);
    leftSleeveShape.closePath();
    const leftSleeve = new THREE.Mesh(
      new THREE.ShapeGeometry(leftSleeveShape),
      bodyMat.clone()
    );
    leftSleeve.position.set(-1.4, 1.3, 0);
    group.add(leftSleeve);

    // Right sleeve
    const rightSleeveShape = new THREE.Shape();
    rightSleeveShape.moveTo(0, 0);
    rightSleeveShape.lineTo(1.5, 0.6);
    rightSleeveShape.lineTo(1.5, -0.5);
    rightSleeveShape.lineTo(0, -0.9);
    rightSleeveShape.closePath();
    const rightSleeve = new THREE.Mesh(
      new THREE.ShapeGeometry(rightSleeveShape),
      bodyMat.clone()
    );
    rightSleeve.position.set(1.4, 1.3, 0);
    group.add(rightSleeve);

    // Collar (U-shape torus arc)
    const collarCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.42, 1.7, 0.02),
      new THREE.Vector3(-0.22, 1.85, 0.02),
      new THREE.Vector3(0, 1.8, 0.02),
      new THREE.Vector3(0.22, 1.85, 0.02),
      new THREE.Vector3(0.42, 1.7, 0.02),
    ]);
    const collarMat = new THREE.MeshPhysicalMaterial({ color: cfg.color, roughness: 0.9, metalness: 0 });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(collarCurve, 20, 0.06, 8, false), collarMat));
  }

  function buildBlazer(group: THREE.Group) {
    const cfg = getProductConfig(productRef.current?.name ?? '', dominantColorRef.current);
    const fabricMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness, side: THREE.DoubleSide,
    });
    const lapelMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color, roughness: cfg.roughness + 0.05, metalness: 0, side: THREE.DoubleSide,
    });

    // Main body front panel (texturable)
    const body = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.8), fabricMat.clone());
    body.name = 'front';
    body.position.set(0, -0.1, 0.01);
    group.add(body);

    // Left lapel
    const lapelL = new THREE.Shape();
    lapelL.moveTo(0, 0);
    lapelL.lineTo(-0.8, 0.9);
    lapelL.lineTo(-1.0, 0.5);
    lapelL.lineTo(-0.5, -0.6);
    lapelL.closePath();
    const meshLapelL = new THREE.Mesh(new THREE.ShapeGeometry(lapelL), lapelMat.clone());
    meshLapelL.position.set(-0.1, 1.1, 0.02);
    group.add(meshLapelL);

    // Right lapel (mirrored)
    const lapelR = new THREE.Shape();
    lapelR.moveTo(0, 0);
    lapelR.lineTo(0.8, 0.9);
    lapelR.lineTo(1.0, 0.5);
    lapelR.lineTo(0.5, -0.6);
    lapelR.closePath();
    const meshLapelR = new THREE.Mesh(new THREE.ShapeGeometry(lapelR), lapelMat.clone());
    meshLapelR.position.set(0.1, 1.1, 0.02);
    group.add(meshLapelR);

    // Left sleeve
    const leftSleeveShape = new THREE.Shape();
    leftSleeveShape.moveTo(0, 0);
    leftSleeveShape.lineTo(-1.4, 0.4);
    leftSleeveShape.lineTo(-1.4, -1.3);
    leftSleeveShape.lineTo(0, -1.0);
    leftSleeveShape.closePath();
    const leftSleeve = new THREE.Mesh(new THREE.ShapeGeometry(leftSleeveShape), fabricMat.clone());
    leftSleeve.position.set(-1.4, 1.5, 0);
    group.add(leftSleeve);

    // Right sleeve
    const rightSleeveShape = new THREE.Shape();
    rightSleeveShape.moveTo(0, 0);
    rightSleeveShape.lineTo(1.4, 0.4);
    rightSleeveShape.lineTo(1.4, -1.3);
    rightSleeveShape.lineTo(0, -1.0);
    rightSleeveShape.closePath();
    const rightSleeve = new THREE.Mesh(new THREE.ShapeGeometry(rightSleeveShape), fabricMat.clone());
    rightSleeve.position.set(1.4, 1.5, 0);
    group.add(rightSleeve);

    // Collar band
    const collarCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6, 1.75, 0.02),
      new THREE.Vector3(-0.2, 2.0, 0.02),
      new THREE.Vector3(0, 1.95, 0.02),
      new THREE.Vector3(0.2, 2.0, 0.02),
      new THREE.Vector3(0.6, 1.75, 0.02),
    ]);
    const collarMat = new THREE.MeshPhysicalMaterial({ color: cfg.color, roughness: 0.85, metalness: 0 });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(collarCurve, 20, 0.07, 8, false), collarMat));

    // Center button strip
    const buttonStripMat = new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 });
    for (let y = -1.2; y <= 1.0; y += 0.55) {
      const btn = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), buttonStripMat);
      btn.position.set(0, y, 0.03);
      group.add(btn);
    }
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'var(--r, 12px)' }}
    >
      {/* THREE.js mounts here */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Decal cursor — shown when 3D selection mode is active and hovering model */}
      <div
        ref={decalCursorRef}
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          border: `2px dashed ${zoneMode === 'logo' ? '#ff6584' : '#43e97b'}`,
          borderRadius: 4,
          display: 'none',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
          zIndex: 100,
        }}
      />

      {/* 3D selection mode badge */}
      {select3DMode && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,101,132,0.15)',
            border: '1px solid #ff6584',
            borderRadius: 20,
            padding: '4px 14px',
            fontSize: '0.75rem',
            color: '#ff6584',
            fontWeight: 700,
            pointerEvents: 'none',
            zIndex: 101,
            whiteSpace: 'nowrap',
          }}
        >
          Click model to place zone
        </div>
      )}

      {/* Cross buttons for 3D-placed zones (updated manually in the animate loop) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {zones.map((z, idx) => {
          if (z.source === '3d' && z.point3d) {
            return (
              <button
                key={idx}
                ref={el => { buttonRefs.current[idx] = el; }}
                onClick={(e) => { e.stopPropagation(); onDeleteZone?.(idx); }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Delete 3D zone"
                aria-label="Delete 3D zone"
                style={{
                  position: 'absolute',
                  display: 'none',
                  transform: 'translate(-50%, -50%)',
                  width: 24,
                  height: 24,
                  background: 'rgba(217,45,32,0.85)',
                  border: '2px solid rgba(255,255,255,0.9)',
                  borderRadius: '50%',
                  color: '#fff',
                  cursor: 'pointer',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  zIndex: 200,
                  pointerEvents: 'auto',
                }}
              >
                ✕
              </button>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}