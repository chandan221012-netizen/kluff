import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import io from 'socket.io-client';
import { 
  QrCode, Printer, Plus, Loader2, 
  TrendingUp, Layers, RefreshCw, IndianRupee, Save, CheckCircle2,
  Download, LogOut, FileText, Image as ImageIcon, Sparkles, Trash2
} from 'lucide-react';
import { SERVER_URL } from '../config';

export default function ShopDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'queue' | 'printers' | 'poster'

  // Form states
  const [bwPrice, setBwPrice] = useState(2);
  const [colorPrice, setColorPrice] = useState(10);
  const [newPrinterName, setNewPrinterName] = useState('');
  const [systemPrinterName, setSystemPrinterName] = useState('');
  const [isColor, setIsColor] = useState(false);

  // Desktop Agent & Cloud Routing states
  const [isAgentOnline, setIsAgentOnline] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [printerRouting, setPrinterRouting] = useState({
    defaultPrinter: '',
    bwPrinter: '',
    colorPrinter: '',
    a3Printer: '',
    a2Printer: '',
    a1Printer: '',
    photoPrinter: ''
  });
  const [savingRouting, setSavingRouting] = useState(false);
  const [saveRoutingSuccess, setSaveRoutingSuccess] = useState(false);

  const token = localStorage.getItem('ownerToken') || '';

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, []);

  // Connect socket for real-time live print queue and desktop agent updates
  useEffect(() => {
    if (!stats?.qrToken) return;

    const socket = io(SERVER_URL);
    socket.emit('join-shop-room', stats.shopId || stats.qrToken);

    socket.on('agent-status-update', (data) => {
      setIsAgentOnline(data.status === 'ONLINE');
    });

    socket.on('agent-printers-updated', (data) => {
      if (Array.isArray(data.printers)) {
        setAvailablePrinters(data.printers);
      }
    });

    socket.on('customer-status-update', (update) => {
      setRecentJobs((prev) =>
        prev.map((j) => (j.jobId === update.jobId ? { ...j, status: update.status } : j))
      );
      fetchStats();
      fetchHistory();
    });

    return () => socket.disconnect();
  }, [stats?.qrToken]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch dashboard data');
      
      setStats(data);
      setBwPrice(data.pricing?.bwPerPage || 2);
      setColorPrice(data.pricing?.colorPerPage || 10);
      setIsAgentOnline(Boolean(data.isAgentOnline));
      if (Array.isArray(data.availablePrinters)) setAvailablePrinters(data.availablePrinters);
      if (data.printerRouting) {
        setPrinterRouting(prev => ({
          ...prev,
          ...data.printerRouting
        }));
      }
      setLoading(false);
    } catch (err) {
      setErrorMsg(err.message);
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/dashboard/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setRecentJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('History error:', err);
    }
  };

  const handleDeletePrinter = async (printerId) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/dashboard/printers/${printerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchStats();
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleUpdatePricing = async (e) => {
    e.preventDefault();
    setSaveSuccess(false);

    try {
      const res = await fetch(`${SERVER_URL}/api/dashboard/pricing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ bwPerPage: bwPrice, colorPerPage: colorPrice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleSaveRouting = async (e) => {
    if (e) e.preventDefault();
    setSavingRouting(true);
    setSaveRoutingSuccess(false);

    try {
      const res = await fetch(`${SERVER_URL}/api/dashboard/printer-routing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(printerRouting)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save printer routing');

      setSaveRoutingSuccess(true);
      setTimeout(() => setSaveRoutingSuccess(false), 3500);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSavingRouting(false);
    }
  };

  const handleAddPrinter = async (e) => {
    e.preventDefault();
    if (!newPrinterName || !systemPrinterName) return;

    try {
      const res = await fetch(`${SERVER_URL}/api/dashboard/printers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newPrinterName,
          systemPrinterName,
          isColorSupported: isColor
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setNewPrinterName('');
      setSystemPrinterName('');
      setIsColor(false);
      fetchStats();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ownerToken');
    navigate('/login');
  };

  const handlePrintPoster = () => {
    window.print();
  };

  // Dynamic LAN IP resolution: If accessed via localhost, use the detected Wi-Fi LAN IP
  // so any mobile phone connected to the same Wi-Fi network opens the print screen immediately!
  const lanIp = stats?.serverIp || '10.91.1.121';
  const origin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `${window.location.protocol}//${lanIp}:${window.location.port || '5173'}`
    : window.location.origin;

  const publicPrintUrl = stats?.qrToken
    ? `${origin}/print/${stats.qrToken}`
    : '';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh]">
        <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
        <p className="mt-3 text-xs font-semibold text-slate-400">Loading shop intelligence...</p>
      </div>
    );
  }

  if (errorMsg || !stats) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-3xl shadow-xl border border-slate-100 text-center space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <LogOut className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Session Expired or Connection Error</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          {errorMsg || 'Could not connect to the backend server. Please log in again.'}
        </p>
        <button
          onClick={handleLogout}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Top Navigation & Shop Profile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              ● Online Relay
            </span>
            <span className="text-xs text-slate-400 font-mono">Token: {stats?.qrToken?.substring(0, 8)}...</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{stats?.shopName}</h1>
          <p className="text-xs text-slate-400 font-medium">AUTOPRINT Terminal Hub & Queue Manager</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors border border-slate-200/60"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Gross Revenue</span>
            <span className="text-xl font-black">₹{stats?.totalRevenue || 0}</span>
          </div>

          <button
            onClick={handleLogout}
            className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-colors border border-rose-100"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 24-HOUR / 10-PAGE TRIAL & HARDWARE TERMINAL BANNER */}
      {stats?.subscription?.trial?.isTrial && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-amber-50 border border-emerald-200/80 p-5 rounded-3xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-600 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                👑 24-Hour Free Trial Active
              </span>
              <span className="text-xs font-bold text-slate-700">
                {stats?.subscription?.trial?.pagesUsed || 0} / {stats?.subscription?.trial?.maxPages || 10} Pages Used
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Your free trial gives you 10 free test pages within 24 hours. After 10 pages or 24 hours (whichever comes first), activate your monthly subscription to keep printing!
            </p>
          </div>

          <div className="flex items-center gap-3">
            {stats?.pairedHardwareId ? (
              <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border border-slate-200 text-xs text-slate-700 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>PC Linked: <strong>{stats.pairedComputerName || 'Registered Terminal'}</strong></span>
                <button
                  onClick={async () => {
                    if (!window.confirm("Unlink your current PC?\n\nThis will allow you to activate and link a new computer to your shop.")) return;
                    try {
                      const res = await fetch(`${SERVER_URL}/api/shops/unlink-terminal`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ shopId: stats?.shopId })
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.message || 'Unlink failed');
                      alert('Hardware lock released. You can now link your new computer.');
                      fetchStats();
                    } catch (err) { alert(err.message); }
                  }}
                  className="text-[10px] text-rose-600 hover:text-rose-700 font-bold ml-1 underline"
                  title="Unlink this PC if you are switching computers"
                >
                  Unlink PC
                </button>
              </div>
            ) : (
              <div className="bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-semibold">
                ⚠️ No PC Linked: Enter your token in KluffPrintAgent.exe
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-bold gap-6 print:hidden overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Overview & Rates
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`pb-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'queue'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Live Queue & History ({recentJobs.length})
        </button>
        <button
          onClick={() => setActiveTab('poster')}
          className={`pb-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'poster'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" /> Counter QR & Poster Generator
        </button>
        <button
          onClick={() => setActiveTab('printers')}
          className={`pb-3 transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'printers'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Printers ({stats?.printers?.length || 0})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & PRICING RULES                                           */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Print Jobs</span>
                <div className="text-2xl font-black text-slate-900 mt-1">{stats?.totalJobs || 0}</div>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Jobs</span>
                <div className="text-2xl font-black text-emerald-600 mt-1">{stats?.completedJobs || 0}</div>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div 
              onClick={() => setActiveTab('poster')}
              className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between cursor-pointer hover:border-indigo-200 transition-all group"
            >
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer Portal QR</span>
                <div className="text-xs font-mono font-bold text-indigo-600 mt-1 group-hover:underline">
                  View & Print Poster →
                </div>
              </div>
              <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <QrCode className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Pricing Setup Grid */}
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <IndianRupee className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Per-Page Rate Setup</h2>
                <p className="text-xs text-slate-400">Configure customer self-service printing rates</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePricing} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    B&W Mono Rate (₹ / Page)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={bwPrice}
                    onChange={(e) => setBwPrice(e.target.value)}
                    className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Full Color Rate (₹ / Page)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={colorPrice}
                    onChange={(e) => setColorPrice(e.target.value)}
                    className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider flex justify-center items-center gap-2 transition-all shadow-md shadow-indigo-600/20"
              >
                <Save className="w-4 h-4" /> Save Pricing Rules
              </button>
              {saveSuccess && (
                <p className="text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1.5 mt-2">
                  <CheckCircle2 className="w-4 h-4" /> Pricing updated live across all QR portals!
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: COUNTER QR CODE & READY-TO-PRINT POSTER GENERATOR                  */}
      {/* ========================================================================= */}
      {activeTab === 'poster' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 print:hidden">
            <div>
              <h2 className="text-lg font-black text-slate-900">Counter Poster & Standee Generator</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Print this A4 poster, laminate it, and display it on your counter for instant customer self-service.
              </p>
            </div>
            <button
              onClick={handlePrintPoster}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <Printer className="w-4 h-4" /> Print / Save Poster
            </button>
          </div>

          {/* Printable A4 Poster Layout */}
          <div className="max-w-xl mx-auto bg-white p-10 rounded-3xl shadow-2xl border-4 border-indigo-600 text-center space-y-6 print:border-none print:shadow-none print:p-0 print:max-w-none">
            {/* Header Branding */}
            <div className="space-y-2 border-b-2 border-slate-100 pb-4">
              <div className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5" /> Instant Self-Service Printing
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">{stats?.shopName}</h1>
              <p className="text-xs text-slate-500 font-medium">Scan with your phone camera to print documents & photos directly</p>
            </div>

            {/* High-Resolution Counter QR Code */}
            <div className="p-6 bg-slate-50 rounded-3xl inline-block border-2 border-dashed border-indigo-200">
              <QRCodeSVG
                value={publicPrintUrl}
                size={240}
                level="H"
                includeMargin={true}
              />
              <p className="text-[11px] font-mono text-slate-400 mt-2 font-bold">{publicPrintUrl}</p>
            </div>

            {/* Price Table Badges */}
            <div className="grid grid-cols-2 gap-4 text-center max-w-sm mx-auto">
              <div className="p-4 bg-slate-900 text-white rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Black & White</span>
                <span className="text-2xl font-black">₹{stats?.pricing?.bwPerPage}/page</span>
              </div>
              <div className="p-4 bg-indigo-600 text-white rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-indigo-200 block tracking-wider">Full Color</span>
                <span className="text-2xl font-black">₹{stats?.pricing?.colorPerPage}/page</span>
              </div>
            </div>

            {/* 3 Simple Steps for Customer */}
            <div className="grid grid-cols-3 gap-3 text-left pt-2 border-t-2 border-slate-100 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl">
                <span className="text-indigo-600 font-black text-sm block">1</span>
                <p className="font-bold text-slate-800">Scan QR</p>
                <p className="text-[10px] text-slate-400 font-normal">Use any phone camera or scanner</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl">
                <span className="text-indigo-600 font-black text-sm block">2</span>
                <p className="font-bold text-slate-800">Upload Files</p>
                <p className="text-[10px] text-slate-400 font-normal">Select PDFs, docs, or photos</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl">
                <span className="text-indigo-600 font-black text-sm block">3</span>
                <p className="font-bold text-slate-800">Collect Prints</p>
                <p className="text-[10px] text-slate-400 font-normal">Prints come out automatically</p>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 font-medium">
              Powered by <span className="font-bold text-indigo-600">AUTOPRINT</span> • Zero-Touch Cloud Spooler
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PRINTER MANAGEMENT & CLOUD ROUTING MATRIX                          */}
      {/* ========================================================================= */}
      {activeTab === 'printers' && (
        <div className="space-y-6 print:hidden">
          {/* Agent Download Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 rounded-3xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
            <div className="space-y-1 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black uppercase tracking-wider border border-indigo-400/20">
                <Sparkles className="w-3.5 h-3.5" /> Headless Desktop Service
              </div>
              <h2 className="text-xl font-black">AUTOPRINT Background Agent (Windows)</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Run this silent agent on the Windows PC connected to your printers. It runs 100% in the background without any local browser window, discovers your printers, and prints orders instantly.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`${SERVER_URL}/api/dashboard/download-agent`}
                download="KluffPrintAgent.exe"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30 active:scale-95"
              >
                <Download className="w-4 h-4" /> Download Agent (.exe)
              </a>
              <a
                href={`${SERVER_URL}/api/dashboard/agent-config`}
                download="config.json"
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-3 rounded-xl border border-white/10 flex items-center gap-2 transition-all active:scale-95"
                title="Download preconfigured config.json file with your shop token"
              >
                <FileText className="w-4 h-4" /> Shop Config (.json)
              </a>
            </div>
          </div>

          {/* Live Agent Status & Discovered Printers Panel */}
          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-3.5 h-3.5 rounded-full ${isAgentOnline ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse' : 'bg-amber-400'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900">
                    Desktop Agent: {isAgentOnline ? 'Connected & Ready' : 'Offline / Waiting for PC'}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    isAgentOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {isAgentOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isAgentOnline
                    ? 'Silent background service is listening for print jobs on your shop PC.'
                    : 'Launch KluffPrintAgent.exe on your shop PC to auto-connect and sync printers.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Discovered Printers ({availablePrinters.length}):</span>
              {availablePrinters.length > 0 ? (
                availablePrinters.map((pName, idx) => (
                  <span key={idx} className="px-2.5 py-1 bg-slate-100 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 flex items-center gap-1.5">
                    <Printer className="w-3 h-3 text-slate-500" />
                    {pName}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400 italic">No printers reported yet</span>
              )}
            </div>
          </div>

          {/* Task-Based Printer Routing Matrix Card */}
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-black text-slate-900">Task-Based Printer Routing</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Assign which physical printer handles each document type. All orders are automatically dispatched without touching the PC.
                </p>
              </div>

              {saveRoutingSuccess && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Routing saved & pushed to Desktop Agent!
                </div>
              )}
            </div>

            <form onSubmit={handleSaveRouting} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. B&W Mono */}
                <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white">
                      B&W Monochrome
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">A4 / Letter / Legal</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Standard black and white documents</p>
                  <select
                    value={printerRouting.bwPrinter || ''}
                    onChange={(e) => setPrinterRouting({ ...printerRouting, bwPrinter: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl p-3 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">(Default / Fallback Printer)</option>
                    {availablePrinters.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                    {printerRouting.bwPrinter && !availablePrinters.includes(printerRouting.bwPrinter) && (
                      <option value={printerRouting.bwPrinter}>{printerRouting.bwPrinter} (Saved)</option>
                    )}
                  </select>
                </div>

                {/* 2. Full Color */}
                <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-red-500 via-amber-500 to-blue-500 text-white">
                      Full Color
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Color Prints</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Presentations, charts, and color docs</p>
                  <select
                    value={printerRouting.colorPrinter || ''}
                    onChange={(e) => setPrinterRouting({ ...printerRouting, colorPrinter: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl p-3 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">(Default / Fallback Printer)</option>
                    {availablePrinters.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                    {printerRouting.colorPrinter && !availablePrinters.includes(printerRouting.colorPrinter) && (
                      <option value={printerRouting.colorPrinter}>{printerRouting.colorPrinter} (Saved)</option>
                    )}
                  </select>
                </div>

                {/* 3. A3 Medium */}
                <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white">
                      A3 Size
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Medium Sheets</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Drawings, posters, and A3 spreadsheets</p>
                  <select
                    value={printerRouting.a3Printer || ''}
                    onChange={(e) => setPrinterRouting({ ...printerRouting, a3Printer: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl p-3 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">(Default / Fallback Printer)</option>
                    {availablePrinters.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                    {printerRouting.a3Printer && !availablePrinters.includes(printerRouting.a3Printer) && (
                      <option value={printerRouting.a3Printer}>{printerRouting.a3Printer} (Saved)</option>
                    )}
                  </select>
                </div>

                {/* 4. A2 Large */}
                <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white">
                      A2 Size
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Large Format</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Engineering plans, blueprints, A2 sheets</p>
                  <select
                    value={printerRouting.a2Printer || ''}
                    onChange={(e) => setPrinterRouting({ ...printerRouting, a2Printer: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl p-3 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">(Default / Fallback Printer)</option>
                    {availablePrinters.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                    {printerRouting.a2Printer && !availablePrinters.includes(printerRouting.a2Printer) && (
                      <option value={printerRouting.a2Printer}>{printerRouting.a2Printer} (Saved)</option>
                    )}
                  </select>
                </div>

                {/* 5. A1 Extra Large */}
                <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white">
                      A1 Size
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Poster Format</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Big architectural drawings and A1 banners</p>
                  <select
                    value={printerRouting.a1Printer || ''}
                    onChange={(e) => setPrinterRouting({ ...printerRouting, a1Printer: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl p-3 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">(Default / Fallback Printer)</option>
                    {availablePrinters.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                    {printerRouting.a1Printer && !availablePrinters.includes(printerRouting.a1Printer) && (
                      <option value={printerRouting.a1Printer}>{printerRouting.a1Printer} (Saved)</option>
                    )}
                  </select>
                </div>

                {/* 6. Photo Paper */}
                <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                      Photo Prints
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Glossy Paper</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Dedicated photo printer or glossy tray</p>
                  <select
                    value={printerRouting.photoPrinter || ''}
                    onChange={(e) => setPrinterRouting({ ...printerRouting, photoPrinter: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl p-3 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">(Default / Fallback Printer)</option>
                    {availablePrinters.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                    {printerRouting.photoPrinter && !availablePrinters.includes(printerRouting.photoPrinter) && (
                      <option value={printerRouting.photoPrinter}>{printerRouting.photoPrinter} (Saved)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* 7. Default Fallback Printer */}
              <div className="p-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white">
                    Default Fallback Printer
                  </span>
                  <span className="text-[10px] text-indigo-600 font-bold">Primary Workhorse</span>
                </div>
                <p className="text-xs text-slate-500 font-medium">Used when no specific category printer is selected or available</p>
                <select
                  value={printerRouting.defaultPrinter || ''}
                  onChange={(e) => setPrinterRouting({ ...printerRouting, defaultPrinter: e.target.value })}
                  className="w-full text-xs font-bold border border-indigo-200 rounded-xl p-3 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select Default Printer...</option>
                  {availablePrinters.map((p, i) => (
                    <option key={i} value={p}>{p}</option>
                  ))}
                  {printerRouting.defaultPrinter && !availablePrinters.includes(printerRouting.defaultPrinter) && (
                    <option value={printerRouting.defaultPrinter}>{printerRouting.defaultPrinter} (Saved)</option>
                  )}
                </select>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingRouting}
                  className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs px-8 py-4 rounded-2xl flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all uppercase tracking-wider"
                >
                  {savingRouting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving & Syncing...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Printer Routing</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LIVE QUEUE & PRINT HISTORY                                         */}
      {/* ========================================================================= */}
      {activeTab === 'queue' && (
        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Real-Time Print Queue & History</h2>
              <p className="text-xs text-slate-400">Incoming documents and historical customer jobs</p>
            </div>
            <button
              onClick={fetchHistory}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors border border-slate-200/60 flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-medium space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300" />
              <p>No print jobs in the queue yet. Scan your counter QR to test!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                    <th className="pb-3">Job Ref</th>
                    <th className="pb-3">Document</th>
                    <th className="pb-3">Settings</th>
                    <th className="pb-3">Pages / Copies</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentJobs.map((job) => (
                    <tr key={job.jobId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 font-mono font-bold text-slate-900">
                        #{job.jobId?.substring(0, 8)}
                      </td>
                      <td className="py-3 font-medium text-slate-800">
                        <div className="flex items-center gap-2 truncate max-w-[180px]">
                          {job.jobType === 'photo' ? (
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          )}
                          <span className="truncate">{job.originalFileName}</span>
                        </div>
                      </td>
                      <td className="py-3 uppercase text-[11px] font-bold text-slate-600">
                        {job.colorMode === 'color' ? '🎨 Color' : '⬛ B&W'} • {job.paperSize || 'A4'}
                      </td>
                      <td className="py-3 font-medium text-slate-600">
                        {job.pageCount} pg × {job.copies} copy
                      </td>
                      <td className="py-3 font-bold text-slate-900">
                        ₹{job.totalPrice}
                      </td>
                      <td className="py-3">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                            job.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : job.status === 'PRINTING'
                              ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 animate-pulse'
                              : job.status === 'FAILED'
                              ? 'bg-rose-50 text-rose-600 border border-rose-100'
                              : 'bg-amber-50 text-amber-600 border border-amber-100'
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="py-3 text-[11px] text-slate-400">
                        {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Floating Live Agent Health Indicator in bottom-right corner */}
      <div 
        onClick={() => setActiveTab('printers')}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 px-4 py-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 text-xs font-bold transition-all hover:scale-105 cursor-pointer select-none print:hidden"
        title="Click to view desktop agent & printer routing"
      >
        <span className="relative flex h-3 w-3">
          {isAgentOnline && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isAgentOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} />
        </span>
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-slate-400 font-semibold leading-tight">Desktop Agent</span>
          <span className={`font-black text-xs leading-tight ${isAgentOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
            {isAgentOnline ? 'Online & Ready' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
}