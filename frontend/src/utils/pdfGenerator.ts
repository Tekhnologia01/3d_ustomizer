import { jsPDF } from 'jspdf';
import type { Product, DesignZone, ImprintMethod } from '../types';

export interface PDFData {
  product: Product;
  colorName: string;
  colorHex: string;
  imprintMethod: string;
  imprintColor: string;
  pmsNumber: string;
  imprintLocationCount: number;
  imprintLocations: Record<string, string>;
  // quantity: number;
  zones: DesignZone[];
  twoDSnapshotDataUrl?: string | null;
  threeDSnapshotDataUrl: string | null;
  sideThumbnails: Record<string, string>;
  generatedDate?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

const getImageDimensions = (url: string): Promise<{w: number, h: number}> => {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = url;
  });
};

/**
 * Downsample a dataUrl to maxPx on its longest side and return a JPEG dataUrl
 * at the given quality (0–1). Drastically reduces PDF file size.
 */
const compressImage = (
  dataUrl: string,
  maxPx = 500,
  quality = 0.60
): Promise<string> => {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      let w = img.width;
      let h = img.height;
      if (w > maxPx || h > maxPx) {
        if (ratio >= 1) { w = maxPx; h = Math.round(maxPx / ratio); }
        else            { h = maxPx; w = Math.round(maxPx * ratio); }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      // White background so transparent PNGs don't bloat as JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback: return original
    img.src = dataUrl;
  });
};

/**
 * Returns true if the image is essentially blank (all white / fully transparent).
 * Samples from 9 points across the image (grid) to avoid false positives when
 * the logo is placed away from the center.
 */
const isBlankImage = (dataUrl: string): Promise<boolean> => {
  // Always return false so we don't accidentally filter out valid product shots
  // with small logos on white backgrounds.
  return Promise.resolve(false);
};


function drawSectionTitle(doc: jsPDF, title: string, y: number, margin: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(248, 249, 250);
  doc.rect(margin - 4, y - 6, pageWidth - (margin - 4) * 2, 10, 'F');

  doc.setDrawColor(220, 220, 230);
  doc.setLineWidth(0.3);
  doc.line(margin - 4, y + 4, pageWidth - margin + 4, y + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 90);
  doc.text(title.toUpperCase(), margin - 2, y + 1);
  return y + 10;
}

function drawKeyValue(doc: jsPDF, key: string, value: string, x: number, y: number, valueX: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 110);
  doc.text(key, x, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(33, 33, 55);
  doc.text(value || '—', valueX, y);
  return y + 7;
}

