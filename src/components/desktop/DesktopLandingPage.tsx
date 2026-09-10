import React, { useState } from 'react';
import { 
  Flame, 
  Download, 
  Smartphone, 
  Apple, 
  ShieldCheck, 
  Lock, 
  QrCode, 
  MessageSquare, 
  Zap, 
  CheckCircle2, 
  Users, 
  Shield
} from 'lucide-react';
import { SuperAdminLoginModal } from './SuperAdminLoginModal';
import { User } from '../../types';

interface DesktopLandingPageProps {
  onLoginSuccess: (adminUser: User) => void;
  onOpenMobilePreview: () => void;
  allUsers: User[];
}

export const DesktopLandingPage: React.FC<DesktopLandingPageProps> = ({
  onLoginSuccess,
  onOpenMobilePreview,
  allUsers,
}) => {
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isDownloadingApk, setIsDownloadingApk] = useState(false);

  const handleDownloadApk = () => {
    setIsDownloadingApk(true);
    setTimeout(() => {
      setIsDownloadingApk(false);
      alert(
        'CampusFlow Android APK package is ready! When compiled via "npm run cap:build", find your installable APK at:\n\nandroid/app/build/outputs/apk/debug/app-debug.apk\n\nTransfer this file directly to your Android phone.'
      );
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* 1. TOP HEADER (Clean Stitch Navigation) */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md px-6 lg:px-12 py-3.5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-slate-900">CampusFlow</span>
                <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Mobile App
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Student Shared Ledger & Private Financial Vault</p>
            </div>
          </div>

          {/* Action Header Items */}
          <div className="flex items-center gap-3">
            {/* Direct Browser Mobile Preview Button */}
            <button
              onClick={onOpenMobilePreview}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors shadow-2xs"
            >
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              <span>Preview Mobile App</span>
            </button>

            {/* Super Admin Entry */}
            <button
              onClick={() => setIsAdminModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors shadow-2xs"
            >
              <Shield className="w-3.5 h-3.5 text-slate-600" />
              <span>Super Admin Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO & APP DOWNLOAD SHOWCASE */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-12 py-12 lg:py-20 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-12 items-center">
          {/* Left: Copy & Download CTAs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Native Experience for Android & iOS Phones</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight leading-[1.15]">
              Split room bills. <br />
              <span className="text-indigo-600">
                Keep personal spending 100% private.
              </span>
            </h1>

            <p className="text-base text-slate-600 max-w-xl leading-relaxed">
              Designed specifically for college students, flatmates, and hostel residents. Settle shared kitchen outlays and groceries with mathematical certainty while keeping your personal expenses completely shielded.
            </p>

            {/* Value checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Zero rounding drift ledger</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>1-Tap WhatsApp debt nudges</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Encrypted private expense vault</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Offline-first + Supabase sync</span>
              </div>
            </div>

            {/* App Downloads */}
            <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Android APK Download */}
              <button
                onClick={handleDownloadApk}
                disabled={isDownloadingApk}
                className="flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs active:scale-[0.98] transition-all"
              >
                {isDownloadingApk ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <div className="text-left">
                      <div className="text-[10px] text-emerald-100 uppercase tracking-wider font-semibold">Direct Sideload</div>
                      <div className="text-sm font-bold">Download Android APK</div>
                    </div>
                  </>
                )}
              </button>

              {/* iOS TestFlight */}
              <button
                onClick={() => alert('iOS TestFlight beta distribution link is managed via Xcode Cloud or Apple Developer Program.')}
                className="flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-xs active:scale-[0.98] transition-all"
              >
                <Apple className="w-4 h-4" />
                <div className="text-left">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Public Beta</div>
                  <div className="text-sm font-bold">Apple TestFlight</div>
                </div>
              </button>

              {/* QR Code */}
              <button
                onClick={() => setShowQrModal(true)}
                className="flex items-center justify-center p-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-colors"
                title="Scan QR code with phone"
              >
                <QrCode className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              *Runs on Android 8.0+ and iOS 15.0+. No Google Play account required to sideload APK.
            </p>
          </div>

          {/* Right: Natural Stitch Phone Preview Mockup */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-[310px] h-[640px] bg-slate-900 rounded-[44px] p-3 shadow-2xl border-4 border-slate-800">
              {/* Dynamic Island */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-950 rounded-full z-20" />

              {/* Inner Phone Screen (Stitch Clean Canvas) */}
              <div className="w-full h-full rounded-[34px] bg-[#F8FAFC] text-slate-900 overflow-hidden flex flex-col justify-between p-4 relative font-sans select-none border border-slate-200">
                <div className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Flat #402 • Green Glen</div>
                      <div className="text-base font-black text-slate-900">Room Balance Ledger</div>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                      AF
                    </div>
                  </div>

                  {/* Net Balance Card */}
                  <div className="p-3.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                    <div className="text-[11px] opacity-90 font-medium">You are owed overall</div>
                    <div className="text-2xl font-black mt-0.5 tabular-nums">₹1,240.00</div>
                    <div className="text-[10px] mt-1 bg-white/20 inline-block px-2 py-0.5 rounded-full font-medium">
                      3 Flatmates settle via UPI
                    </div>
                  </div>

                  {/* Roommates Ledger Items */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pending Settles</div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center border border-emerald-200">
                          RK
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">Rahul K.</div>
                          <div className="text-[10px] text-slate-500">Wi-Fi + Groceries</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-emerald-700">owes ₹620</div>
                        <div className="text-[9px] text-indigo-600 font-semibold">WhatsApp Nudge</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200">
                          AP
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">Aryan Patel</div>
                          <div className="text-[10px] text-slate-500">Gas Refill</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-emerald-700">owes ₹620</div>
                        <div className="text-[9px] text-indigo-600 font-semibold">WhatsApp Nudge</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom App Navigation */}
                <div className="bg-white rounded-xl p-2 border border-slate-200 shadow-xs flex items-center justify-around">
                  <div className="flex flex-col items-center text-indigo-600 text-[10px] font-bold">
                    <Users className="w-4 h-4" />
                    <span>Ledger</span>
                  </div>
                  <div className="flex flex-col items-center text-slate-400 text-[10px] font-medium">
                    <Lock className="w-4 h-4" />
                    <span>Vault</span>
                  </div>
                  <div className="flex flex-col items-center text-slate-400 text-[10px] font-medium">
                    <Zap className="w-4 h-4" />
                    <span>Activity</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. FEATURE HIGHLIGHTS (Stitch Cards Grid) */}
        <div className="mt-20 pt-12 border-t border-slate-200">
          <div className="text-center max-w-2xl mx-auto space-y-1.5 mb-10">
            <h2 className="text-2xl font-bold text-slate-900">
              Modern Utilities Built for Student Living
            </h2>
            <p className="text-xs text-slate-500">
              Eliminates flatmate friction, awkward payment chases, and messy spreadsheets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Mathematical Equi-Split</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Splits bills with integer-cent accuracy. Even when expenses are divided across 3, 4, or 7 flatmates, rounding discrepancies are safely assigned to prevent 1-paisa drift.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">WhatsApp 1-Tap Reminders</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Send polite payment nudges with instant UPI deep-links. Flatmates can tap once to launch Google Pay, PhonePe, or Paytm and settle without awkward chats.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">100% Private Expense Vault</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Personal expenses (food orders, shopping, books) remain in your private vault. Flatmates only see shared expenses created explicitly in the Room Ledger.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 4. CLEAN DEVELOPER FOOTER */}
      <footer className="border-t border-slate-200 bg-white px-6 lg:px-12 py-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            © {new Date().getFullYear()} CampusFlow Platform. All rights reserved.
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onOpenMobilePreview}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              Open Mobile Simulator
            </button>
            <span>•</span>
            <button
              onClick={() => setIsAdminModalOpen(true)}
              className="text-slate-700 hover:text-indigo-600 font-semibold transition-colors flex items-center gap-1"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Super Admin Console</span>
            </button>
          </div>
        </div>
      </footer>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-6 text-center space-y-4 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <QrCode className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Scan from Phone</h3>
            <p className="text-xs text-slate-500">
              Point your phone camera to download and install the Android APK directly on your device.
            </p>

            <div className="p-4 bg-slate-50 rounded-xl w-44 h-44 mx-auto flex items-center justify-center border border-slate-200">
              <div className="text-xs font-mono text-slate-500 text-center font-bold">
                [ CampusFlow APK URL ]
              </div>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {isAdminModalOpen && (
        <SuperAdminLoginModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          onLoginSuccess={onLoginSuccess}
          allUsers={allUsers}
        />
      )}
    </div>
  );
};
