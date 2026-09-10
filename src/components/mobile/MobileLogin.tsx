import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import {
  createResidentToken,
  verifyResidentToken,
  storeResidentSession,
  checkBiometricCapabilities,
  authenticateWithBiometrics,
  evaluatePasswordStrength,
  generateStrongPasswordSuggestion,
  BiometricDeviceStatus,
  ResidentJwtPayload,
} from '../../lib/auth/jwtService';
import {
  Fingerprint,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
  Check,
  ArrowRight,
  RefreshCw,
  Wallet,
  Key,
  ShieldCheck,
  ChevronRight,
  X,
  UserCheck,
} from 'lucide-react';

interface MobileLoginProps {
  allUsers: User[];
  onLogin: (user: User, token: string) => void;
  onJoinWithCode?: (code: string) => void;
}

export const MobileLogin: React.FC<MobileLoginProps> = ({
  allUsers,
  onLogin,
  onJoinWithCode,
}) => {
  // Navigation Tabs: Resident Sign In vs New Resident / Passcode
  const [authTab, setAuthTab] = useState<'signin' | 'create'>('signin');

  // Form Fields for Sign In
  const [identifier, setIdentifier] = useState('rajdeep@campusflow.io');
  const [password, setPassword] = useState('1234');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  // Form Fields for New Resident
  const [newResidentName, setNewResidentName] = useState('');
  const [newResidentEmail, setNewResidentEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [suggestedPassword, setSuggestedPassword] = useState(() => generateStrongPasswordSuggestion());

  // Biometrics State
  const [_biometricDevice, setBiometricDevice] = useState<BiometricDeviceStatus>({
    isSupported: false,
    type: 'Emulated',
    detail: 'Detecting biometric hardware...',
  });
  const [isScanningBiometrics, setIsScanningBiometrics] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);

  // JWT Token Inspection Modal
  const [inspectingJwt, setInspectingJwt] = useState<ResidentJwtPayload | null>(null);

  // Invite Code Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  // Error & Feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDemoUserId, setSelectedDemoUserId] = useState<string | null>(null);

  // Filter out any super admin users to present residents
  const residentUsers = allUsers.filter((u) => u.role !== 'SUPER_ADMIN');

  // Check device biometrics on mount
  useEffect(() => {
    checkBiometricCapabilities().then((status) => {
      setBiometricDevice(status);
    });
  }, []);

  // Live password strength calculation
  const strength = evaluatePasswordStrength(newPassword);

  // Handle Standard Sign In
  const handleSignIn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const cleanId = identifier.trim().toLowerCase();
    const matchedUser = residentUsers.find(
      (u) =>
        u.email.toLowerCase() === cleanId ||
        (u.phone && u.phone.replace(/\s/g, '').includes(cleanId)) ||
        u.name.toLowerCase() === cleanId
    );

    if (!matchedUser) {
      setErrorMessage('No resident account found with this email or mobile number.');
      return;
    }

    const token = createResidentToken(matchedUser, {
      expiresInDays: rememberDevice ? 7 : 1,
      biometricVerified: false,
    });

    const verifyResult = verifyResidentToken(token);
    if (!verifyResult.valid) {
      setErrorMessage(`JWT Verification Failed: ${verifyResult.error}`);
      return;
    }

    storeResidentSession(token, rememberDevice);
    onLogin(matchedUser, token);
  };

  // Handle Quick Demo 1-Tap Resident Selection
  const handleSelectDemoResident = (user: User) => {
    setSelectedDemoUserId(user.id);
    setIdentifier(user.email);
    setPassword('1234');
    setErrorMessage(null);

    const token = createResidentToken(user, {
      expiresInDays: 7,
      biometricVerified: false,
    });

    storeResidentSession(token, true);
    setTimeout(() => {
      onLogin(user, token);
    }, 200);
  };

  // Handle Biometric Login
  const handleBiometricAuth = async () => {
    setErrorMessage(null);
    setIsScanningBiometrics(true);
    setBiometricSuccess(false);

    try {
      const cleanId = identifier.trim().toLowerCase();
      const targetUser =
        residentUsers.find(
          (u) =>
            u.email.toLowerCase() === cleanId ||
            (u.phone && u.phone.replace(/\s/g, '').includes(cleanId))
        ) || residentUsers[0];

      const success = await authenticateWithBiometrics(targetUser.name);

      if (success) {
        setBiometricSuccess(true);
        const token = createResidentToken(targetUser, {
          expiresInDays: 7,
          biometricVerified: true,
        });

        storeResidentSession(token, true);
        setTimeout(() => {
          onLogin(targetUser, token);
        }, 600);
      } else {
        setErrorMessage('Biometric verification cancelled or unavailable on this device.');
      }
    } catch {
      setErrorMessage('Biometric scan encountered a hardware timeout.');
    } finally {
      setIsScanningBiometrics(false);
    }
  };

  // Handle Create Passcode / New Resident
  const handleCreateResident = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newResidentName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    if (!newResidentEmail.trim() || !newResidentEmail.includes('@')) {
      setErrorMessage('Please enter a valid university or personal email address.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMessage('Passcode / PIN must be at least 4 characters.');
      return;
    }

    let user = residentUsers.find((u) => u.email.toLowerCase() === newResidentEmail.trim().toLowerCase());

    if (!user) {
      const generatedId = 'user-new-' + newResidentEmail.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      user = {
        id: generatedId,
        name: newResidentName.trim(),
        email: newResidentEmail.trim(),
        phone: '+91 98765 00000',
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (!user) return;

    const token = createResidentToken(user, {
      expiresInDays: 7,
      biometricVerified: false,
    });

    storeResidentSession(token, true);
    onLogin(user, token);
  };

  const handleApplySuggestion = () => {
    setNewPassword(suggestedPassword);
    setShowNewPassword(true);
  };

  const handleRefreshSuggestion = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSuggestedPassword(generateStrongPasswordSuggestion());
  };

  const handleOpenJwtInspector = () => {
    const demoToken = createResidentToken(residentUsers[0], { expiresInDays: 7, biometricVerified: true });
    const result = verifyResidentToken(demoToken);
    if (result.payload) {
      setInspectingJwt(result.payload);
    }
  };

  const handleJoinWithCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    if (onJoinWithCode) {
      onJoinWithCode(inviteCodeInput.trim().toUpperCase());
      setShowInviteModal(false);
    }
  };

  // Top 3 demo residents (Rajdeep, Sneha, Amit)
  const topDemoResidents = residentUsers.slice(0, 3);

  return (
    <main className="w-full h-full min-h-[820px] bg-[#F9F9FF] flex flex-col justify-between relative overflow-hidden font-sans select-none text-slate-900">
      {/* 1. iOS Native Status Bar */}
      <header className="w-full px-6 pt-3 pb-1.5 flex items-center justify-between select-none shrink-0 bg-[#F9F9FF]">
        <span className="text-[14px] font-semibold text-slate-900 tracking-tight">9:41</span>
        <div className="flex items-center space-x-2 text-slate-900">
          {/* Signal */}
          <svg className="w-4 h-3 fill-current" viewBox="0 0 17 12">
            <rect x="0" y="9" width="2.5" height="3" rx="0.5" />
            <rect x="4" y="6" width="2.5" height="6" rx="0.5" />
            <rect x="8" y="3" width="2.5" height="9" rx="0.5" />
            <rect x="12" y="0" width="2.5" height="12" rx="0.5" />
          </svg>
          {/* Wi-Fi */}
          <svg className="w-4 h-3 fill-current" viewBox="0 0 16 12">
            <path d="M8 9.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4.24-3.53a6.002 6.002 0 018.48 0 .75.75 0 001.06-1.06 7.502 7.502 0 00-10.6 0 .75.75 0 001.06 1.06zm-2.12-2.13a9.003 9.003 0 0112.72 0 .75.75 0 001.06-1.06 10.503 10.503 0 00-14.84 0 .75.75 0 001.06 1.06z" />
          </svg>
          {/* Battery */}
          <div className="flex items-center">
            <div className="w-5 h-2.5 rounded-[3px] border border-slate-900 p-[1px] flex items-center">
              <div className="w-3 h-full bg-slate-900 rounded-[1px]" />
            </div>
            <div className="w-[1px] h-1 bg-slate-900 rounded-r-[1px] ml-[1px]" />
          </div>
        </div>
      </header>

      {/* Scrollable Center Canvas */}
      <div className="flex-1 px-4 flex flex-col justify-start pt-1 pb-5 space-y-4 overflow-y-auto">
        
        {/* 2. Brand & Header Block (Exact Stitch Screen 805c0b9360af454eaa1ef6649e721536) */}
        <section className="flex flex-col items-center text-center pt-2">
          {/* Logo Emblem */}
          <div className="relative w-16 h-16 mb-2.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl filter blur-[6px]" />
            <div className="relative w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center shadow-inner">
              <Wallet className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">CampusFlow</h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">Room & Expense Ledger</p>
          <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
            <span className="text-[11px] font-medium text-slate-600">Version 2.4 • Flat 302 Ledger</span>
          </div>
        </section>

        {/* 3. Segmented Tactical Pill Control (iOS Segmented Switch) */}
        <section className="w-full bg-slate-100 p-1 rounded-xl border border-slate-200/80 flex items-center">
          <button
            type="button"
            onClick={() => {
              setAuthTab('signin');
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center space-x-1.5 ${
              authTab === 'signin'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Resident Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthTab('create');
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center space-x-1.5 ${
              authTab === 'create'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>New Resident</span>
          </button>
        </section>

        {/* Error message banner */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium leading-relaxed animate-in fade-in">
            {errorMessage}
          </div>
        )}

        {/* 4. Form Credentials Card */}
        {authTab === 'signin' ? (
          <section className="w-full bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3.5">
            <form onSubmit={handleSignIn} className="space-y-3.5">
              {/* Input: Identifier */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="identifier-input">
                    Email or Mobile Number
                  </label>
                  <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-0.5">
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </span>
                </div>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="identifier-input"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="name@campusflow.io or +91 98765..."
                    className="w-full h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Input: Passcode / PIN */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="pin-input">
                    Passcode / Security PIN
                  </label>
                  <button
                    type="button"
                    onClick={() => alert('Demo PIN for all pre-seeded residents is: 1234')}
                    className="text-[11px] text-indigo-600 hover:underline font-medium"
                  >
                    Forgot PIN?
                  </button>
                </div>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="pin-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••"
                    className="w-full h-11 pl-10 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono tracking-widest focus:border-indigo-600 focus:bg-white focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Row: Remember Device Switch */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                  </div>
                  <span className="text-xs text-slate-600 font-medium">Remember this device</span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">PIN: 1234</span>
              </div>

              {/* 5. Primary Action Button */}
              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm active:scale-[0.98] transition-transform duration-150"
                >
                  <span>Sign In as Resident</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Biometrics 1-Tap Option */}
            <div>
              <button
                type="button"
                onClick={handleBiometricAuth}
                disabled={isScanningBiometrics}
                className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-indigo-700 font-semibold text-xs flex items-center justify-center space-x-2 active:scale-[0.98] transition-all"
              >
                {isScanningBiometrics ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Verifying Face ID / Biometrics...</span>
                  </>
                ) : biometricSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">Authenticated via Biometrics</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 text-indigo-600" />
                    <span>Sign In with Face ID / Biometrics</span>
                  </>
                )}
              </button>
            </div>

            {/* 6. Secondary Quick Action: Room Invite */}
            <div>
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="w-full h-10 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium text-xs flex items-center justify-center space-x-1.5 hover:bg-slate-50 active:scale-[0.98] transition-all duration-150"
              >
                <Key className="w-3.5 h-3.5 text-indigo-600" />
                <span>Join Room with Invite Code</span>
              </button>
            </div>
          </section>
        ) : (
          /* TAB 2: CREATE PASSCODE / NEW RESIDENT */
          <section className="w-full bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3.5 animate-in fade-in">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <h2 className="text-xs font-bold text-slate-900">Set Passcode / Join Ledger</h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 rounded-full">
                New Resident
              </span>
            </div>

            <form onSubmit={handleCreateResident} className="space-y-3">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Your Full Name</label>
                <input
                  type="text"
                  value={newResidentName}
                  onChange={(e) => setNewResidentName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">University / Personal Email</label>
                <input
                  type="email"
                  value={newResidentEmail}
                  onChange={(e) => setNewResidentEmail(e.target.value)}
                  placeholder="rahul@campusflow.io"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                  required
                />
              </div>

              {/* Security PIN */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">Create 4-Digit Passcode</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleApplySuggestion}
                      className="text-[10px] text-indigo-600 hover:underline font-semibold flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Auto-Suggest ({suggestedPassword})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshSuggestion}
                      className="p-0.5 text-slate-400 hover:text-indigo-600 rounded"
                      title="New suggestion"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="e.g. 8492"
                    className="w-full h-10 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono tracking-widest focus:bg-white focus:border-indigo-600 focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 p-1 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {newPassword.length > 0 && (
                  <div className="pt-1 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden flex gap-1">
                      <div
                        className={`h-full rounded-full transition-all ${
                          strength.percentage >= 33 ? 'w-1/3 bg-rose-500' : 'w-0'
                        }`}
                      />
                      <div
                        className={`h-full rounded-full transition-all ${
                          strength.percentage >= 66 ? 'w-1/3 bg-amber-500' : 'w-0'
                        }`}
                      />
                      <div
                        className={`h-full rounded-full transition-all ${
                          strength.percentage >= 100 ? 'w-1/3 bg-emerald-500' : 'w-0'
                        }`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">{strength.label}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 shadow-sm active:scale-[0.98] transition-all mt-2"
              >
                <span>Create Resident Passcode</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </section>
        )}

        {/* 7. Quick-Select Demo Profile Row (Exact Stitch Screen 805c0b9360af454eaa1ef6649e721536) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Or Quick Select Resident (Demo)
            </p>
            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
              Flat 302
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {topDemoResidents.map((user, idx) => {
              const isActive = selectedDemoUserId === user.id || identifier === user.email;
              const initials = user.name.charAt(0).toUpperCase();

              // Specific avatar backgrounds
              const bgColors = [
                'bg-indigo-100 text-indigo-700',
                'bg-purple-100 text-purple-700',
                'bg-emerald-100 text-emerald-700',
              ];

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelectDemoResident(user)}
                  className={`flex flex-col items-center p-2 rounded-xl bg-white border transition-all active:scale-95 text-center shadow-2xs ${
                    isActive
                      ? 'border-2 border-indigo-600 ring-2 ring-indigo-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`w-9 h-9 rounded-full ${bgColors[idx % 3]} font-bold flex items-center justify-center text-xs shadow-inner`}
                    >
                      {initials}
                    </div>
                    {isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                        <Check className="w-2 h-2 text-white stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <span className="mt-1 text-xs font-semibold text-slate-900 truncate w-full">
                    {user.name.split(' ')[0]}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Room 302</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 8. Bottom Links & Trust Indicators */}
        <footer className="pt-1 flex flex-col items-center space-y-2">
          {/* JWT Token Inspection Shortcut */}
          <button
            type="button"
            onClick={handleOpenJwtInspector}
            className="group flex items-center space-x-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <span>Inspect Resident JWT Session</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Security Badge */}
          <div className="flex items-center space-x-1 text-slate-400 text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>End-to-End Private Vault • 256-bit Encrypted</span>
          </div>
        </footer>
      </div>

      {/* iOS Home Indicator Bottom Bar */}
      <div className="w-full pb-2 pt-1 flex justify-center items-center select-none bg-[#F9F9FF] shrink-0">
        <div className="w-32 h-1 bg-slate-300 rounded-full" />
      </div>

      {/* Invite Code Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Join Flat via Invite</h3>
                  <p className="text-[11px] text-slate-500">6-character room pass</p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleJoinWithCodeSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="FLAT02"
                  className="w-full h-12 text-center text-lg font-mono font-bold tracking-widest bg-slate-50 border border-slate-300 rounded-xl uppercase text-indigo-700 focus:outline-none focus:border-indigo-600"
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 text-center mt-1">
                  Try demo code: <strong className="text-slate-600 font-mono">FLAT02</strong>
                </p>
              </div>

              <button
                type="submit"
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl active:scale-[0.98] transition-all"
              >
                Join Room
              </button>
            </form>
          </div>
        </div>
      )}

      {/* JWT Token Debug Modal */}
      {inspectingJwt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-5 space-y-3.5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Resident JWT Payload</h3>
              </div>
              <button
                onClick={() => setInspectingJwt(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left font-mono text-[10px] text-slate-700 space-y-1 overflow-x-auto">
              <div><strong className="text-slate-900">iss:</strong> {inspectingJwt.iss}</div>
              <div><strong className="text-slate-900">sub (userId):</strong> {inspectingJwt.sub}</div>
              <div><strong className="text-slate-900">name:</strong> {inspectingJwt.name}</div>
              <div><strong className="text-slate-900">email:</strong> {inspectingJwt.email}</div>
              <div><strong className="text-slate-900">role:</strong> {inspectingJwt.role}</div>
              <div><strong className="text-slate-900">biometricVerified:</strong> {String(inspectingJwt.biometricVerified)}</div>
              <div><strong className="text-slate-900">exp:</strong> {new Date(inspectingJwt.exp * 1000).toLocaleString()}</div>
            </div>

            <button
              onClick={() => setInspectingJwt(null)}
              className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