// ─── Main generator ────────────────────────────────────────────────────────────
export async function generateProductSpecSheet(data: PDFData, returnAsDataUrl = false) {
  const {
    product,
    colorName,
    colorHex,
    imprintMethod,
    imprintColor,
    pmsNumber,
    imprintLocationCount,
    imprintLocations,
    // quantity,
    zones,
    twoDSnapshotDataUrl,
    threeDSnapshotDataUrl,
    sideThumbnails,
  } = data;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // ── 1. HEADER BAR ─────────────────────────────────────────────────────────
  // Background
  doc.setFillColor(22, 27, 44);
  doc.rect(0, 0, pageWidth, 32, 'F');

  // Accent stripe
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 28, pageWidth, 4, 'F');

  // Brand name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('ImprintVision', margin, 19);

  // Tag line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(180, 185, 210);
  doc.text('Design Proof & Physical Specifications', margin, 26);

  // Date (top-right)
  const dateStr = data.generatedDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.setFontSize(8);
  doc.setTextColor(140, 145, 175);
  doc.text(`Generated: ${dateStr}`, pageWidth - margin, 14, { align: 'right' });

  // Proof badge
  doc.setFillColor(99, 102, 241);
  doc.roundedRect(pageWidth - margin - 28, 17, 28, 9, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DESIGN PROOF', pageWidth - margin - 14, 22.5, { align: 'center' });

  let currentY = 42;

  // ── 2. PRODUCT OVERVIEW ───────────────────────────────────────────────────
  currentY = drawSectionTitle(doc, 'Product Overview', currentY, margin);
  currentY += 4;

  const leftCol  = margin;
  const midCol   = margin + 50;
  const rightCol = margin + contentWidth / 2 + 5;
  const rightMid = rightCol + 42;

  // Left column of key-values
  let leftY  = currentY;
  let rightY = currentY;

  leftY = drawKeyValue(doc, 'Product Name:', product.name || '—', leftCol, leftY, midCol);
  leftY = drawKeyValue(doc, 'Product Code:', `#${product.id}`, leftCol, leftY, midCol);
  // leftY = drawKeyValue(doc, 'Shape Type:', product.shape_type || '—', leftCol, leftY, midCol);

  // Right column
  // rightY = drawKeyValue(doc, 'Product Color:', colorName, rightCol, rightY, rightMid);

  // Color swatch
  // const [r, g, b] = hexToRgb(colorHex || '#cccccc');
  // doc.setFillColor(r, g, b);
  // doc.setDrawColor(180, 180, 195);
  // doc.setLineWidth(0.4);
  // doc.roundedRect(rightMid + doc.getTextWidth(colorName) + 2, rightY - 9, 8, 5, 1, 1, 'FD');

  rightY = drawKeyValue(doc, 'Imprint Method:', imprintMethod, rightCol, rightY, rightMid);
  rightY = drawKeyValue(doc, 'Imprint Color:', imprintColor, rightCol, rightY, rightMid);
  rightY = drawKeyValue(doc, 'PMS / Pantone:', pmsNumber, rightCol, rightY, rightMid);
  rightY = drawKeyValue(doc, 'Imprint Locations:', `${imprintLocationCount}`, rightCol, rightY, rightMid);

  // Available imprint methods list
  if (product.imprint_methods && product.imprint_methods.length > 0) {
    rightY += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 110);
    doc.text('Available Methods:', rightCol, rightY);
    rightY += 5;
    product.imprint_methods.forEach((m: ImprintMethod) => {
      const isCurrent = m.name === imprintMethod;
      doc.setFillColor(isCurrent ? 99 : 240, isCurrent ? 102 : 240, isCurrent ? 241 : 250);
      doc.setDrawColor(isCurrent ? 99 : 200, isCurrent ? 102 : 200, isCurrent ? 241 : 215);
      doc.roundedRect(rightCol, rightY - 4, 52, 5.5, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', isCurrent ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(isCurrent ? 255 : 60, isCurrent ? 255 : 60, isCurrent ? 255 : 80);
      doc.text(m.name, rightCol + 3, rightY);
      rightY += 7;
    });
  }

  currentY = Math.max(leftY, rightY) + 6;

  // Divider
  doc.setDrawColor(220, 220, 235);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 8;


  // ── 3. ARTWORK VIEWS / SIDE THUMBNAILS ────────────────────────────────────
  const allViewNames = Object.keys(sideThumbnails).filter(k => sideThumbnails[k]?.startsWith('data:image/'));

  // Compress and filter blank thumbnails in parallel
  const validViews: { name: string; url: string }[] = [];
  await Promise.all(
    allViewNames.map(async name => {
      const raw = sideThumbnails[name];
      const blank = await isBlankImage(raw);
      if (!blank) {
        const compressed = await compressImage(raw, 500, 0.60);
        validViews.push({ name, url: compressed });
      }
    })
  );
  // Keep original order
  validViews.sort((a, b) => allViewNames.indexOf(a.name) - allViewNames.indexOf(b.name));

  if (validViews.length > 0) {
    // New page if not enough space
    if (currentY > pageHeight - 90) {
      doc.addPage();
      currentY = 20;
    }

    currentY = drawSectionTitle(doc, 'Artwork Views', currentY, margin);
    currentY += 4;

    const maxPerRow = 3;
    const thumbSize = (contentWidth - (maxPerRow - 1) * 8) / maxPerRow;
    let tx = margin;

    validViews.forEach(({ name: viewName, url: thumbUrl }, idx) => {

      // Start new row
      if (idx > 0 && idx % maxPerRow === 0) {
        tx = margin;
        currentY += thumbSize + 18;
        // Add page if needed
        if (currentY > pageHeight - 60) {
          doc.addPage();
          currentY = 20;
        }
      }

      // Box background
      doc.setFillColor(248, 248, 252);
      doc.setDrawColor(210, 210, 230);
      doc.roundedRect(tx, currentY, thumbSize, thumbSize, 2, 2, 'FD');

      try {
        doc.addImage(thumbUrl, 'PNG', tx + 2, currentY + 2, thumbSize - 4, thumbSize - 4);
      } catch (e) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 175);
        doc.text('Image N/A', tx + thumbSize / 2, currentY + thumbSize / 2, { align: 'center' });
      }

      // Label pill under thumb
      doc.setFillColor(99, 102, 241);
      doc.roundedRect(tx + 4, currentY + thumbSize + 2, thumbSize - 8, 7, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(viewName, tx + thumbSize / 2, currentY + thumbSize + 7, { align: 'center' });

      tx += thumbSize + 8;
    });

    currentY += thumbSize + 20;
  }

  // ── 7. NOTES & APPROVAL SECTION ───────────────────────────────────────────
  if (currentY > pageHeight - 65) {
    doc.addPage();
    currentY = 20;
  }

  currentY = drawSectionTitle(doc, 'Notes & Approval', currentY, margin);
  currentY += 4;

  // Notes box
  doc.setFillColor(255, 255, 240);
  doc.setDrawColor(220, 210, 130);
  doc.roundedRect(margin, currentY - 2, contentWidth, 22, 2, 2, 'FD');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 100, 40);
  doc.text('This is a digital proof for approval purposes only. Final printed products may have slight color or placement variations.', margin + 3, currentY + 5, { maxWidth: contentWidth - 6 });
  doc.text('Please verify all spelling, imprint methods, quantities, and physical dimensions before final sign-off.', margin + 3, currentY + 14, { maxWidth: contentWidth - 6 });
  currentY += 28;

  // Signature line
  const halfW = (contentWidth - 10) / 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 110);

  doc.setDrawColor(140, 140, 170);
  doc.line(margin, currentY + 14, margin + halfW, currentY + 14);
  doc.text('Customer Signature', margin, currentY + 19);
  doc.text('Date Approved', margin + halfW - 18, currentY + 19);

  doc.line(margin + halfW + 10, currentY + 14, margin + contentWidth, currentY + 14);
  doc.text('ImprintVision Representative', margin + halfW + 10, currentY + 19);

  currentY += 28;

  // ── 8. FOOTER (every page) ────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    const pgh = doc.internal.pageSize.getHeight();
    doc.setFillColor(22, 27, 44);
    doc.rect(0, pgh - 12, pageWidth, 12, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 155, 185);
    doc.text(
      `PromoStudio  |  Document ID: PS-${product.id}-${Date.now().toString(36).toUpperCase()}  |  Confidential — Do Not Distribute`,
      pageWidth / 2,
      pgh - 5,
      { align: 'center' }
    );
    doc.text(`Page ${pg} of ${totalPages}`, pageWidth - margin, pgh - 5, { align: 'right' });
  }

  // ── Download or Return DataUrl ──────────────────────────────────────────────
  const safeName = (product.name || 'product').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  if (returnAsDataUrl) {
    return doc.output('datauristring');
  } else {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    doc.save(`${safeName}_proof_${timestamp}.pdf`);
  }
}

