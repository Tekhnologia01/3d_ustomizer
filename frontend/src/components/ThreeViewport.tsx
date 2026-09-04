import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { Maximize2, RotateCcw, ZoomIn, ZoomOut, Play, Pause, Maximize, Minimize, Loader2 } from 'lucide-react';
import type { Product, SideKey } from '../types';
import { ALL_SIDES } from '../types';
import type { ShapeType } from '../utils/threeBuilders';
import {
  buildFallbackShape,
  loadGLTFModel,
} from '../utils/threeBuilders';

interface Props {
  product: Product;
  currentSide: SideKey;
  dominantColor: string | null;
  preloadedImages: Record<string, HTMLImageElement>;
  imagesReady: boolean;
  cylinderCanvas: HTMLCanvasElement | null;
  textures: React.MutableRefObject<Record<string, THREE.CanvasTexture>>;
  sideThumbnails: React.MutableRefObject<Record<string, HTMLImageElement>>;
  onThreeReady: (ref: ThreeSceneRef) => void;
  onShapeResolved: (s: ShapeType) => void;
  onModelBuilt?: () => void;
  onSideChange: (side: SideKey) => void;
  imprintMethod?: string;
  zones: import('../types').DesignZone[];
  placementMode: boolean;
  placeSize: number;
  onStampDecal: (u: number, v: number, object: THREE.Object3D, faceIndex?: number, hitSide?: string, localU?: number) => void;
  onRequestRender?: (fn: () => void) => void;
}

export interface ThreeSceneRef {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  modelGroup: THREE.Group;
}

function disposeHierarchy(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m: any) => {
          if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
          m.dispose();
        });
      }
    }
  });
}

