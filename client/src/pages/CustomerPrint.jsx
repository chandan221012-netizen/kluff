import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { ArrowLeft, ArrowRight, Check, Clock, QrCode, RotateCcw } from 'lucide-react';
import { SERVER_URL } from '../config';

import ProgressBar from '../components/customer/ProgressBar';
import StepUpload from '../components/customer/StepUpload';
import StepEdit from '../components/customer/StepEdit';
import StepPreview, { parsePageRange } from '../components/customer/StepPreview';
import StepPay from '../components/customer/StepPay';
import { saveFilesToStorage, loadFilesFromStorage, clearFilesFromStorage } from '../utils/fileStorage';

// Module-level cache so mobile OS app switches and remounts NEVER wipe state
let cachedFiles = [];
let cachedInitialized = false;
let cachedShopInfo = null;
let cachedSessionToken = null;
let cachedExpiresAt = null;
let cachedRemainingSeconds = null;
let cachedForToken = null; // tracks which token this cache belongs to

export default function CustomerPrint() {
  const { token } = useParams();
  const navigate = useNavigate();
  // Capture the token ONCE at mount time so URL changes never retrigger this
  const initialTokenRef = useRef(token);
  
  // FIX: If the URL token changed (new QR scan), reset all cached state
  if (cachedForToken && cachedForToken !== token) {
    cachedFiles = [];
    cachedInitialized = false;
    cachedShopInfo = null;
    cachedSessionToken = null;
    cachedExpiresAt = null;
    cachedRemainingSeconds = null;
    cachedForToken = null;
    initialTokenRef.current = token;
    clearFilesFromStorage().catch(() => {});
  }
  cachedForToken = token;

  const sessionInitializedRef = useRef(cachedInitialized);

  // Steps: 1=Upload, 2=Edit, 3=Preview, 4=Pay, 5=Success/Print Another
  const [currentStep, setCurrentStep] = useState(1);

  // Shop & Session Data
  const [shopInfo, setShopInfo] = useState(cachedShopInfo);
  const [loadingShop, setLoadingShop] = useState(!cachedInitialized);
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionToken, setSessionToken] = useState(null);
  const [originalQrToken, setOriginalQrToken] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [expiredReason, setExpiredReason] = useState('');

  // Step 1: Upload
  const [files, setFilesState] = useState(() => cachedFiles);
  const setFiles = useCallback((updater) => {
    setFilesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      cachedFiles = Array.isArray(next) ? next : [];
      return cachedFiles;
    });
  }, []);

  // Restore files from IndexedDB if page was killed by Android/iOS background killer
  useEffect(() => {
    if (files.length === 0) {
      loadFilesFromStorage().then((stored) => {
        if (stored && stored.length > 0) {
          cachedFiles = stored;
          setFilesState(stored);
        }
      });
    }
  }, []);

  const [paperSize, setPaperSize] = useState('A4');

  // Step 2: Edit (per-file settings keyed by file index)
  const [editSettings, setEditSettings] = useState({});

  // Step 3: Preview
  const [pageRange, setPageRange] = useState({}); // { fileIndex: "1-3, 5" }
  const [printSide, setPrintSide] = useState('single');
  const [totalPages, setTotalPages] = useState({}); // set by StepEdit during PDF rendering
  const [pageImages, setPageImages] = useState({}); // current active/cropped page images
  const [originalPageImages, setOriginalPageImages] = useState({}); // pristine original images for re-crop / reset

  // Step 4: Pay & Copies per file
  const [colorMode, setColorMode] = useState('bw');
  const [fileCopies, setFileCopies] = useState({}); // { [fileIndex]: number }
  const [paymentMethod, setPaymentMethod] = useState('counter');

  const handleSetFileCopies = useCallback((fileIdx, val) => {
    setFileCopies(prev => ({
      ...prev,
      [fileIdx]: Math.max(1, Math.min(50, val))
    }));
  }, []);

  // Remove a file and purge its cached preview/edit state
  const handleRemoveFile = useCallback((indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, idx) => idx !== indexToRemove));
    setPageImages(prev => {
      const copy = { ...prev };
      delete copy[indexToRemove];
      return copy;
    });
    setOriginalPageImages(prev => {
      const copy = { ...prev };
      delete copy[indexToRemove];
      return copy;
    });
    setTotalPages(prev => {
      const copy = { ...prev };
      delete copy[indexToRemove];
      return copy;
    });
    setEditSettings(prev => {
      const copy = { ...prev };
      delete copy[indexToRemove];
      return copy;
    });
    setFileCopies(prev => {
      const copy = { ...prev };
      delete copy[indexToRemove];
      return copy;
    });
    setPageRange(prev => {
      const copy = { ...prev };
      delete copy[indexToRemove];
      return copy;
    });
  }, []);

  // Step 5: Order Confirmation
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [batchId, setBatchId] = useState(null);
  const [batchJobs, setBatchJobs] = useState([]);
  const [status, setStatus] = useState(null);

  // Compute total printable pages across all files accounting for per-file copies
  const totalSelectedPages = useMemo(() => {
    let count = 0;
    for (let i = 0; i < files.length; i++) {
      const range = pageRange?.[i] || '';
      const tp = totalPages?.[i] || 1;
      const pagesForFile = (!range.trim()) ? tp : (parsePageRange(range, tp).length || tp);
      const copiesForFile = fileCopies[i] || 1;
      count += pagesForFile * copiesForFile;
    }
    return count || files.length;
  }, [files, pageRange, totalPages, fileCopies]);

  // Handler to print another document without scanning QR again
  const handlePrintAnother = async () => {
    clearFilesFromStorage().catch(() => {});
    setFiles([]);
    setEditSettings({});
    setPageRange({});
    setFileCopies({});
    setPageImages({});
    setOriginalPageImages({});
    setTotalPages({});
    setJobId(null);
    setBatchId(null);
    setBatchJobs([]);
    setStatus(null);
    setErrorMsg('');
    setCurrentStep(1);

    // Issue a fresh session token for the next job at counter
    const activeQr = originalQrToken || initialTokenRef.current;
    if (activeQr && !activeQr.startsWith('SES_')) {
      try {
        const res = await fetch(`${SERVER_URL}/api/session/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrToken: activeQr })
        });
        const data = await res.json();
        if (data.success) {
          setSessionToken(data.sessionToken);
          setExpiresAt(new Date(data.expiresAt).getTime());
          setRemainingSeconds(data.ttlSeconds);
        }
      } catch (e) {}
    }
  };

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    if (secs == null || isNaN(secs)) return '07:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 1. Session Initialization & Validation — runs ONCE on mount only
  // We use an empty dep array [] and read from initialTokenRef so that
  // URL changes made later (navigate/replaceState) NEVER re-run this effect
  // and NEVER wipe files or trigger a re-render of loadingShop.
  useEffect(() => {
    if (sessionInitializedRef.current) return;

    const qrToken = initialTokenRef.current;

    const initOrValidate = async () => {
      try {
        setLoadingShop(true);
        setErrorMsg('');
        setIsExpired(false);

        if (qrToken && qrToken.startsWith('SES_')) {
          // Existing session token — validate it
          const res = await fetch(`${SERVER_URL}/api/session/validate/${qrToken}`);
          const data = await res.json();
          if (!res.ok || !data.valid) {
            setIsExpired(true);
            setExpiredReason(data.message || 'Session expired or inactive. Please scan the QR code at the shop counter to print.');
            setLoadingShop(false);
            return;
          }
          sessionInitializedRef.current = true;
          cachedInitialized = true;
          cachedSessionToken = data.sessionToken;
          cachedExpiresAt = new Date(data.expiresAt).getTime();
          cachedRemainingSeconds = data.remainingSeconds;
          cachedShopInfo = data.shop;

          setSessionToken(data.sessionToken);
          setExpiresAt(cachedExpiresAt);
          setRemainingSeconds(data.remainingSeconds);
          setShopInfo(data.shop);
          setLoadingShop(false);
        } else {
          // Physical QR token — try to issue a fresh 7-minute session token
          try {
            const res = await fetch(`${SERVER_URL}/api/session/init`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ qrToken })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              sessionInitializedRef.current = true;
              cachedInitialized = true;
              cachedSessionToken = data.sessionToken;
              cachedExpiresAt = new Date(data.expiresAt).getTime();
              cachedRemainingSeconds = data.ttlSeconds;
              cachedShopInfo = data.shop;

              setSessionToken(data.sessionToken);
              setOriginalQrToken(qrToken);
              setExpiresAt(cachedExpiresAt);
              setRemainingSeconds(data.ttlSeconds);
              setShopInfo(data.shop);
              setLoadingShop(false);
              return;
            }
          } catch (sessionErr) {
            console.warn('Session init failed, falling back to direct shop check:', sessionErr);
          }

          // Fallback to standard shop check
          const fallbackRes = await fetch(`${SERVER_URL}/api/shops/${qrToken}`);
          const fallbackData = await fallbackRes.json();
          if (!fallbackRes.ok || (!fallbackData.shopName && !fallbackData.name)) {
            throw new Error('Shop not found or inactive. Please scan the counter QR code.');
          }

          sessionInitializedRef.current = true;
          cachedInitialized = true;
          cachedShopInfo = fallbackData;
          setSessionToken(null);
          setOriginalQrToken(qrToken);
          setShopInfo(fallbackData);
          setLoadingShop(false);
        }
      } catch (err) {
        setErrorMsg(err.message);
        setLoadingShop(false);
      }
    };

    initOrValidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // INTENTIONALLY empty — must only run once on mount

  // 2. Real-Time 7-Minute Countdown Ticker
  useEffect(() => {
    if (!expiresAt || isExpired) return;

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(diff);
      // Never forcefully kick user out if they have files uploaded or are actively using the page
      if (diff <= 0 && (!cachedFiles || cachedFiles.length === 0)) {
        setIsExpired(true);
        setExpiredReason('Session expired or inactive. Please scan the QR code at the shop counter to print.');
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, isExpired]);

  // 3. 7-Minute Inactivity Watchdog
  // 3. 8-Minute Inactivity Watchdog
  useEffect(() => {
    if (isExpired) return;
    let inactivityTimer;

    const resetInactivity = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        // Never expire if files are selected
        if (!cachedFiles || cachedFiles.length === 0) {
          setIsExpired(true);
          setExpiredReason('Session expired. Please scan the QR code at the shop counter to print.');
        }
      }, 8 * 60 * 1000); // 8 minutes TTL
    };

    resetInactivity();
    const events = ['mousedown', 'mousemove', 'touchstart', 'scroll', 'keydown'];
    events.forEach(ev => window.addEventListener(ev, resetInactivity, { passive: true }));

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(ev => window.removeEventListener(ev, resetInactivity));
    };
  }, [isExpired]);

  // Socket connection for tracking
  useEffect(() => {
    if (!batchId) return;
    const socket = io(SERVER_URL);
    socket.emit('join-batch-room', { batchId });

    socket.on('batch-status-update', (update) => {
      setBatchJobs(prev =>
        prev.map(j => j.jobId === update.jobId ? { ...j, status: update.status } : j)
      );
      if (update.status === 'COMPLETED' || update.status === 'FAILED') {
        setStatus(update.status);
      }
    });

    socket.on('customer-status-update', (update) => {
      setStatus(update.status);
    });

    return () => socket.disconnect();
  }, [batchId]);

  // Submit print job
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('shopToken', originalQrToken || token);
      if (sessionToken) {
        formData.append('sessionToken', sessionToken);
      }
      formData.append('colorMode', colorMode);
      formData.append('copies', 1);
      formData.append('fileCopies', JSON.stringify(fileCopies));
      formData.append('paperSize', paperSize);
      formData.append('printSide', printSide);
      formData.append('paymentMethod', paymentMethod);

      // Send page ranges
      const ranges = {};
      for (let i = 0; i < files.length; i++) {
        if (pageRange[i]) ranges[i] = pageRange[i];
      }
      formData.append('pageRanges', JSON.stringify(ranges));

      // Send edit settings
      formData.append('editSettings', JSON.stringify(editSettings));

      const res = await fetch(`${SERVER_URL}/api/print`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && (data.error === 'SESSION_EXPIRED' || data.error?.includes('Session'))) {
          setIsExpired(true);
          setExpiredReason(data.message || 'Session expired. Please scan the QR code at the shop counter to print.');
          return;
        }
        throw new Error(data.error || 'Failed to submit print job');
      }

      setJobId(data.jobId || data.jobs?.[0]?.jobId);
      setBatchId(data.batchId);
      setBatchJobs(data.jobs || [{ jobId: data.jobId, status: 'RECEIVED', originalFileName: files[0]?.name }]);
      setStatus('RECEIVED');
      setCurrentStep(5);
      // FIX: Clear IndexedDB immediately after successful submit
      // so files don't persist and reappear on next QR scan
      clearFilesFromStorage().catch(() => {});
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Initialize default edit settings for new files and purge stale state on clear
  useEffect(() => {
    if (files.length === 0) {
      setPageImages({});
      setOriginalPageImages({});
      setTotalPages({});
      setEditSettings({});
      setFileCopies({});
      setPageRange({});
      return;
    }
    const newSettings = { ...editSettings };
    files.forEach((_, i) => {
      if (!newSettings[i]) {
        newSettings[i] = {
          zoom: 1,
          rotation: 0,
          brightness: 100,
          contrast: 100,
          orientation: 'portrait',
          crop: null
        };
      }
    });
    setEditSettings(newSettings);
  }, [files.length]);

  // Loading state
  if (loadingShop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-400">Loading shop...</p>
        </div>
      </div>
    );
  }

  // 8-Minute QR Session Expired Screen (Blocks bookmarks, old links & inactivity)
  if (isExpired) {
    return (
      <div className="min-h-screen py-10 px-4 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 max-w-sm w-full text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-20 h-20 bg-amber-50 border-2 border-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
            <QrCode className="w-10 h-10 stroke-[2]" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Scan It For Print</h2>
            <p className="text-sm font-semibold text-slate-700 leading-relaxed">
              Session expired. Please scan the QR code at the shop counter to print.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (originalQrToken && !originalQrToken.startsWith('SES_')) {
                  window.location.href = `/print/${originalQrToken}`;
                } else {
                  window.location.href = '/test';
                }
              }}
              className="w-full bg-slate-900 hover:bg-black active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Scan It For Print</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (errorMsg && !shopInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center max-w-sm w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto text-2xl font-bold border-2 border-red-100">
            !
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Shop Not Found or Inactive</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {errorMsg.includes('fetch') 
                ? 'Unable to connect to printing server. Please check your connection.'
                : 'Session expired or invalid QR code. Please scan the QR code at the shop counter.'}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/test';
              }}
              className="w-full bg-slate-900 hover:bg-black active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Scan It For Print</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-2">
      <div className="max-w-md mx-auto px-4 py-3 space-y-5">

          {/* Brand Header */}
          <header className="relative pt-3 pb-2 text-center">
            {currentStep > 1 && currentStep <= 4 && (
              <button
                type="button"
                onClick={() => setCurrentStep(s => s - 1)}
                className="absolute left-0 top-3 w-10 h-10 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 transition-all active:scale-[0.95] z-10"
                title="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div className="flex flex-col items-center justify-center">
              {/* Logo & Brand Name matching reference image */}
              <div className="inline-flex items-center gap-2">
                <div className="flex items-baseline font-black tracking-tighter select-none mr-1">
                  <span className="text-amber-500 font-black text-4xl sm:text-5xl leading-none -mr-1">A</span>
                  <span className="text-slate-900 font-black text-3xl sm:text-4xl leading-none">P</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight select-none">
                  <span className="text-slate-900">Auto</span>
                  <span className="text-amber-500">Print</span>
                </h1>
                {/* Rapidly Blinking Live Dot */}
                <span className="relative flex h-3.5 w-3.5 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-90" style={{ animationDuration: '0.7s' }} />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 shadow-sm shadow-emerald-500/60" />
                </span>
              </div>

              {/* Tagline matching reference image */}
              <div className="mt-0.5 text-center">
                <p className="text-xl sm:text-2xl font-bold text-slate-800 tracking-wide font-['Caveat',cursive]">
                  Print Karo, <span className="relative inline-block">
                    Apne Style Mein
                    <span className="absolute -bottom-0.5 left-0 w-full h-[3px] bg-amber-400 rounded-full" />
                  </span>
                </p>
              </div>

              {shopInfo?.name && (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-900 font-bold bg-gradient-to-r from-amber-100/90 to-amber-50 border border-amber-300/80 px-3.5 py-1 rounded-full mt-2 shadow-xs">
                  <span>📍</span>
                  <span>{shopInfo.name}</span>
                </div>
              )}
            </div>
          </header>

          {/* Progress Bar (only for steps 1-4) */}
          {currentStep <= 4 && (
            <ProgressBar currentStep={currentStep} />
          )}

          {/* Error Banner */}
          {errorMsg && currentStep <= 4 && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-xs font-medium p-3 rounded-xl">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Step Content */}
          {currentStep === 1 && (
            <StepUpload
              files={files}
              setFiles={setFiles}
              onRemoveFile={handleRemoveFile}
              paperSize={paperSize}
              setPaperSize={setPaperSize}
              onNext={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 2 && (
            <StepEdit
              files={files}
              setFiles={setFiles}
              editSettings={editSettings}
              setEditSettings={setEditSettings}
              pageImages={pageImages}
              setPageImages={setPageImages}
              originalPageImages={originalPageImages}
              setOriginalPageImages={setOriginalPageImages}
              totalPages={totalPages}
              setTotalPages={setTotalPages}
              paperSize={paperSize}
              setPaperSize={setPaperSize}
              onPageData={({ totalPages: tp, pageImages: pi, originalPageImages: opi }) => {
                if (tp) setTotalPages(tp);
                if (pi) setPageImages(pi);
                if (opi) setOriginalPageImages(opi);
              }}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && (
            <StepPreview
              files={files}
              editSettings={editSettings}
              pageRange={pageRange}
              setPageRange={setPageRange}
              fileCopies={fileCopies}
              setFileCopies={handleSetFileCopies}
              printSide={printSide}
              setPrintSide={setPrintSide}
              totalPages={totalPages}
              pageImages={pageImages}
              onNext={() => setCurrentStep(4)}
              onBack={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 4 && (
            <StepPay
              files={files}
              totalSelectedPages={totalSelectedPages}
              colorMode={colorMode}
              setColorMode={setColorMode}
              fileCopies={fileCopies}
              setFileCopies={handleSetFileCopies}
              printSide={printSide}
              paperSize={paperSize}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              shopInfo={shopInfo}
              sessionToken={sessionToken}
              onSubmit={handleSubmit}
              onBack={() => setCurrentStep(3)}
              submitting={submitting}
            />
          )}

          {currentStep === 5 && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 text-center space-y-5 max-w-[440px] mx-auto">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Print Order Sent!</h2>
                <p className="text-xs text-slate-400">Your documents are now being processed by the printer.</p>
              </div>

              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 text-left space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Job Reference</span>
                  <span className="font-mono font-bold text-slate-900">{jobId || batchId || 'Confirmed'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Prints</span>
                  <span className="font-bold text-slate-900">{totalSelectedPages} pages</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Color Mode</span>
                  <span className="font-bold text-slate-900">{colorMode === 'color' ? 'Color' : 'Black & White'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Payment Status</span>
                  <span className="font-bold text-emerald-700 capitalize">{paymentMethod === 'counter' ? 'Pay on Counter' : 'UPI Paid'}</span>
                </div>
              </div>

              {/* Print Another Document Button */}
              <button
                type="button"
                onClick={handlePrintAnother}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold py-4 rounded-2xl text-sm shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2"
              >
                <span>Print Another Document</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-[11px] text-slate-400">
                You can print more files directly without scanning the QR code again.
              </p>
            </div>
          )}

          {/* Global Footer */}
          <footer className="text-center pt-6 pb-4 space-y-1">
            <p className="text-xs text-slate-500 font-medium">
              ⚡ Powered by <span className="font-bold text-emerald-600">AutoPrint</span>
            </p>
            <p className="text-[10px] text-slate-400">© 2025 AutoPrint. All Rights Reserved.</p>
          </footer>
        </div>
      </div>
  );
}