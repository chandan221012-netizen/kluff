import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  RotateCw, RotateCcw, Crop, Sun, Contrast,
  ChevronLeft, ChevronRight, ArrowRight, ArrowLeft,
  Check, SlidersHorizontal, ZoomIn, Move, RefreshCw,
  FileText, ChevronDown, X, Maximize2
} from 'lucide-react';
import SafeSlider from './SafeSlider';

// Lazy-load pdfjs only when needed, pre-warmed for speed
let pdfjsLib = null;
async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
  return pdfjsLib;
}
// Pre-warm pdfjs in background during idle time
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => getPdfJs().catch(() => {}));
  } else {
    setTimeout(() => getPdfJs().catch(() => {}), 100);
  }
}

export default function StepEdit({
  files,
  setFiles,
  editSettings,
  setEditSettings,
  pageImages: propPageImages = {},
  setPageImages: propSetPageImages,
  originalPageImages: propOriginalPageImages = {},
  setOriginalPageImages: propSetOriginalPageImages,
  totalPages: propTotalPages = {},
  setTotalPages: propSetTotalPages,
  paperSize = 'A4',
  setPaperSize,
  onNext,
  onBack,
  onPageData
}) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Fast-track vs Detailed Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const [showPaperMenu, setShowPaperMenu] = useState(false);
  // Local immediate crop preview override so UI updates with zero delay
  const [localCroppedImage, setLocalCroppedImage] = useState(null);
  const [showEditFullscreen, setShowEditFullscreen] = useState(false);

  const containerRef = useRef(null);
  const cropImageRef = useRef(null);
  const previewImageRef = useRef(null);

  const activeFile = files[activeFileIndex];
  const fileKey = activeFileIndex;

  // Default 4 independent corner points: TL, TR, BR, BL (Percentages 0..100)
  const DEFAULT_4_POINTS = [
    { x: 5, y: 5 },   // 0: Top-Left
    { x: 95, y: 5 },  // 1: Top-Right
    { x: 95, y: 95 }, // 2: Bottom-Right
    { x: 5, y: 95 }   // 3: Bottom-Left
  ];

  const [cropPoints, setCropPoints] = useState(DEFAULT_4_POINTS);
  const cropPointsRef = useRef(DEFAULT_4_POINTS);
  const loadedFileSignaturesRef = useRef({});

  const settings = editSettings[fileKey] || {
    zoom: 1,
    pan: { x: 0, y: 0 },
    rotation: 0,
    brightness: 100,
    contrast: 100,
    orientation: 'portrait'
  };

  // Gesture Pan & Zoom state initialized from persisted settings
  const [pan, setPanState] = useState(() => settings.pan || { x: 0, y: 0 });
  const panRef = useRef(settings.pan || { x: 0, y: 0 });
  panRef.current = pan;

  const setPan = useCallback((newPan) => {
    setPanState(newPan);
    panRef.current = newPan;
    setEditSettings(prev => ({
      ...prev,
      [fileKey]: {
        ...(prev[fileKey] || {}),
        pan: newPan
      }
    }));
  }, [fileKey, setEditSettings]);

  const updateSetting = useCallback((key, value) => {
    setEditSettings(prev => ({
      ...prev,
      [fileKey]: { ...prev[fileKey], [key]: value }
    }));
  }, [fileKey, setEditSettings]);

  // Load PDF or Image into DataURL (detects file changes to prevent stale file caching bug)
  useEffect(() => {
    if (!activeFile) return;

    const currentSig = `${activeFile.name}_${activeFile.size}_${activeFile.lastModified || 0}`;
    const isSameFile = loadedFileSignaturesRef.current[fileKey] === currentSig;

    // Only return early if the exact same file is already loaded in propPageImages
    if (isSameFile && propPageImages[fileKey]?.[activePage]) {
      return;
    }

    // New/different file detected for this slot! Clean local state and reload
    setLocalCroppedImage(null);
    loadedFileSignaturesRef.current[fileKey] = currentSig;

    const isImage = activeFile.type?.startsWith('image/');

    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (propSetPageImages) {
          propSetPageImages(prev => ({ ...prev, [fileKey]: { 1: dataUrl } }));
        }
        if (propSetOriginalPageImages) {
          propSetOriginalPageImages(prev => ({ ...prev, [fileKey]: { 1: dataUrl } }));
        }
        if (propSetTotalPages) {
          propSetTotalPages(prev => ({ ...prev, [fileKey]: 1 }));
        }
        if (onPageData) {
          onPageData({
            totalPages: { ...propTotalPages, [fileKey]: 1 },
            pageImages: { ...propPageImages, [fileKey]: { 1: dataUrl } },
            originalPageImages: { ...propOriginalPageImages, [fileKey]: { 1: dataUrl } }
          });
        }
      };
      reader.readAsDataURL(activeFile);
      return;
    }

    if (activeFile.type === 'application/pdf' || activeFile.name?.endsWith('.pdf')) {
      setLoading(true);
      (async () => {
        try {
          const pdfjs = await getPdfJs();
          const arrayBuffer = await activeFile.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          const totalPdfPages = pdf.numPages;

          // Step 1: Render Page 1 IMMEDIATELY (< 80ms)
          const page1 = await pdf.getPage(1);
          const vp1 = page1.getViewport({ scale: 1.25 });
          const canvas1 = document.createElement('canvas');
          canvas1.width = vp1.width;
          canvas1.height = vp1.height;
          const ctx1 = canvas1.getContext('2d', { alpha: false });
          await page1.render({ canvasContext: ctx1, viewport: vp1 }).promise;
          const page1DataUrl = canvas1.toDataURL('image/jpeg', 0.82);

          const initialPages = { 1: page1DataUrl };
          if (propSetPageImages) propSetPageImages(prev => ({ ...prev, [fileKey]: initialPages }));
          if (propSetOriginalPageImages) propSetOriginalPageImages(prev => ({ ...prev, [fileKey]: initialPages }));
          if (propSetTotalPages) propSetTotalPages(prev => ({ ...prev, [fileKey]: totalPdfPages }));
          if (onPageData) {
            onPageData({
              totalPages: { ...propTotalPages, [fileKey]: totalPdfPages },
              pageImages: { ...propPageImages, [fileKey]: initialPages },
              originalPageImages: { ...propOriginalPageImages, [fileKey]: initialPages }
            });
          }
          setLoading(false); // Stop loader right away

          // Step 2: Stream render remaining pages in background
          const renderCount = Math.min(totalPdfPages, 30);
          if (renderCount > 1) {
            (async () => {
              const allPages = { ...initialPages };
              for (let i = 2; i <= renderCount; i++) {
                const p = await pdf.getPage(i);
                const vp = p.getViewport({ scale: 1.25 });
                const c = document.createElement('canvas');
                c.width = vp.width;
                c.height = vp.height;
                const cx = c.getContext('2d', { alpha: false });
                await p.render({ canvasContext: cx, viewport: vp }).promise;
                allPages[i] = c.toDataURL('image/jpeg', 0.82);
              }
              if (propSetPageImages) propSetPageImages(prev => ({ ...prev, [fileKey]: allPages }));
              if (propSetOriginalPageImages) propSetOriginalPageImages(prev => ({ ...prev, [fileKey]: allPages }));
            })().catch(e => console.warn('Background page render error:', e));
          }
        } catch (err) {
          console.error('PDF render error:', err);
          setLoading(false);
        }
      })();
    }
  }, [activeFile, fileKey, activePage]);

  // Reset active page and local crop override when switching files; restore file's persisted pan
  useEffect(() => {
    setActivePage(1);
    const savedPan = editSettings[activeFileIndex]?.pan || { x: 0, y: 0 };
    setPanState(savedPan);
    panRef.current = savedPan;
    setCropMode(false);
    setLocalCroppedImage(null);
  }, [activeFileIndex, editSettings]);

  // Source images
  const currentCroppedImage = localCroppedImage || propPageImages[fileKey]?.[activePage];
  const currentOriginalImage = propOriginalPageImages[fileKey]?.[activePage] || currentCroppedImage;
  const displayImage = currentCroppedImage || currentOriginalImage;
  const fileTotalPages = propTotalPages[fileKey] || 1;
  const currentCropPoints = cropPoints;

  // ─────────────────────────────────────────────────────────────────────────────
  // HIGH-SENSITIVITY PINCH-TO-ZOOM & FLUID PAN ENGINE
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let initialDist = 0;
    let initialZoom = 1;
    let latestZoom = settings.zoom || 1;
    let initialMidpoint = { x: 0, y: 0 };
    let initialPanState = { x: panRef.current.x, y: panRef.current.y };
    let currentPan = { x: panRef.current.x, y: panRef.current.y };
    let isPinching = false;
    let isSinglePanning = false;
    let singleTouchStart = { x: 0, y: 0, startPanX: 0, startPanY: 0 };
    let rafId = null;

    const renderTransform = (zoomVal, panVal) => {
      if (previewImageRef.current) {
        previewImageRef.current.style.transform = `translate(${panVal.x}px, ${panVal.y}px) scale(${zoomVal}) rotate(${settings.rotation || 0}deg)`;
      }
    };

    const onTouchStart = (e) => {
      if (cropMode) return;

      if (e.touches.length === 2) {
        // Two fingers: Pinch-to-zoom + 2D plane pan simultaneously
        isPinching = true;
        isSinglePanning = false;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        initialDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        initialZoom = settings.zoom || 1;
        latestZoom = initialZoom;
        initialMidpoint = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2
        };
        initialPanState = { ...panRef.current };
        currentPan = { ...panRef.current };

        if (previewImageRef.current) {
          previewImageRef.current.style.transition = 'none';
        }
      } else if (e.touches.length === 1) {
        // Single finger: Move image in X and Y axis anywhere in plane
        isPinching = false;
        isSinglePanning = true;
        singleTouchStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          startPanX: panRef.current.x,
          startPanY: panRef.current.y
        };
        currentPan = { ...panRef.current };
        latestZoom = settings.zoom || 1;

        if (previewImageRef.current) {
          previewImageRef.current.style.transition = 'none';
        }
      }
    };

    const onTouchMove = (e) => {
      if (cropMode) return;

      if (e.touches.length === 2 && isPinching) {
        if (e.cancelable) e.preventDefault();

        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const currentDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

        if (initialDist > 0) {
          // Continuous, fluid zoom scaling
          const ratio = currentDist / initialDist;
          let targetZoom = initialZoom * (1 + (ratio - 1) * 2.2);
          targetZoom = Math.min(5.0, Math.max(0.15, targetZoom));
          latestZoom = targetZoom;

          // Simultaneous X & Y plane movement tracking midpoint
          const midX = (t0.clientX + t1.clientX) / 2;
          const midY = (t0.clientY + t1.clientY) / 2;
          currentPan = {
            x: initialPanState.x + (midX - initialMidpoint.x),
            y: initialPanState.y + (midY - initialMidpoint.y)
          };

          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            renderTransform(targetZoom, currentPan);
          });
        }
      } else if (e.touches.length === 1 && isSinglePanning) {
        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;
        const dx = clientX - singleTouchStart.x;
        const dy = clientY - singleTouchStart.y;

        // Move image freely across X and Y axis everywhere in plane
        if (isEditing || (settings.zoom || 1) > 1.05) {
          if (e.cancelable) e.preventDefault();

          currentPan = {
            x: singleTouchStart.startPanX + dx,
            y: singleTouchStart.startPanY + dy
          };

          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            renderTransform(latestZoom, currentPan);
          });
        }
      }
    };

    const onTouchEnd = (e) => {
      if (isPinching && e.touches.length < 2) {
        isPinching = false;
        if (rafId) cancelAnimationFrame(rafId);
        updateSetting('zoom', Math.round(latestZoom * 100) / 100);
        setPan({ ...currentPan });
      }
      if (isSinglePanning && e.touches.length === 0) {
        isSinglePanning = false;
        if (rafId) cancelAnimationFrame(rafId);
        setPan({ ...currentPan });
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [cropMode, isEditing, settings.zoom, settings.rotation, updateSetting]);

  // Desktop Mouse Drag Handler (Free 2D Movement anywhere in plane)
  const handlePointerDown = (e) => {
    if (cropMode || e.pointerType === 'touch') return;
    if (!isEditing && (settings.zoom || 1) <= 1.05) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = panRef.current.x;
    const startPanY = panRef.current.y;
    let movePan = { x: startPanX, y: startPanY };

    const onPointerMove = (moveEv) => {
      moveEv.preventDefault();
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      movePan = { x: startPanX + dx, y: startPanY + dy };

      if (previewImageRef.current) {
        previewImageRef.current.style.transform = `translate(${movePan.x}px, ${movePan.y}px) scale(${settings.zoom || 1}) rotate(${settings.rotation || 0}deg)`;
      }
    };

    const onPointerUp = () => {
      setPan(movePan);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // 4-Dot Free-Directional Dragging (DIRECTLY RELATIVE TO RENDERED IMAGE ELEMENT)
  const startPointDrag = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    const imgEl = cropImageRef.current;
    if (!imgEl) return;
    const rect = imgEl.getBoundingClientRect();

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const curX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX ?? 0;
      const curY = moveEvent.clientY ?? moveEvent.touches?.[0]?.clientY ?? 0;

      // Exact pixel percentage relative to the rendered image bounds
      const px = Math.min(100, Math.max(0, ((curX - rect.left) / rect.width) * 100));
      const py = Math.min(100, Math.max(0, ((curY - rect.top) / rect.height) * 100));

      const updated = cropPointsRef.current.map((p, i) =>
        i === index ? { x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10 } : p
      );

      cropPointsRef.current = updated;
      setCropPoints(updated);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
  };

  // Drag entire crop polygon together (Directly relative to image)
  const startMoveAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const imgEl = cropImageRef.current;
    if (!imgEl) return;
    const rect = imgEl.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const initialPoints = [...cropPointsRef.current];

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const curX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX ?? 0;
      const curY = moveEvent.clientY ?? moveEvent.touches?.[0]?.clientY ?? 0;

      const deltaX = ((curX - clientX) / rect.width) * 100;
      const deltaY = ((curY - clientY) / rect.height) * 100;

      let maxNegX = 0, maxPosX = 100, maxNegY = 0, maxPosY = 100;
      initialPoints.forEach(p => {
        maxNegX = Math.max(maxNegX, -p.x);
        maxPosX = Math.min(maxPosX, 100 - p.x);
        maxNegY = Math.max(maxNegY, -p.y);
        maxPosY = Math.min(maxPosY, 100 - p.y);
      });

      const clampedDX = Math.max(maxNegX, Math.min(maxPosX, deltaX));
      const clampedDY = Math.max(maxNegY, Math.min(maxPosY, deltaY));

      const updated = initialPoints.map(p => ({
        x: Math.round((p.x + clampedDX) * 10) / 10,
        y: Math.round((p.y + clampedDY) * 10) / 10
      }));

      cropPointsRef.current = updated;
      setCropPoints(updated);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
  };

  // ACCURATE CROP APPLICATION
  // Crops specifically to the selected region and outputs ONLY the cropped document
  const applyA4Crop = async () => {
    const sourceImgSrc = currentOriginalImage || currentCroppedImage;
    if (!sourceImgSrc) return;

    setIsApplyingCrop(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = sourceImgSrc;
      });

      const pts = cropPointsRef.current || DEFAULT_4_POINTS;
      const minX = Math.min(...pts.map(p => p.x));
      const maxX = Math.max(...pts.map(p => p.x));
      const minY = Math.min(...pts.map(p => p.y));
      const maxY = Math.max(...pts.map(p => p.y));

      // Calculate source bounding box from natural image dimensions
      const sx = Math.max(0, Math.round((minX / 100) * img.naturalWidth));
      const sy = Math.max(0, Math.round((minY / 100) * img.naturalHeight));
      const sw = Math.min(img.naturalWidth - sx, Math.max(20, Math.round(((maxX - minX) / 100) * img.naturalWidth)));
      const sh = Math.min(img.naturalHeight - sy, Math.max(20, Math.round(((maxY - minY) / 100) * img.naturalHeight)));

      // Canvas dimensions match the exact cropped width and height
      // The cropped content becomes the entire image without empty white padding
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      // 1. Immediately update local preview state for instant UI reflection
      setLocalCroppedImage(croppedDataUrl);

      // 2. Synchronously update pageImages in parent CustomerPrint state
      if (propSetPageImages) {
        propSetPageImages(prev => ({
          ...prev,
          [fileKey]: {
            ...(prev?.[fileKey] || {}),
            [activePage]: croppedDataUrl
          }
        }));
      }

      // 3. Synchronously create Blob and update File object in parent files array
      if (typeof setFiles === 'function') {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
        if (blob) {
          const croppedFile = new File(
            [blob],
            (activeFile?.name || 'document').replace(/_cropped\.jpg$/, "").replace(/\.[^/.]+$/, "") + "_cropped.jpg",
            { type: 'image/jpeg', lastModified: Date.now() }
          );
          loadedFileSignaturesRef.current[fileKey] = `${croppedFile.name}_${croppedFile.size}_${croppedFile.lastModified}`;
          setFiles(prev => {
            const updated = [...prev];
            updated[activeFileIndex] = croppedFile;
            return updated;
          });
        }
      }

      // 4. Mark cropped and close crop modal
      updateSetting('isCropped', true);
      setCropMode(false);
      setPan({ x: 0, y: 0 });

      return croppedDataUrl;
    } catch (err) {
      console.error('Crop execution error:', err);
    } finally {
      setIsApplyingCrop(false);
    }
  };

  // WYSIWYG: Bakes zoom, pan, brightness, contrast, rotation into canvas
  const bakeTransformToImage = async () => {
    const sourceImgSrc = displayImage;
    if (!sourceImgSrc) return;

    // Only bake if there are actual non-default transforms to bake
    const hasTransforms = (settings.zoom && Math.abs(settings.zoom - 1) > 0.02) ||
      (pan.x !== 0 || pan.y !== 0) ||
      (settings.brightness && settings.brightness !== 100) ||
      (settings.contrast && settings.contrast !== 100);

    if (!hasTransforms) return;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = sourceImgSrc;
      });

      const containerEl = containerRef.current;
      const previewImgEl = previewImageRef.current;

      const containerWidth = containerEl ? containerEl.clientWidth : 400;
      const containerHeight = containerEl ? containerEl.clientHeight : 400;
      const naturalW = img.naturalWidth || 800;
      const naturalH = img.naturalHeight || 1130;

      // Calculate rendered dimensions of the image inside the container
      let renderedW = naturalW;
      let renderedH = naturalH;
      if (previewImgEl && previewImgEl.clientWidth) {
        renderedW = previewImgEl.clientWidth;
        renderedH = previewImgEl.clientHeight;
      } else {
        const aspect = naturalW / naturalH;
        const cAspect = containerWidth / containerHeight;
        if (aspect > cAspect) {
          renderedW = containerWidth;
          renderedH = containerWidth / aspect;
        } else {
          renderedH = containerHeight;
          renderedW = containerHeight * aspect;
        }
      }

      // We bake at high resolution preserving document quality
      const scaleFactor = Math.max(1, naturalW / renderedW);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(renderedW * scaleFactor);
      canvas.height = Math.round(renderedH * scaleFactor);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (settings.brightness !== 100 || settings.contrast !== 100) {
        ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`;
      }

      ctx.save();
      // Move to center of canvas
      ctx.translate(canvas.width / 2, canvas.height / 2);
      // Apply pan (scaled to high-res canvas coordinates)
      ctx.translate(pan.x * scaleFactor, pan.y * scaleFactor);
      // Apply zoom
      ctx.scale(settings.zoom || 1, settings.zoom || 1);
      // Draw image centered
      ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
      ctx.restore();

      const bakedDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      // Update local preview immediately
      setLocalCroppedImage(bakedDataUrl);

      // Update parent CustomerPrint page images
      if (propSetPageImages) {
        propSetPageImages(prev => ({
          ...prev,
          [fileKey]: {
            ...(prev?.[fileKey] || {}),
            [activePage]: bakedDataUrl
          }
        }));
      }

      // Convert to File blob so the baked document is submitted to printer
      if (typeof setFiles === 'function') {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
        if (blob) {
          const bakedFile = new File(
            [blob],
            (activeFile?.name || 'document').replace(/_edited\.jpg$/, "").replace(/\.[^/.]+$/, "") + "_edited.jpg",
            { type: 'image/jpeg', lastModified: Date.now() }
          );
          loadedFileSignaturesRef.current[fileKey] = `${bakedFile.name}_${bakedFile.size}_${bakedFile.lastModified}`;
          setFiles(prev => {
            const updated = [...prev];
            updated[activeFileIndex] = bakedFile;
            return updated;
          });
        }
      }

      // Reset zoom/pan since they are now permanently baked into the image pixels
      updateSetting('zoom', 1);
      setPan({ x: 0, y: 0 });
      return bakedDataUrl;
    } catch (err) {
      console.error('WYSIWYG bake error:', err);
    }
  };

  // AUTOMATIC CROP & TRANSFORM APPLICATION ON CONTINUE
  const handleProceedNext = async () => {
    if (cropMode) {
      await applyA4Crop();
    } else {
      await bakeTransformToImage();
    }
    if (typeof onNext === 'function') {
      onNext();
    }
  };

  // Reset to uncropped original image
  const handleResetCrop = () => {
    setLocalCroppedImage(null);
    if (currentOriginalImage && propSetPageImages) {
      propSetPageImages(prev => ({
        ...prev,
        [fileKey]: {
          ...(prev?.[fileKey] || {}),
          [activePage]: currentOriginalImage
        }
      }));
    }
    cropPointsRef.current = DEFAULT_4_POINTS;
    setCropPoints(DEFAULT_4_POINTS);
    updateSetting('isCropped', false);
    setPan({ x: 0, y: 0 });
  };

  // Full Reset to Default for all settings and crop
  const handleResetAllToDefault = () => {
    setEditSettings(prev => ({
      ...prev,
      [fileKey]: {
        zoom: 1,
        rotation: 0,
        brightness: 100,
        contrast: 100,
        orientation: 'portrait'
      }
    }));
    cropPointsRef.current = DEFAULT_4_POINTS;
    setCropPoints(DEFAULT_4_POINTS);
    setPan({ x: 0, y: 0 });
    setLocalCroppedImage(null);
    if (previewImageRef.current) {
      previewImageRef.current.style.transform = 'translate(0px, 0px) scale(1) rotate(0deg)';
      previewImageRef.current.style.filter = 'brightness(100%) contrast(100%)';
    }
    if (currentOriginalImage && propSetPageImages) {
      propSetPageImages(prev => ({
        ...prev,
        [fileKey]: {
          ...(prev?.[fileKey] || {}),
          [activePage]: currentOriginalImage
        }
      }));
    }
  };

  // Orientation Handlers
  const handleSetPortrait = () => {
    updateSetting('orientation', 'portrait');
    updateSetting('rotation', 0);
  };

  const handleSetLandscape = () => {
    updateSetting('orientation', 'landscape');
    updateSetting('rotation', 90);
  };

  const handleRotate90 = () => {
    updateSetting('rotation', (settings.rotation + 90) % 360);
  };

  return (
    <div className="space-y-4">
      {/* FULL-SCREEN ACCURATE CROP MODAL / PAGE */}
      {cropMode && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-in fade-in duration-200">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-white z-20">
            <button
              type="button"
              onClick={() => setCropMode(false)}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all"
              title="Cancel"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>

            <div className="text-center">
              <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                <Crop className="w-4 h-4 text-emerald-400" />
                <span>Crop Document</span>
              </h3>
              <p className="text-[11px] text-slate-400">Drag 4 corner dots to adjust</p>
            </div>

            {/* Top-Right Action: Reset button only */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetCrop}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Modal Main Viewport: Exact image bounding box matching */}
          <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden p-4 select-none touch-none">
            {currentOriginalImage ? (
              <div className="relative inline-block select-none touch-none">
                <img
                  ref={cropImageRef}
                  src={currentOriginalImage}
                  alt="Full crop view"
                  className="max-w-[90vw] max-h-[72vh] block object-contain select-none pointer-events-none rounded shadow-2xl"
                  draggable={false}
                />

                {/* 4-Corner Free Directional SVG Overlay matching the EXACT image bounds */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <mask id="fullscreen-crop-mask">
                      <rect width="100" height="100" fill="white" />
                      <polygon points={currentCropPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="black" />
                    </mask>
                  </defs>

                  {/* Dark outer backdrop */}
                  <rect width="100" height="100" fill="rgba(0, 0, 0, 0.75)" mask="url(#fullscreen-crop-mask)" />

                  {/* Crop polygon border */}
                  <polygon
                    points={currentCropPoints.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(16, 185, 129, 0.15)"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeDasharray="4,3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {/* Pan entire crop polygon */}
                <div
                  onMouseDown={startMoveAll}
                  onTouchStart={startMoveAll}
                  className="absolute inset-6 cursor-move z-25"
                  title="Drag inside to reposition crop area"
                />

                {/* 4 Free-Directional Corner Dots (Generous 44px hit-target for touchscreens) */}
                {currentCropPoints.map((pt, idx) => (
                  <div
                    key={idx}
                    onMouseDown={(e) => startPointDrag(idx, e)}
                    onTouchStart={(e) => startPointDrag(idx, e)}
                    style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center z-30 cursor-pointer touch-none hover:scale-125 active:scale-135 transition-transform"
                    title={`Drag Corner ${idx + 1}`}
                  >
                    <div className="w-6 h-6 bg-white border-[3.5px] border-emerald-500 rounded-full shadow-2xl flex items-center justify-center ring-4 ring-emerald-500/30">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400 text-sm">Loading document...</div>
            )}
          </div>

          {/* Modal Bottom Bar with Tick (✓) Button */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-3 z-20">
            <button
              type="button"
              onClick={() => setCropMode(false)}
              className="flex-1 py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-[0.98] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyA4Crop}
              disabled={isApplyingCrop}
              className="flex-[2] py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-black text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <span>{isApplyingCrop ? 'Applying Crop...' : 'Apply Crop ✓'}</span>
              <Check className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        </div>
      )}

      {/* File Switcher Tabs when multiple files */}
      {files.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {files.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setActiveFileIndex(i);
                setActivePage(1);
                setPan({ x: 0, y: 0 });
                setLocalCroppedImage(null);
              }}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 ${
                i === activeFileIndex
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 opacity-70" />
              <span>{f.name.length > 18 ? f.name.substring(0, 15) + '...' : f.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Document Preview Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Card Top Toolbar: Paper Size Dropdown + Maximize + Crop Button */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 text-xs">
          {/* Paper Size Dropdown Menu (Moved from Upload screen) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPaperMenu(!showPaperMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/90 shadow-2xs transition-all active:scale-95"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Paper: <strong className="text-slate-900 font-extrabold">{paperSize || 'A4'}</strong></span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {showPaperMenu && (
              <div className="absolute left-0 mt-1.5 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Select Paper Size
                </div>
                {['A4', 'A3', 'A2', 'A1', 'Legal'].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      if (setPaperSize) setPaperSize(size);
                      setShowPaperMenu(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs font-bold flex items-center justify-between transition-colors ${
                      paperSize === size ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>
                      {size}{' '}
                      {size === 'A4'
                        ? '(Standard)'
                        : size === 'A3'
                        ? '(Medium)'
                        : size === 'A2'
                        ? '(Large)'
                        : size === 'A1'
                        ? '(Poster / Extra Large)'
                        : '(Long)'}
                    </span>
                    {paperSize === size && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Maximize / View Fullscreen Button */}
            <button
              type="button"
              onClick={() => setShowEditFullscreen(true)}
              className="p-1.5 font-bold text-xs rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 flex items-center justify-center active:scale-95 transition-all"
              title="Maximize and view document full screen"
              aria-label="Maximize preview"
            >
              <Maximize2 className="w-4 h-4 text-slate-600" />
            </button>

            {/* Clean Crop Trigger Button */}
            <button
              type="button"
              onClick={() => setCropMode(true)}
              className="px-3.5 py-1.5 font-bold text-xs rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200/80 flex items-center gap-1.5 active:scale-95 transition-all"
              title="Open Fullscreen Crop"
            >
              <Crop className="w-3.5 h-3.5 text-slate-700" />
              <span>Crop</span>
            </button>
          </div>
        </div>

        {/* Interactive Document Viewport */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          className={`relative bg-slate-100/80 flex items-center justify-center overflow-hidden select-none ${
            isEditing ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{ minHeight: '340px', maxHeight: '460px', touchAction: 'pan-y' }}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2.5 text-slate-400 py-20">
              <div className="w-9 h-9 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold">Preparing document...</span>
            </div>
          ) : displayImage ? (
            <img
              ref={previewImageRef}
              src={displayImage}
              alt="Document preview"
              className="max-w-full max-h-[440px] object-contain select-none pointer-events-none"
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${settings.zoom}) rotate(${settings.rotation}deg)`,
                filter: `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`,
                WebkitUserDrag: 'none',
                userSelect: 'none'
              }}
            />
          ) : (
            <div className="text-xs text-slate-400 font-medium py-20">No preview available</div>
          )}

          {/* Floating Mid-Right & Mid-Left Document Switcher Arrows (when multiple files) */}
          {files.length > 1 && (
            <>
              <button
                type="button"
                onClick={async () => {
                  if (settings.cropPoints) await applyA4Crop();
                  setActiveFileIndex(i => (i - 1 + files.length) % files.length);
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-white/95 backdrop-blur-md shadow-xl border border-slate-200/90 text-slate-800 hover:bg-white hover:scale-110 active:scale-95 flex items-center justify-center transition-all"
                title="Previous Document"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (settings.cropPoints) await applyA4Crop();
                  setActiveFileIndex(i => (i + 1) % files.length);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-white/95 backdrop-blur-md shadow-xl border border-slate-200/90 text-slate-800 hover:bg-white hover:scale-110 active:scale-95 flex items-center justify-center transition-all"
                title="Next Document"
              >
                <ChevronRight className="w-6 h-6 stroke-[2.5]" />
              </button>
            </>
          )}

          {/* Active document indicator badge */}
          {files.length > 1 && (
            <div className="absolute top-3 left-3 bg-slate-900/85 text-white backdrop-blur-md px-2.5 py-1 rounded-xl text-[10px] font-bold z-10 flex items-center gap-1">
              <span>Doc {activeFileIndex + 1}/{files.length}</span>
              <span className="text-slate-300 truncate max-w-[90px]">· {activeFile?.name}</span>
            </div>
          )}
        </div>

        {/* Page navigation strip (for multi-page PDFs) */}
        {fileTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500">Page Navigation</span>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <button
                type="button"
                onClick={() => setActivePage(p => Math.max(1, p - 1))}
                disabled={activePage <= 1}
                className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>{activePage} of {fileTotalPages}</span>
              <button
                type="button"
                onClick={() => setActivePage(p => Math.min(fileTotalPages, p + 1))}
                disabled={activePage >= fileTotalPages}
                className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: CLEAN REVIEW / FAST-TRACK VIEW (ONLY TWO BUTTONS) */}
      {!isEditing ? (
        <div className="space-y-3 pt-1">
          {/* Button 1: All Good ➔ Continue */}
          <button
            type="button"
            onClick={handleProceedNext}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-base py-4 rounded-2xl shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5"
          >
            <span>All Good ➔ Continue</span>
            <Check className="w-5 h-5 stroke-[3]" />
          </button>

          {/* Button 2: Edit Document (Crop, Rotate, Enhance) */}
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="w-full bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-200/90 text-slate-800 font-bold text-sm py-3.5 rounded-2xl shadow-xs transition-all flex items-center justify-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
            <span>Edit Document (Crop, Rotate, Enhance)</span>
          </button>
        </div>
      ) : (
        /* VIEW 2: ADVANCED INTERACTIVE DOCUMENT EDITOR */
        <div className="space-y-4">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                <span>Fine-Tune Adjustments</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAllToDefault}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/90 shadow-xs active:scale-95"
                  title="Reset all edits, crop, and zoom to default"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset / Default</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCropMode(true)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 shadow-xs active:scale-95"
                >
                  <Crop className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Crop</span>
                </button>
              </div>
            </div>

            {/* Touch-Safe Zoom Slider (15% to 500%) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <ZoomIn className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Zoom Level</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateSetting('zoom', 1);
                      setPan({ x: 0, y: 0 });
                      if (previewImageRef.current) {
                        previewImageRef.current.style.transform = `translate(0px, 0px) scale(1) rotate(${settings.rotation || 0}deg)`;
                      }
                    }}
                    className="px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-all active:scale-95 flex items-center gap-1 shadow-2xs"
                    title="Reset zoom to 100%"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-400" />
                    <span>100%</span>
                  </button>
                  <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                    {Math.round(settings.zoom * 100)}%
                  </span>
                </div>
              </div>
              <SafeSlider
                min={0.15}
                max={5.0}
                step={0.05}
                value={settings.zoom}
                onChange={(val) => updateSetting('zoom', val)}
                accentColor="emerald"
              />
            </div>

            {/* Touch-Safe Brightness Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Brightness</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-500">
                  {settings.brightness}%
                </span>
              </div>
              <SafeSlider
                min={40}
                max={180}
                step={1}
                value={settings.brightness}
                onChange={(val) => updateSetting('brightness', val)}
                accentColor="amber"
              />
            </div>

            {/* Touch-Safe Contrast Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Contrast className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Contrast</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-500">
                  {settings.contrast}%
                </span>
              </div>
              <SafeSlider
                min={40}
                max={180}
                step={1}
                value={settings.contrast}
                onChange={(val) => updateSetting('contrast', val)}
                accentColor="indigo"
              />
            </div>

            {/* Clean Orientation Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-800">Orientation</span>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={handleSetPortrait}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    settings.rotation === 0
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Portrait
                </button>
                <button
                  type="button"
                  onClick={handleSetLandscape}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    settings.rotation === 90
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={handleRotate90}
                  className="p-1 rounded-lg hover:bg-white text-slate-700 transition-all ml-1"
                  title="Rotate 90 degrees"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Action Bar: Back and Continue ✓ */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setCropMode(false);
              }}
              className="flex-1 bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={handleProceedNext}
              disabled={isApplyingCrop}
              className="flex-[2] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black py-3.5 rounded-2xl text-xs shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2"
            >
              <span>{isApplyingCrop ? 'Applying Crop...' : 'Continue'}</span>
              <Check className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {showEditFullscreen && displayImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 animate-in fade-in duration-200"
          onClick={() => setShowEditFullscreen(false)}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between py-3 px-4 text-white max-w-3xl mx-auto w-full shrink-0 border-b border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 pr-4">
              <h3 className="text-sm font-bold truncate text-slate-100">
                {activeFile?.name || 'Document'}
              </h3>
              <p className="text-xs text-slate-400">
                {files.length > 1 ? `Doc ${activeFileIndex + 1} of ${files.length} • ` : ''}Page {activePage} • Fullscreen Preview
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowEditFullscreen(false)}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white flex items-center justify-center transition-all border border-slate-700 shadow-sm"
              title="Close Fullscreen"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Centered Image */}
          <div
            className="flex-1 flex items-center justify-center p-3 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={displayImage}
              alt="Document fullscreen"
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl bg-white select-none"
              style={{
                transform: `rotate(${settings.rotation || 0}deg)`,
                filter: `brightness(${settings.brightness || 100}%) contrast(${settings.contrast || 100}%)`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
