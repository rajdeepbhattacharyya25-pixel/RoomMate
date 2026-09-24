import React, { useState } from 'react';
import { X, Smartphone, Apple, Download, CheckCircle2 } from 'lucide-react';

interface SideloadGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadApk: () => void;
}

export const SideloadGuideModal: React.FC<SideloadGuideModalProps> = ({
  isOpen,
  onClose,
  onDownloadApk,
}) => {
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-charcoal/40 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl bg-white border border-brand-border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between bg-brand-surface/60">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="RoomMate"
              className="w-10 h-10 rounded-2xl object-contain shadow-xs border border-brand-border bg-white p-0.5"
            />
            <div>
              <h3 className="text-base font-bold text-brand-charcoal">Install RoomMate</h3>
              <p className="text-xs text-brand-slate">Quick steps to get RoomMate running on your phone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center text-brand-slate hover:text-brand-charcoal hover:bg-brand-soft transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Switcher Tabs */}
        <div className="px-6 pt-4">
          <div className="flex p-1 bg-brand-surface rounded-xl border border-brand-border">
            <button
              onClick={() => setPlatform('android')}
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                platform === 'android'
                  ? 'bg-white text-brand shadow-xs border border-brand-border'
                  : 'text-brand-slate hover:text-brand-charcoal'
              }`}
            >
              <Smartphone className="w-4 h-4 text-brand" />
              <span>Android (Direct APK)</span>
            </button>
            <button
              onClick={() => setPlatform('ios')}
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                platform === 'ios'
                  ? 'bg-white text-brand shadow-xs border border-brand-border'
                  : 'text-brand-slate hover:text-brand-charcoal'
              }`}
            >
              <Apple className="w-4 h-4 text-brand-charcoal" />
              <span>Apple iOS (Web Clip)</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto text-xs text-brand-slate">
          {platform === 'android' ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-emerald-950">No Google Play Account Required</div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Sideloading allows instant updates, zero app store telemetry, and zero bloatware.
                  </p>
                </div>
              </div>

              <ol className="space-y-3">
                <li className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5 border border-brand-border">
                    1
                  </span>
                  <div>
                    <span className="font-bold text-brand-charcoal">Download the APK package</span>
                    <p className="text-[11px] text-brand-slate mt-0.5">
                      Tap "Download APK Now" below or from the home page.
                    </p>
                  </div>
                </li>

                <li className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5 border border-brand-border">
                    2
                  </span>
                  <div>
                    <span className="font-bold text-brand-charcoal">Allow "Install Unknown Apps"</span>
                    <p className="text-[11px] text-brand-slate mt-0.5">
                      If Android prompts with "File might be harmful", tap <strong className="text-brand-charcoal">"Download anyway"</strong>. In Settings &gt; Apps, allow Chrome or Files to install apps.
                    </p>
                  </div>
                </li>

                <li className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5 border border-brand-border">
                    3
                  </span>
                  <div>
                    <span className="font-bold text-brand-charcoal">Tap Install &amp; Launch</span>
                    <p className="text-[11px] text-brand-slate mt-0.5">
                      Open your notification tray, tap the downloaded <code className="font-mono bg-brand-surface px-1 rounded">RoomMate-staging-v1.0.4-build10.apk</code> package, and press Install.
                    </p>
                  </div>
                </li>
              </ol>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => {
                    onDownloadApk();
                    onClose();
                  }}
                  type="button"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download APK Now</span>
                </button>
                <button
                  onClick={onClose}
                  type="button"
                  className="py-3 px-5 bg-brand-surface hover:bg-brand-soft text-brand-charcoal rounded-xl font-bold text-xs border border-brand-border transition-colors cursor-pointer"
                >
                  Got it
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-brand-border space-y-2 bg-brand-surface/70">
                <div className="font-bold text-brand-charcoal flex items-center gap-2">
                  <Apple className="w-4 h-4 text-brand-charcoal" />
                  <span>Option A: Safari Instant Web App</span>
                </div>
                <p className="text-[11px] text-brand-slate leading-relaxed">
                  Open this page on your iPhone in Safari, tap the <strong className="text-brand-charcoal">Share</strong> button at the bottom, and tap <strong className="text-brand-charcoal">"Add to Home Screen"</strong> for a native standalone app experience.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-brand-border space-y-2 bg-brand-surface/70">
                <div className="font-bold text-brand-charcoal flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-brand" />
                  <span>Option B: Apple TestFlight Beta</span>
                </div>
                <p className="text-[11px] text-brand-slate leading-relaxed">
                  Join our closed iOS student cohort on TestFlight for early builds and biometric LocalAuthentication support.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={onClose}
                  type="button"
                  className="w-full py-3 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
