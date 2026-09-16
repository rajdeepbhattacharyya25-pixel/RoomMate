import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  QrCode,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
  Users,
  Crown,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Room, User, JoinPolicy, InvitePolicy, RoomInvitation } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onResolveInvite: (tokenOrCode: string) => Promise<{
    room: { id: string; name: string; description?: string; joinPolicy: JoinPolicy; invitePolicy: InvitePolicy };
    memberCount: number;
    adminName: string;
    invite: RoomInvitation;
  }>;
  onRequestJoin: (tokenOrCode: string) => Promise<{
    status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
    room: Room;
    message?: string;
  }>;
  onRoomJoined: (room: Room) => void;
  initialCode?: string;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  onClose,
  currentUser: _currentUser,
  onResolveInvite,
  onRequestJoin,
  onRoomJoined,
  initialCode = '',
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'camera'>('code');
  const [codeInput, setCodeInput] = useState(initialCode);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resolved Preview State
  const [previewData, setPreviewData] = useState<{
    room: { id: string; name: string; description?: string; joinPolicy: JoinPolicy; invitePolicy: InvitePolicy };
    memberCount: number;
    adminName: string;
    invite: RoomInvitation;
    tokenOrCode: string;
  } | null>(null);

  // Result state
  const [joinResult, setJoinResult] = useState<{
    status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
    room: Room;
    message?: string;
  } | null>(null);

  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const [_cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access not supported on this browser/device.');
      setActiveTab('code');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        beginScanLoop();
      }
    } catch {
      setCameraError('Camera permission denied or camera in use.');
      setCameraActive(false);
    }
  };

  const beginScanLoop = () => {
    if (scanIntervalRef.current) window.clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || previewData) return;

      if ('BarcodeDetector' in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            handleProcessScannedUrl(raw);
          }
        } catch {
          // pass
        }
      }
    }, 450);
  };

  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !previewData && !joinResult) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, previewData, joinResult]);

  // Extract token from URL or raw code
  const extractTokenOrCode = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const url = new URL(trimmed);
        const segments = url.pathname.split('/').filter(Boolean);
        const joinIdx = segments.indexOf('join');
        if (joinIdx >= 0 && segments[joinIdx + 1]) {
          return segments[joinIdx + 1];
        }
        const tokenParam = url.searchParams.get('token') || url.searchParams.get('join') || url.searchParams.get('code');
        if (tokenParam) return tokenParam;
      } catch {
        // fallback
      }
    }
    if (trimmed.startsWith('roommate://join') || trimmed.startsWith('campusflow://join')) {
      try {
        const url = new URL(trimmed);
        return url.searchParams.get('token') || url.searchParams.get('code') || trimmed;
      } catch {
        // fallback
      }
    }
    return trimmed.replace(/^#/, '');
  };

  const handleProcessScannedUrl = async (scannedString: string) => {
    const clean = extractTokenOrCode(scannedString);
    if (!clean) return;
    stopCamera();
    hapticSuccess();
    await handleResolve(clean);
  };

  const handleResolve = async (tokenOrCode: string) => {
    try {
      setIsValidating(true);
      setErrorMessage(null);
      const res = await onResolveInvite(tokenOrCode);
      setPreviewData({ ...res, tokenOrCode });
      hapticImpact('MEDIUM');
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmJoin = async () => {
    if (!previewData) return;
    try {
      setIsValidating(true);
      setErrorMessage(null);
      const res = await onRequestJoin(previewData.tokenOrCode);
      hapticSuccess();
      setJoinResult(res);
      if (res.status === 'JOINED') {
        onRoomJoined(res.room);
      }
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsValidating(false);
    }
  };

  const handleReset = () => {
    setPreviewData(null);
    setJoinResult(null);
    setErrorMessage(null);
    setCodeInput('');
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        handleReset();
        onClose();
      }}
      title="Join a Room"
      subtitle="Scan QR code or enter room invite code"
      icon={<QrCode className="w-4.5 h-4.5 text-indigo-600" />}
    >
      <div className="space-y-4 pb-2">
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 3: RESULT VIEW (Joined, Pending, Already Member) */}
        {joinResult ? (
          <div className="p-5 rounded-2xl bg-white border border-slate-200 text-center space-y-4 animate-in zoom-in-95">
            {joinResult.status === 'JOINED' ? (
              <>
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Welcome to {joinResult.room.name}!</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    You are now an active member with full access to shared bills and settlements.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRoomJoined(joinResult.room);
                  }}
                  className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs active:scale-95 transition-all shadow-xs"
                >
                  Open Room Ledger
                </button>
              </>
            ) : joinResult.status === 'PENDING' ? (
              <>
                <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                  <Clock className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Request Pending</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Your request to join <strong>{joinResult.room.name}</strong> has been sent to the room admin for approval. You will gain access as soon as it is approved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs active:scale-95 transition-all"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Already a Member</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    You are already an active member of <strong>{joinResult.room.name}</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRoomJoined(joinResult.room);
                  }}
                  className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs active:scale-95 transition-all shadow-xs"
                >
                  Open Room
                </button>
              </>
            )}
          </div>
        ) : previewData ? (
          /* STEP 2: ROOM PREVIEW CONFIRMATION UX */
          <div className="p-5 rounded-2xl bg-white border border-slate-200 text-center space-y-4 animate-in fade-in">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
              <span className="text-2xl">🏠</span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Join {previewData.room.name}?</h3>
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                  <Users className="w-3 h-3 text-indigo-600" />
                  <span>{previewData.memberCount} members</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200">
                  <Crown className="w-3 h-3 text-amber-600" />
                  <span>Admin: {previewData.adminName}</span>
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 text-slate-600 text-xs leading-relaxed border border-slate-100">
              You will get access to this room&apos;s shared expenses, splits, and settlement history. <strong>Your Personal Vault expenses will remain 100% private.</strong>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={isValidating}
                onClick={handleReset}
                className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isValidating}
                onClick={handleConfirmJoin}
                className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-xs"
              >
                {isValidating ? (
                  <span>Processing...</span>
                ) : (
                  <span>
                    {previewData.room.joinPolicy === 'APPROVAL_REQUIRED' ? 'Request to Join' : `Join ${previewData.room.name}`}
                  </span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* STEP 1: SCAN QR OR ENTER ROOM CODE */
          <>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('code');
                  stopCamera();
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'code' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Enter Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('camera');
                  startCamera();
                }}
                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'camera' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600" />
                <span>Scan QR</span>
              </button>
            </div>

            {activeTab === 'camera' ? (
              <div className="p-4 rounded-2xl bg-slate-900 text-white text-center space-y-3 relative overflow-hidden">
                <div className="w-full aspect-square max-w-[260px] mx-auto rounded-xl overflow-hidden bg-black relative border-2 border-indigo-400/50 shadow-inner flex items-center justify-center">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  <div className="absolute inset-0 border-2 border-indigo-400 rounded-xl pointer-events-none animate-pulse" />
                </div>
                {cameraError ? (
                  <p className="text-xs text-rose-300">{cameraError}</p>
                ) : (
                  <p className="text-xs text-slate-300">
                    Align RoomMate QR code inside the frame to scan automatically
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 block">Room Code or Invite Link</label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Enter the 6-digit code (e.g. #FLAT02) or paste an invite link
                  </p>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="#FLAT02"
                    className="w-full h-12 pl-4 pr-12 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono font-bold text-slate-900 uppercase focus:bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                  />
                  {codeInput && (
                    <button
                      type="button"
                      onClick={() => setCodeInput('')}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!codeInput.trim() || isValidating}
                  onClick={() => handleResolve(extractTokenOrCode(codeInput))}
                  className={`w-full h-11 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 ${
                    codeInput.trim() && !isValidating
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isValidating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>{isValidating ? 'Validating Room...' : 'Continue'}</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
};
