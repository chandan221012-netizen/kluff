import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Power,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  IndianRupee,
  Store,
  Monitor,
  Printer,
  Sliders,
  Copy,
  Check,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Clock,
  RotateCcw,
  Sparkles,
  ChevronRight,
  TrendingUp,
  FileText
} from 'lucide-react';
import { SERVER_URL } from '../config';

export default function FounderDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem('founderToken');

  const [overview, setOverview] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [copiedToken, setCopiedToken] = useState('');

  // Modals state
  const [activeShopModal, setActiveShopModal] = useState(null); // 'SUBSCRIPTION' | 'EDIT' | null
  const [selectedShop, setSelectedShop] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states for modals
  const [subForm, setSubForm] = useState({
    planName: 'STARTER',
    expiresAt: '',
    maxMonthlyPages: 1000,
    autoTerminateOnLimit: true
  });

  const [editForm, setEditForm] = useState({
    name: '',
    ownerName: '',
    email: '',
    contactPhone: '',
    address: '',
    bwPerPage: 2.0,
    colorPerPage: 10.0,
    isActive: true
  });

  // Redirect if no founder token
  useEffect(() => {
    if (!token) {
      navigate('/founder/login');
    }
  }, [token, navigate]);

  // Fetch overview & shops
  const fetchData = useCallback(async (showRefreshAnim = false) => {
    if (!token) return;
    if (showRefreshAnim) setRefreshing(true);

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };

      const [resOverview, resShops] = await Promise.all([
        fetch(`${SERVER_URL}/api/founder/overview`, { headers }),
        fetch(`${SERVER_URL}/api/founder/shops`, { headers })
      ]);

      if (resOverview.status === 401 || resShops.status === 401) {
        localStorage.removeItem('founderToken');
        navigate('/founder/login');
        return;
      }

      const dataOverview = await resOverview.json();
      const dataShops = await resShops.json();

      if (dataOverview.success) setOverview(dataOverview.metrics);
      if (dataShops.success) setShops(dataShops.shops || []);
    } catch (err) {
      console.error('[Founder Fetch Error]:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live WebSocket updates
  useEffect(() => {
    const socket = io(SERVER_URL);

    socket.on('agent-status-update', () => {
      fetchData();
    });

    socket.on('batch-status-update', () => {
      fetchData();
    });

    return () => socket.disconnect();
  }, [fetchData]);

  // Handle Remote Lock / Killswitch toggle
  const handleToggleRemoteLock = async (shop) => {
    const isLocked = shop.subscription?.isRemoteLocked;
    const actionName = isLocked ? 'UNFREEZE / RESUME' : 'FREEZE / KILL';
    const confirmMsg = isLocked
      ? `Resume printing service for ${shop.name}? The desktop agent will resume processing jobs.`
      : `ACTIVATE KILLSWITCH for ${shop.name}?\n\nThis will immediately LOCK their desktop software and reject all customer print jobs!`;

    if (!window.confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/founder/shops/${shop.shopId}/remote-lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lock: !isLocked,
          reason: !isLocked ? 'Manually frozen by platform founder' : ''
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Action failed');
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to toggle killswitch');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Subscription Modal
  const openSubModal = (shop) => {
    setSelectedShop(shop);
    const sub = shop.subscription || {};
    const expDate = sub.expiresAt ? new Date(sub.expiresAt).toISOString().split('T')[0] : '';
    setSubForm({
      planName: sub.planName || 'STARTER',
      expiresAt: expDate,
      maxMonthlyPages: sub.maxMonthlyPages || 1000,
      autoTerminateOnLimit: sub.autoTerminateOnLimit ?? true
    });
    setActiveShopModal('SUBSCRIPTION');
  };

  // Save Subscription
  const handleSaveSubscription = async (e) => {
    e.preventDefault();
    if (!selectedShop) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/founder/shops/${selectedShop.shopId}/subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(subForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update subscription');
      setActiveShopModal(null);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to update subscription');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Details Modal
  const openEditModal = (shop) => {
    setSelectedShop(shop);
    setEditForm({
      name: shop.name || '',
      ownerName: shop.ownerName || '',
      email: shop.email || '',
      contactPhone: shop.contactPhone || '',
      address: shop.address || '',
      bwPerPage: shop.pricing?.bwPerPage ?? 2.0,
      colorPerPage: shop.pricing?.colorPerPage ?? 10.0,
      isActive: shop.isActive ?? true
    });
    setActiveShopModal('EDIT');
  };

  // Save Shop Details
  const handleSaveDetails = async (e) => {
    e.preventDefault();
    if (!selectedShop) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/founder/shops/${selectedShop.shopId}/details`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update shop');
      setActiveShopModal(null);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to update shop');
    } finally {
      setActionLoading(false);
    }
  };

  // Reset Monthly Quota Counter
  const handleResetQuota = async (shop) => {
    if (!window.confirm(`Reset monthly page counter for ${shop.name} to 0 pages?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/founder/shops/${shop.shopId}/reset-quota`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Reset failed');
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to reset quota');
    } finally {
      setActionLoading(false);
    }
  };

  // Regenerate QR Token
  const handleRegenerateToken = async (shop) => {
    if (!window.confirm(`Generate a brand new QR Token for ${shop.name}?\n\nThe previous QR code will immediately stop working!`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/founder/shops/${shop.shopId}/reset-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Token reset failed');
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to reset token');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(''), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem('founderToken');
    navigate('/founder/login');
  };

  // Filtered Shops
  const filteredShops = shops.filter((shop) => {
    const q = searchQuery.toLowerCase();
    const matchQuery =
      shop.name.toLowerCase().includes(q) ||
      shop.ownerName.toLowerCase().includes(q) ||
      shop.shopId.toLowerCase().includes(q) ||
      shop.qrToken.toLowerCase().includes(q) ||
      (shop.device?.deviceId || '').toLowerCase().includes(q);

    if (!matchQuery) return false;

    if (statusFilter === 'ACTIVE') return shop.isActive && !shop.subscription?.isRemoteLocked && !shop.subscription?.isExpired;
    if (statusFilter === 'LOCKED') return shop.subscription?.isRemoteLocked;
    if (statusFilter === 'EXPIRED') return shop.subscription?.isExpired;
    if (statusFilter === 'ONLINE') return shop.device?.status === 'ONLINE';

    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Loading Founder Master Control...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      
      {/* TOP MASTER BAR */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white">
                  KLUFF FOUNDER CONTROL
                </h1>
                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Master Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Full infrastructure visibility, live software killswitch & quota engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-all flex items-center gap-2 active:scale-95"
              title="Refresh Live Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 active:scale-95"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* KPI OVERVIEW CARDS */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* Total Revenue */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Platform Revenue</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ₹{(overview.totalGrossRevenue || 0).toLocaleString()}
                </div>
                <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="text-emerald-400 font-semibold">Today: ₹{(overview.todayRevenue || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Total Pages */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pages Printed</span>
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {(overview.totalPagesPrinted || 0).toLocaleString()}
                </div>
                <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-2">
                  <span>BW: <strong className="text-slate-200">{overview.bwPages || 0}</strong></span>
                  <span>•</span>
                  <span>Color: <strong className="text-amber-300">{overview.colorPages || 0}</strong></span>
                </div>
              </div>
            </div>

            {/* Registered Shops */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered Shops</span>
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <Store className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {overview.totalShops}
                </div>
                <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-2">
                  <span className="text-emerald-400 font-semibold">{overview.activeShops} Active</span>
                  <span>•</span>
                  <span className="text-rose-400 font-semibold">{overview.lockedShops} Frozen</span>
                </div>
              </div>
            </div>

            {/* Desktop Agents */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Software Agents</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Monitor className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {overview.agentsOnline} <span className="text-sm font-normal text-slate-500">/ {overview.totalAgents}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-slate-300 font-medium">{overview.agentsOnline} connected online</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SEARCH, FILTER & ACTION BAR */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shops, owners, IDs, tokens..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/80 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {[
              { id: 'ALL', label: 'All Shops' },
              { id: 'ACTIVE', label: 'Active' },
              { id: 'ONLINE', label: 'Agents Online' },
              { id: 'LOCKED', label: 'Remote Frozen' },
              { id: 'EXPIRED', label: 'Expired Plan' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  statusFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* MASTER SHOPS DIRECTORY TABLE */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Shop & Owner</th>
                  <th className="py-3.5 px-4">Assigned Tokens</th>
                  <th className="py-3.5 px-4">Software & Hardware</th>
                  <th className="py-3.5 px-4">Printed / Quota</th>
                  <th className="py-3.5 px-4">Gross Revenue</th>
                  <th className="py-3.5 px-4">Plan & Expiry</th>
                  <th className="py-3.5 px-4 text-center">Killswitch Control</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredShops.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No shops found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredShops.map((shop) => {
                    const sub = shop.subscription;
                    const isLocked = sub?.isRemoteLocked;
                    const maxPages = sub?.maxMonthlyPages || 0;
                    const currentPages = sub?.currentMonthPages || 0;
                    const pct = maxPages > 0 ? Math.min(100, Math.round((currentPages / maxPages) * 100)) : 0;

                    return (
                      <tr
                        key={shop.shopId}
                        className={`hover:bg-slate-800/30 transition-colors ${
                          isLocked ? 'bg-rose-950/10' : ''
                        }`}
                      >
                        {/* Shop & Owner Info */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{shop.name}</span>
                              {!shop.isActive && (
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">Inactive</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-300 font-medium">
                              {shop.ownerName}
                            </div>
                            <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-slate-600" />
                                {shop.email}
                              </span>
                              {shop.contactPhone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-600" />
                                  {shop.contactPhone}
                                </span>
                              )}
                              {shop.address && (
                                <span className="flex items-center gap-1 truncate max-w-xs" title={shop.address}>
                                  <MapPin className="w-3 h-3 text-slate-600 shrink-0" />
                                  {shop.address}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Tokens */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-2">
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Shop ID</span>
                              <code className="text-slate-300 font-mono text-[11px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                {shop.shopId}
                              </code>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Counter QR Token</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <code className="text-amber-400 font-mono text-[11px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 truncate max-w-[120px]">
                                  {shop.qrToken}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(shop.qrToken, shop.shopId)}
                                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                                  title="Copy Token"
                                >
                                  {copiedToken === shop.shopId ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <a
                                  href={`/print/${shop.qrToken}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                                  title="Open Customer QR Page"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Software & Hardware Device */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  shop.device?.status === 'ONLINE'
                                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse'
                                    : 'bg-slate-600'
                                }`}
                              />
                              <span className="font-semibold text-white">
                                {shop.device?.deviceName || 'Windows Desktop'}
                              </span>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  shop.device?.status === 'ONLINE'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {shop.device?.status || 'OFFLINE'}
                              </span>
                            </div>

                            <div className="text-[10px] text-slate-400">
                              Dev ID: <code className="text-slate-300 font-mono">{shop.device?.deviceId || 'DEV_PENDING'}</code>
                            </div>

                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Printer className="w-3 h-3 text-slate-600" />
                              <span>
                                {shop.availablePrinters?.length || 0} printer(s) mapped
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Printed Pages / Quota */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold text-white">
                              <span>{currentPages} pgs</span>
                              <span className="text-[10px] font-normal text-slate-400">
                                {maxPages > 0 ? `/ ${maxPages} max` : 'Unlimited'}
                              </span>
                            </div>

                            {maxPages > 0 && (
                              <div className="w-28 bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                                <div
                                  className={`h-full transition-all ${
                                    pct >= 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}

                            <div className="text-[10px] text-slate-500">
                              Lifetime: <strong className="text-slate-300">{shop.analytics.totalPagesPrinted} pgs</strong>
                            </div>
                          </div>
                        </td>

                        {/* Gross Revenue */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1">
                            <div className="text-sm font-black text-emerald-400">
                              ₹{shop.analytics.totalRevenue.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {shop.analytics.completedJobs} jobs completed
                            </div>
                          </div>
                        </td>

                        {/* Plan & Expiry */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                sub?.planName === 'ENTERPRISE'
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                  : sub?.planName === 'PRO'
                                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {sub?.planName || 'STARTER'}
                            </span>

                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              <span>
                                {sub?.expiresAt
                                  ? new Date(sub.expiresAt).toLocaleDateString()
                                  : 'No Expiry'}
                              </span>
                            </div>

                            <div className="text-[10px]">
                              {sub?.isExpired ? (
                                <span className="text-rose-400 font-bold">Expired</span>
                              ) : sub?.daysRemaining !== undefined ? (
                                <span className="text-slate-500">{sub.daysRemaining} days left</span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        {/* Killswitch Control */}
                        <td className="py-4 px-4 align-top text-center">
                          <button
                            onClick={() => handleToggleRemoteLock(shop)}
                            disabled={actionLoading}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 mx-auto active:scale-95 ${
                              isLocked
                                ? 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300'
                            }`}
                            title={isLocked ? 'Software is FROZEN. Click to resume.' : 'Software is ACTIVE. Click to freeze.'}
                          >
                            {isLocked ? (
                              <>
                                <Lock className="w-3.5 h-3.5 text-rose-400" />
                                <span>FROZEN</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                                <span>ACTIVE</span>
                              </>
                            )}
                          </button>
                          {isLocked && sub?.lockReason && (
                            <span className="text-[9px] text-rose-400 block mt-1 max-w-[120px] mx-auto truncate" title={sub.lockReason}>
                              {sub.lockReason}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4 align-top text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openSubModal(shop)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-all"
                              title="Manage Plan & Monthly Quota"
                            >
                              Plan & Quota
                            </button>
                            <button
                              onClick={() => openEditModal(shop)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-all"
                              title="Edit Shop Details & Rates"
                            >
                              Details
                            </button>
                            <button
                              onClick={() => handleResetQuota(shop)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
                              title="Reset Monthly Counter to 0"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL 1: PLAN & QUOTA MANAGEMENT */}
      {activeShopModal === 'SUBSCRIPTION' && selectedShop && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">Subscription & Quota Engine</h3>
                <p className="text-xs text-slate-400">Configure remote limits for {selectedShop.name}</p>
              </div>
              <button
                onClick={() => setActiveShopModal(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSubscription} className="space-y-4 text-xs">
              {/* Plan Dropdown */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Subscription Tier</label>
                <select
                  value={subForm.planName}
                  onChange={(e) => setSubForm({ ...subForm, planName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                >
                  <option value="STARTER">Starter Tier</option>
                  <option value="PRO">Pro Tier</option>
                  <option value="ENTERPRISE">Enterprise Tier</option>
                  <option value="UNLIMITED">Unlimited Custom Tier</option>
                </select>
              </div>

              {/* Expiry Date */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Monthly Expiry Date</label>
                <input
                  type="date"
                  value={subForm.expiresAt}
                  onChange={(e) => setSubForm({ ...subForm, expiresAt: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                />
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 30);
                      setSubForm({ ...subForm, expiresAt: d.toISOString().split('T')[0] });
                    }}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg"
                  >
                    +30 Days (1 Month)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setFullYear(d.getFullYear() + 1);
                      setSubForm({ ...subForm, expiresAt: d.toISOString().split('T')[0] });
                    }}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg"
                  >
                    +1 Year (Annual)
                  </button>
                </div>
              </div>

              {/* Max Monthly Pages */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  Max Monthly Page Limit (Quota)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={subForm.maxMonthlyPages}
                    onChange={(e) => setSubForm({ ...subForm, maxMonthlyPages: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500 font-mono"
                    placeholder="e.g. 1000 (0 for unlimited)"
                  />
                  <button
                    type="button"
                    onClick={() => setSubForm({ ...subForm, maxMonthlyPages: 0 })}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl whitespace-nowrap text-[11px]"
                  >
                    Unlimited
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Current month usage: <strong>{selectedShop.subscription?.currentMonthPages || 0} pages</strong>
                </p>
              </div>

              {/* Auto Terminate Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={subForm.autoTerminateOnLimit}
                    onChange={(e) => setSubForm({ ...subForm, autoTerminateOnLimit: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800"
                  />
                  <span>Auto-freeze software when quota or subscription expires</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveShopModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  {actionLoading ? 'Saving...' : 'Apply Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT SHOP DETAILS & PRICING */}
      {activeShopModal === 'EDIT' && selectedShop && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">Edit Shop & Pricing Rates</h3>
                <p className="text-xs text-slate-400">{selectedShop.shopId}</p>
              </div>
              <button
                onClick={() => setActiveShopModal(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Shop Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Owner Name</label>
                  <input
                    type="text"
                    value={editForm.ownerName}
                    onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Email Address</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Contact Phone</label>
                  <input
                    type="text"
                    value={editForm.contactPhone}
                    onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                    placeholder="+91..."
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Shop Physical Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500"
                  placeholder="Street, City, State..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">B&W Rate / Page (₹)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editForm.bwPerPage}
                    onChange={(e) => setEditForm({ ...editForm, bwPerPage: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Color Rate / Page (₹)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editForm.colorPerPage}
                    onChange={(e) => setEditForm({ ...editForm, colorPerPage: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800"
                  />
                  <span>Shop Account Active</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleRegenerateToken(selectedShop)}
                  className="text-amber-400 hover:text-amber-300 font-semibold"
                >
                  Regenerate QR Token
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveShopModal(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                  >
                    {actionLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
