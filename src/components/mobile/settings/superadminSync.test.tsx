import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { db } from '../../../lib/storage/mockStorage';
import { HelpSupportTab } from './tabs/HelpSupportTab';
import { AboutTab } from './tabs/AboutTab';
import { PlatformSettings, User } from '../../../types';

const mockStorageMap: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorageMap[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorageMap[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorageMap[key];
  },
  clear: () => {
    Object.keys(mockStorageMap).forEach((k) => delete mockStorageMap[k]);
  },
};

describe('SuperAdmin Changes Reflection in User Mobile App Test Suite', () => {
  const dummyUser: User = {
    id: 'usr-student-tester',
    name: 'Student Resident',
    email: 'student@campus.edu',
    role: 'STUDENT',
    isSuspended: false,
    onboardingCompleted: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const superAdminUser: User = {
    id: 'usr-superadmin-boss',
    name: 'Super Admin',
    email: 'admin@roommate.app',
    role: 'SUPER_ADMIN',
    isSuspended: false,
    onboardingCompleted: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {
        localStorage: mockLocalStorage,
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    }
    db.upsertUser(superAdminUser);
    db.upsertUser(dummyUser);
    db.updateSuperAdminSecuritySettings(superAdminUser.id, {
      currentAal: 'aal2',
      lastStepUpAt: new Date().toISOString(),
      lastStepUpLevel: 2,
    });
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    db.updateSuperAdminSecuritySettings(superAdminUser.id, {
      currentAal: 'aal2',
      lastStepUpAt: new Date().toISOString(),
      lastStepUpLevel: 2,
    });
  });

  it('renders default support email in HelpSupportTab when no override is present', () => {
    const html = renderToString(
      <HelpSupportTab currentUser={dummyUser} onShowToast={() => {}} />
    );

    expect(html).toContain('Direct Support Channels');
    expect(html).toContain('Developer &amp; Support Desk');
    // Default email from db.getPlatformSettings()
    const defaultEmail = db.getPlatformSettings().supportEmail || 'support@roommate.app';
    expect(html).toContain(defaultEmail);
  });

  it('dynamically reflects new support email and helpline phone in HelpSupportTab when SuperAdmin updates settings', () => {
    const customSettings: PlatformSettings = {
      ...db.getPlatformSettings(),
      supportEmail: 'custom-helpdesk@campusroom.in',
      supportPhone: '+91 80000 12345',
    };

    const html = renderToString(
      <HelpSupportTab
        currentUser={dummyUser}
        platformSettings={customSettings}
        onShowToast={() => {}}
      />
    );

    expect(html).toContain('custom-helpdesk@campusroom.in');
    expect(html).toContain('mailto:custom-helpdesk@campusroom.in');
    expect(html).toContain('Helpline Support Phone');
    expect(html).toContain('+91 80000 12345');
    expect(html).toContain('tel:+918000012345');
  });

  it('reflects custom App Name configured by SuperAdmin in AboutTab', () => {
    const customSettings: PlatformSettings = {
      ...db.getPlatformSettings(),
      appName: 'RoomMate Campus Edition',
    };

    const html = renderToString(
      <AboutTab
        currentUser={dummyUser}
        platformSettings={customSettings}
        onShowToast={() => {}}
      />
    );

    expect(html).toContain('RoomMate Campus Edition');
  });

  it('updates platform settings in db, dispatches event, and persists changes', () => {
    let eventFired = false;
    let eventDetail: any = null;

    const originalDispatch = (globalThis as any).window?.dispatchEvent;
    (globalThis as any).window.dispatchEvent = (event: any) => {
      if (event.type === 'roommate_platform_settings_updated') {
        eventFired = true;
        eventDetail = event.detail;
      }
      return true;
    };

    try {
      const updated = db.updatePlatformSettings(superAdminUser.id, {
        supportEmail: 'director.support@campus.edu',
        supportPhone: '+91 91111 22222',
        maxRoomMembers: 6,
      });

      expect(updated.supportEmail).toBe('director.support@campus.edu');
      expect(updated.supportPhone).toBe('+91 91111 22222');
      expect(updated.maxRoomMembers).toBe(6);

      const fromStorage = db.getPlatformSettings();
      expect(fromStorage.supportEmail).toBe('director.support@campus.edu');
      expect(fromStorage.supportPhone).toBe('+91 91111 22222');
      expect(fromStorage.maxRoomMembers).toBe(6);

      expect(eventFired).toBe(true);
      expect(eventDetail?.supportEmail).toBe('director.support@campus.edu');
    } finally {
      if (originalDispatch) {
        (globalThis as any).window.dispatchEvent = originalDispatch;
      }
    }
  });

  it('enforces maxRoomMembers configured by SuperAdmin during room join', () => {
    // Set max limit to 2
    db.updatePlatformSettings(superAdminUser.id, { maxRoomMembers: 2 });

    // Create room with 1 member
    const room = db.createRoom(superAdminUser.id, 'Small Room', 'Capacity test');
    const invite = db.getState().roomInvitations.find((i) => i.roomId === room.id && !i.isRevoked)!;

    // Join second member (now at limit = 2)
    const user2: User = {
      id: 'usr-member-2',
      name: 'Member Two',
      email: 'member2@campus.edu',
      role: 'STUDENT',
      isSuspended: false,
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.upsertUser(user2);
    db.joinRoomWithCode(user2.id, invite.inviteCode);

    // Attempt to join 3rd member (should be rejected because max is 2)
    const user3: User = {
      id: 'usr-member-3',
      name: 'Member Three',
      email: 'member3@campus.edu',
      role: 'STUDENT',
      isSuspended: false,
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.upsertUser(user3);

    expect(() => {
      db.joinRoomWithCode(user3.id, invite.inviteCode);
    }).toThrow('Room has reached maximum capacity of 2 roommates.');
  });
});
