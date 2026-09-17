import { describe, it, expect } from 'vitest';
import {
  matchesUserOmniSearch,
  filterAndSortUsers,
  SortPreset,
  StatusFilter,
  RoleFilter,
  RoomFilter,
  PhoneFilter,
} from './adminUsersFilters';
import { User, Room, RoomMember } from '../../../types';

describe('SuperAdmin Users Management: Omni-Search & Filter Suite', () => {
  const mockUsers: User[] = [
    {
      id: 'usr-admin-001',
      name: 'Super Admin User',
      email: 'admin@roommate.app',
      phone: '+91 99999 00000',
      upiId: 'admin@okaxis',
      role: 'SUPER_ADMIN',
      isSuspended: false,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'usr-student-002',
      name: 'Rajdeep Bhattacharyya',
      email: 'rajdeep@gmail.com',
      phone: '+91 80135 34817',
      upiId: 'rajdeep@oksbi',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-09-10T12:00:00.000Z',
      updatedAt: '2026-09-15T12:00:00.000Z',
    },
    {
      id: 'usr-student-003',
      name: 'Jyotirmay Bhattacharya',
      email: 'jyotirmay@gmail.com',
      phone: undefined, // Missing phone
      upiId: undefined,
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-09-14T08:00:00.000Z',
      updatedAt: '2026-09-14T08:00:00.000Z',
    },
    {
      id: 'usr-student-004',
      name: 'Amit Suspended',
      email: 'amit@susp.com',
      phone: '+91 98765 43210',
      role: 'STUDENT',
      isSuspended: true, // Suspended
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
  ];

  const mockRooms: Room[] = [
    {
      id: 'room-fl-101',
      name: 'Flat 101 Lake View',
      createdBy: 'usr-student-002',
      isArchived: false,
      createdAt: '2026-09-10T12:30:00.000Z',
      updatedAt: '2026-09-10T12:30:00.000Z',
    },
    {
      id: 'room-fl-202',
      name: 'Hostel Block B-4',
      createdBy: 'usr-admin-001',
      isArchived: false,
      createdAt: '2026-09-02T12:30:00.000Z',
      updatedAt: '2026-09-02T12:30:00.000Z',
    },
  ];

  const mockRoomMembers: RoomMember[] = [
    {
      id: 'mem-1',
      roomId: 'room-fl-101',
      userId: 'usr-student-002',
      status: 'ACTIVE',
      joinedAt: '2026-09-10T12:35:00.000Z',
      role: 'ROOM_ADMIN',
    },
    {
      id: 'mem-2',
      roomId: 'room-fl-202',
      userId: 'usr-student-002',
      status: 'ACTIVE',
      joinedAt: '2026-09-11T12:35:00.000Z',
      role: 'MEMBER',
    },
    {
      id: 'mem-3',
      roomId: 'room-fl-202',
      userId: 'usr-admin-001',
      status: 'ACTIVE',
      joinedAt: '2026-09-02T12:35:00.000Z',
      role: 'ROOM_ADMIN',
    },
    // usr-student-003 and usr-student-004 have 0 rooms (unassigned)
  ];

  describe('1. Omni-Search Matching', () => {
    it('matches by resident name case-insensitively', () => {
      const match = matchesUserOmniSearch(mockUsers[1], 'rajdeep', mockRooms, mockRoomMembers);
      expect(match).toBe(true);

      const noMatch = matchesUserOmniSearch(mockUsers[0], 'rajdeep', mockRooms, mockRoomMembers);
      expect(noMatch).toBe(false);
    });

    it('matches by email address', () => {
      const match = matchesUserOmniSearch(mockUsers[0], 'admin@roommate.app', mockRooms, mockRoomMembers);
      expect(match).toBe(true);
    });

    it('matches by formatted phone number', () => {
      const match = matchesUserOmniSearch(mockUsers[1], '+91 80135', mockRooms, mockRoomMembers);
      expect(match).toBe(true);
    });

    it('matches by raw numeric digits without spaces or country code', () => {
      // Query "8013534817" or partial "80135"
      const matchFull = matchesUserOmniSearch(mockUsers[1], '8013534817', mockRooms, mockRoomMembers);
      expect(matchFull).toBe(true);

      const matchPartial = matchesUserOmniSearch(mockUsers[1], '80135', mockRooms, mockRoomMembers);
      expect(matchPartial).toBe(true);
    });

    it('matches by Supabase User UUID / ID', () => {
      const match = matchesUserOmniSearch(mockUsers[2], 'usr-student-003', mockRooms, mockRoomMembers);
      expect(match).toBe(true);
    });

    it('matches by UPI ID', () => {
      const match = matchesUserOmniSearch(mockUsers[0], 'admin@okaxis', mockRooms, mockRoomMembers);
      expect(match).toBe(true);
    });

    it('matches by assigned Room Name', () => {
      // usr-student-002 is in "Flat 101 Lake View"
      const match = matchesUserOmniSearch(mockUsers[1], 'Lake View', mockRooms, mockRoomMembers);
      expect(match).toBe(true);

      // usr-student-003 is NOT in Lake View
      const noMatch = matchesUserOmniSearch(mockUsers[2], 'Lake View', mockRooms, mockRoomMembers);
      expect(noMatch).toBe(false);
    });

    it('matches by Role name', () => {
      const match = matchesUserOmniSearch(mockUsers[0], 'superadmin', mockRooms, mockRoomMembers);
      expect(match).toBe(true);
    });
  });

  describe('2. Sorting Presets', () => {
    const baseOptions = {
      users: mockUsers,
      rooms: mockRooms,
      roomMembers: mockRoomMembers,
      statusFilter: 'all' as StatusFilter,
      roleFilter: 'all' as RoleFilter,
      roomFilter: 'all' as RoomFilter,
      phoneFilter: 'all' as PhoneFilter,
    };

    it('sorts by newest registered first', () => {
      const sorted = filterAndSortUsers({ ...baseOptions, sortPreset: 'newest' });
      // usr-student-003 was created on Sept 14 (most recent)
      expect(sorted[0].id).toBe('usr-student-003');
      // usr-student-004 was created on Aug 20 (oldest)
      expect(sorted[sorted.length - 1].id).toBe('usr-student-004');
    });

    it('sorts by oldest registered first', () => {
      const sorted = filterAndSortUsers({ ...baseOptions, sortPreset: 'oldest' });
      expect(sorted[0].id).toBe('usr-student-004'); // Aug 20
      expect(sorted[sorted.length - 1].id).toBe('usr-student-003'); // Sept 14
    });

    it('sorts alphabetically A to Z by resident name', () => {
      const sorted = filterAndSortUsers({ ...baseOptions, sortPreset: 'name_asc' });
      expect(sorted[0].name).toBe('Amit Suspended');
      expect(sorted[1].name).toBe('Jyotirmay Bhattacharya');
      expect(sorted[2].name).toBe('Rajdeep Bhattacharyya');
      expect(sorted[3].name).toBe('Super Admin User');
    });

    it('sorts alphabetically Z to A by resident name', () => {
      const sorted = filterAndSortUsers({ ...baseOptions, sortPreset: 'name_desc' });
      expect(sorted[0].name).toBe('Super Admin User');
      expect(sorted[sorted.length - 1].name).toBe('Amit Suspended');
    });

    it('sorts by highest room membership count first', () => {
      const sorted = filterAndSortUsers({ ...baseOptions, sortPreset: 'rooms_desc' });
      // usr-student-002 has 2 rooms
      expect(sorted[0].id).toBe('usr-student-002');
      // usr-admin-001 has 1 room
      expect(sorted[1].id).toBe('usr-admin-001');
      // unassigned users with 0 rooms come last
      expect(sorted[2].id).toBe('Amit Suspended' === sorted[2].name ? 'usr-student-004' : 'usr-student-003');
    });
  });

  describe('3. Administrative Filters', () => {
    const baseOptions = {
      users: mockUsers,
      rooms: mockRooms,
      roomMembers: mockRoomMembers,
      sortPreset: 'newest' as SortPreset,
    };

    it('filters active vs suspended users', () => {
      const active = filterAndSortUsers({
        ...baseOptions,
        statusFilter: 'active',
        roleFilter: 'all',
        roomFilter: 'all',
        phoneFilter: 'all',
      });
      expect(active.length).toBe(3);
      expect(active.every((u) => !u.isSuspended)).toBe(true);

      const suspended = filterAndSortUsers({
        ...baseOptions,
        statusFilter: 'suspended',
        roleFilter: 'all',
        roomFilter: 'all',
        phoneFilter: 'all',
      });
      expect(suspended.length).toBe(1);
      expect(suspended[0].id).toBe('usr-student-004');
    });

    it('filters unassigned users (0 rooms)', () => {
      const unassigned = filterAndSortUsers({
        ...baseOptions,
        statusFilter: 'all',
        roleFilter: 'all',
        roomFilter: 'unassigned',
        phoneFilter: 'all',
      });
      expect(unassigned.length).toBe(2);
      expect(unassigned.map((u) => u.id)).toContain('usr-student-003');
      expect(unassigned.map((u) => u.id)).toContain('usr-student-004');
    });

    it('filters residents with missing phone numbers', () => {
      const missingPhone = filterAndSortUsers({
        ...baseOptions,
        statusFilter: 'all',
        roleFilter: 'all',
        roomFilter: 'all',
        phoneFilter: 'missing_phone',
      });
      expect(missingPhone.length).toBe(1);
      expect(missingPhone[0].id).toBe('usr-student-003');
    });
  });
});
