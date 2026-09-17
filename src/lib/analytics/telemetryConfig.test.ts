import { describe, it, expect } from 'vitest';
import {
  isPostHogConfigured,
  isCrashlyticsConfigured,
  getPostHogDashboardUrl,
  getPostHogEventsUrl,
  getPostHogSessionReplaysUrl,
  getPostHogInsightsUrl,
  getFirebaseCrashlyticsUrl,
  TRACKED_EVENT_TAXONOMIES,
  POSTHOG_PROJECT_ID,
} from './telemetryConfig';

describe('Telemetry Config & Deep Link Engine', () => {
  it('identifies valid PostHog configuration when phc_ key is provided', () => {
    // Current environment has phc_ key set
    expect(isPostHogConfigured()).toBe(true);
  });

  it('checks crashlytics configuration status', () => {
    expect(typeof isCrashlyticsConfigured()).toBe('boolean');
  });

  it('generates proper PostHog dashboard link including project id', () => {
    const dashboardUrl = getPostHogDashboardUrl();
    expect(dashboardUrl).toContain('https://us.posthog.com/project/');
    expect(dashboardUrl).toContain(POSTHOG_PROJECT_ID);
    expect(dashboardUrl).toContain('/dashboard');
  });

  it('generates proper PostHog session replay URL', () => {
    const replayUrl = getPostHogSessionReplaysUrl();
    expect(replayUrl).toContain('https://us.posthog.com/project/');
    expect(replayUrl).toContain('/replay');
  });

  it('generates proper PostHog insights URL', () => {
    const insightsUrl = getPostHogInsightsUrl();
    expect(insightsUrl).toContain('https://us.posthog.com/project/');
    expect(insightsUrl).toContain('/insights');
  });

  it('generates proper PostHog events URL with optional event filter', () => {
    const eventsUrl = getPostHogEventsUrl();
    expect(eventsUrl).toContain('https://us.posthog.com/project/');
    expect(eventsUrl).toContain('/events');

    const filteredUrl = getPostHogEventsUrl('room_created');
    expect(filteredUrl).toContain('event=room_created');
  });

  it('generates fallback Firebase console URL if no project id set', () => {
    const fbUrl = getFirebaseCrashlyticsUrl();
    expect(fbUrl).toMatch(/https:\/\/console\.firebase\.google\.com\//);
  });

  it('exposes all core RoomMate event taxonomies', () => {
    expect(TRACKED_EVENT_TAXONOMIES.length).toBe(5);
    const categoryIds = TRACKED_EVENT_TAXONOMIES.map((t) => t.id);
    expect(categoryIds).toEqual(['auth', 'rooms', 'expenses', 'settlements', 'payments']);
  });
});
