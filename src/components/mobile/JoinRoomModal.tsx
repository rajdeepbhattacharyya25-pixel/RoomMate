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
  Upload,
  Image as ImageIcon,
  Zap,
  ZapOff,
  Clipboard,
  ShieldCheck,
  MessageCircle,
  WifiOff,
} from 'lucide-react';
import { Room, User, JoinPolicy, InvitePolicy, RoomInvitation } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { hapticImpact, hapticSuccess, hapticWarning, hapticSelection } from '../../lib/native/haptics';
import {
  decodeQrFromVideoFrame,
  decodeQrFromImage,
  cleanAndNormalizeRoomCode,
} from '../../lib/services/qrDecoder';

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
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'EXPIRED' | 'NOT_FOUND' | 'OFFLINE' | 'GENERIC'>('GENERIC');

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [_cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Initialize or reset when modal opens or initialCode changes
  useEffect(() => {
    if (isOpen) {
      if (initialCode) {
        const cleaned = cleanAndNormalizeRoomCode(initialCode);
        setCodeInput(cleaned);
        setActiveTab('code');
        handleResolve(cleaned);
      } else {
        const permDenied = localStorage.getItem('roommate_camera_perm_denied') === 'true';
        setActiveTab(permDenied ? 'code' : 'camera');
      }
    } else {
      stopCamera();
      handleReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialCode]);

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
    setIsTorchOn(false);
    setHasTorch(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access not supported on this browser or device.');
      setActiveTab('code');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as { torch?: boolean };
        if (caps.torch) {
          setHasTorch(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        beginScanLoop();
      }
    } catch {
      localStorage.setItem('roommate_camera_perm_denied', 'true');
      setCameraError('Camera permission denied or camera in use. Enter code manually or upload a screenshot.');
      setCameraActive(false);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !isTorchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
      hapticSelection();
    } catch {
      // ignore torch failure
    }
  };

  // Continuous frame analysis using dual-engine decoder (BarcodeDetector + jsQR fallback)
  const beginScanLoop = () => {
    if (scanIntervalRef.current) window.clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || previewData || isValidating) return;

      try {
        const rawPayload = await decodeQrFromVideoFrame(videoRef.current, canvasRef.current);
        if (rawPayload) {
          handleProcessScannedUrl(rawPayload);
        }
      } catch {
        // frame drop, continue loop
      }
    }, 380);
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

  const handleProcessScannedUrl = async (scannedString: string) => {
    const clean = cleanAndNormalizeRoomCode(scannedString);
    if (!clean) return;
    stopCamera();
    hapticSuccess();
    setCodeInput(clean);
    await handleResolve(clean);
  };

  const handleResolve = async (tokenOrCode: string) => {
    const clean = cleanAndNormalizeRoomCode(tokenOrCode);
    if (!clean) {
      setErrorMessage('Please enter a valid room invite code.');
      return;
    }

    try {
      setIsValidating(true);
      setErrorMessage(null);
      setErrorType('GENERIC');

      const res = await onResolveInvite(clean);
      setPreviewData({ ...res, tokenOrCode: clean });
      hapticImpact('MEDIUM');
    } catch (err: unknown) {
      hapticWarning();
      const rawMsg = err instanceof Error ? err.message : String(err);

      if (!navigator.onLine) {
        setErrorType('OFFLINE');
        setErrorMessage('You are currently offline. An active internet connection is required to verify new room invites.');
      } else if (rawMsg.includes('INVITE_EXPIRED') || rawMsg.toLowerCase().includes('expired')) {
        setErrorType('EXPIRED');
        setErrorMessage('This room invite has expired or was revoked by the room admin.');
      } else if (rawMsg.includes('INVITE_UNAVAILABLE') || rawMsg.includes('ROOM_NOT_FOUND')) {
        setErrorType('NOT_FOUND');
        setErrorMessage('Room invite not found. Please check the code or ask the admin for a new link.');
      } else {
        setErrorType('GENERIC');
        setErrorMessage(rawMsg);
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Upload screenshot from gallery
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      setErrorMessage(null);
      const res = await decodeQrFromImage(file);
      if (res.success && res.rawPayload) {
        hapticSuccess();
        const code = cleanAndNormalizeRoomCode(res.rawPayload);
        setCodeInput(code);
        await handleResolve(code);
      } else {
        hapticWarning();
        setErrorMessage(res.errorMessage || "Could not detect a QR code in this image. Please ensure it's clear or enter the code manually.");
      }
    } catch {
      setErrorMessage('Failed to read image file. Please try another screenshot.');
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Read clipboard text directly
  const handlePasteCode = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const clean = cleanAndNormalizeRoomCode(text);
          setCodeInput(clean);
          hapticSuccess();
        }
      }
    } catch {
      // Clipboard access blocked
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
    setErrorType('GENERIC');
    setCodeInput('');
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  const handleAskAdmin = () => {
    const text = `Hey! Could you send me a fresh RoomMate room invite link? The previous code expired or was revoked.`;
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank');
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
      subtitle="Scan QR code, upload screenshot, or enter code"
      icon={<QrCode className="w-4.5 h-4.5 text-indigo-600" />}
    >
      {/* Hidden file picker for gallery QR upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="space-y-4 pb-2">
        {/* Offline indicator banner if device is offline */}
        {typeof navigator !== 'undefined' && !navigator.onLine && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>You are offline. Connecting to new rooms requires internet.</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs font-medium space-y-2 animate-in fade-in">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            </div>

            {/* Edge Case 1: Helpful action buttons when code is expired or revoked */}
            {(errorType === 'EXPIRED' || errorType === 'NOT_FOUND') && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAskAdmin}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Ask Admin for New Invite</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1C1C25] border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-[11px] font-semibold active:scale-95 transition-all"
                >
                  Try Another Code
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: RESULT VIEW (Joined, Pending, Already Member) */}
        {joinResult ? (
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200 dark:border-[#27354A] text-center space-y-4 animate-in zoom-in-95">
            {joinResult.status === 'JOINED' ? (
              <>
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Welcome to {joinResult.room.name}!</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    You are now an active roommate with full access to shared expenses and settlements.
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
                <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                  <Clock className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Request Sent to Admin</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Your request to join <strong>{joinResult.room.name}</strong> was submitted. You will be notified as soon as the room admin approves your request.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-11 rounded-xl bg-slate-100 dark:bg-[#20202A] hover:bg-slate-200 dark:hover:bg-[#27354A] text-slate-800 dark:text-slate-200 font-semibold text-xs active:scale-95 transition-all"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                {/* Edge Case: Already Member flow with 1-tap open */}
                <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                  <Users className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Already a Member</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    You are already an active roommate in <strong>{joinResult.room.name}</strong>.
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
            )}
          </div>
        ) : previewData ? (
          /* STEP 2: ROOM PREVIEW CONFIRMATION UX */
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200 dark:border-[#27354A] text-center space-y-4 animate-in fade-in">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-[#20202A] text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-100 dark:border-[#27354A] shadow-2xs">
              <span className="text-2xl">🏠</span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Join {previewData.room.name}?</h3>
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#20202A] text-slate-700 dark:text-slate-300 text-xs font-semibold">
                  <Users className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>{previewData.memberCount} members</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-800/60">
                  <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>Admin: {previewData.adminName}</span>
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#181820] text-slate-600 dark:text-slate-300 text-xs leading-relaxed border border-slate-200/80 dark:border-[#27354A] flex items-start gap-2.5 text-left">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                You will share bills and splits with roommates in this flat. <strong>Your Personal Vault expenses remain 100% private.</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={isValidating}
                onClick={handleReset}
                className="h-11 rounded-xl bg-white dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-[#27354A] active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isValidating}
                onClick={handleConfirmJoin}
                className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-xs transition-all"
              >
                {isValidating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
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
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-[#181820] rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('code');
                  stopCamera();
                  hapticSelection();
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'code'
                    ? 'bg-white dark:bg-[#20202A] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Enter Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('camera');
                  startCamera();
                  hapticSelection();
                }}
                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'camera'
                    ? 'bg-white dark:bg-[#20202A] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Scan QR</span>
              </button>
            </div>

            {activeTab === 'camera' ? (
              <div className="p-4 rounded-2xl bg-slate-950 text-white text-center space-y-3 relative overflow-hidden">
                <div className="w-full aspect-square max-w-[260px] mx-auto rounded-xl overflow-hidden bg-black relative border-2 border-indigo-500/60 shadow-inner flex items-center justify-center">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  <div className="absolute inset-0 border-2 border-indigo-400 rounded-xl pointer-events-none animate-pulse" />

                  {/* Top-Right Flashlight / Torch Toggle */}
                  {hasTorch && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className="absolute top-2.5 right-2.5 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md active:scale-95 transition-all"
                      aria-label="Toggle Torch"
                    >
                      {isTorchOn ? <Zap className="w-4 h-4 text-amber-400 fill-amber-400" /> : <ZapOff className="w-4 h-4 text-slate-300" />}
                    </button>
                  )}
                </div>

                {cameraError ? (
                  <p className="text-xs text-rose-300">{cameraError}</p>
                ) : (
                  <p className="text-xs text-slate-300">
                    Align the room QR code in frame to join automatically
                  </p>
                )}

                {/* Upload QR screenshot fallback button inside camera tab */}
                <div className="pt-1 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 active:scale-95 transition-all"
                  >
                    {isProcessingImage ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>{isProcessingImage ? 'Scanning Image...' : 'Upload QR Screenshot'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200 dark:border-[#27354A] space-y-3.5">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Room Code or Invite Link</label>
                    <button
                      type="button"
                      onClick={handlePasteCode}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1"
                    >
                      <Clipboard className="w-3 h-3" />
                      <span>Paste</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Enter the 6-character room code (e.g. #FLAT02) or paste an invite link
                  </p>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      // Auto-strip leading hash and uppercase short codes while typing
                      if (raw.startsWith('#')) {
                        setCodeInput(raw.replace(/^#+/, '').toUpperCase());
                      } else if (!raw.includes('/') && !raw.includes('.') && raw.length <= 10) {
                        setCodeInput(raw.toUpperCase().replace(/\s+/g, ''));
                      } else {
                        setCodeInput(raw);
                      }
                    }}
                    placeholder="FLAT02"
                    className="w-full h-12 pl-4 pr-12 rounded-xl bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] text-sm font-mono font-bold text-slate-900 dark:text-white uppercase focus:bg-white dark:focus:bg-[#181820] focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                  {codeInput && (
                    <button
                      type="button"
                      onClick={() => setCodeInput('')}
                      className="absolute right-3 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={!codeInput.trim() || isValidating}
                    onClick={() => handleResolve(codeInput)}
                    className={`w-full h-11 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 ${
                      codeInput.trim() && !isValidating
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'bg-slate-100 dark:bg-[#181820] text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    {isValidating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>{isValidating ? 'Validating Room...' : 'Continue'}</span>
                  </button>

                  {/* 1-Tap Upload Screenshot from gallery button */}
                  <button
                    type="button"
                    disabled={isProcessingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-10 rounded-xl bg-slate-50 dark:bg-[#20202A] hover:bg-slate-100 dark:hover:bg-[#27354A] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    {isProcessingImage ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    )}
                    <span>{isProcessingImage ? 'Processing Screenshot...' : 'Scan from Gallery Screenshot'}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
};
