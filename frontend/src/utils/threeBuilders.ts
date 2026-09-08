import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Product } from '../types';
import { resolveMediaUrl } from './apiConfig';

// ─── Material Config ─────────────────────────────────────────────────────────

export interface MaterialConfig {
  color: number;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

export function getProductMaterialConfig(name: string, dominantColor: string | null): MaterialConfig {
  const baseColor = dominantColor ? parseInt(dominantColor.replace('#', '0x')) : 0xffffff;
  // NOTE: `baseColor || 0xffffff` used to silently force genuinely black
  // products (`#000000` -> 0) to white. Only fall back on a real parse
  // failure (NaN), not on a valid color that happens to be 0.
  return { color: Number.isNaN(baseColor) ? 0xffffff : baseColor, roughness: 0.6, metalness: 0.1 };
}

export function getProductBaseColorHex(name: string, dominantColor: string | null): string {
  if (dominantColor) return dominantColor;
  return '#ffffff';
}

// ─── Shape Builders ───────────────────────────────────────────────────────────

export function buildWaterBottle(
  modelGroup: THREE.Group,
  cylinderTexture: THREE.CanvasTexture,
  cfg: MaterialConfig
) {
  const pts = [
    new THREE.Vector2(0.00, -2.30),
    new THREE.Vector2(0.52, -2.25),
    new THREE.Vector2(0.70, -2.05),
    new THREE.Vector2(0.88, -1.60),
    new THREE.Vector2(0.95, -0.60),
    new THREE.Vector2(0.93, 0.60),
    new THREE.Vector2(0.88, 1.30),
    new THREE.Vector2(0.68, 1.75),
    new THREE.Vector2(0.36, 1.95),
    new THREE.Vector2(0.33, 2.10),
    new THREE.Vector2(0.38, 2.18),
    new THREE.Vector2(0.38, 2.30),
  ];
  const geo = new THREE.LatheGeometry(pts, 96).rotateY(Math.PI * 0.75);
  const mat = new THREE.MeshPhysicalMaterial({
    color: cfg.color,
    map: cylinderTexture,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    clearcoat: cfg.clearcoat ?? 0,
    clearcoatRoughness: cfg.clearcoatRoughness ?? 0,
  });
  modelGroup.add(new THREE.Mesh(geo, mat));
}

export function buildCoffeeMug(
  modelGroup: THREE.Group,
  cylinderTexture: THREE.CanvasTexture,
  cfg: MaterialConfig
) {
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color,
    map: cylinderTexture,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    clearcoat: cfg.clearcoat ?? 0,
    clearcoatRoughness: cfg.clearcoatRoughness ?? 0,
    side: THREE.DoubleSide,
  });

  const plainMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    clearcoat: cfg.clearcoat ?? 0,
    clearcoatRoughness: cfg.clearcoatRoughness ?? 0,
  });

  // Outer wall
  modelGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.0, 64, 1, true).rotateY(Math.PI * 0.75), bodyMat));

  // Inner wall
  const innerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 2.8, 64, 1, true).rotateY(Math.PI * 0.75), plainMat);
  innerMesh.position.y = 0.1;
  modelGroup.add(innerMesh);

  // Top Rim
  const rimGeo = new THREE.RingGeometry(0.87, 0.95, 64);
  rimGeo.rotateX(-Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeo, plainMat);
  rimMesh.position.y = 1.5;
  modelGroup.add(rimMesh);

  // Bottom Cap
  const bottomGeo = new THREE.CircleGeometry(0.95, 64);
  bottomGeo.rotateX(Math.PI / 2);
  const bottomMesh = new THREE.Mesh(bottomGeo, plainMat);
  bottomMesh.position.y = -1.5;
  modelGroup.add(bottomMesh);

  // Inner Bottom Cap
  const innerBottomGeo = new THREE.CircleGeometry(0.87, 64);
  innerBottomGeo.rotateX(-Math.PI / 2);
  const innerBottomMesh = new THREE.Mesh(innerBottomGeo, plainMat);
  innerBottomMesh.position.y = -1.3;
  modelGroup.add(innerBottomMesh);

  // Handle
  const R = 0.94;
  const handlePts = [
    new THREE.Vector3(R, 0.95, 0.0),
    new THREE.Vector3(R + 0.28, 0.80, 0.0),
    new THREE.Vector3(R + 0.72, 0.40, 0.0),
    new THREE.Vector3(R + 0.80, 0.00, 0.0),
    new THREE.Vector3(R + 0.72, -0.40, 0.0),
    new THREE.Vector3(R + 0.28, -0.80, 0.0),
    new THREE.Vector3(R, -0.95, 0.0),
  ];
  const handleCurve = new THREE.CatmullRomCurve3(handlePts);
  modelGroup.add(new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 24, 0.09, 10, false), plainMat));

  // Coaster base removed - no longer needed
}

