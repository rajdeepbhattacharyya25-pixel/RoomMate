import React, { useState } from 'react';
import { Menu, X, Smartphone, Download, Lock, QrCode } from 'lucide-react';
import { useScrollProgress } from '../../lib/hooks/useScrollProgress';

interface LandingNavbarProps {
  onOpenMobilePreview: () => void;
  onOpenAdminModal: () => void;
  onOpenGuide: () => void;
  onDownloadApk: () => void;
  onOpenQrModal?: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({
  onOpenMobilePreview,
  onOpenAdminModal,
  onOpenGuide,
  onDownloadApk,
  onOpenQrModal,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollProgress, isScrolled } = useScrollProgress(20);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 backdrop-blur-md border-b border-brand-border ${
        isScrolled ? 'bg-white/95 shadow-fin-sm' : 'bg-white/85'
      }`}
      data-purpose="main-header"
    >
      {/* Top Scroll Progress Indicator */}
      <div
        className="absolute top-0 left-0 h-[2.5px] bg-gradient-to-r from-brand via-brand-dark to-emerald-500 transition-all duration-100 ease-out z-50"
        style={{ width: `${Math.round(scrollProgress * 100)}%` }}
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />

      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-all duration-300 ${
          isScrolled ? 'h-16' : 'h-20'
        }`}
      >
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <a aria-label="RoomMate Home" className="flex items-center gap-2.5 group focus:outline-hidden" href="#">
            <img
              src="/logo.png"
              alt="RoomMate"
              className="w-9 h-9 rounded-xl object-contain shadow-xs transform transition-transform group-hover:scale-105"
            />
            <span className="font-sans text-xl font-extrabold tracking-tight text-brand-charcoal">
              Room<span className="text-brand">Mate</span>
            </span>
          </a>
          <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand-slate bg-brand-soft px-2.5 py-1 rounded-full border border-brand-border">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Campus Financial Precision</span>
          </div>
        </div>

        {/* Desktop Nav Links */}
        <nav aria-label="Desktop Navigation" className="hidden md:flex items-center gap-8 text-sm font-medium text-brand-slate">
          <a className="hover:text-brand transition-colors" href="#personal-vault">
            Personal Vault
          </a>
          <a className="hover:text-brand transition-colors" href="#shared-ledger">
            Shared Ledger
          </a>
          <a className="hover:text-brand transition-colors" href="#settlement-demo">
            Interactive Settlement
          </a>
          <a className="hover:text-brand transition-colors" href="#how-it-works">
            How It Works
          </a>
        </nav>

        {/* Nav Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {onOpenQrModal && (
            <button
              onClick={onOpenQrModal}
              type="button"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand px-3 py-2 rounded-lg hover:bg-brand-soft transition-colors cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-brand" />
              <span>Scan QR</span>
            </button>
          )}

          <button
            onClick={onOpenGuide}
            type="button"
            className="hidden sm:inline-flex items-center text-xs font-semibold text-brand-slate hover:text-brand px-3 py-2 rounded-lg hover:bg-brand-soft transition-colors cursor-pointer"
          >
            Sideload Guide
          </button>

          <button
            onClick={onOpenAdminModal}
            type="button"
            className="hidden lg:inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand px-3 py-2 rounded-lg hover:bg-brand-soft transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-brand" />
            <span>Admin Portal</span>
          </button>

          <button
            onClick={onOpenMobilePreview}
            type="button"
            className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-white bg-brand hover:bg-brand-dark px-4 sm:px-5 py-2.5 rounded-full transition-all duration-200 shadow-sm hover:shadow active:scale-95 cursor-pointer"
          >
            <Smartphone className="w-4 h-4" />
            <span>Get Started</span>
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            type="button"
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-xl text-brand-slate hover:text-brand-charcoal hover:bg-brand-soft border border-brand-border cursor-pointer transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-brand-border bg-white px-4 pt-3 pb-5 space-y-2 text-sm font-medium animate-fade-up">
          <a
            href="#personal-vault"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2.5 rounded-xl text-brand-charcoal hover:bg-brand-soft transition-colors"
          >
            Personal Vault
          </a>
          <a
            href="#shared-ledger"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2.5 rounded-xl text-brand-charcoal hover:bg-brand-soft transition-colors"
          >
            Shared Ledger
          </a>
          <a
            href="#settlement-demo"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2.5 rounded-xl text-brand-charcoal hover:bg-brand-soft transition-colors"
          >
            Interactive Settlement
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2.5 rounded-xl text-brand-charcoal hover:bg-brand-soft transition-colors"
          >
            How It Works
          </a>
          <div className="pt-3 border-t border-brand-border flex flex-col gap-2">
            {onOpenQrModal && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenQrModal();
                }}
                type="button"
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-brand-slate hover:bg-brand-soft flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5 text-brand" />
                <span>Scan to Download QR</span>
              </button>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenGuide();
              }}
              type="button"
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-brand-slate hover:bg-brand-soft"
            >
              Sideload Guide (Android APK & iOS)
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAdminModal();
              }}
              type="button"
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-brand-slate hover:bg-brand-soft flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-brand" />
              <span>SuperAdmin Portal</span>
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onDownloadApk();
              }}
              type="button"
              className="w-full text-center px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-brand hover:bg-brand-dark flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Android APK</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
