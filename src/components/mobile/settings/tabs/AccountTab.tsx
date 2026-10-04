import React, { useState, useEffect } from 'react';
import {
  Camera,
  QrCode,
  CheckCircle2,
  Eye,
  Upload,
  Trash2,
  Copy,
  Check,
  Loader2,
  Edit2,
  Mail,
  AtSign,
  Smartphone,
  X,
  Sparkles,
} from 'lucide-react';
import { User } from '../../../../types';
import { pickImageFile, uploadImage } from '../../../../lib/services/imageUploadService';
import { updateProfileAvatar, updateUpiQrUrl, updateProfileUpiId } from '../../../../lib/storage/cloudStorageAdapter';
import { supabase, isSupabaseConfigured } from '../../../../lib/supabase/client';
import { UserAvatar } from '../../../common/UserAvatar';
import { isGoogleDefaultAvatar } from '../../../../lib/utils/avatarUtils';
import { decodeQrFromImage } from '../../../../lib/services/qrDecoder';
import { extractUpiIdFromQrPayload } from '../../../../lib/payments/upiExtraction';
import { hapticSuccess, hapticImpact, hapticWarning } from '../../../../lib/native/haptics';
import { playSuccessSound } from '../../../../lib/native/notificationSound';
import { EditNameModal } from '../modals/EditNameModal';
import { EditPhoneModal } from '../modals/EditPhoneModal';
import { ChangeEmailModal } from '../modals/ChangeEmailModal';
import { EditUsernameModal } from '../modals/EditUsernameModal';
import { EditUpiIdModal } from '../modals/EditUpiIdModal';
import { QrPreviewModal } from '../modals/QrPreviewModal';
import { FullScreenQrModal } from '../modals/FullScreenQrModal';

interface AccountTabProps {
  currentUser: User;
  onProfileUpdated?: () => void;
  onShowToast: (msg: string) => void;
}