export function buildNotebook(
  modelGroup: THREE.Group,
  cfg: MaterialConfig
) {
  const coverMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color,
    roughness: 0.85,
    metalness: 0.05,
  });
  const blackSpineMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c1c1c, roughness: 0.7, metalness: 0.1,
  });
  const spiralMat = new THREE.MeshStandardMaterial({
    color: 0x151515, roughness: 0.5, metalness: 0.8,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xfbfbf9, roughness: 0.9, metalness: 0.0,
  });

  // Left spine strip
  const leftStrip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.18), blackSpineMat);
  leftStrip.position.set(-1.25, 0, 0);
  modelGroup.add(leftStrip);

  // Front cover
  const rightCover = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.2, 0.18), coverMat);
  rightCover.position.set(0.25, 0, 0);
  rightCover.name = 'front';
  modelGroup.add(rightCover);

  // Back cover spine
  const backCoverLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.18), blackSpineMat);
  backCoverLeft.position.set(-1.25, 0, -0.5);
  modelGroup.add(backCoverLeft);

  // Back cover
  const backCoverRight = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.2, 0.18), coverMat);
  backCoverRight.position.set(0.25, 0, -0.5);
  backCoverRight.name = 'back';
  modelGroup.add(backCoverRight);

  // Pages block
  const pages = new THREE.Mesh(new THREE.BoxGeometry(2.90, 4.10, 0.34), paperMat);
  pages.position.set(0.05, 0, -0.25);
  modelGroup.add(pages);

  // Spiral rings
  const torusGeo = new THREE.TorusGeometry(0.15, 0.025, 8, 24);
  for (let y = -1.9; y <= 1.9; y += 0.24) {
    const ring = new THREE.Mesh(torusGeo, spiralMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-1.5, y, -0.25);
    modelGroup.add(ring);
  }

  // Elastic band
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.22, 0.20), blackSpineMat);
  band.position.set(0.8, 0, 0.01);
  modelGroup.add(band);
}

export function buildCap(
  modelGroup: THREE.Group,
  textures: Record<string, THREE.CanvasTexture>,
  cfg: MaterialConfig
) {
  const capMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    side: THREE.DoubleSide,
  });
  const plainWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0.1,
  });

  // Crown (hemisphere)
  const crownGeo = new THREE.SphereGeometry(1.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  crownGeo.scale(1.0, 0.95, 1.05);
  const crown = new THREE.Mesh(crownGeo, capMat);
  crown.rotation.x = -0.05;
  modelGroup.add(crown);

  // Brim (curved plane)
  const visorGeo = new THREE.PlaneGeometry(2.0, 1.4, 16, 16);
  const pos = visorGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const zBend = -0.16 * Math.sin((y + 0.7) / 1.4 * Math.PI) - 0.22 * (x * x);
    pos.setZ(i, zBend);
  }
  visorGeo.computeVertexNormals();

  const visor = new THREE.Mesh(visorGeo, capMat);
  visor.rotation.x = -Math.PI / 2 + 0.15;
  visor.position.set(0, -0.08, 0.72);
  modelGroup.add(visor);

  const visorWhite = new THREE.Mesh(visorGeo.clone(), plainWhiteMat);
  visorWhite.rotation.x = -Math.PI / 2 + 0.15;
  visorWhite.position.set(0, -0.10, 0.72);
  modelGroup.add(visorWhite);

  // Button
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), plainWhiteMat);
  button.position.set(0, 1.32, -0.05);
  modelGroup.add(button);

  // Customizable patch panels
  const patchConfigs = [
    { name: 'front', phiStart: Math.PI * 0.35, phiLength: Math.PI * 0.3 },
    { name: 'back', phiStart: Math.PI * 1.35, phiLength: Math.PI * 0.3 },
    { name: 'right', phiStart: -Math.PI * 0.15, phiLength: Math.PI * 0.3 },
    { name: 'left', phiStart: Math.PI * 0.85, phiLength: Math.PI * 0.3 },
  ];

  patchConfigs.forEach(conf => {
    const patchGeo = new THREE.SphereGeometry(1.405, 32, 16, conf.phiStart, conf.phiLength, Math.PI * 0.18, Math.PI * 0.28);
    patchGeo.scale(1.0, 0.95, 1.05);
    const pMat = new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      map: textures[conf.name] || null,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });
    const patchMesh = new THREE.Mesh(patchGeo, pMat);
    patchMesh.name = conf.name;
    patchMesh.rotation.x = -0.05;
    modelGroup.add(patchMesh);
  });
}

