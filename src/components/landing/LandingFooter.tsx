import React from 'react';

interface LandingFooterProps {
  onOpenMobilePreview: () => void;
  onOpenAdminModal: () => void;
  onOpenGuide: () => void;
  onOpenQrModal: () => void;
  onDownloadApk: () => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({
  onOpenMobilePreview,
  onOpenAdminModal,
  onOpenGuide,
  onOpenQrModal,
  onDownloadApk,
}) => {
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'RoomMate — Split Room Bills. Keep Personal Spending Private.',
        text: 'Zero-drift shared expense tracker and private student vault.',
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  return (
    <footer className="bg-white border-t border-brand-border py-16" data-purpose="main-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-brand-border">
          
          {/* Brand Info Column */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="RoomMate"
                className="w-9 h-9 rounded-xl object-contain shadow-xs"
              />
              <span className="font-sans text-xl font-extrabold tracking-tight text-brand-charcoal">
                Room<span className="text-brand">Mate</span>
              </span>
            </div>

            <p className="text-xs text-brand-slate leading-relaxed">
              Tactile financial companion tailored for student living and flatmates. Equal splits, zero drift, and absolute client-side privacy.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational (Supabase Live)</span>
            </div>
          </div>

          {/* Links Column 1: Product */}
          <div className="lg:col-span-2 lg:ml-auto">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-charcoal mb-4">Product</h4>
            <ul className="space-y-2.5 text-xs text-brand-slate">
              <li>
                <a className="hover:text-brand transition-colors" href="#personal-vault">
                  Personal Vault
                </a>
              </li>
              <li>
                <a className="hover:text-brand transition-colors" href="#shared-ledger">
                  Shared Ledger
                </a>
              </li>
              <li>
                <a className="hover:text-brand transition-colors" href="#who-owes-whom">
                  Who Owes Whom
                </a>
              </li>
              <li>
                <a className="hover:text-brand transition-colors" href="#how-it-works">
                  How It Works
                </a>
              </li>
              <li>
                <a className="hover:text-brand transition-colors" href="#categories">
                  Campus Categories
                </a>
              </li>
            </ul>
          </div>

          {/* Links Column 2: Downloads */}
          <div className="lg:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-charcoal mb-4">Downloads</h4>
            <ul className="space-y-2.5 text-xs text-brand-slate">
              <li>
                <button onClick={onDownloadApk} className="hover:text-brand transition-colors cursor-pointer text-left">
                  Android APK (v1.0.4)
                </button>
              </li>
              <li>
                <button onClick={onOpenGuide} className="hover:text-brand transition-colors cursor-pointer text-left">
                  Apple TestFlight &amp; PWA
                </button>
              </li>
              <li>
                <button onClick={onOpenQrModal} className="hover:text-brand transition-colors cursor-pointer text-left">
                  Scan Phone QR Code
                </button>
              </li>
              <li>
                <button onClick={onOpenGuide} className="hover:text-brand transition-colors cursor-pointer text-left">
                  Sideloading Guide
                </button>
              </li>
            </ul>
          </div>

          {/* Links Column 3: Architecture */}
          <div className="lg:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-charcoal mb-4">Architecture</h4>
            <ul className="space-y-2.5 text-xs text-brand-slate">
              <li>
                <button onClick={onOpenAdminModal} className="hover:text-brand transition-colors cursor-pointer text-left">
                  Super Admin Portal
                </button>
              </li>
              <li>
                <button onClick={onOpenMobilePreview} className="hover:text-brand transition-colors cursor-pointer text-left">
                  Launch Mobile Simulator
                </button>
              </li>
              <li>
                <span className="text-brand-slate/80">Capacitor 8.5 Native Engine</span>
              </li>
              <li>
                <span className="text-brand-slate/80">Deterministic 0-Drift Math</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-brand-slate font-medium">
          <div>
            &copy; 2026 RoomMate Platform. Crafted for college students &amp; flatmates.
          </div>
          <div className="flex items-center gap-6">
            <span>Client-Side Encryption</span>
            <span>Zero-Tracker Architecture</span>
            <button onClick={handleShare} className="text-brand hover:underline cursor-pointer">
              Share Page
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
