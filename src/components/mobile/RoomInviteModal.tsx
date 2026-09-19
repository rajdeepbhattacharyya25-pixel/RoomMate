import React, { useState } from 'react';
import {
  QrCode,
  Copy,
  Check,
  Share2,
  RefreshCw,
  Clock,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { Room, RoomInvitation, RoomMember, User } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

interface RoomInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  invitation: RoomInvitation | null;
  currentUser: User;
  roomMembers: RoomMember[];
  onRegenerateInvite: (expirationHours?: number) => Promise<RoomInvitation | void>;
}

export const RoomInviteModal: React.FC<RoomInviteModalProps> = ({
  isOpen,
  onClose,
  room,
  invitation,
  currentUser,
  roomMembers,
  onRegenerateInvite,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState<number | undefined>(undefined);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenSuccessMsg, setRegenSuccessMsg] = useState<string | null>(null);

  const isRoomAdmin =
    roomMembers.some(
      (m) => m.roomId === room.id && m.userId === currentUser.id && m.role === 'ROOM_ADMIN' && m.status === 'ACTIVE'
    ) || room.adminUserId === currentUser.id || room.createdBy === currentUser.id;

  const canInvite = room.invitePolicy !== 'ADMIN_ONLY' || isRoomAdmin;

  // Compute dynamic invite link using token
  const token = invitation?.token || invitation?.inviteCode || 'code';
  const isCapacitorOrLocal =
    typeof window !== 'undefined' &&
    (window.location.origin.includes('localhost') ||
      window.location.origin.includes('capacitor://') ||
      window.location.origin.includes('127.0.0.1'));
  const baseUrl =
    isCapacitorOrLocal || typeof window === 'undefined'
      ? 'https://roommate26.vercel.app'
      : window.location.origin;
  const inviteLink = `${baseUrl}/join/${token}`;

  // QR Code URL via reliable high-res image service with fallback
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(
    inviteLink
  )}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      hapticSuccess();
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // fallback
    }
  };

  const handleCopyCode = async () => {
    if (!invitation?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(invitation.inviteCode);
      hapticSuccess();
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2200);
    } catch {
      // fallback
    }
  };

  const handleShareInvite = async () => {
    hapticImpact('MEDIUM');
    const shareText = `Join my RoomMate room ${room.name} 🏠\nTap this link to join the room:\n${inviteLink}\nOr enter code: #${invitation?.inviteCode || ''}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${room.name} on RoomMate`,
          text: shareText,
          url: inviteLink,
        });
        hapticSuccess();
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleConfirmRegenerate = async () => {
    try {
      setIsRegenerating(true);
      await onRegenerateInvite(selectedExpiry);
      hapticSuccess();
      setShowRegenConfirm(false);
      setRegenSuccessMsg('New invitation generated! Previous QR & links are now revoked.');
      setTimeout(() => setRegenSuccessMsg(null), 3500);
    } catch (err: unknown) {
      hapticWarning();
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Invite to ${room.name}`}
      subtitle="Share QR, invite link, or manual room code"
      icon={<QrCode className="w-4.5 h-4.5 text-indigo-600" />}
    >
      <div className="space-y-4 pb-2">
        {regenSuccessMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{regenSuccessMsg}</span>
          </div>
        )}

        {!canInvite ? (
          <div className="p-6 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Admin Only Invites</h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              This room is configured so that only the room admin can generate and share invitations. Please ask the admin to invite new members.
            </p>
          </div>
        ) : (
          <>
            {/* Scannable QR Code Card */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col items-center text-center space-y-3">
              <div className="w-56 h-56 bg-slate-50 rounded-2xl p-2.5 border border-slate-100 flex items-center justify-center shadow-inner relative group">
                <img
                  src={qrCodeUrl}
                  alt={`QR Code to join ${room.name}`}
                  className="w-full h-full object-contain rounded-xl"
                  loading="eager"
                />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800">Scan this QR code to join</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Point any phone camera or use the RoomMate scanner
                </p>
              </div>

              {/* Room Code Fallback Badge */}
              {invitation && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100">
                  <span className="text-[11px] font-medium text-slate-600">Manual Code:</span>
                  <span className="font-mono font-bold text-xs text-indigo-700">
                    #{invitation.inviteCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="text-indigo-600 hover:text-indigo-800 text-[10px] font-semibold flex items-center gap-0.5 ml-1"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Invite Link & Actions */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Shareable Invite Link
              </label>

              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs font-mono text-slate-700 truncate flex-1 select-all">
                  {inviteLink}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1 transition-all shrink-0 active:scale-95"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="h-11 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareInvite}
                  className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Invite</span>
                </button>
              </div>
            </div>

            {/* Admin Controls: Regenerate Invite & Expiration */}
            {isRoomAdmin && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-800">Admin Security Controls</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                    Active
                  </span>
                </div>

                {!showRegenConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowRegenConfirm(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Regenerate Invite & Revoke Old</span>
                  </button>
                ) : (
                  <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-3 animate-in fade-in">
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">Regenerate Invite?</h4>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        The current QR code and invite link will immediately stop working. Anyone using the old invitation will no longer be able to join. Existing roommates and expenses remain untouched.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Optional Expiration</span>
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: 'Never', hours: undefined },
                          { label: '24h', hours: 24 },
                          { label: '7 days', hours: 168 },
                          { label: '30 days', hours: 720 },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setSelectedExpiry(opt.hours)}
                            className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-all ${
                              selectedExpiry === opt.hours
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isRegenerating}
                        onClick={() => setShowRegenConfirm(false)}
                        className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isRegenerating}
                        onClick={handleConfirmRegenerate}
                        className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-1 active:scale-95 shadow-xs"
                      >
                        {isRegenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                        <span>{isRegenerating ? 'Regenerating...' : 'Confirm'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
};
