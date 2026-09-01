import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import io from 'socket.io-client';
import jsQR from 'jsqr';
import { 
  QrCode, IndianRupee, Printer, Save, Plus, Loader2, 
  CheckCircle2, TrendingUp, Layers, Activity, RefreshCw, AlertCircle, Play, Pause,
  Download, Printer as PrintIcon, LogOut, FileText, Image as ImageIcon, Sparkles, Trash2,
  Wallet, Upload, Check, X
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


  const token = localStorage.getItem('ownerToken') || '';

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, []);

  // Connect socket for real-time live print queue updates
  useEffect(() => {
    if (!stats?.qrToken) return;

    const socket = io(SERVER_URL);
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

  // If dashboard is opened on localhost on laptop, generate the QR with the machine's LAN IP
  // so scanning with a phone camera opens the phone-accessible network address!
  const origin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `${window.location.protocol}//10.192.119.121:${window.location.port || '5173'}`
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
              <PrintIcon className="w-4 h-4" /> Print / Save Poster
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
      {/* TAB 3: PRINTER MANAGEMENT                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'printers' && (
        <div className="space-y-6 print:hidden">
          {/* Agent Download Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 rounded-3xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
            <div className="space-y-1 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black uppercase tracking-wider border border-indigo-400/20">
                <Sparkles className="w-3.5 h-3.5" /> Desktop Spooler Software
              </div>
              <h2 className="text-xl font-black">AUTOPRINT Desktop Agent (Windows)</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Run this standalone software on the PC connected to your printers. It runs silently, automatically discovers your printers, and prints orders instantly without touching the keyboard.
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pair Printer Form */}
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-slate-100 text-slate-800 rounded-xl">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Pair OS System Printer</h2>
                <p className="text-xs text-slate-400">Connect a printer registered in Windows Spooler</p>
              </div>
            </div>

            <form onSubmit={handleAddPrinter} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Display Label (Customer UI)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Front Counter Laser Printer"
                  value={newPrinterName}
                  onChange={(e) => setNewPrinterName(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Exact Windows Printer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. HP LaserJet Pro M404"
                  value={systemPrinterName}
                  onChange={(e) => setSystemPrinterName(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="isColor"
                  checked={isColor}
                  onChange={(e) => setIsColor(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="isColor" className="text-xs font-semibold text-slate-600">
                  Supports Full Color Printing
                </label>
              </div>
              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider flex justify-center items-center gap-2 transition-all shadow-md shadow-slate-900/10"
              >
                <Plus className="w-4 h-4" /> Add Printer Node
              </button>
            </form>
          </div>

          {/* Printer List */}
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <h2 className="text-base font-bold text-slate-900 mb-4">Active Hardware Devices</h2>
            <div className="space-y-3">
              {stats?.printers?.map((p) => (
                <div key={p.printerId} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <h3 className="font-bold text-slate-900">{p.name}</h3>
                    <p className="font-mono text-[11px] text-slate-400 mt-0.5">{p.systemPrinterName}</p>
                    <span className="text-[10px] text-slate-500 mt-1 inline-block">
                      {p.isColorSupported ? 'Full Color & B&W' : 'B&W Monochrome Only'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                      {p.status || 'ONLINE'}
                    </span>
                    <button
                      onClick={() => handleDeletePrinter(p.printerId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Remove Printer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
    </div>
  );
}