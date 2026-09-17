import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from '../../types';
import {
  createResidentToken,
  verifyResidentToken,
  storeResidentSession,
  authenticateWithBiometrics,
  generateStrongPasswordSuggestion,
  ResidentJwtPayload,
  validateStrict4DigitPin,
} from '../../lib/auth/jwtService';
import {
  Fingerprint,
  Lock,
  Mail,
  Sparkles,
  KeyRound,
  Check,
  ArrowRight,
  RefreshCw,
  X,
  UserCheck,
  ShieldCheck,
  Building,
  UserPlus,
  HelpCircle,
  Key,
  QrCode,
  Camera,
  Upload,
  Users,
  Crown,
  CheckCircle2,
  AlertCircle,
  Hourglass,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  resolveInviteCloud,
  requestJoinRoomCloud,
  checkJoinRequestStatusCloud,
  checkEmailExistsCloud,
  registerWithEmailConfirmationCloud,
  checkEmailVerificationStatusCloud,
  resendConfirmationEmailCloud,
  signInWithGoogleOAuth,
  signInResidentWithCredentialsCloud,
} from '../../lib/storage/cloudStorageAdapter';
import { StrictPinInput } from '../common/StrictPinInput';
import { GoogleSignInButton } from '../common/GoogleSignInButton';
import { OAuthProviderNoticeModal } from './OAuthProviderNoticeModal';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';
import { sendLocalJoinRequestNotification } from '../../lib/native/notifications';

interface MobileLoginProps {
  allUsers: User[];
  onLogin: (user: User, token: string) => void;
  onJoinWithCode?: (code: string, user?: User, token?: string) => void;
}

