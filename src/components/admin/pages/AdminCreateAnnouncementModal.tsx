import React, { useState } from 'react';
import {
  X,
  Megaphone,
  Bell,
  Mail,
  Send,
  Users,
  Home,
  Globe,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import {
  PlatformAnnouncement,
  AnnouncementAudience,
  AnnouncementPriority,
  AnnouncementDelivery,
  User,
  Room,
} from '../../../types';

interface AdminCreateAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  allUsers: User[];
  rooms: Room[];
  onCreateAnnouncement: (
    announcement: Omit<PlatformAnnouncement, 'id' | 'sentAt' | 'recipientsCount' | 'status'>
  ) => Promise<void> | void;
}

export const AdminCreateAnnouncementModal: React.FC<AdminCreateAnnouncementModalProps> = ({
  isOpen,
  onClose,
  allUsers,
  rooms,
  onCreateAnnouncement,
}) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('EVERYONE');
  const [priority, setPriority] = useState<AnnouncementPriority>('NORMAL');
  const [deliveryChannels, setDeliveryChannels] = useState<AnnouncementDelivery[]>(['IN_APP']);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Compute recipient estimate
  const estimatedRecipients =
    audience === 'EVERYONE'
      ? allUsers.length
      : audience === 'SELECTED_USERS'
      ? selectedUserIds.length
      : selectedRoomIds.length * 3; // rough estimation

  const toggleChannel = (channel: AnnouncementDelivery) => {
    if (deliveryChannels.includes(channel)) {
      if (deliveryChannels.length === 1) return; // Keep at least one
      setDeliveryChannels(deliveryChannels.filter((c) => c !== channel));
    } else {
      setDeliveryChannels([...deliveryChannels, channel]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Announcement title is required.');
      return;
    }
    if (!message.trim()) {
      setError('Message body cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreateAnnouncement({
        title: title.trim(),
        message: message.trim(),
        audience,
        targetUserIds: audience === 'SELECTED_USERS' ? selectedUserIds : undefined,
        targetRoomIds: audience === 'SELECTED_ROOMS' ? selectedRoomIds : undefined,
        priority,
        deliveryChannels,
        createdBy: 'SuperAdmin',
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch broadcast');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Broadcast Announcement</h2>
              <p className="text-xs text-slate-500">
                Dispatch platform-wide alerts, maintenance notices, or updates to student flatmates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title Input */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Announcement Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Scheduled UPI System Maintenance tonight at 2 AM"
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          {/* Message Input */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Message Body *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Provide clear details, expected downtime or instructions for students..."
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-slate-400"
              required
            />
          </div>

          {/* Audience & Priority Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Audience */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Target Audience
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAudience('EVERYONE')}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    audience === 'EVERYONE'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span className="text-[11px]">Everyone</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAudience('SELECTED_USERS')}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    audience === 'SELECTED_USERS'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-[11px]">Users</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAudience('SELECTED_ROOMS')}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    audience === 'SELECTED_ROOMS'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <span className="text-[11px]">Rooms</span>
                </button>
              </div>
            </div>

            {/* Target Selectors */}
            {audience === 'SELECTED_USERS' && (
              <div className="col-span-1 sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Select Specific Students ({selectedUserIds.length} chosen)
                </span>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {allUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedUserIds([...selectedUserIds, u.id]);
                          else setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-800">{u.name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">({u.email})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {audience === 'SELECTED_ROOMS' && (
              <div className="col-span-1 sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Select Specific Rooms ({selectedRoomIds.length} chosen)
                </span>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {rooms.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRoomIds.includes(r.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedRoomIds([...selectedRoomIds, r.id]);
                          else setSelectedRoomIds(selectedRoomIds.filter((id) => id !== r.id));
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-800">{r.name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">(#{r.id.slice(-6)})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Priority */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Priority Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPriority('NORMAL')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    priority === 'NORMAL'
                      ? 'border-slate-700 bg-slate-100 text-slate-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="text-[11px] block">Normal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPriority('IMPORTANT')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    priority === 'IMPORTANT'
                      ? 'border-amber-500 bg-amber-50 text-amber-800 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="text-[11px] block">Important</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPriority('CRITICAL')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    priority === 'CRITICAL'
                      ? 'border-rose-600 bg-rose-50 text-rose-800 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="text-[11px] block">Critical</span>
                </button>
              </div>
            </div>
          </div>

          {/* Delivery Channels */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Delivery Channels
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={deliveryChannels.includes('IN_APP')}
                  onChange={() => toggleChannel('IN_APP')}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <Bell className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-800">In-App Notification</span>
              </label>

              <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={deliveryChannels.includes('PUSH')}
                  onChange={() => toggleChannel('PUSH')}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <Send className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-800">Push Notification</span>
              </label>

              <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={deliveryChannels.includes('EMAIL')}
                  onChange={() => toggleChannel('EMAIL')}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <Mail className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-slate-800">Email Broadcast</span>
              </label>
            </div>
          </div>

          {/* Estimated reach & preview */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-600" /> Mobile Notification Preview
              </span>
              <span className="font-mono text-slate-500 font-semibold">
                Est. ~{estimatedRecipients} students
              </span>
            </div>

            {/* Mobile notification preview card */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-sm flex items-start gap-3">
              <div className="relative shrink-0">
                <img
                  src="/logo.png"
                  alt="RoomMate"
                  className="w-8 h-8 rounded-lg object-contain shadow-xs"
                />
                <div
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold ring-1 ring-white ${
                    priority === 'CRITICAL'
                      ? 'bg-rose-600'
                      : priority === 'IMPORTANT'
                      ? 'bg-amber-500'
                      : 'bg-indigo-600'
                  }`}
                >
                  <Megaphone className="w-2.5 h-2.5" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-slate-900 truncate text-xs">
                      {title || 'Scheduled System Notice'}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">&bull; RoomMate</span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">now</span>
                </div>
                <p className="text-slate-600 text-[11px] mt-0.5 line-clamp-2">
                  {message || 'Announcement message preview will appear here...'}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {isSubmitting ? 'Dispatching...' : `Broadcast to ${estimatedRecipients} Recipients`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