export default function ThreeViewport({
  product,
  currentSide,
  dominantColor,
  preloadedImages,
  imagesReady,
  cylinderCanvas,
  textures,
  onThreeReady,
  onShapeResolved,
  onModelBuilt,
  onSideChange,
  imprintMethod,
  zones,
  placementMode,
  placeSize,
  onStampDecal,
  onRequestRender,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<ThreeSceneRef | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const animFrameRef = useRef<number>(0);
  const shapeTypeRef = useRef<ShapeType>('flat');
  const targetRotRef = useRef({ x: 0, y: 0, z: 0 });
  const transitionRef = useRef(false);
  const envTextureRef = useRef<THREE.Texture | null>(null);
  const pmremGeneratorRef = useRef<THREE.PMREMGenerator | null>(null);

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

  const [zoomPercent, setZoomPercent] = React.useState(100);
  const [isAutoRotate, setIsAutoRotate] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isModelLoading, setIsModelLoading] = React.useState(true);
  const [cursorState, setCursorState] = React.useState<{ show: boolean; left: number; top: number }>({
    show: false,
    left: 0,
    top: 0,
  });

  useEffect(() => {
    if (threeRef.current?.controls) {
      threeRef.current.controls.enabled = !placementMode;
    }
  }, [placementMode]);

  useEffect(() => {
    if (threeRef.current?.controls) {
      threeRef.current.controls.autoRotate = isAutoRotate;
      threeRef.current.controls.autoRotateSpeed = 2.0;
    }
  }, [isAutoRotate]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      stageRef.current?.requestFullscreen().catch(err => {
        console.warn('Error attempting to enable fullscreen:', err.message);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const finalizeModel = (modelGroup: THREE.Group) => {
    modelGroup.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    if (floorRef.current) {
      const box = new THREE.Box3().setFromObject(modelGroup);
      floorRef.current.position.y = box.min.y - 0.01;
    }
  };

  const rebuildModel = (modelGroup: THREE.Group) => {
    if (!cylinderCanvas) return;
    setIsModelLoading(true);

    disposeHierarchy(modelGroup);
    while (modelGroup.children.length > 0) {
      modelGroup.remove(modelGroup.children[0]);
    }
    Object.keys(textures.current).forEach((key) => {
      textures.current[key]?.dispose();
      delete textures.current[key];
    });

    const cylinderTexture = new THREE.CanvasTexture(cylinderCanvas);
    const opts = {
      product,
      modelGroup,
      cylinderTexture,
      textures: textures.current,
      preloadedImages,
      dominantColor,
      onShapeResolved: (shape: ShapeType) => {
        shapeTypeRef.current = shape;
        onShapeResolved(shape);
      },
    };

    if (product.model_3d_url || product.tripo_model_url) {
      loadGLTFModel({
        ...opts,
        cylinderCanvas,
        onLoaded: () => {
          finalizeModel(modelGroup);
          onModelBuilt?.();
          setIsModelLoading(false);
        },
      });
    } else {
      buildFallbackShape(opts);
      finalizeModel(modelGroup);
      onModelBuilt?.();
      setIsModelLoading(false);
    }
  };

  const updateZoomDisplay = () => {
    const ref = threeRef.current;
    if (!ref) return;
    const distance = ref.camera.position.distanceTo(ref.controls.target);
    setZoomPercent(Math.round((7.5 / distance) * 100));
  };

  const setCameraDistance = (distance: number) => {
    const ref = threeRef.current;
    if (!ref) return;
    const { camera, controls } = ref;
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(distance, 2, 18));
    camera.position.copy(controls.target).add(offset);
    camera.updateProjectionMatrix();
    controls.update();
    updateZoomDisplay();
  };

  const zoomBy = (factor: number) => {
    const ref = threeRef.current;
    if (!ref) return;
    const distance = ref.camera.position.distanceTo(ref.controls.target);
    setCameraDistance(distance * factor);
  };

  const resetView = () => {
    const ref = threeRef.current;
    if (!ref) return;
    ref.controls.target.set(0, 0, 0);
    ref.camera.position.set(0, 2.6, 7.5);
    ref.controls.update();
    updateZoomDisplay();
  };

  const fitView = () => {
    const ref = threeRef.current;
    if (!ref) return;
    const box = new THREE.Box3().setFromObject(ref.modelGroup);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = sphere.radius || 2.4;
    ref.controls.target.copy(sphere.center);
    ref.camera.position.set(sphere.center.x, sphere.center.y + radius * 0.25, sphere.center.z + radius * 2.4);
    ref.controls.update();
    updateZoomDisplay();
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    // Use a neutral background that won't interfere with model colors
    scene.background = new THREE.Color('#f0f0f0');

    // Guard against a NaN/Infinity aspect ratio: the 3D viewport can be mounted
    // while its container is still `display:none` (view starts in 2D mode), in
    // which case clientWidth/clientHeight are both 0. Fall back to 1 until the
    // ResizeObserver below fires with the real size.
    const camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || 1) / (container.clientHeight || 1),
      0.1,
      100
    );
    camera.position.set(0, 3, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    // Correct output color space — without this, PBR textures render darker than intended.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // ── Environment map (Image-Based Lighting) ──
    // Tripo/AI-generated GLTF models use high-metalness PBR materials that
    // render almost entirely from environment reflections. Without scene.environment
    // there is nothing to reflect, so the model appears near-black regardless
    // of how bright the directional/ambient lights are.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGeneratorRef.current = pmremGenerator;
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    envTextureRef.current = envTexture;
    scene.environment = envTexture;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 18;
    controls.addEventListener('start', () => { transitionRef.current = false; });
    controls.addEventListener('change', updateZoomDisplay);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight1.position.set(4, 7, 4);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.set(1024, 1024);
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 15;
    dirLight1.shadow.camera.left = dirLight1.shadow.camera.bottom = -4;
    dirLight1.shadow.camera.right = dirLight1.shadow.camera.top = 4;
    dirLight1.shadow.bias = -0.0005;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-4, 5, -4);
    scene.add(dirLight2);



    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    threeRef.current = { scene, camera, renderer, controls, modelGroup };
    onThreeReady(threeRef.current);
    // NOTE: we deliberately do NOT call rebuildModel() here. The effect below
    // (deps: [imagesReady, product, dominantColor]) is the single owner of
    // model builds. Previously this line ALSO called rebuildModel() on mount,
    // and then — a moment later, once preloadProductImages() resolved and
    // imagesReady flipped to true — the effect below fired and called
    // rebuildModel() again with the *same* product. For GLTF products that
    // meant fetching and parsing the entire model twice on every load, which
    // is the main reason 3D models were loading slowly.
    updateZoomDisplay();

    let needsRender = true;
    const needsRenderRef = { current: true };

    controls.addEventListener('change', () => { needsRenderRef.current = true; });
    // Expose a function so external callers (e.g. ProductCustomizer) can trigger a single render
    onRequestRender?.(() => { needsRenderRef.current = true; });

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Always update controls — required for damping / auto-rotate to work
      controls.update();

      if (threeRef.current && transitionRef.current) {
        const grp = threeRef.current.modelGroup;
        const t = targetRotRef.current;
        const SPEED = 0.08;
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
        needsRenderRef.current = true;
      }

      // Auto-rotate always needs a fresh render
      if (controls.autoRotate) needsRenderRef.current = true;

      if (needsRenderRef.current) {
        renderer.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    needsRender; // suppress unused warning
    animate();

    const onResize = () => {
      const width = container.clientWidth || 400; // Provide fallback to avoid 0x0 WebGL crash
      const height = container.clientHeight || 400;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      needsRenderRef.current = true;
    };

    // Use ResizeObserver instead of window resize to catch display:none -> display:block toggles
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      controls.removeEventListener('change', updateZoomDisplay);
      if (threeRef.current?.modelGroup) {
        disposeHierarchy(threeRef.current.modelGroup);
      }
      Object.keys(textures.current).forEach((key) => {
        textures.current[key]?.dispose();
        delete textures.current[key];
      });
      // Dispose environment map resources
      envTextureRef.current?.dispose();
      envTextureRef.current = null;
      pmremGeneratorRef.current?.dispose();
      pmremGeneratorRef.current = null;
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      threeRef.current = null;
      floorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  useEffect(() => {
    if (!imagesReady || !threeRef.current) return;
    rebuildModel(threeRef.current.modelGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesReady, product, dominantColor]);

  /**
   * Returns UV in a consistent space:
   *   u = 0..1 left→right on the side
   *   v = 0..1 top→bottom on the side  (canvas-style, Y flipped from Three.js UV)
   * Also returns percent coords (0–100) for zone checks.
   */
  const getHitDetails = (hit: THREE.Intersection) => {
    const uv = hit.uv;

    let targetSide: SideKey = currentSide;
    let localU = uv ? uv.x : 0.5;
    let localV = uv ? uv.y : 0.5;

    if (shapeTypeRef.current === 'cylinder') {
      let angle = 0;
      if (threeRef.current?.modelGroup) {
        const modelPt = threeRef.current.modelGroup.worldToLocal(hit.point.clone());
        angle = Math.atan2(modelPt.x, modelPt.z);
      } else {
        const localPt = hit.object.worldToLocal(hit.point.clone());
        angle = Math.atan2(localPt.x, localPt.z);
      }

      if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
        targetSide = 'front';
        localU = (angle + Math.PI / 4) / (Math.PI / 2);
      } else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) {
        targetSide = 'right';
        localU = (angle - Math.PI / 4) / (Math.PI / 2);
      } else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) {
        targetSide = 'left';
        localU = (angle + 3 * Math.PI / 4) / (Math.PI / 2);
      } else {
        targetSide = 'back';
        let a = angle;
        if (a < 0) a += 2 * Math.PI;
        localU = (a - 3 * Math.PI / 4) / (Math.PI / 2);
      }
    } else {
      const named = (hit.object as THREE.Mesh).name;
      if (['front', 'back', 'left', 'right', 'top'].includes(named)) {
        targetSide = named as SideKey;
      } else {
        const faceMap: Record<number, SideKey> = { 0: 'right', 1: 'left', 2: 'top', 4: 'front', 5: 'back' };
        targetSide = faceMap[hit.face?.materialIndex ?? 4] ?? currentSide;
      }
    }

    localU = Math.max(0, Math.min(1, localU));
    const canvasV = 1 - Math.max(0, Math.min(1, localV));

    return {
      targetSide,
      localU,
      localV: canvasV,
      rawU: localU,
      rawV: localV,
      xPercent: localU * 100,
      yPercent: canvasV * 100,
    };
  };

  /** Find the imprint (printable) zone for a side — preferred over logo zone for constraints */
  const findImprintZone = (side: string) => {
    return (
      zones.find((z) => {
        const zAny = z as any;
        const name = ((zAny.name || '') as string).toLowerCase();
        return (
          z.side === side &&
          (zAny.zone_type === 'imprint' ||
            zAny.type === 'imprint' ||
            zAny.kind === 'imprint' ||
            name.includes('imprint'))
        );
      }) ||
      zones.find((z) => {
        const zAny = z as any;
        return (
          z.side === side &&
          zAny.zone_type !== 'logo' &&
          zAny.type !== 'logo' &&
          zAny.kind !== 'logo'
        );
      }) ||
      zones.find((z) => z.side === side && (z as any).zone_type === 'logo')
    );
  };

  const isInsideZone = (
    xPercent: number,
    yPercent: number,
    zone: import('../types').DesignZone
  ) => {
    const z = zone as any;
    const zx = z.x_percent ?? z.x ?? 0;
    const zy = z.y_percent ?? z.y ?? 0;
    const zw = z.width_percent ?? z.w ?? 100;
    const zh = z.height_percent ?? z.h ?? 100;
    return (
      xPercent >= zx &&
      xPercent <= zx + zw &&
      yPercent >= zy &&
      yPercent <= zy + zh
    );
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placementMode || !threeRef.current) return;
    const { camera, modelGroup } = threeRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const x = (sx / rect.width) * 2 - 1;
    const y = -(sy / rect.height) * 2 + 1;

    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hits = raycaster.intersectObjects(modelGroup.children, true);

    if (hits.length === 0) return;
    const details = getHitDetails(hits[0]);
    if (!details) return;

    onStampDecal(
      details.localU,
      details.localV,
      hits[0].object,
      hits[0].face?.materialIndex,
      details.targetSide,
      details.localU
    );
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placementMode || !threeRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { camera, modelGroup } = threeRef.current;
    const x = (sx / rect.width) * 2 - 1;
    const y = -(sy / rect.height) * 2 + 1;

    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hits = raycaster.intersectObjects(modelGroup.children, true);

    if (hits.length > 0) {
      setCursorState({ show: true, left: sx, top: sy });
    } else {
      setCursorState((prev) => ({ ...prev, show: false }));
    }
  };

  const handlePointerUp = (_e: React.PointerEvent<HTMLDivElement>) => {
    // No-op
  };

  const handlePointerLeave = () => {
    setCursorState((prev) => ({ ...prev, show: false }));
  };

  return (
    <div className="studio-stage" ref={stageRef}>
      <div className="studio-stage-badges">
        <span>{imprintMethod || 'Pad Printing'}</span>
      </div>

      <div
        ref={containerRef}
        className={`canvas-box studio-three-canvas ${placementMode ? 'placing' : ''}`}
        style={{ cursor: placementMode ? 'crosshair' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {isModelLoading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(240, 240, 240, 0.7)', zIndex: 10, color: '#64748b' }}>
            <Loader2 size={40} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ marginTop: '12px', fontWeight: 500 }}>Loading 3D Model...</span>
          </div>
        )}
      </div>

      {placementMode && cursorState.show && (
        <div
          className="studio-decal-cursor"
          style={{
            left: `${cursorState.left}px`,
            top: `${cursorState.top}px`,
            width: `${placeSize * 0.4}px`,
            height: `${placeSize * 0.4}px`,
          }}
        />
      )}

      <div className="studio-zoom-toolbar" aria-label="Viewport controls">
        <button
          type="button"
          onClick={() => setIsAutoRotate(!isAutoRotate)}
          title={isAutoRotate ? 'Stop Auto-Rotate' : 'Start Auto-Rotate'}
        >
          {isAutoRotate ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <em />
        <button type="button" onClick={() => zoomBy(1.12)} title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <span>{zoomPercent}%</span>
        <button type="button" onClick={() => zoomBy(0.88)} title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <em />
        <button type="button" onClick={resetView} title="Reset view">
          <RotateCcw size={16} />
        </button>
        <button type="button" onClick={fitView} title="Fit view">
          <Maximize2 size={16} />
        </button>
        <em />
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>

      {placementMode && (
        <div className="studio-placement-note">
          Click inside the printable area to place the selected stamp.
        </div>
      )}
    </div>
  );
}