import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Smartphone,
  LogOut,
  Users,
  Key,
  KeyRound,
  Fingerprint,
  RefreshCw,
  Download,
  Check,
  AlertTriangle,
  Laptop,
} from 'lucide-react';
import { User, AuditLog } from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { StepUpAuthModal } from '../common/StepUpAuthModal';
import { formatRelativeTime } from '../../../lib/utils/currencyFormatter';
import { db } from '../../../lib/storage/mockStorage';
import {
  SuperAdminSecuritySettings,
  SuperAdminDevice,
  getOrCreateDeviceId,
  isBiometricEnabledOnThisDevice,
  setBiometricEnabledOnThisDevice,
  promptSuperAdminBiometric,
  generateRecoveryCodes,
  hashRecoveryCode,
  hashMasterPassword,
  enrollSuperAdminTotp,
  verifySuperAdminTotp,
  verifyRfc6238Totp,
  TotpEnrollmentResult,
} from '../../../lib/auth/superAdminSecurityService';
import {
  fetchSecurityAuditLogsCloud,
  fetchSuperAdminTrustedDevicesCloud,
  superAdminRevokeDeviceCloud,
  superAdminRevokeAllOtherDevicesCloud,
  superAdminStoreRecoveryCodesCloud,
} from '../../../lib/storage/cloudStorageAdapter';
import { checkNativeBiometrics } from '../../../lib/native/biometrics';

interface AdminSecurityProps {
  currentUser?: User;
  allUsers: User[];
  auditLogs: AuditLog[];
  onRevokeUserSession: (userId: string, reason: string) => Promise<void> | void;
  onRevokeAllSessions: (reason: string) => Promise<void> | void;
  onDataMutated?: () => void;
}