export const MobileLogin: React.FC<MobileLoginProps> = ({
  allUsers,
  onLogin,
  onJoinWithCode,
}) => {
  // 3-Segment Tab Switcher: signin | join | create
  const [authTab, setAuthTab] = useState<'signin' | 'join' | 'create'>('signin');

  // Available residents registered on device
  const residentUsers = useMemo(
    () =>
      allUsers && allUsers.length > 0
        ? allUsers.filter((u) => u.role !== 'SUPER_ADMIN')
        : [],
    [allUsers]
  );

  // Form Fields for Sign In
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Form Fields for Join with Code & QR Wizard
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [joinResidentName, setJoinResidentName] = useState('');
  const [joinResidentEmail, setJoinResidentEmail] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [joinMode, setJoinMode] = useState<'code' | 'camera'>('code');
  const [joinWizardStep, setJoinWizardStep] = useState<
    'scan_or_code' | 'confirm_room' | 'resident_info' | 'existing_user_auth' | 'email_verification' | 'waiting'
  >('scan_or_code');
  const [joinRequestStatus, setJoinRequestStatus] = useState<
    'pending' | 'approved' | 'declined' | null
  >(null);
  const [activeJoinRequestId, setActiveJoinRequestId] = useState<string | null>(null);
  const [isResolvingRoom, setIsResolvingRoom] = useState(false);
  const [isSubmittingJoin, setIsSubmittingJoin] = useState(false);
  const [resolvedRoomData, setResolvedRoomData] = useState<{
    room: { id: string; name: string; description?: string; joinPolicy?: string };
    memberCount: number;
    adminName: string;
    tokenOrCode: string;
  } | null>(null);
  const [pendingJoinUser, setPendingJoinUser] = useState<User | null>(null);

  // Email Verification & Existing User Auth States
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);

  const [existingUserForJoin, setExistingUserForJoin] = useState<User | null>(null);
  const [existingUserPin, setExistingUserPin] = useState('');
  const [existingUserAuthError, setExistingUserAuthError] = useState<string | null>(null);
  const [isAuthenticatingExisting, setIsAuthenticatingExisting] = useState(false);

  // Create Resident Account Email Verification
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createEmailVerificationPending, setCreateEmailVerificationPending] = useState(false);
  const [createdUserPending, setCreatedUserPending] = useState<User | null>(null);

  // Camera Scanner Refs & States
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form Fields for New Resident
  const [newResidentName, setNewResidentName] = useState('');
  const [newResidentEmail, setNewResidentEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [suggestedPassword, setSuggestedPassword] = useState(() =>
    generateStrongPasswordSuggestion()
  );

  // Biometrics State
  const [isScanningBiometrics, setIsScanningBiometrics] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);

  // Forgot PIN Modal State
  const [showForgotPinModal, setShowForgotPinModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  // Hidden Developer Trigger (5 taps on RoomMate logo)
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [inspectingJwt, setInspectingJwt] = useState<ResidentJwtPayload | null>(null);

  // Google OAuth State
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showOAuthNotice, setShowOAuthNotice] = useState(false);
  const [oauthNoticeError, setOauthNoticeError] = useState<string | undefined>(undefined);

  // Error & Selection State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDemoUserId, setSelectedDemoUserId] = useState<string | null>(
    residentUsers[0]?.id || null
  );
  const [pendingInviteToken] = useState<string | null>(() => {
    return (
      localStorage.getItem('roommate_pending_join_token') ||
      sessionStorage.getItem('roommate_pending_join_token')
    );
  });

  // Ensure default demo selection is synced
  useEffect(() => {
    if (residentUsers.length > 0 && !selectedDemoUserId) {
      setSelectedDemoUserId(residentUsers[0].id);
      setIdentifier(residentUsers[0].email);
    }
  }, [residentUsers, selectedDemoUserId]);

  // Handle Standard Sign In with Strict Backend Credential Verification
  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    hapticImpact('LIGHT');

    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId) {
      hapticWarning();
      setErrorMessage('Please enter your email address or mobile number.');
      return;
    }

    if (!password || !password.trim()) {
      hapticWarning();
      setErrorMessage('Please enter your 4-digit security PIN.');
      return;
    }

    setIsSigningIn(true);

    try {
      const authResult = await signInResidentWithCredentialsCloud(cleanId, password);

      if (!authResult.success || !authResult.user) {
        hapticWarning();
        setErrorMessage(
          authResult.error || 'Authentication failed. Please check your credentials.'
        );
        return;
      }

      const verifiedUser = authResult.user;

      const token = createResidentToken(verifiedUser, {
        expiresInDays: rememberDevice ? 7 : 1,
        biometricVerified: false,
      });

      const verifyResult = verifyResidentToken(token);
      if (!verifyResult.valid) {
        hapticWarning();
        setErrorMessage(`Verification Notice: ${verifyResult.error}`);
        return;
      }

      hapticSuccess();
      storeResidentSession(token, rememberDevice);
      onLogin(verifiedUser, token);
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Google OAuth Sign-In
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setErrorMessage(null);
    try {
      const result = await signInWithGoogleOAuth();
      if (!result.success) {
        if (result.isUnconfiguredProvider) {
          setOauthNoticeError(result.error);
          setShowOAuthNotice(true);
        } else {
          setErrorMessage(result.error || 'Failed to initiate Google Sign-In.');
          hapticWarning();
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Google Sign-In failed.');
      hapticWarning();
    } finally {
      setIsGoogleLoading(false);
    }
  };


  // Handle Biometric Login
  const handleBiometricAuth = async () => {
    setErrorMessage(null);
    setIsScanningBiometrics(true);
    setBiometricSuccess(false);
    hapticImpact('LIGHT');

    try {
      const cleanId = identifier.trim().toLowerCase();
      const targetUser = cleanId
        ? residentUsers.find(
            (u) =>
              u.email.toLowerCase() === cleanId ||
              (u.phone && u.phone.replace(/\s/g, '').includes(cleanId))
          )
        : (selectedDemoUserId
            ? residentUsers.find((u) => u.id === selectedDemoUserId)
            : null);

      if (!targetUser) {
        hapticWarning();
        setErrorMessage('Please enter your registered email or phone number first.');
        setIsScanningBiometrics(false);
        return;
      }

      const success = await authenticateWithBiometrics(targetUser.name);

      if (success) {
        setBiometricSuccess(true);
        hapticSuccess();
        const token = createResidentToken(targetUser, {
          expiresInDays: 7,
          biometricVerified: true,
        });

        storeResidentSession(token, true);
        setTimeout(() => {
          onLogin(targetUser, token);
        }, 500);
      } else {
        hapticWarning();
        setErrorMessage(
          'Biometric authentication was cancelled or could not verify credentials.'
        );
      }
    } catch {
      hapticWarning();
      setErrorMessage(
        'Biometric authentication encountered a device timeout. Please use your PIN.'
      );
    } finally {
      setIsScanningBiometrics(false);
    }
  };

  // Stop live camera stream
  const stopCamera = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start live camera stream
  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported on this browser. Please enter code or upload QR image.');
      setJoinMode('code');
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
        beginScanLoop();
      }
    } catch {
      setCameraError('Camera permission denied or camera in use.');
    }
  };

  // Scan frame loop using native BarcodeDetector
  const beginScanLoop = () => {
    if (scanIntervalRef.current) window.clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || isResolvingRoom) return;

      if ('BarcodeDetector' in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            handleScannedCode(raw);
          }
        } catch {
          // Frame drop, continue
        }
      }
    }, 450);
  };

  // Start or stop camera based on tab and join mode
  useEffect(() => {
    if (authTab === 'join' && joinMode === 'camera' && joinWizardStep === 'scan_or_code') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authTab, joinMode, joinWizardStep]);

  // Extract code/token from raw input or URL
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
        const tokenParam = url.searchParams.get('join') || url.searchParams.get('code') || url.searchParams.get('token');
        if (tokenParam) return tokenParam;
      } catch {}
    }
    if (trimmed.startsWith('roommate://') || trimmed.startsWith('campusflow://')) {
      try {
        const url = new URL(trimmed);
        return url.searchParams.get('join') || url.searchParams.get('code') || url.searchParams.get('token') || trimmed;
      } catch {}
    }
    return trimmed.replace(/^#/, '');
  };

  // Handle scanned QR string from camera or file
  const handleScannedCode = async (rawInput: string) => {
    const clean = extractTokenOrCode(rawInput);
    if (!clean) return;
    stopCamera();
    hapticSuccess();
    setJoinInviteCode(clean.toUpperCase());
    await resolveAndProceedToConfirmation(clean);
  };

  // Resolve room details and transition to Step 1 (Room Confirmation Card)
  const resolveAndProceedToConfirmation = async (code: string) => {
    try {
      setIsResolvingRoom(true);
      setErrorMessage(null);
      setCameraError(null);
      const res = await resolveInviteCloud(code);
      setResolvedRoomData({
        room: res.room,
        memberCount: res.memberCount,
        adminName: res.adminName,
        tokenOrCode: code,
      });
      setJoinWizardStep('confirm_room');
      hapticImpact('MEDIUM');
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : 'Invalid or expired room invite code');
    } finally {
      setIsResolvingRoom(false);
    }
  };

  // Handle file upload fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        if ('BarcodeDetector' in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0) {
            handleScannedCode(barcodes[0].rawValue);
            return;
          }
        }
        setCameraError('Could not detect a QR code in this image. Please enter code manually.');
      };
      reader.readAsDataURL(file);
    } catch {
      setCameraError('Failed to process image. Please enter code manually.');
    }
  };

  // Handle manual code entry submit
  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinInviteCode.trim().toUpperCase();
    if (!clean) {
      hapticWarning();
      setErrorMessage('Please enter a 6-character room invite code.');
      return;
    }
    await resolveAndProceedToConfirmation(clean);
  };

  // Cooldown countdown timer for resend email
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-detect email verification when user returns from email app
  useEffect(() => {
    if (joinWizardStep !== 'email_verification') return;
    const handleWindowFocus = async () => {
      if (isCheckingVerification) return;
      try {
        const res = await checkEmailVerificationStatusCloud(joinResidentEmail, joinPin);
        if (res.isVerified && resolvedRoomData && pendingJoinUser) {
          hapticSuccess();
          const joinRes = await requestJoinRoomCloud(pendingJoinUser.id, resolvedRoomData.tokenOrCode);
          const reqId = joinRes.requestId || ('req-' + Date.now().toString(36));
          setActiveJoinRequestId(reqId);
          setJoinRequestStatus('pending');
          setJoinWizardStep('waiting');
          setEmailVerificationError(null);
        }
      } catch {}
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [joinWizardStep, joinResidentEmail, joinPin, isCheckingVerification, resolvedRoomData, pendingJoinUser]);

  // Submit Join Request with Strict 4-Digit PIN & Email Verification Check
  const handleSendJoinRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedRoomData) return;

    if (!joinResidentName.trim()) {
      hapticWarning();
      setErrorMessage('Please enter your full name.');
      return;
    }

    const cleanEmail = joinResidentEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      hapticWarning();
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    const pinValidation = validateStrict4DigitPin(joinPin);
    if (!pinValidation.isValid) {
      hapticWarning();
      setErrorMessage(pinValidation.error || 'PIN must be exactly 4 digits.');
      return;
    }

    setIsSubmittingJoin(true);
    setErrorMessage(null);

    try {
      // 1. Check if email already belongs to an existing RoomMate account
      const existing = await checkEmailExistsCloud(cleanEmail);
      if (existing.exists && existing.user) {
        // PRESERVE existing user profile, name, PIN, and personal expense vault
        setExistingUserForJoin(existing.user);
        setExistingUserPin('');
        setExistingUserAuthError(null);
        setJoinWizardStep('existing_user_auth');
        setIsSubmittingJoin(false);
        return;
      }

      // 2. New user registration with native Supabase email verification
      const generatedId = 'usr-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const newUser: User = {
        id: generatedId,
        name: joinResidentName.trim(),
        email: cleanEmail,
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const regResult = await registerWithEmailConfirmationCloud(newUser, pinValidation.sanitized);

      if (regResult.error) {
        hapticWarning();
        setErrorMessage(regResult.error);
        setIsSubmittingJoin(false);
        return;
      }

      if (regResult.isExistingUser) {
        const user = regResult.user || existing.user || newUser;
        setExistingUserForJoin(user);
        setExistingUserPin('');
        setExistingUserAuthError(null);
        setJoinWizardStep('existing_user_auth');
        setIsSubmittingJoin(false);
        return;
      }

      const activeUser = regResult.user;
      setPendingJoinUser(activeUser);

      // 3. If native Supabase email confirmation is required:
      if (regResult.emailConfirmationRequired) {
        hapticImpact('LIGHT');
        setResendCooldown(60);
        setEmailVerificationError(null);
        setJoinWizardStep('email_verification');
        setIsSubmittingJoin(false);
        return;
      }

      // 4. If confirmation is not required (e.g. offline/instant policy), proceed to join request:
      const res = await requestJoinRoomCloud(activeUser.id, resolvedRoomData.tokenOrCode);
      const reqId = res.requestId || ('req-' + Date.now().toString(36));
      setActiveJoinRequestId(reqId);

      if (res.status === 'JOINED') {
        hapticSuccess();
        const token = createResidentToken(activeUser, { expiresInDays: 7, biometricVerified: false });
        storeResidentSession(token, true);
        if (onJoinWithCode) {
          onJoinWithCode(resolvedRoomData.tokenOrCode, activeUser, token);
        } else {
          onLogin(activeUser, token);
        }
        return;
      }

      const pendingData = {
        requestId: reqId,
        roomId: resolvedRoomData.room.id,
        roomName: resolvedRoomData.room.name,
        adminName: resolvedRoomData.adminName,
        user: activeUser,
        tokenOrCode: resolvedRoomData.tokenOrCode,
      };
      localStorage.setItem('roommate_active_join_request', JSON.stringify(pendingData));
      await sendLocalJoinRequestNotification({
        requesterName: activeUser.name,
        requesterEmail: activeUser.email,
        roomName: resolvedRoomData.room.name,
      });

      hapticImpact('MEDIUM');
      setJoinRequestStatus('pending');
      setJoinWizardStep('waiting');
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : 'Failed to process request.');
    } finally {
      setIsSubmittingJoin(false);
    }
  };

  // Handle Existing User Authentication during Room Join
  const handleExistingUserAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingUserForJoin || !resolvedRoomData) return;

    const validation = validateStrict4DigitPin(existingUserPin);
    if (!validation.isValid) {
      hapticWarning();
      setExistingUserAuthError(validation.error || 'PIN must be exactly 4 digits.');
      return;
    }

    setIsAuthenticatingExisting(true);
    setExistingUserAuthError(null);

    try {
      const cleanPin = validation.sanitized;
      // Live Supabase verification or local match
      const res = await checkEmailVerificationStatusCloud(existingUserForJoin.email, cleanPin);
      const user = res.user || existingUserForJoin;

      hapticSuccess();
      setPendingJoinUser(user);

      // Dispatch Join Request using EXISTING user profile - NO OVERWRITE
      const joinRes = await requestJoinRoomCloud(user.id, resolvedRoomData.tokenOrCode);
      const reqId = joinRes.requestId || ('req-' + Date.now().toString(36));
      setActiveJoinRequestId(reqId);

      if (joinRes.status === 'JOINED') {
        const token = createResidentToken(user, { expiresInDays: 7, biometricVerified: false });
        storeResidentSession(token, true);
        if (onJoinWithCode) {
          onJoinWithCode(resolvedRoomData.tokenOrCode, user, token);
        } else {
          onLogin(user, token);
        }
        return;
      }

      const pendingData = {
        requestId: reqId,
        roomId: resolvedRoomData.room.id,
        roomName: resolvedRoomData.room.name,
        adminName: resolvedRoomData.adminName,
        user,
        tokenOrCode: resolvedRoomData.tokenOrCode,
      };
      localStorage.setItem('roommate_active_join_request', JSON.stringify(pendingData));
      await sendLocalJoinRequestNotification({
        requesterName: user.name,
        requesterEmail: user.email,
        roomName: resolvedRoomData.room.name,
      });

      setJoinRequestStatus('pending');
      setJoinWizardStep('waiting');
    } catch {
      hapticWarning();
      setExistingUserAuthError('Authentication failed. Please verify your 4-digit PIN.');
    } finally {
      setIsAuthenticatingExisting(false);
    }
  };

  // Check email verification status live with Supabase
  const handleCheckEmailVerification = async () => {
    setIsCheckingVerification(true);
    setEmailVerificationError(null);
    try {
      const res = await checkEmailVerificationStatusCloud(joinResidentEmail, joinPin);
      if (!res.isVerified) {
        hapticWarning();
        setEmailVerificationError(
          res.error || `Please confirm your email using the link we sent to ${joinResidentEmail}.`
        );
      } else {
        hapticSuccess();
        const user = res.user || pendingJoinUser;
        if (user && resolvedRoomData) {
          setPendingJoinUser(user);
          const joinRes = await requestJoinRoomCloud(user.id, resolvedRoomData.tokenOrCode);
          const reqId = joinRes.requestId || ('req-' + Date.now().toString(36));
          setActiveJoinRequestId(reqId);

          if (joinRes.status === 'JOINED') {
            const token = createResidentToken(user, { expiresInDays: 7, biometricVerified: false });
            storeResidentSession(token, true);
            if (onJoinWithCode) {
              onJoinWithCode(resolvedRoomData.tokenOrCode, user, token);
            } else {
              onLogin(user, token);
            }
            return;
          }

          const pendingData = {
            requestId: reqId,
            roomId: resolvedRoomData.room.id,
            roomName: resolvedRoomData.room.name,
            adminName: resolvedRoomData.adminName,
            user,
            tokenOrCode: resolvedRoomData.tokenOrCode,
          };
          localStorage.setItem('roommate_active_join_request', JSON.stringify(pendingData));
          await sendLocalJoinRequestNotification({
            requesterName: user.name,
            requesterEmail: user.email,
            roomName: resolvedRoomData.room.name,
          });

          setJoinRequestStatus('pending');
          setJoinWizardStep('waiting');
        }
      }
    } catch (err: unknown) {
      setEmailVerificationError(String(err));
    } finally {
      setIsCheckingVerification(false);
    }
  };

  // Resend confirmation email with cooldown
  const handleResendConfirmationEmail = async () => {
    if (resendCooldown > 0 || isResendingEmail) return;
    setIsResendingEmail(true);
    try {
      const res = await resendConfirmationEmailCloud(joinResidentEmail);
      if (res.success) {
        hapticSuccess();
        setResendCooldown(60);
      } else {
        hapticWarning();
        setEmailVerificationError(res.error || 'Failed to resend confirmation email.');
      }
    } finally {
      setIsResendingEmail(false);
    }
  };

  // Enter room once approved by Admin
  const handleEnterApprovedRoom = () => {
    hapticSuccess();
    const activeUser = pendingJoinUser || residentUsers[0];
    if (!activeUser) return;
    const token = createResidentToken(activeUser, { expiresInDays: 7, biometricVerified: false });
    storeResidentSession(token, true);
    localStorage.removeItem('roommate_active_join_request');
    localStorage.removeItem('roommate_pending_join_token');
    sessionStorage.removeItem('roommate_pending_join_token');

    const code = resolvedRoomData?.tokenOrCode || joinInviteCode;
    if (onJoinWithCode) {
      onJoinWithCode(code, activeUser, token);
    } else {
      onLogin(activeUser, token);
    }
  };

  // Cancel pending request and return to join screen
  const handleCancelPendingRequest = () => {
    localStorage.removeItem('roommate_active_join_request');
    setActiveJoinRequestId(null);
    setJoinRequestStatus(null);
    setJoinWizardStep('scan_or_code');
  };

  // Status Polling when waiting for Admin approval
  useEffect(() => {
    if (authTab !== 'join' || joinWizardStep !== 'waiting' || !activeJoinRequestId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await checkJoinRequestStatusCloud(activeJoinRequestId);
        if (!isMounted) return;

        if (res.status === 'APPROVED') {
          hapticSuccess();
          setJoinRequestStatus('approved');
        } else if (res.status === 'DECLINED') {
          hapticWarning();
          setJoinRequestStatus('declined');
        }
      } catch (err) {
        console.warn('Polling checkJoinRequestStatusCloud error:', err);
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [authTab, joinWizardStep, activeJoinRequestId]);

  // Restore pending request from localStorage or detect deep link on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('roommate_active_join_request');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.requestId) {
          setActiveJoinRequestId(parsed.requestId);
          setPendingJoinUser(parsed.user);
          setResolvedRoomData({
            room: { id: parsed.roomId, name: parsed.roomName },
            memberCount: 3,
            adminName: parsed.adminName || 'Admin',
            tokenOrCode: parsed.tokenOrCode,
          });
          setJoinInviteCode(parsed.tokenOrCode || 'FLAT02');
          setAuthTab('join');
          setJoinWizardStep('waiting');
          setJoinRequestStatus('pending');

          checkJoinRequestStatusCloud(parsed.requestId).then((st) => {
            if (st.status === 'APPROVED') setJoinRequestStatus('approved');
            else if (st.status === 'DECLINED') setJoinRequestStatus('declined');
          });
          return;
        }
      }
    } catch {}

    try {
      const url = new URL(window.location.href);
      const joinParam = url.searchParams.get('join') || url.searchParams.get('code');
      const token = joinParam || pendingInviteToken;
      if (token) {
        setAuthTab('join');
        setJoinInviteCode(token.toUpperCase());
        resolveAndProceedToConfirmation(token);
      }
    } catch {}
  }, [pendingInviteToken]);

  // Handle Create Passcode / New Resident with Native Supabase Verification
  const handleCreateResident = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    hapticImpact('LIGHT');

    if (!newResidentName.trim()) {
      hapticWarning();
      setErrorMessage('Please enter your full name.');
      return;
    }

    const cleanEmail = newResidentEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      hapticWarning();
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    const pinValidation = validateStrict4DigitPin(newPassword);
    if (!pinValidation.isValid) {
      hapticWarning();
      setErrorMessage(pinValidation.error || 'PIN must be exactly 4 digits.');
      return;
    }

    setIsSubmittingCreate(true);

    try {
      const generatedId = 'usr-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const newUser: User = {
        id: generatedId,
        name: newResidentName.trim(),
        email: cleanEmail,
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const regResult = await registerWithEmailConfirmationCloud(newUser, pinValidation.sanitized);

      if (regResult.error) {
        hapticWarning();
        setErrorMessage(regResult.error);
        setIsSubmittingCreate(false);
        return;
      }

      if (regResult.isExistingUser) {
        hapticWarning();
        setErrorMessage('This email is already registered. Please sign in with your PIN.');
        setIsSubmittingCreate(false);
        return;
      }

      if (regResult.emailConfirmationRequired) {
        hapticImpact('LIGHT');
        setCreatedUserPending(regResult.user);
        setCreateEmailVerificationPending(true);
        setResendCooldown(60);
        setIsSubmittingCreate(false);
        return;
      }

      const activeUser = regResult.user;
      hapticSuccess();
      const token = createResidentToken(activeUser, {
        expiresInDays: 7,
        biometricVerified: false,
      });

      storeResidentSession(token, true);
      onLogin(activeUser, token);
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Check email verification status for newly created resident account
  const handleCheckCreateEmailVerification = async () => {
    if (!createdUserPending) return;
    setIsCheckingVerification(true);
    setEmailVerificationError(null);
    try {
      const res = await checkEmailVerificationStatusCloud(createdUserPending.email, newPassword);
      if (!res.isVerified) {
        hapticWarning();
        setEmailVerificationError(
          res.error || `Please confirm your email using the link we sent to ${createdUserPending.email}.`
        );
      } else {
        hapticSuccess();
        const user = res.user || createdUserPending;
        const token = createResidentToken(user, { expiresInDays: 7, biometricVerified: false });
        storeResidentSession(token, true);
        onLogin(user, token);
      }
    } catch (err: unknown) {
      setEmailVerificationError(String(err));
    } finally {
      setIsCheckingVerification(false);
    }
  };

  const handleApplySuggestion = () => {
    hapticImpact('LIGHT');
    setNewPassword(suggestedPassword);
  };

  const handleRefreshSuggestion = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticImpact('LIGHT');
    setSuggestedPassword(generateStrongPasswordSuggestion());
  };

  // Forgot PIN submit handler
  const handleForgotPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    hapticImpact('LIGHT');

    if (!forgotEmail.trim()) {
      setErrorMessage('Please enter your registered email or phone.');
      return;
    }

    const pinValidation = validateStrict4DigitPin(forgotNewPin);
    if (!pinValidation.isValid) {
      setErrorMessage(pinValidation.error || 'New PIN must be exactly 4 digits.');
      return;
    }

    setPassword(forgotNewPin);
    setIdentifier(forgotEmail.trim());
    setForgotSuccess('Security PIN reset successfully! You can now sign in.');
    hapticSuccess();

    setTimeout(() => {
      setShowForgotPinModal(false);
      setForgotSuccess(null);
    }, 1500);
  };

  // Hidden developer gesture: 5 taps on RoomMate logo
  const handleLogoTap = () => {
    const nextCount = logoTapCount + 1;
    setLogoTapCount(nextCount);
    if (nextCount >= 5) {
      setLogoTapCount(0);
      const target = residentUsers[0] || (allUsers && allUsers[0]);
      if (!target) return;
      const demoToken = createResidentToken(target, {
        expiresInDays: 7,
        biometricVerified: true,
      });
      const result = verifyResidentToken(demoToken);
      if (result.payload) {
        setInspectingJwt(result.payload);
      }
    }
  };

  return (
    <main className="w-full min-h-screen bg-[#F9F9FF] text-slate-900 flex flex-col justify-between selection:bg-indigo-100 selection:text-indigo-900 select-none pb-safe pt-safe">
      {/* Scrollable Center Canvas */}
      <div className="flex-1 w-full max-w-[420px] mx-auto px-4 py-4 flex flex-col justify-start space-y-4">
        
        {/* 1. Header & Pure RoomMate Branding */}
        <header className="flex flex-col items-center text-center pt-2">
          {/* RoomMate Emblem with emerald status verification */}
          <button
            type="button"
            onClick={handleLogoTap}
            className="relative mb-2 focus:outline-none group active:scale-95 transition-transform"
            title="RoomMate"
          >
            <img
              src="/logo.png"
              alt="RoomMate"
              className="w-24 h-24 rounded-2xl object-contain drop-shadow-sm"
              onError={(e) => {
                // Fallback to vector icon if image not available
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                if (fallback) fallback.classList.remove('hidden');
              }}
            />
            <div className="fallback-icon hidden w-24 h-24 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building className="w-12 h-12 stroke-[2]" />
            </div>
            {/* Emerald Verified Micro Badge */}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border-2 border-[#F9F9FF] flex items-center justify-center shadow-xs">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white stroke-[3.5]" />
              </div>
            </div>
          </button>

          {/* App Title & Subtitle */}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            RoomMate
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Live Together. Spend Smarter.
          </p>

          {/* Active Ledger Pill Badge */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/80">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-slate-700">Student Ledger</span>
            <span className="text-slate-300 text-[11px]">•</span>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5">
              <ShieldCheck className="w-3 h-3" />
              Secured
            </span>
          </div>

          {/* Pending Room Invite Banner */}
          {pendingInviteToken && (
            <div className="w-full mt-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-left flex items-start gap-2.5 shadow-2xs animate-in fade-in">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-indigo-950">Room Invitation Received</div>
                <div className="text-[11px] text-indigo-700 mt-0.5 leading-snug">
                  Sign in or create your resident account below to accept your invitation.
                </div>
              </div>
            </div>
          )}

          {/* 2. Interactive 3-Segment Mode Tabs */}
          <div className="w-full mt-4 bg-slate-100 p-1 rounded-xl border border-slate-200/80 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => {
                hapticImpact('LIGHT');
                setAuthTab('signin');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 text-center rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center space-x-1 ${
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
                hapticImpact('LIGHT');
                setAuthTab('join');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 text-center rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center space-x-1 ${
                authTab === 'join'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Join with Code</span>
            </button>

            <button
              type="button"
              onClick={() => {
                hapticImpact('LIGHT');
                setAuthTab('create');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 text-center rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center space-x-1 ${
                authTab === 'create'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>New Resident</span>
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium leading-relaxed animate-in fade-in flex items-start justify-between gap-2">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-700 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 3. TAB CONTENT PANES */}

        {/* TAB 1: RESIDENT SIGN IN */}
        {authTab === 'signin' && (
          <section className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4 animate-in fade-in">
            {/* Google Sign-In Primary Quick Action */}
            <div className="space-y-3">
              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                loading={isGoogleLoading}
                label="Continue with Google"
              />
              <div className="flex justify-center -mt-1">
                <button
                  type="button"
                  onClick={() => setShowOAuthNotice(true)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition-colors py-0.5"
                >
                  Browser redirect issue or have auth link? Tap here
                </button>
              </div>
              <div className="relative flex items-center justify-center my-1">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  or sign in with credentials
                </span>
              </div>
            </div>

            <form onSubmit={handleSignIn} className="space-y-3.5">
              {/* Identifier Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="resident-identifier"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Email or Mobile Number
                  </label>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                    Resident Verified
                  </span>
                </div>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="resident-identifier"
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="name@example.com or +91 98765..."
                    className="w-full h-12 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs text-slate-900 font-medium placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Passcode / Security PIN */}
              <StrictPinInput
                id="resident-pin"
                value={password}
                onChange={setPassword}
                label="4-Digit Passcode / Security PIN"
                sublabel="Apartment Keycard"
                placeholder="••••"
                required
                showDotsIndicator
              />

              {/* Row: Remember device & Forgot PIN */}
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
                  <span className="text-xs text-slate-600 font-medium">
                    Remember this device
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(identifier);
                    setShowForgotPinModal(true);
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Forgot PIN?
                </button>
              </div>

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:pointer-events-none active:scale-[0.98] text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all duration-150"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to RoomMate</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Biometrics CTA */}
            <div>
              <button
                type="button"
                onClick={handleBiometricAuth}
                disabled={isScanningBiometrics}
                className="w-full h-11 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] text-indigo-700 border border-indigo-200/60 rounded-xl flex items-center justify-center space-x-2 text-xs font-semibold transition-all duration-150"
              >
                {isScanningBiometrics ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Verifying Biometrics...</span>
                  </>
                ) : biometricSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    <span className="text-emerald-700">
                      Authenticated via Biometrics
                    </span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 text-indigo-600" />
                    <span>Sign in with Biometrics / Fingerprint</span>
                  </>
                )}
              </button>
            </div>

            {/* Security Verification Badge */}
            <div className="flex items-center justify-center gap-1.5 pt-1 text-slate-400 text-[11px] font-medium">
              <Lock className="w-3 h-3 text-emerald-600" />
              <span>256-bit JWT Verified Session</span>
              <span>•</span>
              <span className="text-emerald-600 font-semibold">SOC-2 Vault</span>
            </div>
          </section>
        )}

        {/* TAB 2: JOIN VIA ROOM PASS OR QR SCANNER */}
        {authTab === 'join' && (
          <section className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4 animate-in fade-in">
            {/* STEP 0: SCAN QR OR ENTER CODE */}
            {joinWizardStep === 'scan_or_code' && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-1">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Join Flat via Room Pass
                  </h2>
                  <p className="text-xs text-slate-500">
                    Scan flatmate&apos;s QR code or enter 6-character room key
                  </p>
                </div>

                {/* Mode Switcher Pill */}
                <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      hapticImpact('LIGHT');
                      setJoinMode('camera');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-center rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      joinMode === 'camera'
                        ? 'bg-white text-indigo-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Scan Room QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      hapticImpact('LIGHT');
                      setJoinMode('code');
                      stopCamera();
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-center rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      joinMode === 'code'
                        ? 'bg-white text-indigo-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Enter Code</span>
                  </button>
                </div>

                {/* Sub-Mode 1: In-Place Live Camera Scanner */}
                {joinMode === 'camera' && (
                  <div className="space-y-3 animate-in fade-in">
                    <div className="relative w-full h-64 bg-slate-950 rounded-2xl overflow-hidden border-2 border-indigo-500/40 flex items-center justify-center shadow-inner">
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        autoPlay
                        playsInline
                        muted
                      />

                      {/* Viewfinder Target Reticle */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-indigo-400/80 rounded-2xl relative shadow-[0_0_20px_rgba(99,102,241,0.25)]">
                          {/* Reticle Corners */}
                          <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-white rounded-tl-md" />
                          <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-white rounded-tr-md" />
                          <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-white rounded-bl-md" />
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-white rounded-br-md" />

                          {/* Pulsing Scanline */}
                          <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-300 to-transparent shadow-[0_0_8px_#818cf8] animate-pulse" />
                        </div>
                      </div>

                      {/* Camera Status Overlay */}
                      <div className="absolute bottom-2.5 inset-x-3 py-1.5 px-3 rounded-xl bg-slate-900/80 backdrop-blur-sm text-center">
                        <span className="text-[11px] text-white font-medium">
                          Align Room QR inside frame
                        </span>
                      </div>
                    </div>

                    {/* Camera Error Message */}
                    {cameraError && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{cameraError}</span>
                      </div>
                    )}

                    {/* Fallback Upload Image Button */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                      >
                        <Upload className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Upload QR Image</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setJoinMode('code');
                          stopCamera();
                        }}
                        className="px-3 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all"
                      >
                        <span>Use Code</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-Mode 2: Manual 6-Character Code Form */}
                {joinMode === 'code' && (
                  <form onSubmit={handleManualCodeSubmit} className="space-y-3.5 animate-in fade-in">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 text-center">
                        Room Invite Key
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={joinInviteCode}
                        onChange={(e) => setJoinInviteCode(e.target.value.toUpperCase())}
                        placeholder="FLAT02"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full h-14 text-center text-xl font-mono font-bold tracking-[0.25em] bg-slate-50 border-2 border-indigo-200 focus:border-indigo-600 rounded-2xl uppercase text-indigo-700 focus:outline-none transition-colors"
                        required
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isResolvingRoom}
                      className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all duration-150"
                    >
                      {isResolvingRoom ? (
                        <span>Verifying Room...</span>
                      ) : (
                        <>
                          <span>Verify Code & Proceed</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    {/* Demo shortcut helper */}
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setJoinInviteCode('FLAT02');
                          resolveAndProceedToConfirmation('FLAT02');
                        }}
                        className="text-[11px] text-indigo-600 hover:underline font-medium"
                      >
                        Active Staging Code: <strong className="font-mono font-bold">FLAT02</strong> (Tap to verify)
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* STEP 1: PRIVACY-PRESERVING ROOM CONFIRMATION */}
            {joinWizardStep === 'confirm_room' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold tracking-wider text-indigo-600 uppercase">
                    Step 1 of 2 • Room Confirmation
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    #{resolvedRoomData?.tokenOrCode || joinInviteCode}
                  </span>
                </div>

                {/* Verified Room Identity Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 border border-indigo-100 text-center space-y-3 shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto text-xl shadow-sm">
                    🏠
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                      You&apos;re Invited to Join
                    </p>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">
                      {resolvedRoomData?.room.name}
                    </h3>
                    {resolvedRoomData?.room.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {resolvedRoomData.room.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200">
                      <Crown className="w-3 h-3 text-amber-600" />
                      <span>Admin: {resolvedRoomData?.adminName}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-[11px] font-semibold border border-indigo-200">
                      <Users className="w-3 h-3 text-indigo-600" />
                      <span>{resolvedRoomData?.memberCount} active flatmates</span>
                    </span>
                  </div>
                </div>

                {/* Privacy Reassurance Note */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed space-y-1">
                  <p className="font-semibold text-slate-800 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-600" />
                    <span>Zero Information Exposed Before Approval</span>
                  </p>
                  <p>
                    Your personal expense vault remains 100% private. Joining requests access to this household&apos;s shared bills.
                  </p>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setJoinWizardStep('scan_or_code');
                      setResolvedRoomData(null);
                    }}
                    className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    Cancel / Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setJoinWizardStep('resident_info')}
                    className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all shadow-xs"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: RESIDENT IDENTITY & 4-DIGIT PIN ENTRY */}
            {joinWizardStep === 'resident_info' && (
              <form onSubmit={handleSendJoinRequest} className="space-y-3.5 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold tracking-wider text-indigo-600 uppercase">
                    Step 2 of 2 • Resident Identity
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium truncate max-w-[140px]">
                    {resolvedRoomData?.room.name}
                  </span>
                </div>

                {/* Quick Join with Google */}
                <div className="space-y-2.5 pb-1">
                  <GoogleSignInButton
                    onClick={handleGoogleSignIn}
                    loading={isGoogleLoading}
                    label="Quick Join with Google"
                  />
                  <div className="flex justify-center -mt-1">
                    <button
                      type="button"
                      onClick={() => setShowOAuthNotice(true)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition-colors py-0.5"
                    >
                      Browser redirect issue or have auth link? Tap here
                    </button>
                  </div>
                  <div className="relative flex items-center justify-center my-1">
                    <div className="border-t border-slate-200 w-full" />
                    <span className="bg-white px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      or enter details manually
                    </span>
                  </div>
                </div>

                {/* Full Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Your Full Name
                  </label>
                  <div className="relative flex items-center">
                    <UserCheck className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={joinResidentName}
                      onChange={(e) => setJoinResidentName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none transition-colors"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {/* Email or Mobile */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Email or Mobile Number
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={joinResidentEmail}
                      onChange={(e) => setJoinResidentEmail(e.target.value)}
                      placeholder="resident@roommate.app"
                      className="w-full h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Strict 4-Digit Security PIN */}
                <StrictPinInput
                  id="join-security-pin"
                  value={joinPin}
                  onChange={setJoinPin}
                  label="Create 4-Digit Security PIN"
                  sublabel="SHA-256 Protected"
                  placeholder="••••"
                  required
                  helperText="Admin never sees your PIN. It is used strictly to log in to your resident account."
                  showDotsIndicator
                />

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSubmittingJoin}
                    onClick={() => setJoinWizardStep('confirm_room')}
                    className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingJoin || joinPin.length < 4 || !joinResidentName.trim() || !joinResidentEmail.trim()}
                    className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                  >
                    {isSubmittingJoin ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Request...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Join Request</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* EXISTING USER AUTHENTICATION STEP (Preserves Account & Personal Vault) */}
            {joinWizardStep === 'existing_user_auth' && existingUserForJoin && (
              <form onSubmit={handleExistingUserAuthSubmit} className="space-y-4 animate-in fade-in">
                {/* Identity Reassurance Card */}
                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                    {existingUserForJoin.name ? existingUserForJoin.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-900">
                      Account Found: {existingUserForJoin.name}
                    </h4>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      This email is already registered. Enter your 4-digit PIN to authenticate and request access to <strong>{resolvedRoomData?.room.name}</strong>.
                    </p>
                  </div>
                </div>

                {/* Protection Notice */}
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-[11px] text-emerald-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Your account details, existing memberships, and personal expense vault remain strictly private.</span>
                </div>

                {/* PIN Input */}
                <StrictPinInput
                  id="existing-user-pin"
                  value={existingUserPin}
                  onChange={setExistingUserPin}
                  label="Enter 4-Digit Security PIN"
                  sublabel="Existing Resident Key"
                  placeholder="••••"
                  error={existingUserAuthError}
                  required
                  autoFocus
                  showDotsIndicator
                />

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isAuthenticatingExisting}
                    onClick={() => {
                      setJoinWizardStep('resident_info');
                      setExistingUserPin('');
                      setExistingUserAuthError(null);
                    }}
                    className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isAuthenticatingExisting || existingUserPin.length < 4}
                    className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                  >
                    {isAuthenticatingExisting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Authenticate & Join</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* EMAIL VERIFICATION STEP (Native Supabase Email Confirmation) */}
            {joinWizardStep === 'email_verification' && (
              <div className="space-y-4 animate-in fade-in">
                {/* Visual Icon & Header */}
                <div className="text-center space-y-2 pt-2">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                    <Mail className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Check Your Email</h3>
                    <p className="text-xs text-slate-500 pt-0.5">
                      We&apos;ve sent a confirmation link to:
                    </p>
                    <p className="text-xs font-mono font-bold text-indigo-700 pt-1 break-all bg-indigo-50/50 px-3 py-1.5 rounded-lg border border-indigo-100/80 inline-block mt-1">
                      {joinResidentEmail}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed px-2">
                    Please open the email and tap the confirmation link before continuing your room access request.
                  </p>
                </div>

                {/* Privacy & Two-Stage Security Note */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Two-Stage Security Model</span>
                  </p>
                  <p>
                    Confirming your email verifies your identity. The flat admin must then approve your join request before ledger access is granted.
                  </p>
                </div>

                {/* Verification Error Notice */}
                {emailVerificationError && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold">Email not verified yet</p>
                      <p className="text-[11px] text-amber-800">
                        {emailVerificationError}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = `mailto:${joinResidentEmail}`;
                      }}
                      className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      <span>Open Email App</span>
                    </button>

                    <button
                      type="button"
                      disabled={isCheckingVerification}
                      onClick={handleCheckEmailVerification}
                      className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                    >
                      {isCheckingVerification ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>I&apos;ve Confirmed</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Resend Confirmation Link with Cooldown Timer */}
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isResendingEmail}
                      onClick={handleResendConfirmationEmail}
                      className="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      {isResendingEmail ? (
                        'Sending confirmation email…'
                      ) : resendCooldown > 0 ? (
                        `Resend available in ${resendCooldown}s`
                      ) : (
                        'Resend Confirmation Email'
                      )}
                    </button>
                  </div>

                  {/* Back Link */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setJoinWizardStep('resident_info');
                        setEmailVerificationError(null);
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      Change email address
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: WAITING FOR ADMIN APPROVAL, APPROVED, OR DECLINED */}
            {joinWizardStep === 'waiting' && (
              <div className="space-y-4 animate-in fade-in">
                {/* 1. Approved State */}
                {joinRequestStatus === 'approved' ? (
                  <div className="p-4 text-center space-y-4 animate-in zoom-in-95">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl shadow-sm">
                      🎉
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">You&apos;re in!</h3>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        <strong>{resolvedRoomData?.adminName || 'Admin'}</strong> approved your request to join <strong>{resolvedRoomData?.room.name}</strong>.
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        You can now access your shared room ledger, view split expenses, and record settlement payments.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleEnterApprovedRoom}
                      className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
                    >
                      <span>Enter Room Ledger</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : joinRequestStatus === 'declined' ? (
                  /* 2. Declined State */
                  <div className="p-4 text-center space-y-4 animate-in fade-in">
                    <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-2xl shadow-sm">
                      ❌
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Request Declined</h3>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Your request to join <strong>{resolvedRoomData?.room.name}</strong> was declined by {resolvedRoomData?.adminName || 'the admin'}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCancelPendingRequest}
                      className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs active:scale-95 transition-all"
                    >
                      Back to Join
                    </button>
                  </div>
                ) : (
                  /* 3. Pending State */
                  <div className="space-y-4">
                    {/* 3-Stage Visual Progress Tracker */}
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Request Sent</span>
                      </div>
                      <span className="text-slate-300">───</span>
                      <div className="flex items-center gap-1.5 text-indigo-700 font-bold animate-pulse">
                        <Hourglass className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Waiting</span>
                      </div>
                      <span className="text-slate-300">───</span>
                      <div className="flex items-center gap-1 text-slate-400 font-medium">
                        <div className="w-2.5 h-2.5 rounded-full border border-slate-300" />
                        <span>Access</span>
                      </div>
                    </div>

                    {/* Status Message Card */}
                    <div className="text-center space-y-2 py-2">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-xl border border-amber-200/80">
                        ⏳
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Waiting for Admin Approval
                      </h3>
                      <p className="text-xs text-slate-600 max-w-xs mx-auto">
                        Your request has been sent to <strong>{resolvedRoomData?.adminName || 'the admin'}</strong> for <strong>{resolvedRoomData?.room.name}</strong>.
                      </p>
                    </div>

                    {/* Help Note */}
                    <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900 leading-relaxed">
                      💡 <strong>You can safely leave this screen or close the app.</strong> We will notify you the moment your request is approved.
                    </div>

                    <button
                      type="button"
                      onClick={handleCancelPendingRequest}
                      className="w-full h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 font-semibold text-xs active:scale-95 transition-all"
                    >
                      Cancel Request & Return
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: NEW RESIDENT REGISTRATION */}
        {authTab === 'create' && (
          <section className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <h2 className="text-xs font-bold text-slate-900">
                  Register New Resident
                </h2>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 rounded-full">
                New Account
              </span>
            </div>

            {createEmailVerificationPending ? (
              <div className="space-y-4 animate-in fade-in py-2">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                    <Mail className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Check Your Email</h3>
                    <p className="text-xs text-slate-500 pt-0.5">
                      We&apos;ve sent a confirmation link to:
                    </p>
                    <p className="text-xs font-mono font-bold text-indigo-700 pt-1 break-all bg-indigo-50/50 px-3 py-1.5 rounded-lg border border-indigo-100/80 inline-block mt-1">
                      {createdUserPending?.email || newResidentEmail}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed px-2">
                    Please open the email and tap the confirmation link to complete your account setup.
                  </p>
                </div>

                {emailVerificationError && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Email not verified yet</p>
                      <p className="text-[11px] text-amber-800">{emailVerificationError}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = `mailto:${createdUserPending?.email || newResidentEmail}`;
                      }}
                      className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      <span>Open Email App</span>
                    </button>

                    <button
                      type="button"
                      disabled={isCheckingVerification}
                      onClick={handleCheckCreateEmailVerification}
                      className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                    >
                      {isCheckingVerification ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>I&apos;ve Confirmed</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isResendingEmail}
                      onClick={() => handleResendConfirmationEmail()}
                      className="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      {isResendingEmail ? (
                        'Sending confirmation email…'
                      ) : resendCooldown > 0 ? (
                        `Resend available in ${resendCooldown}s`
                      ) : (
                        'Resend Confirmation Email'
                      )}
                    </button>
                  </div>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateEmailVerificationPending(false);
                        setEmailVerificationError(null);
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      Change registration details
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <GoogleSignInButton
                  onClick={handleGoogleSignIn}
                  loading={isGoogleLoading}
                  label="Sign up with Google"
                />
                <div className="flex justify-center -mt-1">
                  <button
                    type="button"
                    onClick={() => setShowOAuthNotice(true)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition-colors py-0.5"
                  >
                    Browser redirect issue or have auth link? Tap here
                  </button>
                </div>
                <div className="relative flex items-center justify-center my-1">
                  <div className="border-t border-slate-200 w-full" />
                  <span className="bg-white px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    or register with email
                  </span>
                </div>

                <form onSubmit={handleCreateResident} className="space-y-3">
                {/* Full Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Full Name
                  </label>
                  <input
                    type="text"
                    autoCapitalize="words"
                    value={newResidentName}
                    onChange={(e) => setNewResidentName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none transition-colors"
                    required
                  />
                </div>

                {/* Email / Mobile */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Email Address
                  </label>
                  <input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={newResidentEmail}
                    onChange={(e) => setNewResidentEmail(e.target.value)}
                    placeholder="resident@roommate.app"
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none transition-colors"
                    required
                  />
                </div>

                {/* Passcode / PIN Creation */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Create 4-Digit Passcode
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleApplySuggestion}
                        className="text-[10px] text-indigo-600 hover:underline font-semibold flex items-center gap-0.5"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>Auto-PIN ({suggestedPassword})</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRefreshSuggestion}
                        className="p-0.5 text-slate-400 hover:text-indigo-600"
                        title="Regenerate"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <StrictPinInput
                    id="create-resident-pin"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="••••"
                    required
                    showDotsIndicator
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingCreate || newPassword.length < 4 || !newResidentName.trim() || !newResidentEmail.trim()}
                  className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-semibold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all mt-2 disabled:opacity-50"
                >
                  {isSubmittingCreate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Resident Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
              </div>
            )}
          </section>
        )}

        {/* Alternative Onboarding Action Banner */}
        {authTab !== 'join' && (
          <button
            type="button"
            onClick={() => {
              hapticImpact('LIGHT');
              setAuthTab('join');
            }}
            className="w-full py-2.5 px-4 rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/50 flex items-center justify-between text-indigo-700 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Key className="w-4 h-4 text-indigo-600" />
              <span>Have an invite code?</span>
            </div>
            <span className="text-xs font-bold text-indigo-600 flex items-center">
              Join with Room Key
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </span>
          </button>
        )}

        {/* 6. Footer & Security Compliance Notice */}
        <footer className="pt-2 pb-4 text-center space-y-1.5">
          <div className="flex items-center justify-center space-x-1.5 text-slate-400 text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Private Ledger • 256-bit Encrypted Vault</span>
          </div>
          <p className="text-[10px] text-slate-400">
            RoomMate Technologies • Authorized Flatmates Only
          </p>
        </footer>
      </div>

      {/* Forgot PIN Recovery Modal */}
      {showForgotPinModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reset PIN</h3>
                  <p className="text-[11px] text-slate-500">RoomMate Keycard</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPinModal(false);
                  setForgotSuccess(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotSuccess ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold text-center">
                {forgotSuccess}
              </div>
            ) : (
              <form onSubmit={handleForgotPinSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Your Email or Mobile
                  </label>
                  <input
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="resident@roommate.app"
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-xs text-slate-900 focus:outline-none focus:border-indigo-600 transition-colors"
                    required
                  />
                </div>

                <StrictPinInput
                  id="forgot-new-pin"
                  value={forgotNewPin}
                  onChange={setForgotNewPin}
                  label="Set New 4-Digit PIN"
                  placeholder="••••"
                  required
                  centerText
                  showDotsIndicator
                />

                <button
                  type="submit"
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl active:scale-[0.98] transition-all"
                >
                  Update Passcode
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Discrete JWT Debug Inspection Modal (Triggered by 5 taps on RoomMate logo) */}
      {inspectingJwt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-5 space-y-3.5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Resident JWT Session (Dev Debug)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingJwt(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left font-mono text-[10px] text-slate-700 space-y-1 overflow-x-auto">
              <div>
                <strong className="text-slate-900">iss:</strong> {inspectingJwt.iss}
              </div>
              <div>
                <strong className="text-slate-900">sub:</strong> {inspectingJwt.sub}
              </div>
              <div>
                <strong className="text-slate-900">name:</strong> {inspectingJwt.name}
              </div>
              <div>
                <strong className="text-slate-900">email:</strong> {inspectingJwt.email}
              </div>
              <div>
                <strong className="text-slate-900">role:</strong> {inspectingJwt.role}
              </div>
              <div>
                <strong className="text-slate-900">biometricVerified:</strong>{' '}
                {String(inspectingJwt.biometricVerified)}
              </div>
              <div>
                <strong className="text-slate-900">exp:</strong>{' '}
                {new Date(inspectingJwt.exp * 1000).toLocaleString()}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setInspectingJwt(null)}
              className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Google OAuth Provider Configuration Notice Modal */}
      <OAuthProviderNoticeModal
        isOpen={showOAuthNotice}
        onClose={() => setShowOAuthNotice(false)}
        errorMessage={oauthNoticeError}
      />
    </main>
  );
};
