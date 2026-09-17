import { User, Room, RoomMember } from '../../../types';

export type SortPreset =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'rooms_desc'
  | 'rooms_asc';

export type StatusFilter = 'all' | 'active' | 'suspended';
export type RoleFilter = 'all' | 'STUDENT' | 'SUPER_ADMIN';
export type RoomFilter = 'all' | 'in_rooms' | 'unassigned';
export type PhoneFilter = 'all' | 'has_phone' | 'missing_phone';

export interface FilterAndSortOptions {
  users: User[];
  rooms: Room[];
  roomMembers: RoomMember[];
  statusFilter: StatusFilter;
  roleFilter: RoleFilter;
  roomFilter: RoomFilter;
  phoneFilter: PhoneFilter;
  sortPreset: SortPreset;
}

/**
 * Checks if a user matches the omni-search query across:
 * - Resident Name
 * - Email address
 * - Phone number (formatted string or digit-normalized)
 * - User UUID / ID
 * - UPI ID
 * - Role
 * - Assigned Room Names
 */
export function matchesUserOmniSearch(
  u: User,
  query: string,
  rooms: Room[],
  roomMembers: RoomMember[]
): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  // 1. Name match
  if (u.name.toLowerCase().includes(q)) return true;

  // 2. Email match
  if (u.email.toLowerCase().includes(q)) return true;

  // 3. Phone match:
  // Direct text match on formatted phone (e.g. "+91 80135")
  if (u.phone && u.phone.toLowerCase().includes(q)) return true;

  // Digit-normalized match (e.g., query "8013534817" matches "+91 80135 34817")
  const queryDigits = q.replace(/\D/g, '');
  if (queryDigits.length >= 3 && u.phone) {
    const userPhoneDigits = u.phone.replace(/\D/g, '');
    if (userPhoneDigits.includes(queryDigits)) return true;
  }

  // 4. Supabase User UUID / ID match
  if (u.id.toLowerCase().includes(q)) return true;

  // 5. UPI ID match
  if (u.upiId && u.upiId.toLowerCase().includes(q)) return true;

  // 6. Role match
  if (u.role.toLowerCase().includes(q)) return true;
  if ((q === 'superadmin' || q === 'admin') && u.role === 'SUPER_ADMIN') return true;
  if (q === 'student' && u.role === 'STUDENT') return true;

  // 7. Assigned Room Name match
  const userRoomMemberships = roomMembers.filter((m) => m.userId === u.id);
  const userRoomNames = rooms
    .filter((r) => userRoomMemberships.some((m) => m.roomId === r.id))
    .map((r) => r.name.toLowerCase());
  if (userRoomNames.some((rName) => rName.includes(q))) return true;

  return false;
}

/**
 * Filters and sorts users according to the selected administrative presets.
 */
export function filterAndSortUsers({
  users,
  rooms: _rooms,
  roomMembers,
  statusFilter,
  roleFilter,
  roomFilter,
  phoneFilter,
  sortPreset,
}: FilterAndSortOptions): User[] {
  const filtered = users.filter((u) => {
    if (statusFilter === 'active' && u.isSuspended) return false;
    if (statusFilter === 'suspended' && !u.isSuspended) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;

    const userRoomsCount = roomMembers.filter((m) => m.userId === u.id).length;
    if (roomFilter === 'in_rooms' && userRoomsCount === 0) return false;
    if (roomFilter === 'unassigned' && userRoomsCount > 0) return false;

    const hasPhone = Boolean(u.phone && u.phone.trim());
    if (phoneFilter === 'has_phone' && !hasPhone) return false;
    if (phoneFilter === 'missing_phone' && hasPhone) return false;

    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (sortPreset) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'name_asc':
        return a.name.localeCompare(b.name);
      case 'name_desc':
        return b.name.localeCompare(a.name);
      case 'rooms_desc': {
        const aCount = roomMembers.filter((m) => m.userId === a.id).length;
        const bCount = roomMembers.filter((m) => m.userId === b.id).length;
        if (bCount !== aCount) return bCount - aCount;
        return a.name.localeCompare(b.name);
      }
      case 'rooms_asc': {
        const aCount = roomMembers.filter((m) => m.userId === a.id).length;
        const bCount = roomMembers.filter((m) => m.userId === b.id).length;
        if (aCount !== bCount) return aCount - bCount;
        return a.name.localeCompare(b.name);
      }
      default:
        return 0;
    }
  });
}