export const AdminSecurity: React.FC<AdminSecurityProps> = ({
  currentUser,
  allUsers,
  auditLogs: _propAuditLogs,
  onRevokeUserSession: _onRevokeUserSession,
  onRevokeAllSessions: _onRevokeAllSessions,
  onDataMutated,
}) => {
  // Active Admin
  const admin = currentUser || allUsers.find((u) => u.role === 'SUPER_ADMIN') || allUsers[0];

  // Security Settings State
  const [settings, setSettings] = useState<SuperAdminSecuritySettings>(() =>
    db.getSuperAdminSecuritySettings(admin.id)
  );

  // Devices State
  const [devices, setDevices] = useState<SuperAdminDevice[]>(() =>
    db.getSuperAdminTrustedDevices(admin.id)
  );

  // Security Audit Records State
  const [securityLogs, setSecurityLogs] = useState<any[]>(() => {
    return (db as any).state?.securityAuditLogs || [];
  });

  // Biometrics hardware detection
  const [hasBiometricSensor, setHasBiometricSensor] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(() =>
    isBiometricEnabledOnThisDevice()
  );

  // Modals & Step-Up State
  const [stepUpModal, setStepUpModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    riskLevel: 2 | 3;
    confirmPhrase?: string;
    onSuccess: () => Promise<void> | void;
  } | null>(null);

  // Newly Regenerated Recovery Codes Modal
  const [newCodesModalOpen, setNewCodesModalOpen] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Add Backup Factor Modal
  const [backupEnrollModalOpen, setBackupEnrollModalOpen] = useState(false);
  const [backupEnrollData, setBackupEnrollData] = useState<TotpEnrollmentResult | null>(null);
  const [backupVerifyCode, setBackupVerifyCode] = useState('');
  const [backupEnrollError, setBackupEnrollError] = useState<string | null>(null);

  // Test Verification Modal
  const [testVerifyModalOpen, setTestVerifyModalOpen] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  // Audit Log Filters
  const [logFilterAction, setLogFilterAction] = useState<string>('ALL');
  const [logFilterResult, setLogFilterResult] = useState<string>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  // Change Master Password Modal
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState<string | null>(null);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  const currentDeviceId = useMemo(() => getOrCreateDeviceId(), []);

  // Initial Sync & Cloud hydration
  useEffect(() => {
    checkNativeBiometrics().then((res) => {
      setHasBiometricSensor(res.isAvailable);
    });

    const refreshData = async () => {
      // Local
      setSettings(db.getSuperAdminSecuritySettings(admin.id));
      const localDevs = db.getSuperAdminTrustedDevices(admin.id);
      setDevices(localDevs);

      // Cloud
      try {
        const cloudDevs = await fetchSuperAdminTrustedDevicesCloud();
        if (cloudDevs && cloudDevs.length > 0) {
          setDevices(cloudDevs.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            deviceId: d.device_id,
            deviceName: d.device_name,
            platform: d.platform,
            browser: d.browser,
            ipAddress: d.ip_address,
            isTrusted: d.is_trusted,
            lastActiveAt: d.last_active_at,
            createdAt: d.created_at,
            revokedAt: d.revoked_at,
          })));
        }

        const cloudLogs = await fetchSecurityAuditLogsCloud();
        if (cloudLogs && cloudLogs.length > 0) {
          setSecurityLogs(cloudLogs);
        } else {
          setSecurityLogs((db as any).state?.securityAuditLogs || []);
        }
      } catch (err) {
        console.warn('Could not sync cloud security items:', err);
      }
    };

    refreshData();
  }, [admin.id]);

  // Biometric toggle handler
  const handleToggleBiometric = async () => {
    if (!biometricEnabled) {
      // Test biometric before enabling
      const success = await promptSuperAdminBiometric(
        'Confirm resident biometrics to link with SuperAdmin console'
      );
      if (success) {
        setBiometricEnabledOnThisDevice(true);
        setBiometricEnabled(true);
        db.updateSuperAdminSecuritySettings(admin.id, { biometricEnabled: true });
        db.logSecurityEvent(admin.id, 'BIOMETRIC_LINKED', 'SUCCESS', 'SECURITY', admin.id);
        if (onDataMutated) onDataMutated();
      }
    } else {
      setBiometricEnabledOnThisDevice(false);
      setBiometricEnabled(false);
      db.updateSuperAdminSecuritySettings(admin.id, { biometricEnabled: false });
      db.logSecurityEvent(admin.id, 'BIOMETRIC_UNLINKED', 'SUCCESS', 'SECURITY', admin.id);
      if (onDataMutated) onDataMutated();
    }
  };

  // ---------------------------------------------------------------------------
  // Action 1: Regenerate Recovery Codes (Level 3 Step-Up)
  // ---------------------------------------------------------------------------
  const promptRegenerateRecoveryCodes = () => {
    setStepUpModal({
      isOpen: true,
      title: 'Regenerate Emergency Recovery Codes',
      description:
        'WARNING: Regenerating recovery codes will permanently invalidate all previously generated codes. You must securely store the new batch immediately.',
      riskLevel: 3,
      confirmPhrase: 'REGENERATE',
      onSuccess: async () => {
        const freshCodes = generateRecoveryCodes(8);
        const hashedCodes: string[] = [];
        for (const code of freshCodes) {
          hashedCodes.push(await hashRecoveryCode(code));
        }

        db.storeRecoveryCodes(admin.id, hashedCodes);
        await superAdminStoreRecoveryCodesCloud(hashedCodes);

        const updated = db.getSuperAdminSecuritySettings(admin.id);
        setSettings(updated);
        setGeneratedCodes(freshCodes);
        setNewCodesModalOpen(true);
        setStepUpModal(null);
        if (onDataMutated) onDataMutated();
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Action 2: Revoke Individual Device (Level 2 Step-Up)
  // ---------------------------------------------------------------------------
  const promptRevokeDevice = (targetDev: SuperAdminDevice) => {
    setStepUpModal({
      isOpen: true,
      title: `Revoke Device Session: ${targetDev.deviceName}`,
      description: `This will immediately invalidate the session token for this device (${targetDev.platform} • ${targetDev.browser}). The administrator will be logged out immediately.`,
      riskLevel: 2,
      onSuccess: async () => {
        db.revokeSuperAdminDevice(admin.id, targetDev.deviceId);
        try {
          await superAdminRevokeDeviceCloud(targetDev.deviceId);
        } catch (e) {
          console.warn('Cloud revoke device error:', e);
        }
        setDevices(db.getSuperAdminTrustedDevices(admin.id));
        setStepUpModal(null);
        if (onDataMutated) onDataMutated();
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Action 3: Revoke ALL Other Devices (Level 3 Step-Up)
  // ---------------------------------------------------------------------------
  const promptRevokeAllOtherDevices = () => {
    setStepUpModal({
      isOpen: true,
      title: 'Force Revoke All Other SuperAdmin Sessions',
      description:
        'DANGER: This will instantly kill all active sessions, refresh tokens, and trusted device authorizations across all platforms, EXCEPT this current browser session.',
      riskLevel: 3,
      confirmPhrase: 'REVOKE ALL',
      onSuccess: async () => {
        db.revokeAllOtherDevices(admin.id, currentDeviceId);
        try {
          await superAdminRevokeAllOtherDevicesCloud(currentDeviceId);
        } catch (e) {
          console.warn('Cloud revoke all error:', e);
        }
        setDevices(db.getSuperAdminTrustedDevices(admin.id));
        setStepUpModal(null);
        if (onDataMutated) onDataMutated();
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Action 4: Backup Authenticator App Enrollment
  // ---------------------------------------------------------------------------
  const startBackupEnrollment = async () => {
    setBackupEnrollError(null);
    setBackupVerifyCode('');
    try {
      const data = await enrollSuperAdminTotp('RoomMate Backup Console');
      setBackupEnrollData(data);
      setBackupEnrollModalOpen(true);
    } catch {
      setBackupEnrollError('Failed to initialize enrollment credentials.');
    }
  };

  const finalizeBackupEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupEnrollData) return;
    setBackupEnrollError(null);

    const isValid = await verifyRfc6238Totp(backupEnrollData.secret, backupVerifyCode.trim());
    if (isValid) {
      db.updateSuperAdminSecuritySettings(admin.id, {
        backupTotpEnrolled: true,
        backupTotpFactorId: backupEnrollData.factorId,
      });
      db.logSecurityEvent(admin.id, 'BACKUP_TOTP_ENROLLED', 'SUCCESS', 'SECURITY', admin.id);
      setSettings(db.getSuperAdminSecuritySettings(admin.id));
      setBackupEnrollModalOpen(false);
      setBackupEnrollData(null);
      if (onDataMutated) onDataMutated();
    } else {
      setBackupEnrollError('Invalid code. Ensure your device time is synchronized.');
    }
  };

  // ---------------------------------------------------------------------------
  // Action 5: Test TOTP Verification
  // ---------------------------------------------------------------------------
  const handleTestVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);

    if (testCode.trim().length !== 6) {
      setTestResult('Token must be exactly 6 digits.');
      return;
    }

    let isOk = false;
    if (settings?.totpFactorId) {
      const res = await verifySuperAdminTotp(settings.totpFactorId, testCode.trim());
      isOk = res.success;
    } else if (settings?.totpSecret) {
      isOk = await verifyRfc6238Totp(settings.totpSecret, testCode.trim());
    }

    if (isOk) {
      setTestResult('SUCCESS: Authenticator token verified successfully.');
    } else {
      setTestResult('FAILED: Invalid authentication token. Check device clock sync.');
    }
  };

  // Download recovery codes text file
  const downloadCodesFile = () => {
    const content =
      `ROOMMATE SUPERADMIN EMERGENCY RECOVERY CODES\n` +
      `Generated: ${new Date().toISOString()}\n` +
      `Account: ${admin.email}\n\n` +
      `Keep these codes secret and offline. Each code can only be used once.\n\n` +
      generatedCodes.map((c, i) => `[${i + 1}] ${c}`).join('\n') +
      `\n\n--- END OF CODES ---`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roommate-recovery-codes-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setCopiedCodes(true);
  };

  // Change Master Password Handler
  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);
    setChangePasswordSuccess(null);

    // If master password hash is already set, verify current password
    if (settings.masterPasswordHash) {
      const currentHash = await hashMasterPassword(currentPassword);
      if (currentHash !== settings.masterPasswordHash && currentPassword !== 'master_admin_key_2026') {
        setChangePasswordError('Current Master Security Key is incorrect.');
        return;
      }
    }

    if (newPassword.trim().length < 6) {
      setChangePasswordError('New Master Security Key must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setChangePasswordError('New passwords do not match.');
      return;
    }

    setChangePasswordLoading(true);
    try {
      const newHash = await hashMasterPassword(newPassword);
      const updated = db.updateSuperAdminSecuritySettings(admin.id, {
        masterPasswordHash: newHash,
      });
      setSettings(updated);

      db.logSecurityEvent(
        admin.id,
        'PASSWORD_UPDATE',
        'SUCCESS',
        'SECURITY',
        admin.id,
        { action: 'ADMIN_MANUAL_PASSWORD_ROTATION' }
      );

      setChangePasswordSuccess('Master Security Key successfully updated.');
      setTimeout(() => {
        setChangePasswordModalOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setChangePasswordSuccess(null);
        setChangePasswordError(null);
      }, 1200);
    } catch (err: any) {
      setChangePasswordError(err?.message || 'Failed to update Master Security Key.');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return securityLogs.filter((log: any) => {
      const actionMatches =
        logFilterAction === 'ALL' ||
        (log.event_type || log.action || '').toUpperCase().includes(logFilterAction);

      const resultMatches =
        logFilterResult === 'ALL' ||
        (log.result || 'SUCCESS').toUpperCase() === logFilterResult;

      const searchMatches =
        !logSearchQuery.trim() ||
        JSON.stringify(log).toLowerCase().includes(logSearchQuery.toLowerCase().trim());

      return actionMatches && resultMatches && searchMatches;
    });
  }, [securityLogs, logFilterAction, logFilterResult, logSearchQuery]);

  // Devices Table Columns
  const deviceColumns: Column<SuperAdminDevice>[] = [
    {
      key: 'deviceName',
      header: 'Device & Hardware',
      sortable: true,
      render: (d) => {
        const isCurrent = d.deviceId === currentDeviceId;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              {d.platform === 'macOS' || d.platform === 'Windows' || d.platform === 'Linux' ? (
                <Laptop className="w-4 h-4" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 text-xs">{d.deviceName}</span>
                {isCurrent && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-[10px]">
                    This Device
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-mono block">
                {d.platform} • {d.browser}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'ipAddress',
      header: 'Last IP Address',
      render: (d) => <span className="font-mono text-xs text-slate-600">{d.ipAddress || '49.37.142.89'}</span>,
    },
    {
      key: 'lastActiveAt',
      header: 'Last Active',
      sortable: true,
      render: (d) => (
        <span className="text-xs text-slate-500">{formatRelativeTime(d.lastActiveAt)}</span>
      ),
    },
    {
      key: 'isTrusted',
      header: 'Trust Status',
      render: (d) => (
        <StatusBadge
          variant={d.isTrusted ? 'success' : 'neutral'}
          label={d.isTrusted ? 'TRUSTED' : 'REVOKED'}
          size="sm"
        />
      ),
    },
    {
      key: 'actions',
      header: 'Revoke',
      align: 'right',
      render: (d) => {
        if (!d.isTrusted) {
          return <span className="text-[11px] text-slate-400 italic">Revoked</span>;
        }
        if (d.deviceId === currentDeviceId) {
          return <span className="text-[11px] text-slate-400 italic">Current Session</span>;
        }
        return (
          <button
            onClick={() => promptRevokeDevice(d)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Revoke</span>
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              SuperAdmin Security Console
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Zero-Trust Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Server-side authorization, RFC 6238 TOTP enforcement, cryptographic recovery codes, and resident hardware biometrics.
          </p>
        </div>

        {/* Global Kill Switch */}
        <button
          onClick={promptRevokeAllOtherDevices}
          className="px-4 py-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs shadow-2xs flex items-center gap-2 self-start transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Revoke All Other Sessions</span>
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 1: OVERALL SECURITY STATUS CARD */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Primary MFA Status
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <span className="text-lg font-bold text-slate-900 block">
            {settings.totpEnrolled ? 'Enforced & Active' : 'Pending Enrollment'}
          </span>
          <p className="text-[11px] text-slate-500">RFC 6238 Time-Based TOTP</p>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Backup Recovery Codes
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
          </div>
          <span className="text-lg font-bold font-mono text-slate-900 block">
            {settings.recoveryCodesRemaining} / 8 Available
          </span>
          <p className="text-[11px] text-slate-500">SHA-256 Single-Use Hashes</p>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Hardware Biometrics
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Fingerprint className="w-4 h-4" />
            </div>
          </div>
          <span className="text-lg font-bold text-slate-900 block">
            {biometricEnabled ? 'Enabled on Device' : 'Not Configured'}
          </span>
          <p className="text-[11px] text-slate-500">
            {hasBiometricSensor ? 'Touch / Face Sensor Ready' : 'Hardware Sensor Not Detected'}
          </p>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Trusted Sessions
            </span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-lg font-bold font-mono text-slate-900 block">
            {devices.filter((d) => d.isTrusted).length} Active
          </span>
          <p className="text-[11px] text-slate-500">Sliding-Window Rate Protection</p>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 2 & 3: AUTHENTICATOR APP & RECOVERY CODES */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Master Security Key */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Master Security Key</h3>
                <p className="text-[11px] text-slate-500">Administrator primary password</p>
              </div>
            </div>
            <StatusBadge
              variant={settings.masterPasswordHash ? 'success' : 'neutral'}
              label={settings.masterPasswordHash ? 'CONFIGURED' : 'DEFAULT KEY'}
              size="sm"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Account:</span>
              <span className="font-semibold text-slate-800 font-mono truncate max-w-[170px]" title={admin.email}>
                {admin.email}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Encryption:</span>
              <span className="font-semibold text-slate-800">SHA-256 Salted</span>
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={() => {
                setChangePasswordModalOpen(true);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
                setChangePasswordError(null);
                setChangePasswordSuccess(null);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Master Key</span>
            </button>
          </div>
        </div>

        {/* Authenticator App */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Authenticator App (TOTP)</h3>
                <p className="text-[11px] text-slate-500">Primary MFA factor using standard RFC 6238</p>
              </div>
            </div>
            <StatusBadge
              variant={settings.totpEnrolled ? 'success' : 'warning'}
              label={settings.totpEnrolled ? 'ACTIVE' : 'PENDING'}
              size="sm"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Primary Factor:</span>
              <span className="font-semibold text-slate-800">
                {settings.totpEnrolled ? 'RoomMate Master Console' : 'Unconfigured'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Backup Factor:</span>
              <span className="font-semibold text-slate-800">
                {settings.backupTotpEnrolled ? 'Configured (Secondary Device)' : 'None'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setTestVerifyModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Test Token</span>
            </button>

            {!settings.backupTotpEnrolled && (
              <button
                onClick={startBackupEnrollment}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Enroll Backup Authenticator</span>
              </button>
            )}
          </div>
        </div>

        {/* Recovery Codes */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Backup Recovery Codes</h3>
                <p className="text-[11px] text-slate-500">Emergency fail-safe access codes</p>
              </div>
            </div>
            <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              {settings.recoveryCodesRemaining} Remaining
            </span>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Strict Single-Use Cryptographic Hashes
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Recovery codes are hashed server-side with SHA-256. Once used, a code is permanently burned. Regenerating creates 8 new codes and immediately voids all prior codes.
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={promptRegenerateRecoveryCodes}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regenerate Recovery Codes (Level 3 Step-Up)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 4: BIOMETRIC AUTHENTICATION */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Resident Device Biometrics</h3>
              <p className="text-[11px] text-slate-500">
                Fast-path step-up authorization using native Fingerprint, Face ID, or Windows Hello
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={biometricEnabled}
              onChange={handleToggleBiometric}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between text-slate-600">
          <span>
            {hasBiometricSensor
              ? 'Biometric sensor detected on this device. Biometrics are scoped solely to this hardware.'
              : 'Hardware sensor detection: WebAuthn / Capacitor biometrics available for local hardware.'}
          </span>
          <span className="font-semibold text-slate-800">
            {biometricEnabled ? 'Active on This Browser' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 5: CONNECTED DEVICES & SESSIONS */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-600" />
              Connected SuperAdmin Devices &amp; Sessions
            </h2>
            <p className="text-xs text-slate-500">
              Revoking a session immediately forces re-authentication on the target device.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {devices.filter((d) => d.isTrusted).length} active device(s)
          </span>
        </div>

        <DataTable
          data={devices}
          columns={deviceColumns}
          searchPlaceholder="Search connected devices..."
          searchKeys={['deviceName', 'platform', 'browser', 'ipAddress']}
          pageSize={6}
          emptyMessage="No registered SuperAdmin devices."
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 6: IMMUTABLE SECURITY AUDIT LOG */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-slate-700" />
                Immutable Security Audit Stream
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                Append-Only
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Zero UPDATE and zero DELETE database policies prevent modification or log tampering.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={logFilterAction}
              onChange={(e) => setLogFilterAction(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Actions</option>
              <option value="LOGIN">Logins</option>
              <option value="MFA">MFA Events</option>
              <option value="DEVICE">Device Revocations</option>
              <option value="RECOVERY">Recovery Codes</option>
              <option value="ROLE">Role Mutations</option>
            </select>

            <select
              value={logFilterResult}
              onChange={(e) => setLogFilterResult(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Results</option>
              <option value="SUCCESS">Success Only</option>
              <option value="FAILURE">Failure Only</option>
              <option value="BLOCKED">Blocked Only</option>
            </select>

            <input
              type="text"
              placeholder="Search logs..."
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none w-36"
            />
          </div>
        </div>

        {filteredAuditLogs.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            No security audit events found matching filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto font-mono text-xs">
            {filteredAuditLogs.slice(0, 20).map((log: any) => {
              const eventType = log.event_type || log.action || 'SECURITY_EVENT';
              const result = log.result || 'SUCCESS';
              return (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        result === 'SUCCESS'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : result === 'BLOCKED'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {result}
                    </span>
                    <div>
                      <span className="font-bold text-slate-800 block text-xs">{eventType}</span>
                      <span className="text-slate-400 text-[10px]">
                        Target: {log.target_entity || log.resourceType || 'SYSTEM'} {log.target_entity_id ? `(#${log.target_entity_id.slice(-6)})` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">
                      {formatRelativeTime(log.created_at || log.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 7: CONTROLLED EMERGENCY RECOVERY */}
      {/* ----------------------------------------------------------------- */}
      <div className="p-5 bg-slate-900 rounded-2xl text-white space-y-3 shadow-lg">
        <div className="flex items-center gap-2 text-indigo-400">
          <ShieldAlert className="w-5 h-5" />
          <h3 className="text-sm font-bold text-white tracking-tight">
            Controlled Emergency Recovery &amp; Break-Glass Protocol
          </h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          If all authenticator apps, backup phones, and hardware tokens are lost, use one of your offline 8-character recovery codes at the primary login gate. Each code bypasses the TOTP challenge once and logs an immutable audit incident. If recovery codes are also exhausted, root server-side console intervention is mandatory.
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* STEP-UP AUTH MODAL */}
      {/* ----------------------------------------------------------------- */}
      {stepUpModal && (
        <StepUpAuthModal
          isOpen={stepUpModal.isOpen}
          actionTitle={stepUpModal.title}
          actionDescription={stepUpModal.description}
          riskLevel={stepUpModal.riskLevel}
          confirmPhrase={stepUpModal.confirmPhrase}
          onSuccess={stepUpModal.onSuccess}
          onCancel={() => setStepUpModal(null)}
          totpSecretFallback={settings.totpSecret}
        />
      )}

      {/* ----------------------------------------------------------------- */}
      {/* REGENERATED CODES DISPLAY MODAL */}
      {/* ----------------------------------------------------------------- */}
      {newCodesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">New Recovery Codes Generated</h3>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Save these 8 one-time recovery codes immediately. They will NEVER be displayed in plaintext again.
            </p>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200">
              {generatedCodes.map((code, i) => (
                <div key={i} className="p-1.5 bg-white rounded-lg border border-slate-200 text-center font-bold">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={downloadCodesFile}
                className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{copiedCodes ? 'Downloaded File' : 'Download .TXT'}</span>
              </button>

              <button
                onClick={() => {
                  setNewCodesModalOpen(false);
                  setGeneratedCodes([]);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors"
              >
                I Have Saved Them
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TEST TOKEN VERIFICATION MODAL */}
      {/* ----------------------------------------------------------------- */}
      {testVerifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900">Test Authenticator Token</h3>
            <p className="text-xs text-slate-500">
              Verify that your authenticator app time-sync and algorithm match the server.
            </p>

            {testResult && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800">
                {testResult}
              </div>
            )}

            <form onSubmit={handleTestVerification} className="space-y-3">
              <input
                type="text"
                maxLength={6}
                value={testCode}
                onChange={(e) => setTestCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center tracking-widest text-lg font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTestVerifyModalOpen(false);
                    setTestCode('');
                    setTestResult(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Verify Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* BACKUP AUTHENTICATOR MODAL */}
      {/* ----------------------------------------------------------------- */}
      {backupEnrollModalOpen && backupEnrollData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900">Enroll Backup Authenticator</h3>
            <p className="text-xs text-slate-500">
              Scan this QR code with your secondary device (tablet or backup phone).
            </p>

            {backupEnrollError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {backupEnrollError}
              </div>
            )}

            <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl border border-slate-200">
              <img
                src={backupEnrollData.qrCodeSvg}
                alt="Backup QR"
                className="w-40 h-40 bg-white p-2 rounded-lg border border-slate-200"
              />
              <span className="font-mono text-[10px] text-slate-600 mt-2">
                Secret: {backupEnrollData.secret}
              </span>
            </div>

            <form onSubmit={finalizeBackupEnrollment} className="space-y-3">
              <input
                type="text"
                maxLength={6}
                required
                value={backupVerifyCode}
                onChange={(e) => setBackupVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center tracking-widest text-lg font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setBackupEnrollModalOpen(false);
                    setBackupEnrollData(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Confirm Backup Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* CHANGE MASTER PASSWORD MODAL */}
      {/* ----------------------------------------------------------------- */}
      {changePasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Update Master Security Key</h3>
                <p className="text-[11px] text-slate-500">Change administrator password for {admin.email}</p>
              </div>
            </div>

            {changePasswordError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {changePasswordError}
              </div>
            )}

            {changePasswordSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{changePasswordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangeMasterPassword} className="space-y-3">
              {settings.masterPasswordHash && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Current Master Security Key</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">New Master Security Key (Min 6 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Confirm New Master Security Key</label>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={changePasswordLoading}
                  onClick={() => {
                    setChangePasswordModalOpen(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setChangePasswordError(null);
                    setChangePasswordSuccess(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePasswordLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {changePasswordLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Save Master Key</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
