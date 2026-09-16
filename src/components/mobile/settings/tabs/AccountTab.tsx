import React, { useState } from 'react';
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
} from 'lucide-react';
import { User } from '../../../../types';
import { pickImageFile, uploadImage } from '../../../../lib/services/imageUploadService';
import { updateProfileAvatar, updateUpiQrUrl, updateProfileUpiId } from '../../../../lib/storage/cloudStorageAdapter';
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

  // Avatar & QR local overrides
  const [avatarUrlOverride, setAvatarUrlOverride] = useState<string | null>(null);
  const [upiQrUrlOverride, setUpiQrUrlOverride] = useState<string | null | undefined>(undefined);

  const effectiveAvatar = avatarUrlOverride !== null ? avatarUrlOverride : currentUser.avatarUrl;
  const effectiveQr = upiQrUrlOverride !== undefined ? (upiQrUrlOverride || undefined) : currentUser.upiQrUrl;

  // Upload states
  const [isUploadingDp, setIsUploadingDp] = useState(false);
  const [pendingQrFile, setPendingQrFile] = useState<File | null>(null);
  const [pendingQrPreview, setPendingQrPreview] = useState<string | null>(null);
  const [isSavingQr, setIsSavingQr] = useState(false);
  const [isAnalyzingQr, setIsAnalyzingQr] = useState(false);
  const [extractedUpiFromQr, setExtractedUpiFromQr] = useState<string | null>(null);

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
    try {
      const file = await pickImageFile('image/*');
      if (!file) return;

      setIsUploadingDp(true);
      const result = await uploadImage(file, `${currentUser.name}_avatar`);

      if (result.success && result.url) {
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
        await updateUpiQrUrl(currentUser.id, result.url);
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
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center space-x-3.5">
          {/* Avatar with Camera upload button */}
          <div className="relative group shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-xs overflow-hidden border-2 border-white">
              {effectiveAvatar ? (
                <img
                  src={effectiveAvatar}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                currentUser.name.charAt(0).toUpperCase()
              )}
            </div>

            <button
              type="button"
              onClick={handleUploadDp}
              disabled={isUploadingDp}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md border-2 border-white hover:bg-indigo-700 active:scale-95 transition-all"
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
              <h2 className="text-base font-bold text-slate-900 truncate">{currentUser.name}</h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  currentUser.role === 'SUPER_ADMIN'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                }`}
              >
                {currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'Resident'}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">{currentUser.email}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs font-mono text-indigo-600 font-medium">@{username}</span>
              <span className="text-[10px] text-slate-300">•</span>
              <span className="text-xs font-mono text-slate-600 font-medium flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-emerald-600" />
                {currentUser.phone || <span className="text-slate-400 italic">No phone added</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Edit Identity Actions */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setShowEditName(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
            <span className="truncate">Edit Name</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEditPhone(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span className="truncate">Edit Phone</span>
          </button>

          <button
            type="button"
            onClick={() => setShowChangeEmail(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <Mail className="w-3.5 h-3.5 text-indigo-600" />
            <span className="truncate">Email</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEditUsername(true)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors active:scale-98"
          >
            <AtSign className="w-3.5 h-3.5 text-indigo-600" />
            <span className="truncate">Username</span>
          </button>
        </div>
      </div>

      {/* 6. Payment Identity Section (Housed Exclusively in Account) */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Payment Identity
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            How roommates identify and pay you during settlements
          </p>
        </div>

        {/* 6.1 UPI ID Card */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-600">Your UPI ID (VPA)</span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleCopyUpi}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                title="Copy UPI ID"
              >
                {copiedUpi ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowEditUpi(true)}
                className="px-2 py-0.5 rounded text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
          <div className="text-xs font-mono font-bold text-emerald-800 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{upiId}</span>
          </div>
        </div>

        {/* 6.2 UPI Payment QR Code Card */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                UPI Payment QR Code
              </h4>
              <p className="text-[11px] text-slate-500">
                Roommates can scan this directly to settle debts with you.
              </p>
            </div>
          </div>

          {effectiveQr ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div
                onClick={() => setShowFullQr(true)}
                className="flex items-center space-x-3 cursor-pointer group"
              >
                <img
                  src={effectiveQr}
                  alt="My UPI QR"
                  className="w-12 h-12 rounded-lg object-contain bg-white border border-slate-200 p-0.5 group-hover:scale-105 transition-transform"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>QR Ready</span>
                  </div>
                  <p className="text-[10px] text-slate-500">PhonePe, GPay, Paytm compatible</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setShowFullQr(true)}
                  className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-xs flex items-center gap-1 font-medium shadow-2xs"
                  title="View QR Code"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  onClick={handleSelectQr}
                  disabled={isAnalyzingQr}
                  className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 active:scale-95 transition-all text-xs flex items-center gap-1 font-medium disabled:opacity-60"
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
                  className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 active:scale-95 transition-all text-xs flex items-center justify-center"
                  title="Remove QR Code"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center space-y-2.5 bg-slate-50/50">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">No Payment QR uploaded yet</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-0.5">
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
    </div>
  );
};
