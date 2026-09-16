import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Sparkles,
  X,
  KeyRound,
  Clock,
  Key,
} from 'lucide-react';
import { User } from '../../types';
import { db } from '../../lib/storage/mockStorage';
import {
  checkRateLimit,
  recordMfaFailure,
  resetMfaFailures,
  verifySuperAdminTotp,
  verifyRfc6238Totp,
  getOrCreateDeviceId,
  getDeviceMetadata,
  hashRecoveryCode,
} from '../../lib/auth/superAdminSecurityService';
import {
  superAdminRegisterDeviceCloud,
  superAdminVerifyRecoveryCodeCloud,
} from '../../lib/storage/cloudStorageAdapter';

interface SuperAdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (adminUser: User) => void;
  allUsers: User[];
}

export const SuperAdminLoginModal: React.FC<SuperAdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  allUsers,
}) => {
  const [step, setStep] = useState<'CREDENTIALS' | 'MFA' | 'RECOVERY'>('CREDENTIALS');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [matchedAdmin, setMatchedAdmin] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('CREDENTIALS');
      setEmail('');
      setPassword('');
      setMfaCode('');
      setRecoveryCode('');
      setError(null);
      setMatchedAdmin(null);
    } else {
      const rateCheck = checkRateLimit();
      if (rateCheck.isLocked && rateCheck.remainingSeconds) {
        setLockoutRemaining(rateCheck.remainingSeconds);
      }
    }
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

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const matched = allUsers.find(
        (u) => u.email.toLowerCase().trim() === email.toLowerCase().trim()
      );

      if (!matched) {
        setError('No administrator account registered under this email address.');
        setIsLoading(false);
        return;
      }

      if (matched.role !== 'SUPER_ADMIN') {
        setError('Access Denied: This account does not possess SuperAdmin platform privileges.');
        setIsLoading(false);
        return;
      }

      if (matched.isSuspended) {
        setError('Access Denied: This administrator account has been suspended.');
        setIsLoading(false);
        return;
      }

      if (password.trim().length < 4) {
        setError('Please enter a valid administrator master security key.');
        setIsLoading(false);
        return;
      }

      setMatchedAdmin(matched);
      setStep('MFA');
      setIsLoading(false);
    }, 300);
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !matchedAdmin) return;
    setError(null);

    if (mfaCode.trim().length !== 6) {
      setError('Please enter a valid 6-digit authentication code.');
      return;
    }

    setIsLoading(true);

    try {
      const settings = db.getSuperAdminSecuritySettings(matchedAdmin.id);
      let isVerified = false;

      if (settings.totpFactorId) {
        const res = await verifySuperAdminTotp(settings.totpFactorId, mfaCode.trim());
        isVerified = res.success;
      } else if (settings.totpSecret) {
        isVerified = await verifyRfc6238Totp(settings.totpSecret, mfaCode.trim());
      }

      if (isVerified) {
        resetMfaFailures();
        await finalizeLogin(matchedAdmin);
      } else {
        const rateResult = recordMfaFailure();
        if (rateResult.isLocked) {
          setLockoutRemaining(15 * 60);
          setError('Too many failed attempts. Security lockout active for 15 minutes.');
        } else {
          setError(`Invalid authentication code. ${rateResult.attemptsRemaining} attempts remaining.`);
        }
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
      setIsLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !matchedAdmin) return;
    setError(null);

    const clean = recoveryCode.trim().toUpperCase();
    if (clean.length < 10) {
      setError('Please enter a valid recovery code (e.g. XXXX-XXXX-XXXX).');
      return;
    }

    setIsLoading(true);

    try {
      const hash = await hashRecoveryCode(clean);
      const localRes = db.verifyRecoveryCode(matchedAdmin.id, hash);
      let verified = localRes.success;

      const cloudRes = await superAdminVerifyRecoveryCodeCloud(hash);
      if (cloudRes.success) verified = true;

      if (verified) {
        resetMfaFailures();
        await finalizeLogin(matchedAdmin);
      } else {
        const rateResult = recordMfaFailure();
        if (rateResult.isLocked) {
          setLockoutRemaining(15 * 60);
          setError('Too many failed attempts. Security lockout active for 15 minutes.');
        } else {
          setError(`Invalid recovery code. ${rateResult.attemptsRemaining} attempts remaining.`);
        }
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Recovery verification failed.');
      setIsLoading(false);
    }
  };

  const finalizeLogin = async (admin: User) => {
    const deviceId = getOrCreateDeviceId();
    const meta = getDeviceMetadata();

    db.registerSuperAdminDevice(admin.id, {
      deviceId,
      deviceName: meta.deviceName,
      platform: meta.platform,
      browser: meta.browser,
    });

    await superAdminRegisterDeviceCloud(deviceId, meta.deviceName, meta.platform, meta.browser);

    db.logSecurityEvent(
      admin.id,
      'LOGIN_SUCCESS',
      'SUCCESS',
      'SECURITY',
      admin.id,
      { deviceId, platform: meta.platform, browser: meta.browser }
    );

    setIsLoading(false);
    onLoginSuccess(admin);
    onClose();
  };

  const handleFillDemoAdmin = () => {
    const superAdmin = allUsers.find((u) => u.role === 'SUPER_ADMIN');
    if (superAdmin) {
      setEmail(superAdmin.email);
      setPassword('admin1234');
      setError(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 space-y-5">
          {/* Header Badge */}
          <div className="flex flex-col items-center text-center space-y-2 pt-2">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                <Lock className="w-3 h-3 text-slate-500" />
                Operations Console
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
                {step === 'CREDENTIALS' && 'Super Admin Access'}
                {step === 'MFA' && 'Two-Factor Challenge'}
                {step === 'RECOVERY' && 'Emergency Recovery'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 'CREDENTIALS' && 'Zero-Trust server-side authentication with cryptographic MFA.'}
                {step === 'MFA' && 'Enter the 6-digit TOTP token from your authenticator app.'}
                {step === 'RECOVERY' && 'Enter an unused one-time backup recovery code.'}
              </p>
            </div>
          </div>

          {/* Lockout Banner */}
          {isLocked && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 animate-in fade-in">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Security Lockout Active</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Retry enabled in <span className="font-mono font-bold">{lockoutRemaining}s</span>.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && !isLocked && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Credentials Form */}
          {step === 'CREDENTIALS' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Administrator Email</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@roommate.app"
                  value={email}
                  disabled={isLocked || isLoading}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-mono shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>Master Security Key</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  disabled={isLocked || isLoading}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-mono shadow-2xs"
                />
              </div>

              <button
                type="submit"
                disabled={isLocked || isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Proceed to 2FA Challenge</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step 2: MFA Token Challenge */}
          {step === 'MFA' && (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-slate-700">
                <p className="font-semibold text-indigo-950">Enter Time-Based 6-Digit MFA Token</p>
                <p className="text-[11px] text-indigo-700/80 mt-0.5">
                  Verify via your Authenticator app (Google Authenticator, Authy, 1Password).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>6-Digit Security Token</span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  disabled={isLocked || isLoading}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  autoFocus
                  className="w-full text-center tracking-widest text-lg font-mono font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              <button
                type="submit"
                disabled={isLocked || isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Authenticate &amp; Launch Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-1 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setStep('CREDENTIALS')}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep('RECOVERY')}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                >
                  Use Recovery Code
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Emergency Recovery Form */}
          {step === 'RECOVERY' && (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-600" />
                  One-Time Backup Code
                </p>
                <p className="text-[11px] text-amber-700 mt-1">
                  Enter one of your 8 emergency codes (e.g. XXXX-XXXX-XXXX).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>Recovery Code</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isLocked || isLoading}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  autoFocus
                  className="w-full text-center tracking-widest text-base font-mono font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={isLocked || isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Verify Code &amp; Launch Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('MFA')}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors pt-1"
              >
                &larr; Back to Authenticator Token
              </button>
            </form>
          )}

          {/* Quick Demo Fill Helper */}
          {step === 'CREDENTIALS' && (
            <div className="pt-2 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={handleFillDemoAdmin}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold py-1 px-3 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Fill Demo Super Admin Creds</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
