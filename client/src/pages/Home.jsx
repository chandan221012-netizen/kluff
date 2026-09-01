import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Printer, QrCode, Zap, Layers, ShieldCheck, ArrowRight, 
  Store, Smartphone, Cpu, CheckCircle2, Sparkles, TrendingUp,
  FileUp, Palette
} from 'lucide-react';

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-16">
      {/* Top Navbar */}
      <header className="flex items-center justify-between bg-white p-5 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-600/30">
            A
          </div>
          <div>
            <span className="text-xl font-black text-slate-900 tracking-tight">AUTOPRINT</span>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Zero-Touch Cloud Printing</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200/60"
          >
            Shop Login
          </Link>
          <Link
            to="/register"
            className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
          >
            Register Shop <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" /> Next-Gen Photocopy & Print Shop SaaS
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
          Digitize Your Counter with <span className="text-indigo-600">Zero-Touch</span> QR Printing
        </h1>

        <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
          Say goodbye to chaotic WhatsApp queues and USB drives. Display your unique shop counter QR code—customers scan, upload multiple files, customize print rules, pay, and prints spool directly to your physical printers.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            to="/register"
            className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
          >
            Onboard Your Shop Free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/test"
            className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-2xl border border-slate-200 shadow-sm transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
          >
            <Smartphone className="w-4 h-4 text-indigo-600" /> Try Customer QR Demo
          </Link>
        </div>
      </section>

      {/* 4-Step Interactive Architecture */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900">How AUTOPRINT Works</h2>
          <p className="text-xs text-slate-400">Complete end-to-end automation from scan to tray</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black">
              1
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Register & Setup Rates</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create your shop profile in 60 seconds. Set dynamic per-page pricing for B&W and Color printing.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black">
              2
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Generate Counter Poster</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Print your high-res A4 counter poster with embedded QR code, laminated instructions, and rate cards.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black">
              3
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Connect Windows Agent</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Run the lightweight background desktop agent on your counter PC to link physical spoolers via WebSockets.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-3">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black">
              4
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Zero-Touch Printing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Customers scan, upload batches, pay via UPI/counter, and files automatically route to your laser/inkjet printers.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="bg-slate-900 text-white p-10 sm:p-14 rounded-3xl shadow-2xl space-y-8">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-950 px-3 py-1 rounded-full border border-indigo-800">
            Enterprise Grade Engine
          </span>
          <h2 className="text-3xl font-black tracking-tight">Engineered for Busy High-Volume Print Shops</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
          <div className="p-6 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <Layers className="w-6 h-6 text-indigo-400" />
            <h3 className="font-bold text-sm">Multi-File Batch Queue</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Customers select multiple PDFs, Word documents, and photos at once. Spooled sequentially without page overlap.
            </p>
          </div>

          <div className="p-6 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <Cpu className="w-6 h-6 text-indigo-400" />
            <h3 className="font-bold text-sm">Multi-Printer Dynamic Routing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Auto-routes high-speed B&W documents to Mono Laser printers and full-color graphics to dedicated Inkjet printers.
            </p>
          </div>

          <div className="p-6 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <Palette className="w-6 h-6 text-indigo-400" />
            <h3 className="font-bold text-sm">Smart Image Pre-Processing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Raw photos and screenshots are automatically fitted and centered into standard A4 PDF pages using pdf-lib before spooling.
            </p>
          </div>

          <div className="p-6 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <QrCode className="w-6 h-6 text-indigo-400" />
            <h3 className="font-bold text-sm">Instant Counter Posters</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              One-click downloadable and printable A4 counter standees with dynamic QR codes and live pricing rules.
            </p>
          </div>

          <div className="p-6 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            <h3 className="font-bold text-sm">Real-Time Revenue Analytics</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Live tracking of daily page volumes, completed jobs, and cash/UPI revenue totals directly in your owner dashboard.
            </p>
          </div>

          <div className="p-6 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            <h3 className="font-bold text-sm">Auto-Cleanup & Privacy</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Background cron jobs automatically purge temporary spool files to ensure complete customer privacy and save disk space.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-slate-400 border-t border-slate-200">
        <p>© 2026 AUTOPRINT SaaS Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
