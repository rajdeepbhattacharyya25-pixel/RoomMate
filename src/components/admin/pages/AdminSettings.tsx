import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  CheckCircle2,
  Flame,
  Home,
  CreditCard,
  Lock,
} from 'lucide-react';
import { PlatformSettings, SplitMethod, JoinPolicy, InvitePolicy } from '../../../types';
import { ConfirmationDialog } from '../common/ConfirmationDialog';

interface AdminSettingsProps {
  settings: PlatformSettings;
  onUpdateSettings: (newSettings: Partial<PlatformSettings>) => Promise<void> | void;
  onPurgeDemoData?: () => Promise<void> | void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  settings,
  onUpdateSettings,
  onPurgeDemoData,
}) => {
  const [form, setForm] = useState<PlatformSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);

  const handleChange = (key: keyof PlatformSettings, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateSettings(form);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Configuration</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              SuperAdmin Controls
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Global room limits, financial controls, notification policies, and emergency maintenance toggle.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-2 self-start transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving Changes...' : 'Save Configuration'}</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Platform configuration updated successfully. Applied to all connected clients.</span>
        </div>
      )}

      {/* Main Settings Sections */}
      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Section 1: General Info */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <SettingsIcon className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">General Application Info</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                App Display Name
              </label>
              <input
                type="text"
                value={form.appName}
                onChange={(e) => handleChange('appName', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Base Currency Code
              </label>
              <input
                type="text"
                value={form.currencyCode}
                onChange={(e) => handleChange('currencyCode', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Official Support Email
              </label>
              <input
                type="email"
                value={form.supportEmail}
                onChange={(e) => handleChange('supportEmail', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Helpline Phone
              </label>
              <input
                type="text"
                value={form.supportPhone}
                onChange={(e) => handleChange('supportPhone', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Room & Flatmate Limits */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Home className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">Room & Flatmate Limits</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Max Members Per Shared Room
              </label>
              <input
                type="number"
                value={form.maxRoomMembers}
                onChange={(e) => handleChange('maxRoomMembers', Number(e.target.value))}
                min={2}
                max={50}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Maximum capacity of student roommates per flat
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Invite QR Expiration (Hours)
              </label>
              <input
                type="number"
                value={form.qrExpirationHours}
                onChange={(e) => handleChange('qrExpirationHours', Number(e.target.value))}
                min={1}
                max={168}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Duration before room join QR codes automatically expire
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Default Room Join Policy
              </label>
              <select
                value={form.defaultJoinPolicy}
                onChange={(e) => handleChange('defaultJoinPolicy', e.target.value as JoinPolicy)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="APPROVAL_REQUIRED">Approval Required (Admin confirms)</option>
                <option value="OPEN">Open (Anyone with link joins directly)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Default Invitation Rights
              </label>
              <select
                value={form.defaultInvitePolicy}
                onChange={(e) => handleChange('defaultInvitePolicy', e.target.value as InvitePolicy)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="ALL_MEMBERS">All Roommates Can Invite</option>
                <option value="ADMIN_ONLY">Room Admin Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Financial & Expense Limits */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Financial & Expense Rules</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Max Single Shared Bill Limit (INR)
              </label>
              <input
                type="number"
                value={form.maxExpenseAmount}
                onChange={(e) => handleChange('maxExpenseAmount', Number(e.target.value))}
                step={5000}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Threshold preventing accidental fat-finger high entries (e.g. ₹2,00,000)
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Default Split Method
              </label>
              <select
                value={form.defaultSplitMethod}
                onChange={(e) => handleChange('defaultSplitMethod', e.target.value as SplitMethod)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="EQUAL">Equal Split Among Selected</option>
                <option value="CUSTOM_AMOUNT">Exact Specific Amounts</option>
                <option value="PERCENTAGE">Percentage (%)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Security & Authentication */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Lock className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-900">Security & Authentication Parameters</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <div>
                <span className="font-bold text-slate-800 block">Google OAuth Provider</span>
                <span className="text-[11px] text-slate-400">Allow students to sign in with Google</span>
              </div>
              <input
                type="checkbox"
                checked={form.googleAuthEnabled}
                onChange={(e) => handleChange('googleAuthEnabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <div>
                <span className="font-bold text-slate-800 block">Email Verification</span>
                <span className="text-[11px] text-slate-400">Enforce verified email before joining rooms</span>
              </div>
              <input
                type="checkbox"
                checked={form.emailVerificationRequired}
                onChange={(e) => handleChange('emailVerificationRequired', e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Client Session Lifetime (Minutes)
              </label>
              <input
                type="number"
                value={form.sessionTimeoutMinutes}
                onChange={(e) => handleChange('sessionTimeoutMinutes', Number(e.target.value))}
                min={60}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Danger Zone */}
        <div className="p-6 rounded-2xl border-2 border-rose-200 bg-rose-50/30 space-y-5">
          <div className="flex items-center gap-2 border-b border-rose-200 pb-3">
            <Flame className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-black text-rose-900 uppercase tracking-wider">
              Emergency Danger Zone
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-rose-200 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">Platform Maintenance Mode</span>
                {form.maintenanceMode && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Immediately locks student mobile apps in maintenance splash mode while SuperAdmin retains console access.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMaintenanceModalOpen(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                form.maintenanceMode
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {form.maintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
            </button>
          </div>

          {onPurgeDemoData && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-rose-200 shadow-sm">
              <div>
                <span className="font-bold text-slate-900 text-xs">Reset Staging Test Data</span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Restores default staging rooms, student profiles, and mock seed ledger.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPurgeModalOpen(true)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-rose-700 font-bold rounded-xl text-xs border border-rose-200"
              >
                Reset Staging Seeds
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Maintenance Mode Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={isMaintenanceModalOpen}
        title={form.maintenanceMode ? 'Disable Maintenance Mode?' : 'Activate Platform-Wide Maintenance?'}
        message={
          form.maintenanceMode
            ? 'This will immediately restore access to the mobile app for all student roommates.'
            : 'CRITICAL: Student mobile clients will be blocked with the maintenance splash screen. Only SuperAdmin will be able to perform operations.'
        }
        confirmText={form.maintenanceMode ? 'Restore Mobile Access' : 'Turn On Maintenance'}
        confirmVariant={form.maintenanceMode ? 'warning' : 'danger'}
        requireReason={!form.maintenanceMode}
        onCancel={() => setIsMaintenanceModalOpen(false)}
        onConfirm={async (_reason) => {
          const nextState = !form.maintenanceMode;
          handleChange('maintenanceMode', nextState);
          await onUpdateSettings({ maintenanceMode: nextState });
          setIsMaintenanceModalOpen(false);
        }}
      />

      {/* Staging Data Reset Dialog */}
      {onPurgeDemoData && (
        <ConfirmationDialog
          isOpen={isPurgeModalOpen}
          title="Reset Staging Seed Data?"
          message="This will reload the initial demo flats, test roommate balances, and mock expenses in local storage. Cannot be undone."
          confirmText="Yes, Reset Data"
          confirmVariant="danger"
          requireReason={true}
          onCancel={() => setIsPurgeModalOpen(false)}
          onConfirm={async () => {
            await onPurgeDemoData();
            setIsPurgeModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