export function buildTravelTumbler(
  modelGroup: THREE.Group,
  cylinderTexture: THREE.CanvasTexture
) {
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: cylinderTexture,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const lidMat = new THREE.MeshPhysicalMaterial({
    color: 0x5a636a, roughness: 0.35, metalness: 0.1,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af, roughness: 0.25, metalness: 0.8,
  });
  const blackPlasticMat = new THREE.MeshStandardMaterial({
    color: 0x222222, roughness: 0.4,
  });

  // Body (lathe)
  const pts = [
    new THREE.Vector2(0.0, -2.1),
    new THREE.Vector2(0.72, -2.1),
    new THREE.Vector2(0.75, -1.5),
    new THREE.Vector2(0.80, -0.5),
    new THREE.Vector2(0.88, 0.5),
    new THREE.Vector2(0.92, 1.6),
    new THREE.Vector2(0.92, 1.8),
    new THREE.Vector2(0.0, 1.8),
  ];
  modelGroup.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 64).rotateY(Math.PI * 0.75), bodyMat));

  // Lid
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.94, 0.94, 0.5, 32).rotateY(Math.PI * 0.75), lidMat);
  lid.position.y = 2.05;
  modelGroup.add(lid);

  // Spout
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16).rotateY(Math.PI * 0.75), blackPlasticMat);
  spout.position.set(0, 2.35, 0.05);
  modelGroup.add(spout);

  // Handle
  const handleGroup = new THREE.Group();
  handleGroup.position.set(0, 2.1, 0);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.12), metalMat);
  leftArm.position.set(-0.96, 0.85, 0);
  handleGroup.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.12), metalMat);
  rightArm.position.set(0.96, 0.85, 0);
  handleGroup.add(rightArm);

  const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.06, 0.12), metalMat);
  topBar.position.set(0, 1.8, 0);
  handleGroup.add(topBar);

  modelGroup.add(handleGroup);
}

export function buildPhoneCase(
  modelGroup: THREE.Group,
  textures: Record<string, THREE.CanvasTexture>,
  cfg: MaterialConfig
) {
  const mats = Array.from({ length: 6 }, (_, i) =>
    new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      map: i === 4 ? (textures['front'] || null) : null,
    })
  );
  const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.8, 0.22), mats);
  modelMesh.name = 'front';
  modelGroup.add(modelMesh);

  // Camera bump
  const bumpMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.7 });
  const bump = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 32).rotateY(Math.PI * 0.75), bumpMat);
  bump.rotation.x = Math.PI / 2;
  bump.position.set(-0.65, 1.6, -0.15);
  modelGroup.add(bump);
}

export function buildTShirt(
  modelGroup: THREE.Group,
  textures: Record<string, THREE.CanvasTexture>,
  cfg: MaterialConfig
) {
  const tshirtPoints = [
    new THREE.Vector2(-1.3, -1.9),
    new THREE.Vector2(1.3, -1.9),
    new THREE.Vector2(1.3, 0.4),
    new THREE.Vector2(2.2, 0.7),
    new THREE.Vector2(1.8, 1.4),
    new THREE.Vector2(1.0, 1.6),
    new THREE.Vector2(0.5, 1.8),
    new THREE.Vector2(-0.5, 1.8),
    new THREE.Vector2(-1.0, 1.6),
    new THREE.Vector2(-1.8, 1.4),
    new THREE.Vector2(-2.2, 0.7),
    new THREE.Vector2(-1.3, 0.4),
  ];
  const shape = new THREE.Shape();
  shape.moveTo(tshirtPoints[0].x, tshirtPoints[0].y);
  tshirtPoints.slice(1).forEach(p => shape.lineTo(p.x, p.y));
  shape.closePath();

  const thickness = 0.22;
  const extrudeSettings = {
    depth: thickness, bevelEnabled: true, bevelSegments: 2,
    steps: 1, bevelSize: 0.01, bevelThickness: 0.01,
  };

  const frontMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color, map: textures['front'] || null, roughness: cfg.roughness, metalness: cfg.metalness,
  });
  const frontMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, extrudeSettings), frontMat);
  frontMesh.name = 'front';
  modelGroup.add(frontMesh);

  const backMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color, map: textures['back'] || null, roughness: cfg.roughness, metalness: cfg.metalness,
  });
  const backMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, extrudeSettings), backMat);
  backMesh.name = 'back';
  backMesh.rotation.y = Math.PI;
  backMesh.position.z = -thickness;
  modelGroup.add(backMesh);
}

