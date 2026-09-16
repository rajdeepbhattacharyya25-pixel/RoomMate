import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CapacitorUpdater, type BundleInfo } from '@capgo/capacitor-updater';
import { supabase } from '../lib/supabase/client';
import { BUILD_INFO } from '../config/buildInfo';

export interface AppRelease {
  id: string;
  app_name?: string;
  version: string;
  channel: 'staging' | 'production';
  bundle_url: string;
  checksum: string;
  changelog?: string | null;
  min_native_version: string;
  is_active: boolean;
  build_time?: string | null;
  published_at?: string | null;
}

export interface UpdateState {
  checking: boolean;
  updateAvailable: boolean;
  updateReady: boolean;
  downloading: boolean;
  error: string | null;
  release: AppRelease | null;
  currentBundleId: string;
  activeBundleVersion: string;
  nativeVersion: string;
  channel: 'staging' | 'production';
  lastCheckedAt: string | null;
}

type UpdateListener = (state: UpdateState) => void;

/**
 * Compare two semver strings (e.g. "1.0.2" >= "1.0.0").
 * Returns true if current >= required.
 */
export function isVersionSufficient(current: string, required: string): boolean {
  if (!current || !required) return true;
  const cParts = current.split('.').map(p => parseInt(p, 10) || 0);
  const rParts = required.split('.').map(p => parseInt(p, 10) || 0);
  
  for (let i = 0; i < Math.max(cParts.length, rParts.length); i++) {
    const c = cParts[i] || 0;
    const r = rParts[i] || 0;
    if (c > r) return true;
    if (c < r) return false;
  }
  return true;
}

class LiveUpdateService {
  private state: UpdateState = {
    checking: false,
    updateAvailable: false,
    updateReady: false,
    downloading: false,
    error: null,
    release: null,
    currentBundleId: 'builtin',
    activeBundleVersion: BUILD_INFO.version,
    nativeVersion: BUILD_INFO.version,
    channel: (BUILD_INFO.channel || 'staging') as 'staging' | 'production',
    lastCheckedAt: null,
  };

  private listeners: Set<UpdateListener> = new Set();
  private initialized = false;

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  /**
   * Initializes the updater service and signals native layer that React mounted cleanly.
   * If notifyAppReady is not called within 10s of a new bundle starting,
   * CapacitorUpdater rolls back to the previous bundle.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      // 1. Notify that app booted cleanly (prevents crash rollback)
      await CapacitorUpdater.notifyAppReady();

      // 2. Fetch current active bundle & native version
      const [currentRes, appInfo] = await Promise.all([
        CapacitorUpdater.current().catch(() => null),
        App.getInfo().catch(() => ({ version: BUILD_INFO.version })),
      ]);

      const rawBundleVersion = currentRes?.bundle?.version;
      this.state.currentBundleId = currentRes?.bundle?.id || 'builtin';
      this.state.activeBundleVersion = (rawBundleVersion && rawBundleVersion !== 'builtin') 
        ? rawBundleVersion 
        : BUILD_INFO.version;
      this.state.nativeVersion = appInfo.version || BUILD_INFO.version;
      this.notify();

      // 3. Listen for app resume events to check for updates silently
      App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          this.checkForUpdate({ silent: true }).catch(console.error);
        }
      });
    } catch (err) {
      console.warn('[Updater] Init warning:', err);
    }
  }

  /**
   * Checks Supabase for the latest active release on this APK's channel.
   * Downloads in background and prepares it for next restart.
   */
  public async checkForUpdate(options: { silent?: boolean } = {}): Promise<boolean> {
    if (this.state.checking || this.state.downloading) return false;

    if (!Capacitor.isNativePlatform()) {
      if (!options.silent) {
        console.log('[Updater] Live updates are only active on physical Android/iOS devices.');
      }
      this.state.lastCheckedAt = new Date().toISOString();
      this.notify();
      return false;
    }

    this.state.checking = true;
    this.state.error = null;
    this.notify();

    try {
      // 1. Query Supabase for the latest active version strictly on this build's channel
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('channel', this.state.channel)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      this.state.lastCheckedAt = new Date().toISOString();

      if (error) {
        throw new Error(`Failed to check update: ${error.message}`);
      }

      if (!data) {
        // No active release for this channel
        this.state.checking = false;
        this.notify();
        return false;
      }

      const release = data as AppRelease;

      // 2. Native compatibility guard (min_native_version)
      const appInfo = await App.getInfo().catch(() => ({ version: BUILD_INFO.version }));
      const currentNative = appInfo.version || BUILD_INFO.version;
      this.state.nativeVersion = currentNative;

      if (!isVersionSufficient(currentNative, release.min_native_version)) {
        console.warn(
          `[Updater] OTA release ${release.version} requires native APK >= ${release.min_native_version}, current is ${currentNative}. Skipping OTA.`
        );
        this.state.checking = false;
        this.notify();
        return false;
      }

      // 3. Check if current installed bundle already matches this version
      const current = await CapacitorUpdater.current().catch(() => null);
      const activeVersion = current?.bundle?.version || current?.bundle?.id || 'builtin';

      const isAlreadyCurrent = 
        activeVersion === release.version || 
        (activeVersion === 'builtin' && BUILD_INFO.version === release.version);

      if (isAlreadyCurrent) {
        // Already on this version - no redundant download
        this.state.checking = false;
        this.state.updateAvailable = false;
        this.notify();
        return false;
      }

      // 4. A new update is available!
      this.state.updateAvailable = true;
      this.state.release = release;
      this.state.checking = false;
      this.state.downloading = true;
      this.notify();

      // 5. Download bundle with SHA-256 checksum verification
      console.log(`[Updater] Downloading OTA bundle ${release.version} (channel: ${release.channel})...`);
      const bundle: BundleInfo = await CapacitorUpdater.download({
        url: release.bundle_url,
        version: release.version,
        checksum: release.checksum,
      });

      // 6. Stage update for the next safe launch (non-disruptive)
      await CapacitorUpdater.next({ id: bundle.id });

      this.state.downloading = false;
      this.state.updateReady = true;
      this.notify();
      console.log(`[Updater] Bundle ${release.version} downloaded & staged for next restart.`);
      return true;
    } catch (err: any) {
      console.error('[Updater] Error checking/downloading update:', err);
      this.state.checking = false;
      this.state.downloading = false;
      this.state.error = err?.message || 'Failed to download update';
      this.notify();
      return false;
    }
  }

  /**
   * Applies the staged update immediately and reloads the webview.
   * Can be triggered when user taps "Restart Now" on the notification toast.
   */
  public async applyUpdateAndRestart(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await CapacitorUpdater.reload();
    } catch (err) {
      console.error('[Updater] Failed to reload:', err);
    }
  }

  /**
   * Resets the active bundle back to the native built-in APK bundle and reloads.
   */
  public async resetToBuiltin(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await CapacitorUpdater.reset();
      await CapacitorUpdater.reload();
    } catch (err) {
      console.error('[Updater] Failed to reset to builtin bundle:', err);
    }
  }

  public getState(): UpdateState {
    return { ...this.state };
  }
}

export const liveUpdater = new LiveUpdateService();