export const AccountTab: React.FC<AccountTabProps> = ({
  currentUser,
  onProfileUpdated,
  onShowToast,
}) => {
  // Modal states
  const [showEditName, setShowEditName] = useState(false);
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showEditUsername, setShowEditUsername] = useState(false);
  const [showEditUpi, setShowEditUpi] = useState(false);
  const [showQrPreview, setShowQrPreview] = useState(false);
  const [showFullQr, setShowFullQr] = useState(false);

  const [showPhotoActionSheet, setShowPhotoActionSheet] = useState(false);
  const [googlePhotoAvailable, setGooglePhotoAvailable] = useState<string | null>(null);

  // Avatar & QR local overrides
  const [avatarUrlOverride, setAvatarUrlOverride] = useState<string | null>(null);
  const [upiQrUrlOverride, setUpiQrUrlOverride] = useState<string | null | undefined>(undefined);

  const effectiveAvatar = avatarUrlOverride !== null ? avatarUrlOverride : currentUser.avatarUrl;
  const effectiveQr = upiQrUrlOverride !== undefined ? (upiQrUrlOverride || undefined) : currentUser.upiQrUrl;

  // Auto-collect Google profile photo if available and user has not explicitly customized/removed it
  useEffect(() => {
    async function checkGoogleAvatar() {
      if (!isSupabaseConfigured) return;

      // If current profile avatar is a Google default letter avatar, clean it up immediately
      if (
        currentUser.avatarUrl &&
        (currentUser.avatarUrl.includes('googleusercontent.com') ||
          currentUser.avatarUrl.includes('google.com') ||
          currentUser.avatarUrl.includes('gstatic.com'))
      ) {
        const isCurrentDefault = await isGoogleDefaultAvatar(currentUser.avatarUrl);
        if (isCurrentDefault) {
          await updateProfileAvatar(currentUser.id, null);
          setAvatarUrlOverride('');
          if (onProfileUpdated) onProfileUpdated();
        }
      }

      const customPref = typeof localStorage !== 'undefined'
        ? localStorage.getItem(`roommate_avatar_custom_${currentUser.id}`)
        : null;

      if (customPref === 'removed' || customPref === 'custom') return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const googlePhoto =
          (session?.user?.user_metadata?.avatar_url as string) ||
          (session?.user?.user_metadata?.picture as string) ||
          (session?.user?.user_metadata?.photo_url as string) ||
          (session?.user?.identities?.[0]?.identity_data?.avatar_url as string) ||
          (session?.user?.identities?.[0]?.identity_data?.picture as string);

        if (googlePhoto) {
          const isDefault = await isGoogleDefaultAvatar(googlePhoto);
          if (isDefault) {
            setGooglePhotoAvailable(null);
            return;
          }

          setGooglePhotoAvailable(googlePhoto);
          if (googlePhoto !== currentUser.avatarUrl) {
            await updateProfileAvatar(currentUser.id, googlePhoto);
            setAvatarUrlOverride(googlePhoto);
            if (onProfileUpdated) onProfileUpdated();
          }
        }
      } catch (err) {
        console.warn('Failed to auto-fetch Google avatar:', err);
      }
    }

    checkGoogleAvatar();
  }, [currentUser.id, currentUser.avatarUrl, onProfileUpdated]);

  const handleOpenPhotoActions = async () => {
    if (isSupabaseConfigured) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const googlePhoto =
          (session?.user?.user_metadata?.avatar_url as string) ||
          (session?.user?.user_metadata?.picture as string) ||
          (session?.user?.user_metadata?.photo_url as string) ||
          (session?.user?.identities?.[0]?.identity_data?.avatar_url as string) ||
          (session?.user?.identities?.[0]?.identity_data?.picture as string) ||
          null;

        if (googlePhoto) {
          const isDefault = await isGoogleDefaultAvatar(googlePhoto);
          setGooglePhotoAvailable(isDefault ? null : googlePhoto);
        } else {
          setGooglePhotoAvailable(null);
        }
      } catch {
        setGooglePhotoAvailable(null);
      }
    }
    setShowPhotoActionSheet(true);
  };

  // Upload states
  const [isUploadingDp, setIsUploadingDp] = useState(false);
  const [pendingQrFile, setPendingQrFile] = useState<File | null>(null);
  const [pendingQrPreview, setPendingQrPreview] = useState<string | null>(null);
  const [isSavingQr, setIsSavingQr] = useState(false);
  const [isAnalyzingQr, setIsAnalyzingQr] = useState(false);
  const [extractedUpiFromQr, setExtractedUpiFromQr] = useState<string | null>(null);

  // Revoke object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pendingQrPreview && pendingQrPreview.startsWith('blob:')) {
        URL.revokeObjectURL(pendingQrPreview);
      }
    };
  }, [pendingQrPreview]);

  // Username
  const storedUsername =
    (typeof localStorage !== 'undefined' ? localStorage.getItem(`roommate_username_${currentUser.id}`) : null) ||
    currentUser.name.toLowerCase().replace(/\s+/g, '_');
  const [username, setUsername] = useState(storedUsername);

  // UPI ID
  const savedUpi =
    currentUser.upiId ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem(`roommate_upi_${currentUser.id}`) : '') ||
    '';
  const defaultUpi = savedUpi || `${currentUser.name.toLowerCase().replace(/\s+/g, '')}@okaxis`;
  const [upiId, setUpiId] = useState(defaultUpi);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Profile DP upload
  const handleUploadDp = async () => {
    setShowPhotoActionSheet(false);
    try {
      const file = await pickImageFile('image/*');
      if (!file) return;

      setIsUploadingDp(true);
      const result = await uploadImage(file, `${currentUser.name}_avatar`);

      if (result.success && result.url) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`roommate_avatar_custom_${currentUser.id}`, 'custom');
        }
        await updateProfileAvatar(currentUser.id, result.url);
        setAvatarUrlOverride(result.url);
        await hapticSuccess();
        playSuccessSound();
        onShowToast('Profile photo updated successfully!');
        if (onProfileUpdated) onProfileUpdated();
      } else {
        onShowToast(result.error || 'Failed to upload photo. Please retry.');
      }
    } catch {
      onShowToast('Error selecting photo');
    } finally {
      setIsUploadingDp(false);
    }
  };

  const handleRemovePhoto = async () => {
    setShowPhotoActionSheet(false);
    setIsUploadingDp(true);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`roommate_avatar_custom_${currentUser.id}`, 'removed');
      }
      await updateProfileAvatar(currentUser.id, null);
      setAvatarUrlOverride('');
      await hapticSuccess();
      playSuccessSound();
      onShowToast('Profile photo removed. Using default avatar.');
      if (onProfileUpdated) onProfileUpdated();
    } catch {
      onShowToast('Failed to remove photo.');
    } finally {
      setIsUploadingDp(false);
    }
  };

  const handleApplyGooglePhoto = async () => {
    if (!googlePhotoAvailable) return;
    setShowPhotoActionSheet(false);
    setIsUploadingDp(true);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`roommate_avatar_custom_${currentUser.id}`);
      }
      await updateProfileAvatar(currentUser.id, googlePhotoAvailable);
      setAvatarUrlOverride(googlePhotoAvailable);
      await hapticSuccess();
      playSuccessSound();
      onShowToast('Google profile photo applied!');
      if (onProfileUpdated) onProfileUpdated();
    } catch {
      onShowToast('Failed to apply Google photo.');
    } finally {
      setIsUploadingDp(false);
    }
  };

  // QR select, decode, and preview
  const handleSelectQr = async () => {
    try {
      const file = await pickImageFile('image/*');
      if (!file) return;

      setIsAnalyzingQr(true);

      // 1. Decode QR code locally
      const decodeResult = await decodeQrFromImage(file);
      if (!decodeResult.success) {
        await hapticWarning();
        onShowToast(decodeResult.errorMessage || "We couldn't detect a QR code in this image.");
        return;
      }

      // 2. Extract UPI ID if payload is a UPI payment URI
      let extractedUpi: string | null = null;
      if (decodeResult.rawPayload) {
        const upiDetails = extractUpiIdFromQrPayload(decodeResult.rawPayload);
        if (upiDetails) {
          extractedUpi = upiDetails.upiId;
        }
      }

      const previewUrl = URL.createObjectURL(file);
      setPendingQrFile(file);
      setPendingQrPreview(previewUrl);
      setExtractedUpiFromQr(extractedUpi);
      setShowQrPreview(true);
    } catch {
      onShowToast('Error reading payment QR image');
    } finally {
      setIsAnalyzingQr(false);
    }
  };

  // Confirm QR save (with optional UPI ID save/update)
  const handleConfirmSaveQr = async (saveUpi: boolean, upiToSave?: string) => {
    if (!pendingQrFile) return;
    setIsSavingQr(true);
    try {
      const result = await uploadImage(pendingQrFile, `${currentUser.name}_upi_qr`);
      if (result.success && result.url) {
        // 1. Save QR image URL
        const saved = await updateUpiQrUrl(currentUser.id, result.url);
        if (!saved) {
          onShowToast('Could not save QR code to cloud profile. Please check your connection and retry.');
          return;
        }
        setUpiQrUrlOverride(result.url);

        // 2. Save UPI ID if confirmed or edited
        let extraMsg = '';
        if (saveUpi && upiToSave) {
          const clean = upiToSave.trim().toLowerCase();
          await updateProfileUpiId(currentUser.id, clean);
          setUpiId(clean);
          extraMsg = ` UPI ID ${clean} has also been saved.`;
        }

        await hapticSuccess();
        playSuccessSound();
        onShowToast(`QR code saved successfully.${extraMsg}`);
        setShowQrPreview(false);
        setPendingQrFile(null);
        setPendingQrPreview(null);
        setExtractedUpiFromQr(null);
        if (onProfileUpdated) onProfileUpdated();
      } else {
        onShowToast(result.error || 'Failed to save QR. Please retry.');
      }
    } catch {
      onShowToast('Error saving QR code');
    } finally {
      setIsSavingQr(false);
    }
  };

  // Remove QR
  const handleRemoveQr = async () => {
    if (!confirm('Remove your payment QR code? Roommates will have to enter your UPI ID manually.')) {
      return;
    }
    await updateUpiQrUrl(currentUser.id, '');
    setUpiQrUrlOverride('');
    await hapticImpact('MEDIUM');
    onShowToast('Payment QR removed.');
    if (onProfileUpdated) onProfileUpdated();
  };

  // Copy UPI
  const handleCopyUpi = () => {
    hapticSuccess();
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    onShowToast('UPI ID copied to clipboard!');
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 5.1 Profile Card */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none space-y-4 transition-colors duration-150">
        <div className="flex items-center space-x-3.5">
          {/* Avatar with Camera upload button */}
          <div className="relative group shrink-0">
            <button
              type="button"
              onClick={handleOpenPhotoActions}
              aria-label="Change profile photo"
              className="block rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-98 transition-transform"
            >
              <UserAvatar
                src={effectiveAvatar}
                name={currentUser.name}
                size="xl"
                roundedClassName="rounded-2xl"
                showBorder={true}
                borderColorClassName="border-white dark:border-[#12121A]"
                className="shadow-xs"
              />
            </button>

            <button
              type="button"
              onClick={handleOpenPhotoActions}
              disabled={isUploadingDp}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-[#12121A] hover:bg-indigo-700 active:scale-95 transition-all"
            >
              {isUploadingDp ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{currentUser.name}</h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  currentUser.role === 'SUPER_ADMIN'
                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                }`}
              >
                {currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'Resident'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{currentUser.email}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-medium">@{username}</span>
              <span className="text-[10px] text-slate-300 dark:text-slate-600">•</span>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {currentUser.phone || <span className="text-slate-400 dark:text-slate-500 italic">No phone added</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Edit Identity Actions */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setShowEditName(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-[#20202A] hover:bg-slate-100 dark:hover:bg-[#282836] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <Edit2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="truncate">Edit Name</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEditPhone(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-[#20202A] hover:bg-slate-100 dark:hover:bg-[#282836] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">Edit Phone</span>
          </button>

          <button
            type="button"
            onClick={() => setShowChangeEmail(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-[#20202A] hover:bg-slate-100 dark:hover:bg-[#282836] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <Mail className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="truncate">Email</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEditUsername(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-[#20202A] hover:bg-slate-100 dark:hover:bg-[#282836] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <AtSign className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="truncate">Username</span>
          </button>
        </div>
      </div>

      {/* 6. Payment Identity Section (Housed Exclusively in Account) */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Payment Identity
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            How roommates identify and pay you during settlements
          </p>
        </div>

        {/* 6.1 UPI ID Card */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#20202A] border border-slate-200/80 dark:border-[#27354A] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Your UPI ID (VPA)</span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleCopyUpi}
                className="p-1 rounded-md text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                title="Copy UPI ID"
              >
                {copiedUpi ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowEditUpi(true)}
                className="px-2 py-0.5 rounded text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
          <div className="text-xs font-mono font-bold text-emerald-800 dark:text-emerald-400 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{upiId}</span>
          </div>
        </div>

        {/* 6.2 UPI Payment QR Code Card */}
        <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                UPI Payment QR Code
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Roommates can scan this directly to settle debts with you.
              </p>
            </div>
          </div>

          {effectiveQr ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#20202A] border border-slate-200/80 dark:border-[#27354A]">
              <div
                onClick={() => setShowFullQr(true)}
                className="flex items-center space-x-3 cursor-pointer group"
              >
                <img
                  src={effectiveQr}
                  alt="My UPI QR"
                  className="w-12 h-12 rounded-lg object-contain bg-white dark:bg-[#181820] border border-slate-200 dark:border-[#27354A] p-0.5 group-hover:scale-105 transition-transform"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>QR Ready</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">PhonePe, GPay, Paytm compatible</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setShowFullQr(true)}
                  className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white dark:bg-[#181820] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#282836] active:scale-95 transition-all text-xs flex items-center gap-1 font-medium shadow-2xs"
                  title="View QR Code"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  onClick={handleSelectQr}
                  disabled={isAnalyzingQr}
                  className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-95 transition-all text-xs flex items-center gap-1 font-medium disabled:opacity-60"
                  title="Replace QR Code"
                >
                  {isAnalyzingQr ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{isAnalyzingQr ? 'Reading...' : 'Replace'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveQr}
                  className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:scale-95 transition-all text-xs flex items-center justify-center"
                  title="Remove QR Code"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 dark:border-[#27354A] rounded-xl p-4 text-center space-y-2.5 bg-slate-50/50 dark:bg-[#20202A]/50">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">No Payment QR uploaded yet</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-0.5">
                  Upload a screenshot of your PhonePe, Google Pay, or Paytm QR code.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSelectQr}
                disabled={isAnalyzingQr}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold shadow-xs active:scale-98 transition-all"
              >
                {isAnalyzingQr ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning QR Code...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Payment QR Code</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <EditNameModal
        isOpen={showEditName}
        currentUser={currentUser}
        onClose={() => setShowEditName(false)}
        onSaved={(_name) => {
          onShowToast('Name updated successfully!');
          if (onProfileUpdated) onProfileUpdated();
        }}
      />

      <EditPhoneModal
        isOpen={showEditPhone}
        currentUser={currentUser}
        onClose={() => setShowEditPhone(false)}
        onSaved={(_newPhone) => {
          onShowToast('Phone number updated successfully!');
          if (onProfileUpdated) onProfileUpdated();
        }}
      />

      <ChangeEmailModal
        isOpen={showChangeEmail}
        currentUser={currentUser}
        onClose={() => setShowChangeEmail(false)}
        onSuccess={(_email) => {
          if (onProfileUpdated) onProfileUpdated();
        }}
      />

      <EditUsernameModal
        isOpen={showEditUsername}
        currentUser={currentUser}
        currentUsername={username}
        onClose={() => setShowEditUsername(false)}
        onSaved={(newU) => {
          setUsername(newU);
          onShowToast('Username updated!');
          if (onProfileUpdated) onProfileUpdated();
        }}
      />

      <EditUpiIdModal
        isOpen={showEditUpi}
        currentUser={currentUser}
        currentUpiId={upiId}
        onClose={() => setShowEditUpi(false)}
        onSaved={(newUpi) => {
          setUpiId(newUpi);
          onShowToast('UPI ID updated!');
          if (onProfileUpdated) onProfileUpdated();
        }}
      />

      <QrPreviewModal
        isOpen={showQrPreview}
        previewUrl={pendingQrPreview}
        extractedUpiId={extractedUpiFromQr}
        existingUpiId={savedUpi}
        isSaving={isSavingQr}
        onClose={() => {
          setShowQrPreview(false);
          setPendingQrFile(null);
          setPendingQrPreview(null);
          setExtractedUpiFromQr(null);
        }}
        onConfirmSave={handleConfirmSaveQr}
      />

      <FullScreenQrModal
        isOpen={showFullQr}
        currentUser={currentUser}
        qrUrl={effectiveQr}
        onClose={() => setShowFullQr(false)}
      />

      {/* Profile Photo Action Sheet Modal */}
      {showPhotoActionSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-actions-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="w-full sm:max-w-sm bg-white dark:bg-[#181820] rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-[#27354A] p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-4 duration-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="photo-actions-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Profile Photo
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Manage how you appear to roommates
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoActionSheet(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-[#20202A] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Avatar Preview */}
            <div className="flex items-center justify-center py-2">
              <UserAvatar
                src={effectiveAvatar}
                name={currentUser.name}
                size="2xl"
                roundedClassName="rounded-3xl"
                showBorder={true}
                borderColorClassName="border-slate-200 dark:border-[#27354A]"
                className="shadow-md"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleUploadDp}
                disabled={isUploadingDp}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <Upload className="w-4 h-4" />
                <span>Upload New Photo</span>
              </button>

              {googlePhotoAvailable && googlePhotoAvailable !== effectiveAvatar && (
                <button
                  type="button"
                  onClick={handleApplyGooglePhoto}
                  disabled={isUploadingDp}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#20202A] dark:hover:bg-[#272738] active:scale-98 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-200 dark:border-[#27354A] transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Use Google Account Photo</span>
                </button>
              )}

              {effectiveAvatar && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={isUploadingDp}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 active:scale-98 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 border border-rose-200/80 dark:border-rose-900/40 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove Photo (Use Default Avatar)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPhotoActionSheet(false)}
                className="w-full py-2 px-4 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
