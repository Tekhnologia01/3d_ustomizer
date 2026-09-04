/**
 * vectorToImage.ts
 * Converts vector upload formats (PDF, AI, EPS) into a File object with PNG data
 * that can be used directly in the Fabric.js canvas and 3D viewport.
 *
 * - PDF / AI -> rendered client-side using pdf.js (AI files are PDF-based)
 * - EPS      -> sent to the Django backend for server-side Ghostscript conversion
 */

import * as pdfjsLib from "pdfjs-dist";
import { apiFetch } from "./apiConfig";

// Point pdf.js to the bundled worker – Vite resolves the ?url correctly.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

const RENDER_SCALE = 3; // 3x for crisp, high-res output

/** Render the first page of a PDF (or AI) file and return a PNG File. */
async function pdfToFile(file: File): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport } as any).promise;

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("Canvas toBlob failed")); return; }
      resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png" }));
    }, "image/png");
  });
}

/** Send an EPS file to the Django backend for Ghostscript conversion. */
async function epsToFile(file: File): Promise<File> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/api/convert-vector/", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server returned ${res.status}`);
  }

  const blob = await res.blob();
  return new File([blob], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png" });
}

/**
 * Accepts any supported file and returns a PNG-compatible File.
 * Standard raster formats (JPEG, PNG, BMP, TIFF, GIF, WebP, SVG) pass through unchanged.
 */
export async function normaliseToImage(file: File): Promise<File> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf" || ext === "ai") {
    return pdfToFile(file);
  }

  if (ext === "eps") {
    return epsToFile(file);
  }

  // Raster formats pass straight through
  return file;
}

/** The `accept` string for every <input type="file"> that accepts logos. */
export const ACCEPTED_IMAGE_TYPES =
  "image/*,.pdf,.ai,.eps,application/pdf,application/postscript";