export function buildToteBag(
  modelGroup: THREE.Group,
  textures: Record<string, THREE.CanvasTexture>,
  cfg: MaterialConfig
) {
  const frontMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.4, 0.4),
    new THREE.MeshPhysicalMaterial({ color: cfg.color, map: textures['front'] || null, roughness: cfg.roughness, metalness: cfg.metalness })
  );
  frontMesh.name = 'front';
  modelGroup.add(frontMesh);

  const backMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.4, 0.4),
    new THREE.MeshPhysicalMaterial({ color: cfg.color, map: textures['back'] || null, roughness: cfg.roughness, metalness: cfg.metalness })
  );
  backMesh.name = 'back';
  backMesh.position.z = -0.4;
  modelGroup.add(backMesh);

  const strapMat = new THREE.MeshPhysicalMaterial({ color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness });

  const makeTubeStrap = (pts: THREE.Vector3[]) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.06, 8, false), strapMat);
  };

  modelGroup.add(makeTubeStrap([
    new THREE.Vector3(-0.8, 1.7, 0.21), new THREE.Vector3(-0.6, 2.5, 0.21),
    new THREE.Vector3(0, 2.8, 0.21), new THREE.Vector3(0.6, 2.5, 0.21), new THREE.Vector3(0.8, 1.7, 0.21),
  ]));

  modelGroup.add(makeTubeStrap([
    new THREE.Vector3(-0.8, 1.7, -0.61), new THREE.Vector3(-0.6, 2.5, -0.61),
    new THREE.Vector3(0, 2.8, -0.61), new THREE.Vector3(0.6, 2.5, -0.61), new THREE.Vector3(0.8, 1.7, -0.61),
  ]));
}

export function buildFlatCard(
  modelGroup: THREE.Group,
  textures: Record<string, THREE.CanvasTexture>,
  preloadedImages: Record<string, HTMLImageElement>,
  baseColorHex: string
) {
  const frontImg = preloadedImages['front'];
  let aspect = 1.0;
  if (frontImg?.naturalWidth && frontImg?.naturalHeight) {
    aspect = frontImg.naturalWidth / frontImg.naturalHeight;
  }

  const edgeMat = new THREE.MeshPhysicalMaterial({
    color: baseColorHex, roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.2,
  });

  const mats = Array.from({ length: 6 }, (_, i) => {
    if (i === 4 || i === 5) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: i === 4 ? (textures['front'] || null) : (textures['back'] || null),
        roughness: 0.5, metalness: 0.1, transparent: true, alphaTest: 0.05,
      });
    }
    return edgeMat;
  });

  const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(3.0 * aspect, 3.0, 0.08), mats);
  modelMesh.name = 'front';
  modelGroup.add(modelMesh);
}

// ─── Main Model Builder ───────────────────────────────────────────────────────

export type ShapeType = 'cylinder' | 'box' | 'flat';

export interface BuildModelOptions {
  product: Product;
  modelGroup: THREE.Group;
  cylinderTexture: THREE.CanvasTexture;
  textures: Record<string, THREE.CanvasTexture>;
  preloadedImages: Record<string, HTMLImageElement>;
  dominantColor: string | null;
  onShapeResolved: (shapeType: ShapeType) => void;
}

/**
 * Fill a THREE.CanvasTexture's backing canvas with a flat base color and mark
 * the texture as dirty. Used to guarantee a texture never gets handed to a
 * mesh while its backing canvas is still blank/transparent — a blank canvas
 * renders as black, which combined with a white material color reads as flat
 * gray instead of the intended product color.
 */
