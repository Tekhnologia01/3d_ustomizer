import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { fabric } from 'fabric';
import type { Product, DesignZone, SideKey } from '../types';
import { ALL_SIDES } from '../types';
import { renderTextToCanvas } from '../utils/canvasUtils';
import { getSideImageUrl, resolveImageUrl } from '../utils/productImages';

export interface RelativeStats {
  relX: number;
  relY: number;
  relScaleX: number;
  relScaleY: number;
  angle: number;
}

export interface FabricCanvasHandle {
  endDrag(): unknown;
  moveDrag(canvasX: number, canvasY: number): unknown;
  startDrag(canvasX: number, canvasY: number): unknown;
  addText: (text: string, font: string, size: number, color: string, bold: boolean, italic: boolean, id?: string) => void;
  updateText: (id: string, text: string, font: string, size: number, color: string, bold: boolean, italic: boolean) => void;
  addEmoji: (emoji: string, id?: string) => void;
  addLogoFile: (file: File | string, id?: string) => void;
  applyRelativeStats: (id: string, stats: RelativeStats) => void;
  deleteSelected: () => void;
  bringFront: () => void;
  sendBack: () => void;
  setOpacity: (v: number) => void;
  clearSide: () => void;
  getSnapshot: () => string;
  getDesignOnlyCanvas: (hideZones?: boolean) => HTMLCanvasElement | null;
  cacheCurrentSide: () => void;
  addStampedObject: (obj: fabric.Object) => void;
  undoDecal: () => void;
  clearDecals: () => void;
  flipSelectedHorizontal: () => void;
  flipSelectedVertical: () => void;
  centerSelected: () => void;
  fitSelectedToZone: () => void;
  getLayers: () => { id: string; name: string; type: string; isSelected: boolean }[];
  selectLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  getPhysicalStats: (actualZoneW: number, actualZoneH: number) => { width: number; height: number; left: number; top: number } | null;
  setPhysicalSize: (w: number, h: number, lockProportions: boolean, actualZoneW: number, actualZoneH: number) => void;
  setPhysicalPlacement: (left: number, top: number, actualZoneW: number, actualZoneH: number) => void;
  /** Re-paint all image objects from their stored source canvas and force a renderAll.
   *  Call this after the canvas container becomes visible again to restore pixels
   *  that browsers may have discarded while the element was off-screen. */
  refresh: () => void;
  /** Returns the current pixel dimensions of the Fabric canvas. */
  getCanvasSize: () => { width: number; height: number };
}

interface Props {
  product: Product;
  currentSide: SideKey;
  physicalSide?: string;
  zones: DesignZone[];
  selectedZoneId?: string | null;
  sideObjects: React.MutableRefObject<Record<SideKey, any[]>>;
  sideThumbnails: React.MutableRefObject<Record<string, HTMLImageElement>>;
  onSelectionChange: (obj: any | null) => void;
  onCanvasRender: () => void;
  onSetZones: (logo: DesignZone | null, text: DesignZone | null) => void;
  onBackgroundLoaded?: () => void;
  showToast: (msg: string) => void;
  showImprintArea?: boolean;
  onObjectModified?: (id: string, stats: RelativeStats) => void;
  viewMode?: string;
}

