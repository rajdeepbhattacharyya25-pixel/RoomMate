import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { Sparkles, Smartphone, ArrowRight, ArrowLeft, Check, Loader2, User as UserIcon } from 'lucide-react';
import { hapticSuccess, hapticWarning, hapticImpact } from '../../lib/native/haptics';
import { completeProfileOnboarding, validateAndFormatPhoneNumber } from '../../lib/storage/cloudStorageAdapter';
import { PhoneInput } from '../common/PhoneInput';

interface FirstLoginOnboardingModalProps {
  isOpen: boolean;
  user: User;
  extractedFirstName?: string;
  isGoogleUser?: boolean;
  onCompleted: (updatedUser: User, firstName: string) => void;
}

export const FirstLoginOnboardingModal: React.FC<FirstLoginOnboardingModalProps> = ({
  isOpen,
  user,
  extractedFirstName = '',
  isGoogleUser = true,
  onCompleted,
}) => {
  const [step, setStep] = useState<'NAME' | 'PHONE'>('NAME');
  const [firstName, setFirstName] = useState(extractedFirstName || user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const initialName = extractedFirstName || user.name || '';
      setFirstName(initialName);
      setPhone(user.phone || '');
      setError(null);
      // If user already has a valid confirmed name, jump straight to PHONE step
      if (user.onboardingCompleted === false && user.name && user.name !== 'Resident' && user.phone) {
        setStep('PHONE');
      } else {
        setStep('NAME');
      }
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 200);
    }
  }, [isOpen, user, extractedFirstName]);

  if (!isOpen) return null;

  // Step 1: Handle First Name Confirmation / Edit
  const handleConfirmName = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = firstName.trim();
    if (!cleanName) {
      hapticWarning();
      setError('Please enter your first name.');
      return;
    }
    if (cleanName.length < 2) {
      hapticWarning();
      setError('First name must be at least 2 characters.');
      return;
    }

    hapticImpact('LIGHT');
    setError(null);
    setStep('PHONE');
    setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 150);
  };

  // Step 2: Handle Phone Number Submission and Backend Persistence
  const handleSubmitPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = firstName.trim();
    if (!cleanName) {
      setStep('NAME');
      setError('Please provide your first name.');
      return;
    }

    const validation = validateAndFormatPhoneNumber(phone);
    if (!validation.isValid) {
      hapticWarning();
      setError(validation.error || 'Please enter a valid 10-digit phone number.');
      return;
    }

    setIsSaving(true);

    try {
      const result = await completeProfileOnboarding(user.id, {
        name: cleanName,
        phone: validation.formatted,
      });

      if (!result.success || !result.user) {
        hapticWarning();
        setError(result.error || "Couldn't save your profile. Please try again.");
        setIsSaving(false);
        return;
      }

      await hapticSuccess();
      onCompleted(result.user, cleanName);
    } catch (err: unknown) {
      hapticWarning();
      setError(err instanceof Error ? err.message : "Couldn't save your profile. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[120] bg-slate-900/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 text-slate-900 animate-in fade-in select-none"
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-5 animate-in slide-in-from-bottom-8 sm:zoom-in-95">
        {/* User Identity Header */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/70 rounded-2xl">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-11 h-11 rounded-full object-cover border-2 border-indigo-200 shadow-sm shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
              {(firstName.charAt(0) || user.name.charAt(0) || 'U').toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-slate-900 truncate">
                {firstName || user.name}
              </h4>
              {isGoogleUser ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200/60">
                  <Check className="w-2.5 h-2.5 stroke-[3]" /> Google
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-200/60">
                  Resident
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 truncate font-medium">{user.email}</p>
          </div>
        </div>

        {/* Step Indicator & Titles */}
        {step === 'NAME' ? (
          <div className="text-center space-y-1">
            <div className="inline-flex p-3 rounded-2xl bg-indigo-50 text-indigo-600 mb-1">
              <Sparkles className="w-6 h-6 stroke-[2.2]" />
            </div>
            <h3 id="onboarding-title" className="text-lg font-bold text-slate-900">
              Welcome to RoomMate! 👋
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              {isGoogleUser && extractedFirstName
                ? 'We found your first name from your Google account. Is this correct?'
                : "Let's set up your first name so flatmates can easily identify you."}
            </p>
          </div>
        ) : (
          <div className="text-center space-y-1">
            <div className="inline-flex p-3 rounded-2xl bg-emerald-50 text-emerald-600 mb-1">
              <Smartphone className="w-6 h-6 stroke-[2.2]" />
            </div>
            <h3 id="onboarding-title" className="text-lg font-bold text-slate-900">
              One more thing 📱
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Add your phone number to complete your RoomMate profile and receive payment settlements.
            </p>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center animate-in fade-in">
            {error}
          </div>
        )}

        {/* Step 1: First Name Form */}
        {step === 'NAME' && (
          <form onSubmit={handleConfirmName} className="space-y-4">
            <div>
              <label
                htmlFor="onboarding-first-name"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                First name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  id="onboarding-first-name"
                  ref={nameInputRef}
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isSaving}
                  placeholder="e.g. Rajdeep"
                  autoComplete="given-name"
                  className="w-full pl-10 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400 placeholder:font-normal"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                You can change this anytime later in Settings → Account.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSaving || !firstName.trim()}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Step 2: Phone Number Form */}
        {step === 'PHONE' && (
          <form onSubmit={handleSubmitPhone} className="space-y-4">
            <div>
              <label
                htmlFor="onboarding-phone-number"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Phone number
              </label>
              <PhoneInput
                id="onboarding-phone-number"
                ref={phoneInputRef}
                value={phone}
                onChange={(cleanDigits) => {
                  setPhone(cleanDigits);
                  if (error) setError(null);
                }}
                disabled={isSaving}
                hasError={Boolean(error)}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Used for instant UPI QR settlements and room expense notifications.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('NAME');
                  setError(null);
                }}
                disabled={isSaving}
                className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={isSaving || !phone.trim()}
                className="flex-[2] h-12 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
