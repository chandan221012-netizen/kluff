import React, { useState, useEffect } from 'react';
import { 
  QrCode, IndianRupee, Printer, Save, Plus, Loader2, 
  CheckCircle2, TrendingUp, Layers, Activity, RefreshCw, AlertCircle, Play, Pause
} from 'lucide-react';

const SERVER_URL = 'http://localhost:5000';

export default function ShopDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'queue' | 'printers'

  // Form states
  const [bwPrice, setBwPrice] = useState(2);
  const [colorPrice, setColorPrice] = useState(10);
  const [newPrinterName, setNewPrinterName] = useState('');
  const [systemPrinterName, setSystemPrinterName] = useState('');
  const [isColor, setIsColor] = useState(false);

  const token = localStorage.getItem('ownerToken') || '';

  useEffect(() => {
    fetchStats();
  }, []);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              ● Online Relay
            </span>
            <span className="text-xs text-slate-400">ID: {stats?.qrToken}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{stats?.shopName}</h1>
          <p className="text-xs text-slate-400 font-medium">Terminal Spooling Hub & Queue Manager</p>
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
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-bold gap-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Overview & Metrics
        </button>
        <button
          onClick={() => setActiveTab('printers')}
          className={`pb-3 transition-colors border-b-2 ${
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

            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer Link</span>
                <div className="text-xs font-mono font-bold text-indigo-600 mt-1 truncate max-w-[150px]">
                  /print/{stats?.qrToken}
                </div>
              </div>
              <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl">
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
                <p className="text-xs text-slate-400">Configure public customer printing costs</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePricing} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    B&W Rate (₹ / Page)
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
                    Color Rate (₹ / Page)
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
                  <CheckCircle2 className="w-4 h-4" /> Rates updated live!
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PRINTER MANAGEMENT                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'printers' && (
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
                  Supports Color Printing
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
                      {p.isColorSupported ? 'Color & B&W' : 'B&W Only'}
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}