const FabricCanvas2D = forwardRef<FabricCanvasHandle, Props>(function FabricCanvas2D(
  { product, currentSide, physicalSide, zones, selectedZoneId, sideObjects, sideThumbnails, onSelectionChange, onCanvasRender, onSetZones, onBackgroundLoaded, showToast, showImprintArea = true, onObjectModified, viewMode },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  // Prevents recursive after:render loop
  const isSnapshotting = useRef(false);

  // The visible WRAPPER box is locked once per product so switching side tabs
  // never visibly resizes the widget on screen. Unlike a previous version of
  // this fix, we do NOT lock the actual <canvas> pixel size — each side's
  // zone x_percent/y_percent values are authored relative to that side's own
  // product photo, and the canvas must keep matching each photo's aspect
  // ratio exactly (see the image-load handler below) or zone/decal placement
  // drifts off the artwork for every side except the one that set the lock.
  // The canvas is simply centered inside this fixed wrapper instead.
  const stageSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lastProductIdRef = useRef<number | string | null>(null);

  // Keep the latest callback in a ref so the after:render listener never needs
  // to be re-registered (which would cause re-renders and flicker).
  const onCanvasRenderRef = useRef(onCanvasRender);
  useEffect(() => { onCanvasRenderRef.current = onCanvasRender; });

  // Track the currentSide in a ref so the cleanup function always has the latest value
  const currentSideRef = useRef(currentSide);
  useEffect(() => { currentSideRef.current = currentSide; }, [currentSide]);

  // Ref that holds the clamp function so moveDrag (in useImperativeHandle) can call it
  const clampToBoundsRef = useRef<((obj: any) => void) | null>(null);
  const activeDragObjRef = useRef<fabric.Object | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Zone bounds helper – uses actual canvas dimensions
  const zoneBounds = (z: DesignZone) => {
    const fc = fabricRef.current;
    const iw = fc?.width || 600;
    const ih = fc?.height || 600;
    const left = (z.x_percent / 100) * iw;
    const top = (z.y_percent / 100) * ih;
    return {
      left, top,
      right: left + (z.width_percent / 100) * iw,
      bottom: top + (z.height_percent / 100) * ih,
      angle: z.angle || 0,
    };
  };

  /**
   * For a combined zone, return bounds for the top 60% → used as the logo sub-area.
   */
  const combinedLogoBounds = (z: DesignZone) => {
    const b = zoneBounds(z);
    const totalH = b.bottom - b.top;
    return { ...b, bottom: b.top + totalH * 0.60 };
  };

  /**
   * For a combined zone, return bounds for the bottom 35% → used as the text sub-area.
   * Leaves a 5% gap between logo and text areas.
   */
  const combinedTextBounds = (z: DesignZone) => {
    const b = zoneBounds(z);
    const totalH = b.bottom - b.top;
    return { ...b, top: b.top + totalH * 0.65 };
  };

  const getZonesForSide = () => {
    let relevantZones = zones.filter(z => {
      const zoneName = z.name && z.name.trim() ? z.name.trim() : z.side;
      return z.side === currentSide || zoneName === currentSide;
    });

    if (relevantZones.length === 0 && physicalSide) {
      relevantZones = zones.filter(z => z.side === physicalSide);
    }

    // NEVER use a 3D zone to generate a 2D bounding constraint.
    const true2DZones = relevantZones.filter(z => z.source !== '3d');

    // If a specific zone is selected by the user, honour it for logo+text placement
    if (selectedZoneId) {
      const picked = true2DZones.find(z => String(z.id) === String(selectedZoneId));
      if (picked) {
        const isCombined = picked.zone_type === 'combined';
        return {
          logoZone: isCombined || picked.zone_type === 'logo' ? picked : null,
          textZone: isCombined || picked.zone_type === 'text' ? picked : null,
          combinedZone: isCombined ? picked : null,
        };
      }
    }

    const combinedZone = true2DZones.find(z => z.zone_type === 'combined') || null;
    const logoZone = combinedZone || true2DZones.find(z => z.zone_type === 'logo') || null;
    const textZone = combinedZone || true2DZones.find(z => z.zone_type === 'text') || null;
    return { logoZone, textZone, combinedZone };
  };

  /**
   * Save a SERIALIZABLE copy of the currently live canvas objects.
   * Never store live fabric.Object instances – they become invalid after dispose().
   */
  const snapshotCurrentSide = (sideKey: string) => {
    const fc = fabricRef.current;
    if (!fc) return;

    const userObjs = fc.getObjects().filter(
      o => o.name !== '__bg__' && o.name !== '__zone__'
    );

    sideObjects.current[sideKey] = userObjs.map((o: any) => ({
      id: o.id,
      name: o.name,
      left: o.left,
      top: o.top,
      scaleX: o.scaleX,
      scaleY: o.scaleY,
      angle: o.angle,
      opacity: o.opacity ?? 1,
      originX: o.originX,
      originY: o.originY,
      flipX: !!o.flipX,
      flipY: !!o.flipY,
      _layerName: o._layerName,
      _zone: o._zone,
      _sourceDataUrl: o._sourceDataUrl,
      _textConfig: o._textConfig,
    }));
  };

  const getRelativeStats = (obj: any): RelativeStats | null => {
    const zone = obj._zone;
    if (!zone) return null;
    const zw = zone.right - zone.left;
    const zh = zone.bottom - zone.top;
    if (zw === 0 || zh === 0) return null;
    return {
      relX: (obj.left - zone.left) / zw,
      relY: (obj.top - zone.top) / zh,
      relScaleX: obj.getScaledWidth() / zw,
      relScaleY: obj.getScaledHeight() / zh,
      angle: obj.angle - (zone.angle || 0)
    };
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    refresh() {
      const fc = fabricRef.current;
      if (!fc) return;

      let needsRender = false;
      const promises: Promise<void>[] = [];

      fc.getObjects().forEach(o => {
        const obj = o as any;
        // Only process canvas-backed image objects that have a source URL
        if (!obj._sourceDataUrl) return;

        const canvas: HTMLCanvasElement | null = obj._unwarpedElement || (obj.getElement ? obj.getElement() : null);
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

        // Check if the canvas pixels have been cleared (all zeros = blank)
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const sample = ctx.getImageData(0, 0, Math.min(canvas.width, 4), Math.min(canvas.height, 4));
        const isEmpty = sample.data.every(v => v === 0);
        if (!isEmpty) return; // pixels intact, nothing to do

        // Reload from the original source URL
        const p = new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Re-set element so Fabric picks up the updated canvas
            obj.setElement(canvas);
            obj.setCoords();
            needsRender = true;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = obj._sourceDataUrl;
        });
        promises.push(p);
      });

      // After all reloads complete, do a single renderAll
      Promise.all(promises).then(() => {
        if (needsRender || promises.length === 0) {
          fc.renderAll();
        }
      });
    },

    applyRelativeStats(id, stats) {
      const fc = fabricRef.current;
      if (!fc) return;
      const obj: any = fc.getObjects().find(o => (o as any).id === id);
      if (!obj || !obj._zone) return;

      const zone = obj._zone;
      const zw = zone.right - zone.left;
      const zh = zone.bottom - zone.top;

      const newLeft = zone.left + stats.relX * zw;
      const newTop = zone.top + stats.relY * zh;

      const baseW = obj.width || 1;
      const baseH = obj.height || 1;
      const newScaleX = (stats.relScaleX * zw) / baseW;
      const newScaleY = (stats.relScaleY * zh) / baseH;

      obj.set({
        left: newLeft,
        top: newTop,
        scaleX: newScaleX,
        scaleY: newScaleY,
        angle: stats.angle + (zone.angle || 0)
      });
      obj.setCoords();
      fc.renderAll();
    },

    addText(text, font, size, color, bold, italic, id) {
      const fc = fabricRef.current;
      const { textZone, combinedZone } = getZonesForSide();
      if (!fc || !textZone) {
        showToast('No text zone on this side.');
        return;
      }
      // For combined zones use the full combined area so user can place text anywhere inside it
      const targetZone = combinedZone || textZone;
      const b = zoneBounds(targetZone);
      const zw = b.right - b.left;
      const zh = b.bottom - b.top;

      const unwarpedCanvas = renderTextToCanvas(text, font, size, color, bold, italic);

      const obj = new fabric.Image(unwarpedCanvas, {
        left: b.left + zw / 2,
        top: b.top + zh / 2,
        originX: 'center', originY: 'center',
        scaleX: 0.5, scaleY: 0.5,
        angle: b.angle || 0,
        name: '__text__',
        hasControls: true,
        hasBorders: true
      });
      (obj as any)._zone = b;
      (obj as any)._zoneId = targetZone.id;
      (obj as any)._unwarpedElement = unwarpedCanvas;
      (obj as any)._sourceDataUrl = unwarpedCanvas.toDataURL('image/png');
      (obj as any)._textConfig = { text, font, size, color, bold, italic };
      (obj as any).id = id || Math.random().toString(36).substr(2, 9);
      (obj as any)._layerName = `Text: ${text.substring(0, 10)}${text.length > 10 ? '...' : ''}`;

      fc.add(obj);
      fc.bringToFront(obj);
      fc.setActiveObject(obj);
      onSelectionChange(obj);
      // Keep a serializable snapshot in the ref as well
      snapshotCurrentSide(currentSide);
      fc.renderAll();
      showToast('Text placed in zone!');
    },

    updateText(id, text, font, size, color, bold, italic) {
      const fc = fabricRef.current;
      if (!fc) return;
      const obj: any = fc.getObjects().find(o => (o as any).id === id);
      if (!obj || !obj._textConfig) {
        showToast('Could not find text object to update.');
        return;
      }
      const unwarpedCanvas = renderTextToCanvas(text, font, size, color, bold, italic);
      obj.setElement(unwarpedCanvas);
      obj._unwarpedElement = unwarpedCanvas;
      obj._sourceDataUrl = unwarpedCanvas.toDataURL('image/png');
      obj._textConfig = { text, font, size, color, bold, italic };
      obj._layerName = `Text: ${text.substring(0, 10)}${text.length > 10 ? '...' : ''}`;

      // Update dimensions
      obj.set({ width: unwarpedCanvas.width, height: unwarpedCanvas.height });
      obj.setCoords();
      snapshotCurrentSide(currentSide);
      fc.renderAll();
      showToast('Text updated!');
      // Force selection re-fire so UI updates if needed
      onSelectionChange(obj);
    },

    addEmoji(emoji, id) {
      const fc = fabricRef.current;
      const { logoZone, combinedZone } = getZonesForSide();
      const targetZone = combinedZone || logoZone;
      if (!fc || !targetZone) { showToast('No logo zone on this side.'); return; }

      // Prevent multiple logos in the same area
      if (fc.getObjects().some((o: any) => o.name === '__logo__' && o._zoneId === targetZone.id)) {
        showToast('Only one logo/emoji is allowed per area. Please delete the current one first.');
        return;
      }

      // For combined zones use the full combined area so user can place logo anywhere inside it
      const b = zoneBounds(targetZone);
      const zw = b.right - b.left;
      const zh = b.bottom - b.top;

      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.font = '180px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 128, 128);
      }
      const url = c.toDataURL('image/png');

      fabric.Image.fromURL(url, (img) => {
        // Just store the source URL so refresh() can skip it (since native images aren't cleared)
        (img as any)._sourceDataUrl = url;

        const scale = Math.min(zw / img.width!, zh / img.height!);
        img.set({
          left: b.left + zw / 2, top: b.top + zh / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
          angle: b.angle || 0, name: '__logo__',
          hasControls: true, hasBorders: true
        });
        (img as any)._zone = b;
        (img as any)._zoneId = targetZone.id;
        (img as any).id = id || Math.random().toString(36).substr(2, 9);
        (img as any)._layerName = `Emoji: ${emoji}`;

        fc.add(img);
        fc.setActiveObject(img);
        onSelectionChange(img);
        snapshotCurrentSide(currentSide);
        fc.renderAll();
        showToast(' Preset logo placed!');
      });
    },

    addLogoFile(file, id) {
      const fc = fabricRef.current;
      const { logoZone, combinedZone } = getZonesForSide();
      const targetZone = combinedZone || logoZone;
      if (!fc || !targetZone) { showToast('No logo zone on this side.'); return; }

      // Prevent multiple logos in the same area
      if (fc.getObjects().some((o: any) => o.name === '__logo__' && o._zoneId === targetZone.id)) {
        showToast('Only one logo is allowed per area. Please delete the current one first.');
        return;
      }

      // For combined zones use the full combined area so user can place logo anywhere inside it
      const b = zoneBounds(targetZone);
      const zw = b.right - b.left;
      const zh = b.bottom - b.top;

      const loadImg = (dataUrl: string, name: string) => {
        fabric.Image.fromURL(dataUrl, (img) => {
          // Just store the source URL so refresh() can skip it (since native images aren't cleared)
          (img as any)._sourceDataUrl = dataUrl;

          const scale = Math.min(zw / img.width!, zh / img.height!);
          img.set({
            left: b.left + zw / 2, top: b.top + zh / 2,
            originX: 'center', originY: 'center',
            scaleX: scale, scaleY: scale,
            angle: b.angle || 0, name: '__logo__',
            hasControls: true, hasBorders: true
          });
          (img as any)._zone = b;
          (img as any)._zoneId = targetZone.id;
          (img as any).id = id || Math.random().toString(36).substr(2, 9);
          (img as any)._layerName = `Logo: ${name.substring(0, 15)}`;

          fc.add(img);
          fc.bringToFront(img);
          fc.setActiveObject(img);
          onSelectionChange(img);
          snapshotCurrentSide(currentSide);
          fc.renderAll();
          showToast('Custom logo placed!');
        });
      };

      if (typeof file === 'string') {
        loadImg(file, 'Custom Logo');
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) loadImg(event.target.result as string, file.name);
        };
        reader.readAsDataURL(file);
      }
    },

    deleteSelected() {
      const fc = fabricRef.current;
      const active = fc?.getActiveObject();
      if (!active) return;
      fc!.remove(active);
      snapshotCurrentSide(currentSide);
      fc!.renderAll();
      onSelectionChange(null);
      showToast('Removed');
    },

    bringFront() {
      const fc = fabricRef.current;
      const active = fc?.getActiveObject();
      if (fc && active) { fc.bringToFront(active); fc.renderAll(); }
    },

    sendBack() {
      const fc = fabricRef.current;
      const active = fc?.getActiveObject();
      if (fc && active) { fc.sendBackwards(active); fc.renderAll(); }
    },

    setOpacity(v) {
      const fc = fabricRef.current;
      const active = fc?.getActiveObject();
      if (fc && active) { active.set('opacity', v / 100); fc.renderAll(); }
    },

    clearSide() {
      const fc = fabricRef.current;
      if (!fc) return;
      fc.getObjects().filter(o => o.name !== '__bg__' && o.name !== '__zone__').forEach(o => fc.remove(o));
      sideObjects.current[currentSide] = [];
      fc.renderAll();
    },

    getSnapshot() {
      const fc = fabricRef.current;
      if (!fc) return '';

      const activeObj = fc.getActiveObject();
      let hadBorders = true, hadControls = true;
      if (activeObj) {
        hadBorders = activeObj.hasBorders ?? true;
        hadControls = activeObj.hasControls ?? true;
        activeObj.set({ hasBorders: false, hasControls: false });
      }

      // Hide zone overlays but KEEP the product background image visible
      // so the PDF thumbnail shows the full product photo with the logo on it.
      const zonesList = fc.getObjects().filter(o => o.name === '__zone__');
      zonesList.forEach(z => { (z as any).visible = false; });

      fc.renderAll();
      const dataUrl = fc.toDataURL({ format: 'png', quality: 1.0 });

      // Restore zones visibility
      zonesList.forEach(z => { (z as any).visible = true; });

      if (activeObj) {
        activeObj.set({ hasBorders: hadBorders, hasControls: hadControls });
      }

      fc.renderAll();
      return dataUrl;
    },

    getDesignOnlyCanvas(hideZones = true) {
      const fc = fabricRef.current;
      if (!fc || isSnapshotting.current) return null;

      isSnapshotting.current = true;

      const activeObj = fc.getActiveObject();
      let hadBorders = true, hadControls = true;
      if (activeObj) {
        hadBorders = activeObj.hasBorders ?? true;
        hadControls = activeObj.hasControls ?? true;
        activeObj.set({ hasBorders: false, hasControls: false });
      }

      const bg = fc.getObjects().find(o => o.name === '__bg__');
      const zonesList = fc.getObjects().filter(o => o.name === '__zone__');
      if (bg) bg.visible = false;
      if (hideZones) {
        zonesList.forEach(z => { z.visible = false; });
      }

      const warpedObjects = fc.getObjects().filter(o => (o as any)._unwarpedElement);
      warpedObjects.forEach(o => {
        const anyObj = o as any;
        anyObj._originalElement = anyObj.getElement();
        if (anyObj._unwarpedElement) anyObj.setElement(anyObj._unwarpedElement);
      });

      const oldBg = fc.backgroundColor;
      fc.backgroundColor = '';

      fc.renderAll();

      const highResCanvas = fc.toCanvasElement(4);

      // The returned element is already a canvas with the scaled dimensions
      const tempCanvas = highResCanvas;

      warpedObjects.forEach(o => {
        const anyObj = o as any;
        if (anyObj._originalElement) anyObj.setElement(anyObj._originalElement);
      });

      if (activeObj) {
        activeObj.set({ hasBorders: hadBorders, hasControls: hadControls });
      }

      if (bg) bg.visible = true;
      if (hideZones) {
        zonesList.forEach(z => { z.visible = true; });
      }

      fc.backgroundColor = oldBg;
      fc.renderAll();
      isSnapshotting.current = false;

      return tempCanvas;
    },

    cacheCurrentSide() {
      const fc = fabricRef.current;
      if (!fc || isSnapshotting.current) return;

      isSnapshotting.current = true;

      const activeObj = fc.getActiveObject();
      let hadBorders = true, hadControls = true;
      if (activeObj) {
        hadBorders = activeObj.hasBorders ?? true;
        hadControls = activeObj.hasControls ?? true;
        activeObj.set({ hasBorders: false, hasControls: false });
      }

      const bg = fc.getObjects().find(o => o.name === '__bg__');
      const zonesList = fc.getObjects().filter(o => o.name === '__zone__');
      if (bg) bg.visible = false;
      zonesList.forEach(z => { z.visible = false; });

      const warpedObjects = fc.getObjects().filter(o => (o as any)._unwarpedElement);
      warpedObjects.forEach(o => {
        const anyObj = o as any;
        anyObj._originalElement = anyObj.getElement();
        if (anyObj._unwarpedElement) anyObj.setElement(anyObj._unwarpedElement);
      });

      const oldBg = fc.backgroundColor;
      fc.backgroundColor = '';
      fc.renderAll();
      const dataUrl = fc.toDataURL({ format: 'png', quality: 0.9 });
      fc.backgroundColor = oldBg;
      const img = new Image();
      img.onload = () => {
        sideThumbnails.current[currentSide] = img;
        if (!isSnapshotting.current) onCanvasRenderRef.current();
      };
      img.src = dataUrl;

      warpedObjects.forEach(o => {
        const anyObj = o as any;
        if (anyObj._originalElement) anyObj.setElement(anyObj._originalElement);
      });

      if (activeObj) {
        activeObj.set({ hasBorders: hadBorders, hasControls: hadControls });
      }

      if (bg) bg.visible = true;
      zonesList.forEach(z => { z.visible = true; });
      isSnapshotting.current = false;
      fc.renderAll();

      // Also snapshot serializable objects so restore works correctly
      snapshotCurrentSide(currentSide);
    },

    addStampedObject(obj: fabric.Object) {
      const fc = fabricRef.current;
      if (!fc) return;
      fc.add(obj);
      fc.bringToFront(obj);
      fc.setActiveObject(obj);
      onSelectionChange(obj);
      snapshotCurrentSide(currentSide);
      fc.renderAll();
    },

    getCanvasSize() {
      const fc = fabricRef.current;
      return { width: fc?.width ?? 600, height: fc?.height ?? 600 };
    },

    undoDecal() {
      const fc = fabricRef.current;
      if (!fc) return;
      const objs = fc.getObjects();
      const decal = [...objs].reverse().find(o => o.name === '__decal__');
      if (decal) {
        fc.remove(decal);
        snapshotCurrentSide(currentSide);
        fc.renderAll();
        showToast('Undo applied.');
      } else {
        showToast('Nothing to undo.');
      }
    },

    clearDecals() {
      const fc = fabricRef.current;
      if (fc) {
        fc.getObjects().filter(o => o.name === '__decal__').forEach(o => fc.remove(o));
        fc.renderAll();
      }
      ALL_SIDES.forEach(s => {
        sideObjects.current[s] = (sideObjects.current[s] || []).filter((o: any) => o.name !== '__decal__');
      });
      showToast('Decals cleared on all sides.');
    },

    flipSelectedHorizontal() {
      const fc = fabricRef.current;
      const active = fc?.getActiveObject();
      if (!fc || !active) {
        showToast('Select an artwork or text layer first.');
        return;
      }
      active.set('flipX', !active.flipX);
      fc.renderAll();
    },

    flipSelectedVertical() {
      const fc = fabricRef.current;
      const active = fc?.getActiveObject();
      if (!fc || !active) {
        showToast('Select an artwork or text layer first.');
        return;
      }
      active.set('flipY', !active.flipY);
      fc.renderAll();
    },

    centerSelected() {
      const fc = fabricRef.current;
      const active: any = fc?.getActiveObject();
      if (!fc || !active) {
        showToast('Select an artwork or text layer first.');
        return;
      }

      const zone = active._zone;
      if (zone) {
        active.set({
          left: zone.left + (zone.right - zone.left) / 2,
          top: zone.top + (zone.bottom - zone.top) / 2,
          originX: 'center',
          originY: 'center',
        });
      } else {
        active.viewportCenter();
      }
      active.setCoords();
      fc.renderAll();
      showToast('Centered selected layer.');
    },

    fitSelectedToZone() {
      const fc = fabricRef.current;
      const active: any = fc?.getActiveObject();
      if (!fc || !active) {
        showToast('Select an artwork or text layer first.');
        return;
      }

      const zone = active._zone;
      const targetWidth = zone ? zone.right - zone.left : (fc.width || 600) * 0.5;
      const targetHeight = zone ? zone.bottom - zone.top : (fc.height || 600) * 0.5;
      const sourceWidth = active.width || active.getScaledWidth();
      const sourceHeight = active.height || active.getScaledHeight();
      if (!sourceWidth || !sourceHeight) return;

      const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
      active.set({
        scaleX: scale,
        scaleY: scale,
        left: zone ? zone.left + targetWidth / 2 : (fc.width || 600) / 2,
        top: zone ? zone.top + targetHeight / 2 : (fc.height || 600) / 2,
        originX: 'center',
        originY: 'center',
      });
      active.setCoords();
      fc.renderAll();
      showToast('Fitted selected layer to the print area.');
    },

    getLayers() {
      const fc = fabricRef.current;
      if (!fc) return [];
      const userObjs = fc.getObjects().filter(o => o.name !== '__bg__' && o.name !== '__zone__');
      // Return reversed so top layer is first in UI
      return userObjs.map(o => ({
        id: (o as any).id || Math.random().toString(36).substr(2, 9),
        name: (o as any)._layerName || (o.name === '__text__' ? 'Text Layer' : o.name === '__decal__' ? '3D Decal' : 'Logo Layer'),
        type: o.name || 'unknown',
        isSelected: fc.getActiveObject() === o
      })).reverse();
    },

    selectLayer(id) {
      const fc = fabricRef.current;
      if (!fc) return;
      const obj = fc.getObjects().find(o => (o as any).id === id);
      if (obj) {
        fc.setActiveObject(obj);
        fc.renderAll();
        onSelectionChange(obj);
      }
    },

    deleteLayer(id) {
      const fc = fabricRef.current;
      if (!fc) return;
      const obj = fc.getObjects().find(o => (o as any).id === id);
      if (obj) {
        fc.remove(obj);
        snapshotCurrentSide(currentSide);
        fc.renderAll();
        onSelectionChange(fc.getActiveObject() || null);
      }
    },

    moveLayer(id, direction) {
      const fc = fabricRef.current;
      if (!fc) return;
      const obj = fc.getObjects().find(o => (o as any).id === id);
      if (obj) {
        if (direction === 'up') {
          fc.bringForward(obj);
        } else {
          fc.sendBackwards(obj);
        }
        // Background might have shifted, make sure it stays at the very bottom
        const bg = fc.getObjects().find(o => o.name === '__bg__');
        if (bg) fc.sendToBack(bg);
        fc.renderAll();
      }
    },

    getPhysicalStats(actualZoneW, actualZoneH) {
      const fc = fabricRef.current;
      if (!fc) return null;
      const active: any = fc.getActiveObject();
      if (!active) return null;

      let zone = active._zone;
      if (!zone) {
        const { logoZone, textZone, combinedZone } = getZonesForSide();
        const z = combinedZone || logoZone || textZone;
        if (z) {
          zone = zoneBounds(z);
        } else {
          zone = { left: 0, top: 0, right: fc.width || 600, bottom: fc.height || 600 };
        }
      }
      const zw = zone.right - zone.left;
      const zh = zone.bottom - zone.top;

      // Unify pxPerInch to avoid stretching/distorting artwork. 
      // If the 2D bounding box is imperfectly drawn, we trust the width axis.
      const pxPerInch = zw / (actualZoneW || 12);

      const objW = active.getScaledWidth();
      const objH = active.getScaledHeight();

      const pW = objW / pxPerInch;
      const pH = objH / pxPerInch;

      // Left/Right relative to center
      const centerX = zone.left + zw / 2;
      const centerY = zone.top + zh / 2;

      const pLeft = (active.left - centerX) / pxPerInch;
      // Up/Down relative to center (invert Y so Up is positive)
      const pTop = -(active.top - centerY) / pxPerInch;

      return { width: pW, height: pH, left: pLeft, top: pTop };
    },

    setPhysicalSize(w, h, lockProportions, actualZoneW, actualZoneH) {
      const fc = fabricRef.current;
      if (!fc) return;
      const active: any = fc.getActiveObject();
      if (!active) return;

      let zone = active._zone;
      if (!zone) {
        const { logoZone, textZone, combinedZone } = getZonesForSide();
        const z = combinedZone || logoZone || textZone;
        if (z) {
          zone = zoneBounds(z);
        } else {
          zone = { left: 0, top: 0, right: fc.width || 600, bottom: fc.height || 600 };
        }
      }
      const zw = zone.right - zone.left;
      const zh = zone.bottom - zone.top;

      const pxPerInch = zw / (actualZoneW || 12);

      const newW_px = w * pxPerInch;
      const newH_px = h * pxPerInch;

      const baseW = active.width || 1;
      const baseH = active.height || 1;

      active.set({
        scaleX: newW_px / baseW,
        scaleY: newH_px / baseH,
      });
      active.setCoords();
      fc.renderAll();
    },

    setPhysicalPlacement(left, top, actualZoneW, actualZoneH) {
      const fc = fabricRef.current;
      if (!fc) return;
      const active: any = fc.getActiveObject();
      if (!active) return;

      let zone = active._zone;
      if (!zone) {
        const { logoZone, textZone, combinedZone } = getZonesForSide();
        const z = combinedZone || logoZone || textZone;
        if (z) {
          zone = zoneBounds(z);
        } else {
          zone = { left: 0, top: 0, right: fc.width || 600, bottom: fc.height || 600 };
        }
      }
      const zw = zone.right - zone.left;
      const zh = zone.bottom - zone.top;

      const pxPerInch = zw / (actualZoneW || 12);

      const centerX = zone.left + zw / 2;
      const centerY = zone.top + zh / 2;

      if (active) {
        // Un-invert the Y back to relative-from-center pixels
        const targetTop = centerY - top * pxPerInch;
        const targetLeft = centerX + left * pxPerInch;
        active.set({ left: targetLeft, top: targetTop });
        active.setCoords();
        fc.renderAll();
      }
    },

    startDrag(canvasX, canvasY) {
      const fc = fabricRef.current;
      if (!fc) return false;
      const point = new fabric.Point(canvasX, canvasY);
      const objs = fc.getObjects();
      for (let i = objs.length - 1; i >= 0; i--) {
        const obj = objs[i];
        if (obj.containsPoint(point)) {
          fc.setActiveObject(obj);
          activeDragObjRef.current = obj;
          dragOffsetRef.current = {
            x: (obj.left ?? 0) - canvasX,
            y: (obj.top ?? 0) - canvasY
          };
          fc.renderAll();
          return true;
        }
      }
      return false;
    },

    moveDrag(canvasX, canvasY) {
      const obj = activeDragObjRef.current;
      if (obj) {
        obj.set({
          left: canvasX + dragOffsetRef.current.x,
          top: canvasY + dragOffsetRef.current.y
        });
        if (clampToBoundsRef.current) clampToBoundsRef.current(obj);
        obj.setCoords();
        fabricRef.current?.renderAll();

        if (onObjectModified && (obj as any).id) {
          const stats = getRelativeStats(obj);
          if (stats) onObjectModified((obj as any).id, stats);
        }
      }
    },

    endDrag() {
      activeDragObjRef.current = null;
    }
  }));

  // Initialize / re-initialize Fabric canvas when side or product changes.
  //
  // IMPORTANT: `viewMode` is intentionally NOT a dependency here. This canvas
  // is the single source of truth for the 2D design regardless of whether the
  // 2D or 3D viewport is currently visible — it does not need to be rebuilt
  // when the user toggles between them. Previously `viewMode` WAS included,
  // which caused a full dispose+rebuild on every toggle. Because the 2D
  // container is `display:none` while the 3D view is active, `offsetWidth`
  // reads as 0 at that moment, so the canvas rebuilt at the wrong (400px
  // fallback) size and the scale-aware restore logic remapped every object to
  // a slightly wrong position — that's what caused logos to visibly "jump"
  // when switching views, plus the extra lag from re-fetching/re-decoding the
  // background image and restoring every object on every single toggle.
  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    const containerEl = containerRef.current;
    const availableWidth = Math.max(containerEl?.offsetWidth || 0, 400);
    // Prevent the canvas from becoming excessively tall on wide screens
    const maxHeight = Math.min(typeof window !== 'undefined' ? window.innerHeight * 0.68 : 800, 920);

    // Lock the wrapper's visible box size only when the product itself
    // changes. Side-tab switches re-run this effect too (currentSide is a
    // dependency, since a different background image needs to load) but must
    // NOT re-lock — that's what kept the wrapper's on-screen size fixed
    // across tabs while still letting the inner canvas size itself correctly
    // per photo.
    if (lastProductIdRef.current !== product.id) {
      lastProductIdRef.current = product.id;
      stageSizeRef.current = { width: availableWidth, height: maxHeight };
    }
    if (containerEl && stageSizeRef.current) {
      containerEl.style.width = `${stageSizeRef.current.width}px`;
      containerEl.style.height = `${stageSizeRef.current.height}px`;
      containerEl.style.display = 'flex';
      containerEl.style.alignItems = 'center';
      containerEl.style.justifyContent = 'center';
      containerEl.style.overflow = 'hidden';
    }

    // Temporary square size – will be corrected after the image loads
    const fc = new fabric.Canvas(canvasRef.current, {
      width: availableWidth,
      height: availableWidth,
      preserveObjectStacking: true,
      backgroundColor: '#f4f5f7',
    });
    fabricRef.current = fc;

    // Selection handlers
    fc.on('selection:created', (e) => onSelectionChange(e.target));
    fc.on('selection:updated', (e) => onSelectionChange(e.target));
    fc.on('selection:cleared', () => onSelectionChange(null));

    // Zone clamping — objects use originX/Y='center' so left/top is the center point
    const clampToBounds = (obj: any) => {
      if (!obj || !obj._zone) return;
      const b = obj._zone;
      const maxW = b.right - b.left;
      const maxH = b.bottom - b.top;

      // Cap scale so object never exceeds zone size
      if (obj.width && obj.height) {
        if (obj.scaleX > maxW / obj.width) obj.set('scaleX', maxW / obj.width);
        if (obj.scaleY > maxH / obj.height) obj.set('scaleY', maxH / obj.height);
      }

      const w = obj.getScaledWidth();
      const h = obj.getScaledHeight();
      const halfW = w / 2;
      const halfH = h / 2;

      // For center-origin objects, left/top is the center point
      let cx = obj.left;
      let cy = obj.top;
      if (cx - halfW < b.left) cx = b.left + halfW;
      if (cy - halfH < b.top) cy = b.top + halfH;
      if (cx + halfW > b.right) cx = b.right - halfW;
      if (cy + halfH > b.bottom) cy = b.bottom - halfH;
      obj.set({ left: cx, top: cy });
      obj.setCoords();
      if (mounted && fabricRef.current) fc.renderAll();
    };
    // Store in ref so moveDrag can access it
    clampToBoundsRef.current = clampToBounds;

    const handleModify = (e: any) => {
      clampToBounds(e.target);
    };
    fc.on('object:moving', handleModify);
    fc.on('object:scaling', handleModify);
    fc.on('object:rotating', handleModify);
    fc.on('object:modified', (e: any) => {
      clampToBounds(e.target);
      if (e.target && (e.target as any).id && onObjectModified) {
        const stats = getRelativeStats(e.target);
        if (stats) {
          onObjectModified((e.target as any).id, stats);
        }
      }
    });

    // After render → update 3D (guard against re-entrancy from snapshot renders)
    fc.on('after:render', () => { if (!isSnapshotting.current) onCanvasRenderRef.current(); });

    // Load background image for this side
    const sideImageUrl = resolveImageUrl(
      getSideImageUrl(product, currentSide),
      `${product.name} ${currentSide}`
    );

    fabric.Image.fromURL(
      sideImageUrl,
      (img: any) => {

        const finishRestore = () => {
          if (!mounted || fabricRef.current !== fc) return;

          // Draw zone overlays
          fc.getObjects().filter(o => o.name === '__zone__').forEach(o => fc.remove(o));

          const relevantZones = zones.filter(z => {
            const zoneName = z.name && z.name.trim() ? z.name.trim() : z.side;
            return z.side === currentSide || zoneName === currentSide;
          });
          const combinedZone = relevantZones.find(z => z.zone_type === 'combined') || null;
          const logoZone = combinedZone || relevantZones.find(z => z.zone_type === 'logo') || null;
          const textZone = combinedZone || relevantZones.find(z => z.zone_type === 'text') || null;
          onSetZones(logoZone, textZone);

          if (showImprintArea) {
            // Only show non-3D zones as overlays on the 2D canvas
            // (3D zones are already drawn on the 3D model texture)
            relevantZones.filter(z => z.source !== '3d').forEach(z => {
              const px = (z.x_percent / 100) * canvasW;
              const py = (z.y_percent / 100) * canvasH;
              const pw = (z.width_percent / 100) * canvasW;
              const ph = (z.height_percent / 100) * canvasH;

              const cs = Math.max(12, Math.min(32, Math.min(pw, ph) * 0.15));
              const hw = pw / 2;
              const hh = ph / 2;

              const p1 = `M ${-hw} ${-hh + cs} L ${-hw} ${-hh} L ${-hw + cs} ${-hh}`;
              const p2 = ` M ${hw - cs} ${-hh} L ${hw} ${-hh} L ${hw} ${-hh + cs}`;
              const p3 = ` M ${hw} ${hh - cs} L ${hw} ${hh} L ${hw - cs} ${hh}`;
              const p4 = ` M ${-hw + cs} ${hh} L ${-hw} ${hh} L ${-hw} ${hh - cs}`;
              const pathStr = p1 + p2 + p3 + p4;

              // Only draw the clean corner marks (no filled square)
              const cornersOuter = new fabric.Path(pathStr, {
                left: px + hw,
                top: py + hh,
                originX: 'center',
                originY: 'center',
                fill: 'transparent',
                stroke: 'rgba(255, 255, 255, 0.4)',
                strokeWidth: 6,
                selectable: false,
                evented: false,
                name: '__zone__',
              });

              const cornersInner = new fabric.Path(pathStr, {
                left: px + hw,
                top: py + hh,
                originX: 'center',
                originY: 'center',
                fill: 'transparent',
                stroke: 'rgba(0, 0, 0, 0.3)',
                strokeWidth: 2,
                selectable: false,
                evented: false,
                name: '__zone__',
              });

              fc.add(cornersOuter, cornersInner);
              fc.sendToBack(cornersInner);
              fc.sendToBack(cornersOuter);
            });

            // Background must be at the very bottom
            const bgObj = fc.getObjects().find(o => o.name === '__bg__');
            if (bgObj) fc.sendToBack(bgObj);
          }

          fc.renderAll();
          onBackgroundLoaded?.();
        };


        if (!mounted || fabricRef.current !== fc) return;

        if (!img) {
          // No background image – but still initialize: fall back to the
          // locked stage size (or a square of availableWidth) and call
          // finishRestore so zones and saved objects are drawn.
          const fallback = stageSizeRef.current || { width: availableWidth, height: availableWidth };
          fc.setDimensions(fallback);
          finishRestore();
          return;
        }

        const imgW = img.width || availableWidth;
        const imgH = img.height || availableWidth;
        const imgAspect = imgW / imgH;

        // The canvas is sized to exactly match THIS photo's own aspect ratio
        // (contain-fit within availableWidth x maxHeight) — this is required
        // so that the image fills the canvas edge-to-edge with zero
        // letterboxing, which is what makes each zone's x_percent/y_percent
        // (authored against that photo's own pixel dimensions) land in the
        // correct spot. The canvas's on-screen size not visibly changing
        // across tabs is instead handled by locking the *wrapper* div's size
        // above and centering this canvas inside it via CSS.
        let canvasW = availableWidth;
        let canvasH = availableWidth / imgAspect;

        if (canvasH > maxHeight) {
          canvasH = maxHeight;
          canvasW = maxHeight * imgAspect;
        }

        fc.setDimensions({ width: canvasW, height: canvasH });

        // Scale image to fill the canvas exactly (no letterboxing — canvas
        // aspect ratio was derived from this same image above)
        const scale = Math.min(canvasW / imgW, canvasH / imgH);

        img.set({
          scaleX: scale,
          scaleY: scale,
          left: canvasW / 2,
          top: canvasH / 2,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
          name: '__bg__',
        });

        fc.add(img);
        fc.sendToBack(img);

        // ── Restore saved objects for this side ───────────────────────────────
        // We recreate fresh fabric.Image instances from the serializable snapshot.
        // Never re-add objects that belonged to a disposed canvas.
        const savedObjs = sideObjects.current[currentSide] || [];

        let pendingRestores = 0;


        if (savedObjs.length === 0) {
          finishRestore();
          return;
        }

        pendingRestores = savedObjs.length;

        savedObjs.forEach((saved: any) => {
          if (!saved._sourceDataUrl) {
            pendingRestores -= 1;
            if (pendingRestores <= 0) finishRestore();
            return;
          }

          fabric.Image.fromURL(saved._sourceDataUrl, (restoredImg) => {
            if (!mounted || fabricRef.current !== fc) return;

            // Just use the native image directly to avoid browser clearing issues
            (restoredImg as any)._sourceDataUrl = saved._sourceDataUrl;
            (restoredImg as any)._zone = saved._zone;
            (restoredImg as any).id = saved.id;
            (restoredImg as any)._layerName = saved._layerName;
            (restoredImg as any)._textConfig = saved._textConfig;

            // ── Scale-aware restore ───────────────────────────────────────────
            // The canvas may have been rebuilt at a different pixel size than
            // when the snapshot was taken. Detect this by comparing the saved
            // zone dimensions against their equivalent in the CURRENT canvas.
            let restoredLeft = saved.left;
            let restoredTop = saved.top;
            let restoredScaleX = saved.scaleX;
            let restoredScaleY = saved.scaleY;

            const savedZone = saved._zone;
            if (savedZone) {
              const oldZoneW = savedZone.right - savedZone.left;
              const oldZoneH = savedZone.bottom - savedZone.top;

              if (oldZoneW > 0 && oldZoneH > 0) {
                // Re-derive the current zone bounds from zone percent data (if available)
                // by looking up the matching zone in the freshly-sized canvas.
                const matchedZone = zones.find(z => {
                  const b = zoneBounds(z);
                  return Math.abs(b.left - savedZone.left) < (oldZoneW * 0.25) &&
                    Math.abs(b.top - savedZone.top) < (oldZoneH * 0.25);
                });

                const newZoneB = matchedZone ? zoneBounds(matchedZone) : null;
                if (newZoneB) {
                  const newZoneW = newZoneB.right - newZoneB.left;
                  const newZoneH = newZoneB.bottom - newZoneB.top;

                  // Use a uniform scaling ratio to strictly preserve the artwork's native aspect ratio!
                  const ratio = newZoneW / oldZoneW;

                  // Re-position relative to the new zone
                  const relX = (saved.left - savedZone.left) / oldZoneW;
                  const relY = (saved.top - savedZone.top) / oldZoneH;
                  restoredLeft = newZoneB.left + relX * newZoneW;
                  restoredTop = newZoneB.top + relY * newZoneH;
                  restoredScaleX = saved.scaleX * ratio;
                  restoredScaleY = saved.scaleY * ratio;

                  // Update the zone reference stored on the object to the new coords
                  (restoredImg as any)._zone = newZoneB;
                }
              }
            }

            restoredImg.set({
              left: restoredLeft,
              top: restoredTop,
              scaleX: restoredScaleX,
              scaleY: restoredScaleY,
              angle: saved.angle || 0,
              opacity: saved.opacity ?? 1,
              originX: saved.originX || 'center',
              originY: saved.originY || 'center',
              flipX: !!saved.flipX,
              flipY: !!saved.flipY,
              name: saved.name || '__logo__',
              hasControls: true,
              hasBorders: true,
            });

            fc.add(restoredImg);
            fc.bringToFront(restoredImg);

            pendingRestores -= 1;
            if (pendingRestores <= 0) {
              // If no object is selected after restore, select the first user object
              if (!fc.getActiveObject()) {
                const firstUserObj = fc.getObjects().find(o => o.name !== '__bg__' && o.name !== '__zone__');
                if (firstUserObj) {
                  fc.setActiveObject(firstUserObj);
                  onSelectionChange(firstUserObj);
                }
              }
              finishRestore();
            }
          });
        });
      },
      { crossOrigin: 'anonymous' }
    );

    return () => {
      mounted = false;
      // ── CRITICAL: snapshot live objects BEFORE disposing the old canvas ───────
      // This persists the current state into sideObjects so it can be restored.
      if (fabricRef.current === fc) {
        snapshotCurrentSide(currentSideRef.current);
      }
      fc.dispose();
      fabricRef.current = null;
    };
  }, [product, currentSide, zones, showImprintArea]);

  return (
    <div ref={containerRef} className="canvas-box">
      <canvas ref={canvasRef} />
      {/* <p className="hint">💡 Move, scale or rotate elements. They stay inside boundary zones.</p> */}
    </div>
  );
});

export default FabricCanvas2D;