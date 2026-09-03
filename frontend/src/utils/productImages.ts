import type { Product } from '../types';
import { extractDominantColor } from './canvasUtils';

export function getSideImageUrl(product: Product, side: string): string {
  // Legacy fields mapping
  const fallback = product.image_url || product.external_product_url || '';
  switch (side) {
    case 'back':
      return product.back_image_url || fallback;
    case 'left':
      return product.left_image_url || fallback;
    case 'right':
      return product.right_image_url || fallback;
    case 'top':
      return product.top_image_url || fallback;
    default:
      return fallback;
  }
}

export function resolveImageUrl(
  url: string | null | undefined,
  fallbackLabel = 'Product'
): string {
  if (url && url.trim()) return url;
  return `https://placehold.co/700x700/1a1a2e/6c63ff?text=${encodeURIComponent(fallbackLabel)}`;
}

const imageCache: Record<string, HTMLImageElement> = {};
const fetchCache: Record<string, Promise<HTMLImageElement>> = {};

function loadImage(url: string): Promise<HTMLImageElement> {
  if (imageCache[url]) return Promise.resolve(imageCache[url]);
  if (fetchCache[url]) return fetchCache[url];

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache[url] = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });

  fetchCache[url] = promise;
  return promise;
}

export async function preloadProductImages(
  product: Product
): Promise<{ images: Record<string, HTMLImageElement>; dominantColor: string | null }> {
  const images: Record<string, HTMLImageElement> = {};
  let dominantColor: string | null = null;

  const viewsToLoad = ['front', 'back', 'left', 'right', 'top'];

  await Promise.all(
    viewsToLoad.map(async (side, index) => {
      const url = resolveImageUrl(getSideImageUrl(product, side), `${product.name} ${side}`);
      try {
        const img = await loadImage(url);
        images[side] = img;
        // Grab dominant color from the first view
        if (index === 0) {
          dominantColor = extractDominantColor(img);
        }
      } catch (err) {
        console.warn(err);
      }
    })
  );

  return { images, dominantColor };
}
