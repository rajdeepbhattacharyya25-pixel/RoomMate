import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Fingerprint,
  KeyRound,
  Lock,
  AlertCircle,
  X,
  ArrowRight,
  Clock,
} from 'lucide-react';
import {
  StepUpRiskLevel,
  checkRateLimit,
  recordMfaFailure,
  resetMfaFailures,
  recordStepUpSuccess,
  promptSuperAdminBiometric,
  isBiometricEnabledOnThisDevice,
  verifyRfc6238Totp,
  verifySuperAdminTotp,
  getSuperAdminFactors,
} from '../../../lib/auth/superAdminSecurityService';

export interface StepUpAuthModalProps {
  isOpen: boolean;
  actionTitle: string;
  actionDescription?: string;
  riskLevel: StepUpRiskLevel; // 2 = Sensitive, 3 = Critical
  confirmPhrase?: string; // Optional confirmation string required for Level 3 (e.g. "CONFIRM")
  onSuccess: () => void;
  onCancel: () => void;
  totpSecretFallback?: string;
}

export const StepUpAuthModal: React.FC<StepUpAuthModalProps> = ({
  isOpen,
  actionTitle,
  actionDescription,
  riskLevel,
  confirmPhrase,
  onSuccess,
  onCancel,
  totpSecretFallback,
}) => {
  const [totpCode, setTotpCode] = useState('');
  const [confirmationInput, setConfirmationInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState<number | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Check rate limit on open or tick
  useEffect(() => {
    if (!isOpen) return;

    const rateCheck = checkRateLimit();
    if (rateCheck.isLocked && rateCheck.remainingSeconds) {
      setLockoutRemaining(rateCheck.remainingSeconds);
    } else {
      setLockoutRemaining(null);
    }

    const hasBio = isBiometricEnabledOnThisDevice();
    setBiometricAvailable(hasBio);
    setBiometricVerified(false);
    setTotpCode('');
    setConfirmationInput('');
    setError(null);

    // Fetch live TOTP factor id if available
    getSuperAdminFactors().then((res) => {
      const totp = res.all.find((f) => f.factorType === 'totp');
      if (totp) setFactorId(totp.id);
    });
  }, [isOpen]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining === null || lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  if (!isOpen) return null;

  const isLocked = lockoutRemaining !== null && lockoutRemaining > 0;

  const handleBiometricAuth = async () => {
    if (isLocked || isVerifying) return;
    setError(null);
    setIsVerifying(true);

    try {
      const ok = await promptSuperAdminBiometric(
        `Verify biometrics to authorize: ${actionTitle}`,
        riskLevel
      );
      if (ok) {
        setBiometricVerified(true);
        if (riskLevel === 2) {
          // Level 2 satisfies with either Biometric OR TOTP
          recordStepUpSuccess();
          resetMfaFailures();
          setIsVerifying(false);
          onSuccess();
          return;
        }
        // For Level 3, biometric is step 1 of dual verification
      } else {
        const rateResult = recordMfaFailure();
        if (rateResult.isLocked) {
          setLockoutRemaining(15 * 60);
          setError('Too many failed attempts. Security lockout active for 15 minutes.');
        } else {
          setError('Biometric authentication failed or was cancelled.');
        }
      }
    } catch {
      setError('Biometric sensor unavailable.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isVerifying) return;
    setError(null);

    // Level 3 Confirmation Phrase Check
    if (riskLevel === 3 && confirmPhrase) {
      if (confirmationInput.trim().toUpperCase() !== confirmPhrase.trim().toUpperCase()) {
        setError(`Please type "${confirmPhrase}" to confirm execution.`);
        return;
      }
    }

    // Level 3 requires Biometrics if hardware is active on this device
    if (riskLevel === 3 && biometricAvailable && !biometricVerified) {
      setError('Dual-factor requirement: Please complete biometric verification before submitting TOTP.');
      return;
    }

    if (totpCode.trim().length !== 6 || !/^\d{6}$/.test(totpCode.trim())) {
      setError('Please enter a valid 6-digit authentication token.');
      return;
    }

    setIsVerifying(true);

    try {
      let isVerified = false;

      // Try Supabase Auth MFA challenge if factorId available
      if (factorId) {
        const res = await verifySuperAdminTotp(factorId, totpCode.trim(), totpSecretFallback, riskLevel);
        isVerified = res.success;
      } else if (totpSecretFallback) {
        isVerified = await verifyRfc6238Totp(totpSecretFallback, totpCode.trim());
      } else {
        setError('No active authenticator configured. Please configure an authenticator factor.');
        setIsVerifying(false);
        return;
      }

      if (isVerified) {
        resetMfaFailures();
        recordStepUpSuccess();
        setIsVerifying(false);
        onSuccess();
      } else {
        const rateResult = recordMfaFailure();
        if (rateResult.isLocked) {
          setLockoutRemaining(15 * 60);
          setError('Too many failed attempts. Security lockout active for 15 minutes.');
        } else {
          setError(`Invalid authentication token. ${rateResult.attemptsRemaining} attempts remaining.`);
        }
        setIsVerifying(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify and try again.');
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl">
        {/* Top Risk Header Banner */}
        <div
          className={`px-6 py-4 flex items-center justify-between text-white ${
            riskLevel === 3 ? 'bg-rose-600' : 'bg-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-white/10 text-white">
              {riskLevel === 3 ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <img
                  src="/logo.png"
                  alt="RoomMate"
                  className="w-3.5 h-3.5 rounded-xs object-contain"
                />
                <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">
                  {riskLevel === 3 ? 'RoomMate Level 3 • Critical Security Step-Up' : 'RoomMate Level 2 • Sensitive Operation Step-Up'}
                </span>
              </div>
              <h3 className="text-sm font-bold tracking-tight text-white">{actionTitle}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {actionDescription && (
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200/70">
              {actionDescription}
            </p>
          )}

          {/* Lockout Warning Banner */}
          {isLocked && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Security Lockout Active</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Too many consecutive failed attempts. Retry enabled in{' '}
                  <span className="font-mono font-bold">{lockoutRemaining}s</span>.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && !isLocked && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Biometric Option (if enabled and applicable) */}
          {biometricAvailable && (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    biometricVerified
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-indigo-50 text-indigo-600'
                  }`}
                >
                  {biometricVerified ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : (
                    <Fingerprint className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    {biometricVerified ? 'Biometrics Verified' : 'Resident Device Biometrics'}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {biometricVerified
                      ? 'Cryptographic hardware proof accepted'
                      : 'Touch sensor or Face recognition'}
                  </span>
                </div>
              </div>

              {!biometricVerified ? (
                <button
                  type="button"
                  disabled={isLocked || isVerifying}
                  onClick={handleBiometricAuth}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 shadow-2xs transition-all disabled:opacity-50"
                >
                  Scan Now
                </button>
              ) : (
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  Passed
                </span>
              )}
            </div>
          )}

          {/* TOTP / Verification Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  Authenticator 6-Digit Security Token
                </span>
                {riskLevel === 2 && biometricAvailable && (
                  <span className="text-[10px] text-slate-400 font-normal">OR enter TOTP</span>
                )}
              </label>
              <input
                type="text"
                maxLength={6}
                required
                disabled={isLocked || isVerifying}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center tracking-widest text-lg font-mono font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs disabled:opacity-50"
              />
            </div>

            {/* Critical Confirmation Phrase (Level 3) */}
            {riskLevel === 3 && confirmPhrase && (
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-rose-700 block">
                  Type <span className="font-mono font-bold uppercase">{confirmPhrase}</span> to confirm irreversible execution:
                </label>
                <input
                  type="text"
                  required
                  disabled={isLocked || isVerifying}
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  placeholder={confirmPhrase}
                  className="w-full px-3.5 py-2 text-xs bg-rose-50/50 border border-rose-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all shadow-2xs disabled:opacity-50"
                />
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isVerifying}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLocked || isVerifying}
                className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-bold text-white shadow-md transition-all disabled:opacity-50 ${
                  riskLevel === 3
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                }`}
              >
                {isVerifying ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Authorize Action</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
