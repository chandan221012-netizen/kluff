import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, KeyRound, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { SERVER_URL } from '../config';

export default function FounderLogin() {
  const navigate = useNavigate();
  const [masterKey, setMasterKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!masterKey.trim()) {
      setError('Please enter the Founder Secret Key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${SERVER_URL}/api/founder/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: masterKey.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      localStorage.setItem('founderToken', data.token);
      navigate('/founder');
    } catch (err) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-radial from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Founder Control Center
            </h1>
            <p className="text-xs font-medium text-slate-400">
              Master platform administration & remote software management
            </p>
          </div>

          {/* Error notice */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Founder Master Key</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={masterKey}
                  onChange={(e) => setMasterKey(e.target.value)}
                  placeholder="Enter master security key..."
                  required
                  autoFocus
                  className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-amber-500 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-500 outline-none transition-all"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-500 pl-1">
                Default dev key: <code className="text-slate-400 font-mono">kluff_founder_secret_2026</code>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Access Master Control</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="pt-2 text-center">
            <a
              href="/dashboard"
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Switch to Shop Owner Dashboard →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
