/**
 * Centralized Telemetry & Diagnostics Configuration
 * Manages links, connection status, and event taxonomies for PostHog & Firebase Crashlytics.
 */

export interface EventTaxonomyGroup {
  id: string;
  title: string;
  description: string;
  events: string[];
  color: string;
}

export const POSTHOG_PROJECT_ID =
  import.meta.env.VITE_POSTHOG_PROJECT_ID || '322219';

export const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

export const POSTHOG_KEY =
  import.meta.env.VITE_POSTHOG_KEY || '';

export const FIREBASE_PROJECT_ID =
  import.meta.env.VITE_FIREBASE_PROJECT_ID || '';

export const POSTHOG_EMBED_DASHBOARD_URL =
  import.meta.env.VITE_POSTHOG_EMBED_DASHBOARD_URL || '';

/**
 * Returns whether PostHog analytics is active with a real key
 */
export function isPostHogConfigured(): boolean {
  return Boolean(
    POSTHOG_KEY &&
    POSTHOG_KEY !== 'your-posthog-api-key' &&
    POSTHOG_KEY.startsWith('phc_')
  );
}

/**
 * Returns whether Firebase / Crashlytics project is configured
 */
export function isCrashlyticsConfigured(): boolean {
  return Boolean(
    FIREBASE_PROJECT_ID &&
    FIREBASE_PROJECT_ID !== 'your-project-id'
  );
}

/**
 * Generate PostHog base cloud web console URL
 */
function getPostHogBaseWebUrl(): string {
  // PostHog US cloud dashboard is hosted at us.posthog.com (distinct from ingestion host us.i.posthog.com)
  if (POSTHOG_HOST.includes('eu.')) {
    return 'https://eu.posthog.com';
  }
  return 'https://us.posthog.com';
}

/**
 * Deep-link to PostHog Main Dashboard or Project Overview
 */
export function getPostHogDashboardUrl(): string {
  const base = getPostHogBaseWebUrl();
  return POSTHOG_PROJECT_ID
    ? `${base}/project/${POSTHOG_PROJECT_ID}/dashboard`
    : `${base}/dashboard`;
}

/**
 * Deep-link to PostHog Live Events Stream
 */
export function getPostHogEventsUrl(filterEvent?: string): string {
  const base = getPostHogBaseWebUrl();
  const url = POSTHOG_PROJECT_ID
    ? `${base}/project/${POSTHOG_PROJECT_ID}/events`
    : `${base}/events`;

  if (filterEvent) {
    return `${url}?event=${encodeURIComponent(filterEvent)}`;
  }
  return url;
}

/**
 * Deep-link to PostHog Session Recordings / Replays
 */
export function getPostHogSessionReplaysUrl(): string {
  const base = getPostHogBaseWebUrl();
  return POSTHOG_PROJECT_ID
    ? `${base}/project/${POSTHOG_PROJECT_ID}/replay`
    : `${base}/replay`;
}

/**
 * Deep-link to PostHog Product Insights & Funnels
 */
export function getPostHogInsightsUrl(): string {
  const base = getPostHogBaseWebUrl();
  return POSTHOG_PROJECT_ID
    ? `${base}/project/${POSTHOG_PROJECT_ID}/insights`
    : `${base}/insights`;
}

/**
 * Deep-link to Firebase Crashlytics Console
 */
export function getFirebaseCrashlyticsUrl(): string {
  if (FIREBASE_PROJECT_ID) {
    return `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/crashlytics`;
  }
  return 'https://console.firebase.google.com/';
}

/**
 * Structured taxonomy groups tracked across RoomMate mobile and web clients
 */
export const TRACKED_EVENT_TAXONOMIES: EventTaxonomyGroup[] = [
  {
    id: 'auth',
    title: 'Authentication & Lifecycle',
    description: 'Student onboarding, authentication method, and session lifecycles',
    events: ['signup_started', 'signup_completed', 'login_completed', 'logout_completed'],
    color: 'indigo',
  },
  {
    id: 'rooms',
    title: 'Flatmate Rooms & Clusters',
    description: 'Shared flat creations, join-code entries, and member invitations',
    events: ['room_creation_started', 'room_created', 'room_join_started', 'room_joined', 'room_invitation_sent'],
    color: 'purple',
  },
  {
    id: 'expenses',
    title: 'Expense Ledger Activity',
    description: 'Personal and collective bill records, edits, and deletions',
    events: ['personal_expense_created', 'shared_expense_created', 'expense_updated', 'expense_deleted'],
    color: 'blue',
  },
  {
    id: 'settlements',
    title: 'Settlements & Debt Clearances',
    description: 'IOU resolution starts, bill balancing, and payment confirmations',
    events: ['settlement_started', 'settlement_recorded', 'settlement_completed'],
    color: 'emerald',
  },
  {
    id: 'payments',
    title: 'UPI Deep-Link Intents',
    description: 'Direct VPA payments, QR scans, and app-switch completion rates',
    events: ['payment_flow_started', 'payment_flow_completed', 'payment_flow_failed'],
    color: 'amber',
  },
];
