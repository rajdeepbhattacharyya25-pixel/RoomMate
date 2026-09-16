import React, { useState } from 'react';
import { ShieldAlert, ExternalLink, Copy, Check, X, KeyRound, ArrowRight } from 'lucide-react';
import { hapticSuccess, hapticImpact, hapticWarning } from '../../lib/native/haptics';
import { redeemOAuthUrlOrHash } from '../../lib/storage/cloudStorageAdapter';

interface OAuthProviderNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage?: string;
}

export const OAuthProviderNoticeModal: React.FC<OAuthProviderNoticeModalProps> = ({
  isOpen,
  onClose,
  errorMessage,
}) => {
  const [copied, setCopied] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);

  const redirectUri = 'https://pbzaaskftrmnvocczhat.supabase.co/auth/v1/callback';

  if (!isOpen) return null;

  const handleCopyUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    hapticSuccess();
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRedeemPastedUrl = async () => {
    const raw = pasteInput.trim();
    if (!raw) return;
    setIsRedeeming(true);
    setRedeemError(null);
    try {
      const res = await redeemOAuthUrlOrHash(raw);
      if (res.success) {
        hapticSuccess();
        setRedeemSuccess(true);
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        hapticWarning();
        setRedeemError(res.error || 'Could not validate login session from provided text.');
      }
    } catch (err: unknown) {
      hapticWarning();
      setRedeemError(err instanceof Error ? err.message : 'Failed to redeem login link.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleClose = () => {
    hapticImpact('LIGHT');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="oauth-notice-title"
      className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 text-slate-900 animate-in fade-in"
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/80 space-y-5 animate-in slide-in-from-bottom-6 sm:zoom-in-95 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 flex-shrink-0">
              <ShieldAlert className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 id="oauth-notice-title" className="text-base font-bold text-slate-900">
                Google Sign-In Configuration
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                One-time Supabase Dashboard setup required
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice description */}
        <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200/60 text-xs text-amber-900 leading-relaxed space-y-1">
          <p className="font-semibold">Google OAuth is integrated in the app!</p>
          <p className="text-amber-800/90 text-[11px]">
            To process live Google logins, add your Google Cloud OAuth Client ID and Secret to your Supabase project.
          </p>
          {errorMessage && (
            <p className="font-mono text-[10px] text-amber-950/80 bg-amber-100/60 p-1.5 rounded-lg mt-1 break-all">
              {errorMessage}
            </p>
          )}
        </div>

        {/* 3 Step Setup Guide */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Quick 2-Minute Setup Steps:
          </h4>

          {/* Step 1 */}
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">1. Google Cloud Console</span>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Open Console <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Create an <strong>OAuth 2.0 Client ID (Web Application)</strong>. Set Authorized redirect URI to:
            </p>
            <div className="flex items-center justify-between gap-2 p-2 bg-white border border-slate-200 rounded-lg">
              <code className="text-[10px] text-slate-800 font-mono break-all select-all">
                {redirectUri}
              </code>
              <button
                type="button"
                onClick={handleCopyUri}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200/60 flex-shrink-0"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">2. Supabase Google Provider</span>
              <a
                href="https://supabase.com/dashboard/project/pbzaaskftrmnvocczhat/auth/providers"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Go to Providers <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              In <strong>Authentication &gt; Providers &gt; Google</strong>, toggle <strong>Enabled</strong>, paste your <strong>Client ID</strong> and <strong>Client Secret</strong>, and click <strong>Save</strong>.
            </p>
          </div>

          {/* Step 3: URL Configuration */}
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">3. Supabase URL Configuration</span>
              <a
                href="https://supabase.com/dashboard/project/pbzaaskftrmnvocczhat/auth/url-configuration"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
              >
                URL Configuration <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-[11px] text-slate-600 space-y-1">
              <p>• <strong>Site URL:</strong> Set to <code>http://localhost:5173</code> (do not use https://localhost, as port 443 has no server).</p>
              <p>• <strong>Redirect URLs:</strong> Add these exact patterns:</p>
            </div>
            <div className="space-y-1 font-mono text-[10px] text-slate-700 bg-white p-2 border border-slate-200 rounded-lg select-all">
              <div>• <code>roommate://**</code> (Mandatory for Android App deep-linking)</div>
              <div>• <code>roommate://auth-callback</code></div>
              <div>• <code>http://localhost:5173/**</code> (Web Dev)</div>
              <div>• <code>https://localhost/**</code></div>
              <div>• <code>https://*.vercel.app/**</code> (Production Web)</div>
            </div>
            <p className="text-[10px] text-amber-700">
              ⚠️ Without <code>roommate://**</code>, Supabase redirects to <code>https://localhost</code>, which fails on mobile with ERR_CONNECTION_REFUSED.
            </p>
          </div>
        </div>

        {/* 4. Instant Paste & Redeem Tool */}
        <div className="p-3.5 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl space-y-2.5">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-indigo-900">
              Browser stuck on "Site can't be reached"?
            </span>
          </div>
          <p className="text-[11px] text-indigo-800/80 leading-relaxed">
            If Google already authenticated you and the browser landed on <code>https://localhost/#access_token=...</code>, paste that address here to complete sign-in immediately:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder="https://localhost/#access_token=..."
              className="flex-1 min-w-0 bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <button
              type="button"
              onClick={handleRedeemPastedUrl}
              disabled={!pasteInput.trim() || isRedeeming}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              {redeemSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Success!
                </>
              ) : isRedeeming ? (
                'Signing in...'
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
          {redeemError && (
            <p className="text-[10px] text-red-600 font-medium">{redeemError}</p>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
