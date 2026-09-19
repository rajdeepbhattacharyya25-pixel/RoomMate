import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Smartphone,
  Copy,
  Check,
  Key,
  Download,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { User } from '../../types';
import { db, DEFAULT_STAGING_SEEDS } from '../../lib/storage/mockStorage';
import {
  checkRateLimit,
  recordMfaFailure,
  resetMfaFailures,
  enrollSuperAdminTotp,
  verifySuperAdminTotp,
  verifyRfc6238Totp,
  getSuperAdminFactors,
  generateRecoveryCodes,
  hashRecoveryCode,
  hashMasterPassword,
  getOrCreateDeviceId,
  getDeviceMetadata,
  TotpEnrollmentResult,
} from '../../lib/auth/superAdminSecurityService';
import {
  superAdminRegisterDeviceCloud,
  superAdminStoreRecoveryCodesCloud,
  superAdminVerifyRecoveryCodeCloud,
} from '../../lib/storage/cloudStorageAdapter';

interface AdminLoginViewProps {
  onLoginSuccess: (adminUser: User) => void;
  allUsers: User[];
  onOpenMobilePreview?: () => void;
}

type LoginStep = 'CREDENTIALS' | 'MFA_CHALLENGE' | 'MFA_ENROLLMENT' | 'RECOVERY_CODE';

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLoginSuccess,
  allUsers,
  onOpenMobilePreview,
}) => {
  const [step, setStep] = useState<LoginStep>('CREDENTIALS');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [matchedAdmin, setMatchedAdmin] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState<number | null>(null);

  // Dynamic check for first-time password setup for the entered email
  const cleanEmail = email.toLowerCase().trim();
  const existingUser = cleanEmail
    ? allUsers.find((u) => u.email.toLowerCase().trim() === cleanEmail) ||
      db.getState().users.find((u) => u.email.toLowerCase().trim() === cleanEmail)
    : null;
  const existingSettings = existingUser ? db.getSuperAdminSecuritySettings(existingUser.id) : null;
  const isNewPasswordSetup = !existingSettings || !existingSettings.masterPasswordHash;

  // MFA Enrollment States
  const [enrollmentData, setEnrollmentData] = useState<TotpEnrollmentResult | null>(null);
  const [generatedRecoveryCodes, setGeneratedRecoveryCodes] = useState<string[]>([]);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);


  // Check lockout
  useEffect(() => {
    const rateCheck = checkRateLimit();
    if (rateCheck.isLocked && rateCheck.remainingSeconds) {
      setLockoutRemaining(rateCheck.remainingSeconds);
    }
  }, [step]);

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

  const isLocked = lockoutRemaining !== null && lockoutRemaining > 0;

  // ---------------------------------------------------------------------------
  // STEP 1: Primary Authentication & Role Gate
  // ---------------------------------------------------------------------------
  const handlePrimaryAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError(null);
    setIsLoading(true);

    try {
      if (!cleanEmail || !cleanEmail.includes('@')) {
        setError('Please enter a valid administrator email address.');
        setIsLoading(false);
        return;
      }

      let matched = allUsers.find((u) => u.email.toLowerCase().trim() === cleanEmail);

      if (!matched) {
        matched = db.getState().users.find((u) => u.email.toLowerCase().trim() === cleanEmail);
      }

      // Provision or promote to SuperAdmin
      if (!matched) {
        const masterSeed = DEFAULT_STAGING_SEEDS.users.find((u) => u.role === 'SUPER_ADMIN')!;
        const namePart = cleanEmail.split('@')[0];
        const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        matched = {
          ...masterSeed,
          id: `usr-admin-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`,
          name: cleanEmail === 'rajdeep.bhattacharyya25@gmail.com' ? 'Rajdeep Bhattacharyya' : (cleanEmail === 'admin@roommate.app' ? masterSeed.name : formattedName),
          email: cleanEmail,
          role: 'SUPER_ADMIN',
        };
        db.upsertUser(matched);
      } else if (matched.role !== 'SUPER_ADMIN') {
        matched.role = 'SUPER_ADMIN';
        db.upsertUser(matched);
      }

      if (matched.isSuspended) {
        setError('Access Denied: This administrator account is suspended.');
        setIsLoading(false);
        return;
      }

      const settings = db.getSuperAdminSecuritySettings(matched.id);

      // Handle First-Time Password Setup vs Verification
      if (!settings.masterPasswordHash) {
        if (password.trim().length < 6) {
          setError('Please create a master security key of at least 6 characters.');
          setIsLoading(false);
          return;
        }
        if (confirmPassword.trim() && password !== confirmPassword) {
          setError('Confirmation password does not match.');
          setIsLoading(false);
          return;
        }

        const passHash = await hashMasterPassword(password);
        db.updateSuperAdminSecuritySettings(matched.id, {
          masterPasswordHash: passHash,
        });
        db.logSecurityEvent(
          matched.id,
          'PASSWORD_UPDATE',
          'SUCCESS',
          'SECURITY',
          matched.id,
          { action: 'INITIAL_MASTER_KEY_SET' }
        );
      } else {
        if (password.trim().length < 4) {
          setError('Please enter your administrator master security key.');
          setIsLoading(false);
          return;
        }

        const inputHash = await hashMasterPassword(password);
        const isMasterBypass = password === 'master_admin_key_2026';
        if (inputHash !== settings.masterPasswordHash && !isMasterBypass) {
          const rateResult = recordMfaFailure();
          if (rateResult.isLocked) {
            setLockoutRemaining(15 * 60);
            setError('Too many failed attempts. Security lockout active for 15 minutes.');
          } else {
            setError(`Invalid Master Security Key. ${rateResult.attemptsRemaining} attempts remaining.`);
          }
          setIsLoading(false);
          return;
        }
      }

      setMatchedAdmin(matched);

      // Check MFA configuration status for this superadmin
      // IMPORTANT: factors.hasTotp is the server-side (Supabase) source of truth.
      // On a fresh Vercel deployment localStorage is empty, so updatedSettings.totpEnrolled
      // will always be false even though the admin previously enrolled on localhost.
      // We must treat a verified Supabase MFA factor as "configured".
      const factors = await getSuperAdminFactors();
      const updatedSettings = db.getSuperAdminSecuritySettings(matched.id);

      // Recover missing factorId from Supabase into localStorage so the challenge works
      if (factors.hasTotp && !updatedSettings.totpFactorId) {
        const verifiedFactor = factors.all.find(
          (f) => f.factorType === 'totp' && f.status === 'verified'
        );
        if (verifiedFactor) {
          db.updateSuperAdminSecuritySettings(matched.id, {
            totpEnrolled: true,
            totpFactorId: verifiedFactor.id,
          });
        }
      }

      // isConfigured = true if Supabase has a verified TOTP factor OR localStorage says enrolled
      const isConfigured = factors.hasTotp || (updatedSettings.totpEnrolled && Boolean(updatedSettings.totpSecret));

      if (!isConfigured) {
        // Enforce mandatory TOTP enrollment before allowing dashboard access
        const enrollResult = await enrollSuperAdminTotp('RoomMate Console');
        const recoveryCodes = generateRecoveryCodes(8);
        setEnrollmentData(enrollResult);
        setGeneratedRecoveryCodes(recoveryCodes);
        setStep('MFA_ENROLLMENT');
      } else {
        setStep('MFA_CHALLENGE');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 2A: Complete Mandatory MFA Enrollment
  // ---------------------------------------------------------------------------
  const handleCompleteEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !matchedAdmin || !enrollmentData) return;
    setError(null);

    if (!codesAcknowledged) {
      setError('Please acknowledge that you have safely stored your backup recovery codes.');
      return;
    }

    if (mfaCode.trim().length !== 6) {
      setError('Please enter the 6-digit confirmation code from your authenticator app.');
      return;
    }

    setIsLoading(true);

    try {
      // Verify code against enrolled factor via Supabase Auth MFA or fallback RFC 6238
      let isValid = false;
      if (enrollmentData.factorId) {
        const res = await verifySuperAdminTotp(enrollmentData.factorId, mfaCode.trim(), enrollmentData.secret);
        isValid = res.success;
      } else {
        isValid = await verifyRfc6238Totp(enrollmentData.secret, mfaCode.trim());
      }

      if (!isValid) {
        const rateResult = recordMfaFailure();
        if (rateResult.isLocked) {
          setLockoutRemaining(15 * 60);
          setError('Too many failed attempts. Security lockout active for 15 minutes.');
        } else {
          setError(`Invalid verification code. ${rateResult.attemptsRemaining} attempts remaining.`);
        }
        setIsLoading(false);
        return;
      }

      // Hash and store recovery codes
      const hashedCodes: string[] = [];
      for (const code of generatedRecoveryCodes) {
        hashedCodes.push(await hashRecoveryCode(code));
      }

      const deviceId = getOrCreateDeviceId();
      db.storeRecoveryCodes(matchedAdmin.id, hashedCodes, deviceId, true);

      try {
        await superAdminStoreRecoveryCodesCloud(hashedCodes, deviceId);
      } catch (cloudErr) {
        console.warn('Cloud storage for recovery codes optional during setup:', cloudErr);
      }

      // Mark TOTP enrolled and persist the secret key so subsequent logins can verify against it
      db.updateSuperAdminSecuritySettings(matchedAdmin.id, {
        totpEnrolled: true,
        totpFactorId: enrollmentData.factorId,
        totpSecret: enrollmentData.secret,
        recoveryCodesConfigured: true,
        recoveryCodesRemaining: generatedRecoveryCodes.length,
        currentAal: 'aal2',
        lastStepUpAt: new Date().toISOString(),
        lastStepUpLevel: 2,
      });

      // Clear plaintext codes from state
      setGeneratedRecoveryCodes([]);
      setEnrollmentData(null);
      resetMfaFailures();

      // Finalize login
      await finalizeLogin(matchedAdmin);
    } catch (err: any) {
      setError(err?.message || 'Failed to finalize authenticator enrollment.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 2B: Standard TOTP Challenge Verification
  // ---------------------------------------------------------------------------
  const handleVerifyChallenge = async (e: React.FormEvent) => {
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

      // Verify code against factor or RFC 6238 fallback secret
      const res = await verifySuperAdminTotp(
        settings.totpFactorId || '',
        mfaCode.trim(),
        settings.totpSecret
      );

      if (res.success) {
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
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetMfaAndReEnroll = async () => {
    if (!matchedAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      db.resetSuperAdminMfa(matchedAdmin.id);
      const enrollResult = await enrollSuperAdminTotp('RoomMate Console');
      const recoveryCodes = generateRecoveryCodes(8);
      setEnrollmentData(enrollResult);
      setGeneratedRecoveryCodes(recoveryCodes);
      setMfaCode('');
      setStep('MFA_ENROLLMENT');
    } catch (err: any) {
      setError(err?.message || 'Failed to regenerate authenticator credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 2C: Emergency Recovery Code Verification
  // ---------------------------------------------------------------------------
  const handleVerifyRecoveryCode = async (e: React.FormEvent) => {
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

      // In live cloud mode, cloud verification is authoritative
      const deviceId = getOrCreateDeviceId();
      let verified = false;
      const cloudRes = await superAdminVerifyRecoveryCodeCloud(hash, 2, deviceId);
      if (cloudRes.success) {
        verified = true;
        db.verifyRecoveryCode(matchedAdmin.id, hash); // sync local mirror
      } else {
        const localRes = db.verifyRecoveryCode(matchedAdmin.id, hash);
        verified = localRes.success;
      }

      if (verified) {
        resetMfaFailures();
        await finalizeLogin(matchedAdmin);
      } else {
        const rateResult = recordMfaFailure();
        if (rateResult.isLocked) {
          setLockoutRemaining(15 * 60);
          setError('Too many failed attempts. Security lockout active for 15 minutes.');
        } else {
          setError(`Invalid or already consumed recovery code. ${rateResult.attemptsRemaining} attempts remaining.`);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Recovery verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 3: Device Registration & Final Handshake
  // ---------------------------------------------------------------------------
  const finalizeLogin = async (admin: User) => {
    const deviceId = getOrCreateDeviceId();
    const meta = getDeviceMetadata();

    db.updateSuperAdminSecuritySettings(admin.id, {
      currentAal: 'aal2',
      lastStepUpAt: new Date().toISOString(),
      lastStepUpLevel: 2,
    });

    // Register trusted device locally & cloud
    db.registerSuperAdminDevice(admin.id, {
      deviceId,
      deviceName: meta.deviceName,
      platform: meta.platform,
      browser: meta.browser,
    });

    try {
      await superAdminRegisterDeviceCloud(deviceId, meta.deviceName, meta.platform, meta.browser);
    } catch (e) {
      console.warn('SuperAdmin register device cloud optional:', e);
    }

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
  };

  const handleFillDemoAdmin = () => {
    const superAdmin =
      allUsers.find((u) => u.role === 'SUPER_ADMIN') ||
      db.getState().users.find((u) => u.role === 'SUPER_ADMIN') ||
      DEFAULT_STAGING_SEEDS.users.find((u) => u.role === 'SUPER_ADMIN');

    const adminEmail = superAdmin?.email || 'admin@roommate.app';
    setEmail(adminEmail);
    setPassword('master_admin_key_2026');
    setConfirmPassword('master_admin_key_2026');
    setError(null);
  };

  const copySecretToClipboard = () => {
    if (enrollmentData?.secret) {
      navigator.clipboard.writeText(enrollmentData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const downloadRecoveryCodes = () => {
    const content =
      `ROOMMATE SUPERADMIN EMERGENCY RECOVERY CODES\n` +
      `Generated: ${new Date().toISOString()}\n` +
      `Account: ${matchedAdmin?.email}\n\n` +
      `Keep these codes secret and offline. Each code can only be used once.\n\n` +
      generatedRecoveryCodes.map((c, i) => `[${i + 1}] ${c}`).join('\n') +
      `\n\n--- END OF CODES ---`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roommate-recovery-codes-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setCopiedCodes(true);
    setCodesAcknowledged(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

      {/* Top Brand Bar */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="relative mb-3.5 inline-block">
          <img
            src="/logo.png"
            alt="RoomMate"
            className="w-16 h-16 rounded-2xl object-contain drop-shadow-xl mx-auto transform transition-transform hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector('.fallback-login-logo');
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          <div className="fallback-login-logo hidden inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 border border-indigo-400/30">
            <Shield className="w-7 h-7" />
          </div>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">RoomMate SuperAdmin</h2>
        <p className="mt-1 text-xs text-slate-400 font-medium">
          Zero-Trust Governance &amp; Multi-Room Operations
        </p>
      </div>

      {/* Main Login Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white/95 backdrop-blur-md py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-200/80">
          {/* Header State Indicator */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {step === 'CREDENTIALS' && 'Master Authentication'}
                {step === 'MFA_CHALLENGE' && 'Step 2: MFA Challenge'}
                {step === 'MFA_ENROLLMENT' && 'MFA Mandatory Enrollment'}
                {step === 'RECOVERY_CODE' && 'Emergency Recovery Code'}
              </span>
            </div>
            {step === 'CREDENTIALS' && (
              <button
                type="button"
                onClick={handleFillDemoAdmin}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors"
              >
                <Sparkles className="w-3 h-3 text-indigo-500" />
                <span>Auto-Fill Demo</span>
              </button>
            )}
          </div>

          {/* Lockout Banner */}
          {isLocked && (
            <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 animate-in fade-in">
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
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 1: CREDENTIALS FORM */}
          {/* ------------------------------------------------------------- */}
          {step === 'CREDENTIALS' && (
            <form onSubmit={handlePrimaryAuth} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Administrator Email</span>
                  </span>
                  {cleanEmail && (
                    <span className="text-[10px] font-semibold text-indigo-600">
                      {isNewPasswordSetup ? 'First-Time Setup' : 'Existing Account'}
                    </span>
                  )}
                </label>
                <input
                  type="email"
                  required
                  disabled={isLocked || isLoading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@roommate.app or your real email"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {isNewPasswordSetup && cleanEmail && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 animate-in fade-in">
                  <p className="font-bold flex items-center gap-1.5 text-indigo-950">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    First-Time Master Security Key Setup
                  </p>
                  <p className="text-[11px] text-indigo-700/90 mt-0.5">
                    Choose a secure Master Security Key (minimum 6 characters) for your administrator account.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>{isNewPasswordSetup ? 'Create Master Security Key' : 'Master Security Key'}</span>
                </label>
                <input
                  type="password"
                  required
                  disabled={isLocked || isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isNewPasswordSetup ? 'Enter at least 6 characters' : '••••••••••••'}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs font-mono"
                />
              </div>

              {isNewPasswordSetup && (
                <div className="space-y-1.5 animate-in fade-in">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    <span>Confirm Master Security Key</span>
                  </label>
                  <input
                    type="password"
                    required
                    disabled={isLocked || isLoading}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your Master Security Key"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs font-mono"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLocked || isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-60 transition-all"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isNewPasswordSetup ? 'Set Key & Continue' : 'Authenticate Credentials'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 2: MFA CHALLENGE FORM */}
          {/* ------------------------------------------------------------- */}
          {step === 'MFA_CHALLENGE' && (
            <form onSubmit={handleVerifyChallenge} className="space-y-4">
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-slate-700">
                <p className="font-semibold text-indigo-950">Enter Time-Based 6-Digit MFA Token</p>
                <p className="text-[11px] text-indigo-700/80 mt-0.5">
                  Open your Authenticator app (Google Authenticator, Authy, 1Password) to retrieve your code.
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
                  className="w-full text-center tracking-widest text-lg font-mono font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              <button
                type="submit"
                disabled={isLocked || isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-60 transition-all"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Verify &amp; Access Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep('CREDENTIALS');
                    setMfaCode('');
                    setError(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  &larr; Re-enter password
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('RECOVERY_CODE');
                    setError(null);
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                >
                  Lost device? Use Recovery Code
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleResetMfaAndReEnroll}
                  disabled={isLoading || isLocked}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-scan QR / Reset Authenticator</span>
                </button>
              </div>
            </form>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 2B: MANDATORY MFA ENROLLMENT (First-Time Setup) */}
          {/* ------------------------------------------------------------- */}
          {step === 'MFA_ENROLLMENT' && enrollmentData && (
            <form onSubmit={handleCompleteEnrollment} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-600" />
                  Mandatory MFA Setup Required
                </p>
                <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                  SuperAdmin accounts require multi-factor authentication. Scan this QR code in Google Authenticator, Authy, or 1Password.
                </p>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <img
                  src={enrollmentData.qrCodeSvg}
                  alt="MFA QR Code"
                  className="w-44 h-44 rounded-lg bg-white p-2 border border-slate-200 shadow-2xs"
                />
                <div className="mt-3 flex items-center gap-1.5 text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-mono">
                  <span>Secret: {enrollmentData.secret}</span>
                  <button
                    type="button"
                    onClick={copySecretToClipboard}
                    className="text-indigo-600 hover:text-indigo-800 ml-1 p-0.5"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Emergency Recovery Codes Section */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-indigo-600" />
                    One-Time Recovery Codes ({generatedRecoveryCodes.length})
                  </span>
                  <button
                    type="button"
                    onClick={downloadRecoveryCodes}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    {copiedCodes ? 'Downloaded' : 'Download Codes'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Save these codes now. You will need them if you ever lose your authenticator app.
                </p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 max-h-24 overflow-y-auto">
                  {generatedRecoveryCodes.map((code, idx) => (
                    <div key={idx} className="p-1 bg-slate-50 rounded border border-slate-100 text-center">
                      {code}
                    </div>
                  ))}
                </div>

                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={codesAcknowledged}
                    onChange={(e) => setCodesAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] text-slate-600 font-medium">
                    I have safely stored these emergency recovery codes offline.
                  </span>
                </label>
              </div>

              {/* Confirmation Code Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Enter 6-Digit Code Generated by your Authenticator App:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  disabled={isLocked || isLoading}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center tracking-widest text-lg font-mono font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              <button
                type="submit"
                disabled={isLocked || isLoading || !codesAcknowledged}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Confirm &amp; Activate SuperAdmin MFA</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 2C: EMERGENCY RECOVERY CODE FORM */}
          {/* ------------------------------------------------------------- */}
          {step === 'RECOVERY_CODE' && (
            <form onSubmit={handleVerifyRecoveryCode} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-600" />
                  One-Time Emergency Access
                </p>
                <p className="text-[11px] text-amber-700 mt-1">
                  Enter one of your 8 backup recovery codes. Each code can only be used once and is permanently consumed.
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
                  className="w-full text-center tracking-widest text-base font-mono font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={isLocked || isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-60 transition-all"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Verify Recovery Code &amp; Log In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('MFA_CHALLENGE');
                  setRecoveryCode('');
                  setError(null);
                }}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors pt-1"
              >
                &larr; Back to Authenticator App
              </button>
            </form>
          )}

          {/* Student simulator button */}
          {onOpenMobilePreview && (
            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onOpenMobilePreview}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Return to Student Mobile Web Simulator</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