function primeCanvasTexture(texture: THREE.CanvasTexture, hexColor: string): void {
  const canvas = texture.image as HTMLCanvasElement | undefined;
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  texture.needsUpdate = true;
}

export function buildFallbackShape(opts: BuildModelOptions): void {
  const { product, modelGroup, cylinderTexture, textures, preloadedImages, dominantColor, onShapeResolved } = opts;
  const name = (product.name || '').toLowerCase();
  const shape = product.shape_type;
  const cfg = getProductMaterialConfig(product.name, dominantColor);
  const baseColorHex = getProductBaseColorHex(product.name, dominantColor);

  // Prime the cylinder texture's canvas with the real base color before any
  // mesh gets built and references it, so there's no blank/gray frame.
  primeCanvasTexture(cylinderTexture, baseColorHex);

  if (shape === 'cylinder') {
    onShapeResolved('cylinder');
    buildCoffeeMug(modelGroup, cylinderTexture, cfg);
  } else if (shape === 'box') {
    onShapeResolved('box');
    buildNotebook(modelGroup, cfg);
  } else {
    onShapeResolved('cylinder');
    buildCoffeeMug(modelGroup, cylinderTexture, cfg);
  }
}

const gltfCache: Record<string, THREE.Group> = {};
const gltfFetchCache: Record<string, Promise<THREE.Group>> = {};

function processGLTFModel(
  model: THREE.Group,
  opts: BuildModelOptions & { cylinderCanvas: HTMLCanvasElement; onLoaded?: () => void }
) {
  const { product, modelGroup, onLoaded } = opts;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 3.5 / maxDim;
  model.scale.set(scale, scale, scale);

  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  const explicitYaw = (product as any).model_rotation_y;
  const n = (product.name || '').toLowerCase();
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
      // ── Preserve original Tripo baked textures ──────────────────────────
      // Do NOT assign cylinderTexture here. Tripo GLTF models carry their
      // own embedded textures/PBR materials. Overriding mat.map with the
      // (initially blank) cylinderTexture is what caused the flat gray look.
      //
      // When the user adds designs, update3DTextures() in ProductCustomizer
      // will assign the painted cylinderTexture at that point — which is
      // fine because by then the canvas contains the actual artwork.
      child.userData.isOriginalModel = true; // flag so later updates know

      // Clone materials so independent decals don't get shared across cache instances
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m: any) => m.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    }
  });

  modelGroup.add(model);
  onLoaded?.();
}

export function loadGLTFModel(
  opts: BuildModelOptions & { cylinderCanvas: HTMLCanvasElement; onLoaded?: () => void }
): void {
  const { product, onShapeResolved } = opts;
  const rawUrl = product.model_3d_url || (product as any).model_3d || product.tripo_model_url;

  if (!rawUrl) {
    buildFallbackShape(opts);
    return;
  }
  const url = resolveMediaUrl(rawUrl);

  // GLTF/Tripo models resolve as 'cylinder' so the customizer update path
  // knows how to paint the correct strip layout when designs are added.
  onShapeResolved('cylinder');

  if (gltfCache[url]) {
    const model = gltfCache[url].clone();
    processGLTFModel(model, opts);
    return;
  }

  if (!gltfFetchCache[url]) {
    const loader = new GLTFLoader();
    gltfFetchCache[url] = new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          gltfCache[url] = gltf.scene;
          resolve(gltf.scene);
        },
        undefined,
        reject
      );
    });
  }

  gltfFetchCache[url]
    .then((originalScene) => {
      const model = originalScene.clone();
      processGLTFModel(model, opts);
    })
    .catch((error) => {
      console.error('GLTF load error for URL:', url, error);
      delete gltfFetchCache[url];

      // If primary model_3d_url failed (e.g. 404 Not Found), try tripo_model_url if present & different
      const tripoUrl = product.tripo_model_url ? resolveMediaUrl(product.tripo_model_url) : null;

      
      
      if (tripoUrl && tripoUrl !== url) {
        console.warn('Attempting fallback to tripo_model_url:', tripoUrl);
        const loader = new GLTFLoader();
        loader.load(
          tripoUrl,
          (gltf) => {
            gltfCache[tripoUrl] = gltf.scene;
            processGLTFModel(gltf.scene.clone(), opts);
          },
          undefined,
          (err) => {
            console.error('Fallback tripo_model_url also failed:', err);
            buildFallbackShape(opts);
          }
        );
      } else {
        buildFallbackShape(opts);
      }
    });
}