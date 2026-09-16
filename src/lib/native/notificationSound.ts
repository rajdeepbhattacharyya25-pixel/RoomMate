/**
 * Notification Sound Service
 *
 * Plays the app's custom notification chime (public/sounds/notification.mp3).
 * Falls back to a Web Audio API synthesized tone if the file cannot load.
 * Toggle controlled via localStorage key: roommate_notification_sound_enabled
 */

// ─── Preload the MP3 once so first play is instant ───────────────────────────
const NOTIFICATION_SOUND_URL = '/sounds/notification.mp3';

let cachedAudio: HTMLAudioElement | null = null;
let audioLoadFailed = false;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (audioLoadFailed) return null;

  if (!cachedAudio) {
    try {
      cachedAudio = new Audio(NOTIFICATION_SOUND_URL);
      cachedAudio.preload = 'auto';
      cachedAudio.volume = 0.8;
      cachedAudio.addEventListener('error', () => {
        console.warn('[RoomMate] Notification sound file failed to load — using synthesized fallback.');
        audioLoadFailed = true;
        cachedAudio = null;
      });
    } catch {
      audioLoadFailed = true;
      return null;
    }
  }
  return cachedAudio;
}

// Eagerly preload on import (browser only)
if (typeof window !== 'undefined') {
  getAudio();
}

// ─── Web Audio fallback ───────────────────────────────────────────────────────
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!audioContext || audioContext.state === 'closed') {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playFallbackTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

function playSynthesizedChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playFallbackTone(ctx, 523.25, now, 0.12, 0.25);
    playFallbackTone(ctx, 659.25, now + 0.15, 0.12, 0.20);
  } catch {
    // Silently fail
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const PRIMARY_SOUND_KEY = 'roommate_notification_sound_enabled';
const LEGACY_SOUND_KEY = 'campusflow_notification_sound_enabled';

/**
 * Check if notification sound is enabled (default: true).
 */
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true;
  try {
    const stored =
      localStorage.getItem(PRIMARY_SOUND_KEY) ??
      localStorage.getItem(LEGACY_SOUND_KEY);
    if (stored === null || stored === undefined) return true;
    return stored !== 'false' && stored !== '0' && stored !== 'off' && stored !== 'disabled';
  } catch {
    return true;
  }
}

/**
 * Toggle notification sound on/off.
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const val = enabled.toString();
    localStorage.setItem(PRIMARY_SOUND_KEY, val);
    localStorage.setItem(LEGACY_SOUND_KEY, val);
    window.dispatchEvent(new CustomEvent('roommate_sound_changed', { detail: { enabled } }));
    window.dispatchEvent(new Event('roommate_settings_changed'));
    window.dispatchEvent(new Event('campusflow_settings_changed'));
  } catch (err) {
    console.warn('[RoomMate] Failed to save notification sound preference to localStorage:', err);
  }
}

/**
 * Play the RoomMate notification chime.
 * Uses the custom MP3 with a synthesized fallback.
 */
export function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;

  const audio = getAudio();
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {
      playSynthesizedChime();
    });
  } else {
    playSynthesizedChime();
  }
}

/**
 * Play a success/celebration chime (3-tone ascending C5-E5-G5).
 * Uses synthesized tones for a distinct feel from the notification chime.
 */
export function playSuccessSound(): void {
  if (!isNotificationSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    playFallbackTone(ctx, 523.25, now, 0.10, 0.20);
    playFallbackTone(ctx, 659.25, now + 0.12, 0.10, 0.18);
    playFallbackTone(ctx, 783.99, now + 0.24, 0.15, 0.15);
  } catch {
    // Silently fail
  }
}
