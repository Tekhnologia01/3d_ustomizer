/**
 * Warps a canvas horizontally to simulate a cylindrical perspective.
 * Matches the logic from the Django customize.html warpCylinder function.
 */
export function warpCylinder(
  srcCanvas: HTMLCanvasElement,
  horizontalStrength = 0.90,
  verticalTilt = 0.12
): HTMLCanvasElement {
  const W = srcCanvas.width;
  const H = srcCanvas.height;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = W;
  destCanvas.height = H;
  const destCtx = destCanvas.getContext('2d');
  if (!destCtx) return srcCanvas;

  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return srcCanvas;

  let srcData;
  try {
    srcData = srcCtx.getImageData(0, 0, W, H);
  } catch (e) {
    console.warn('CORS issue reading canvas pixel data, returning unwarped canvas', e);
    return srcCanvas;
  }

  const destData = destCtx.createImageData(W, H);
  const srcPixels = srcData.data;
  const destPixels = destData.data;

  const phi = horizontalStrength;
  const sinPhi = Math.sin(phi);

  for (let y = 0; y < H; y++) {
    const v = (2 * y / H) - 1;
    for (let x = 0; x < W; x++) {
      const u = (2 * x / W) - 1;

      const val = Math.max(-0.9999, Math.min(0.9999, u * sinPhi));
      const uPrime = Math.asin(val) / phi;
      const vPrime = v + verticalTilt * (u * u - 0.5);

      const sx = Math.floor((uPrime + 1) * 0.5 * W);
      const sy = Math.floor((vPrime + 1) * 0.5 * H);

      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        const destIdx = (y * W + x) * 4;
        const srcIdx = (sy * W + sx) * 4;

        destPixels[destIdx]     = srcPixels[srcIdx];
        destPixels[destIdx + 1] = srcPixels[srcIdx + 1];
        destPixels[destIdx + 2] = srcPixels[srcIdx + 2];
        destPixels[destIdx + 3] = srcPixels[srcIdx + 3];
      }
    }
  }

  destCtx.putImageData(destData, 0, 0);
  return destCanvas;
}

/**
 * Renders text into an off-screen canvas with shadow, returning the canvas.
 */
export function renderTextToCanvas(
  text: string,
  font: string,
  size: number,
  color: string,
  isBold: boolean,
  isItalic: boolean
): HTMLCanvasElement {
  const renderSize = Math.max(24, size * 2);
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return tempCanvas;

  const weight = isBold ? 'bold' : 'normal';
  const style = isItalic ? 'italic' : 'normal';
  tempCtx.font = `${style} ${weight} ${renderSize}px "${font}", "Inter", sans-serif`;

  const metrics = tempCtx.measureText(text);
  const textWidth = Math.ceil(metrics.width) || 10;
  const textHeight = Math.ceil(renderSize * 1.35);

  const canvas = document.createElement('canvas');
  canvas.width = textWidth + Math.ceil(renderSize * 0.5);
  canvas.height = textHeight + Math.ceil(renderSize * 0.5);

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.font = `${style} ${weight} ${renderSize}px "${font}", "Inter", sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return canvas;
}

/**
 * Extracts the most dominant non-white, non-transparent color from an image element.
 * Returns a hex string like '#rrggbb' or null.
 */
export function extractDominantColor(imgElement: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 50;
  canvas.height = 50;
  if (!ctx) return null;

  try {
    ctx.drawImage(imgElement, 0, 0, 50, 50);
    const imgData = ctx.getImageData(0, 0, 50, 50);
    const data = imgData.data;

    const colorCounts: Record<string, number> = {};
    let maxCount = 0;
    let dominantColor = { r: 255, g: 255, b: 255 };

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 50) continue;
      if (r > 235 && g > 235 && b > 235) continue;

      const factor = 16;
      const qr = Math.round(r / factor) * factor;
      const qg = Math.round(g / factor) * factor;
      const qb = Math.round(b / factor) * factor;

      const key = `${qr},${qg},${qb}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;

      if (colorCounts[key] > maxCount) {
        maxCount = colorCounts[key];
        dominantColor = { r: qr, g: qg, b: qb };
      }
    }

    return '#' + ((1 << 24) + (dominantColor.r << 16) + (dominantColor.g << 8) + dominantColor.b).toString(16).slice(1);
  } catch {
    return null;
  }
}

const setupCompositeCache: Record<string, HTMLCanvasElement> = {};

/** Build a 1024×1024 canvas showing zone mockups for the Setup page 3D preview. */
export function buildSetupCompositeCanvas(
  sideName: string,
  zones: Array<{ side: string; type: string; x: number; y: number; w: number; h: number; angle?: number; source?: '2d' | '3d' }>,
  baseColor: string
): HTMLCanvasElement {
  const W = 1024;
  const H = 1024;
  const key = sideName || 'default';

  if (!setupCompositeCache[key]) {
    setupCompositeCache[key] = document.createElement('canvas');
    setupCompositeCache[key].width = W;
    setupCompositeCache[key].height = H;
  }

  const comp = setupCompositeCache[key];
  const ctx = comp.getContext('2d');
  if (!ctx) return comp;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, W, H);

  zones
    .filter((z) => (z.side || 'front') === sideName && z.source === '3d')
    .forEach((z) => {
      const px = (z.x / 100) * W;
      const py = (z.y / 100) * H;
      const pw = (z.w / 100) * W;
      const ph = (z.h / 100) * H;

      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate(((z.angle || 0) * Math.PI) / 180);

      ctx.strokeStyle = z.type === 'logo' ? '#ff6584' : '#43e97b';
      ctx.lineWidth = 6;
      ctx.setLineDash([16, 8]);
      ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);

      ctx.fillStyle = z.type === 'logo' ? 'rgba(255,101,132,0.12)' : 'rgba(67,233,123,0.12)';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);

      if (z.type === 'logo') {
        ctx.fillStyle = '#ffd700';
        ctx.font = `${Math.min(pw, ph) * 0.45}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', 0, -ph * 0.08);

        ctx.fillStyle = '#ff6584';
        ctx.font = `bold ${Math.max(14, Math.min(pw, ph) * 0.12)}px Inter, sans-serif`;
        ctx.fillText('LOGO ZONE', 0, ph * 0.28);
      } else {
        ctx.fillStyle = '#43e97b';
        ctx.font = `bold ${Math.max(14, Math.min(pw, ph) * 0.16)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 8;
        ctx.fillText('TEXT ZONE', 0, 0);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    });

  return comp;
}
