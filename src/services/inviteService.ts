import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  HouseholdInvite,
  HouseholdInviteRole,
  HouseholdMember,
} from '../types/models';

/**
 * The `getActiveInvites` query filters by householdId == X AND revoked == false
 * AND usedBy == null AND expiresAt > now. Firestore composite index required:
 *   Collection: invites
 *   Fields: householdId (Asc), revoked (Asc), usedBy (Asc), expiresAt (Asc)
 * On first run Firestore will return an error with a link to auto-create it.
 */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateCode(): string {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return result;
}

function inviteDoc(code: string) {
  return doc(db, 'invites', code);
}

function invitesCollection() {
  return collection(db, 'invites');
}

function membersCollection(householdId: string) {
  return collection(db, 'households', householdId, 'members');
}

function memberDoc(householdId: string, userId: string) {
  return doc(db, 'households', householdId, 'members', userId);
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function toDateOrNull(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function mapInvite(code: string, data: any): HouseholdInvite {
  return {
    id: code,
    householdId: data.householdId ?? '',
    householdName: data.householdName ?? '',
    code,
    role: (data.role ?? 'member') as HouseholdInviteRole,
    createdBy: data.createdBy ?? '',
    createdAt: toDate(data.createdAt),
    expiresAt: toDate(data.expiresAt),
    usedBy: data.usedBy ?? null,
    usedAt: toDateOrNull(data.usedAt),
    revoked: !!data.revoked,
  };
}

function mapMember(id: string, data: any): HouseholdMember {
  return {
    userId: data.userId ?? id,
    email: data.email ?? '',
    displayName: data.displayName ?? null,
    role: (data.role ?? 'member') as HouseholdMember['role'],
    joinedAt: toDate(data.joinedAt),
  };
}

export async function createInvite(
  householdId: string,
  householdName: string,
  role: HouseholdInviteRole,
  createdBy: string
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = inviteDoc(code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await setDoc(ref, {
      code,
      householdId,
      householdName,
      role,
      createdBy,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      usedBy: null,
      usedAt: null,
      revoked: false,
    });
    return code;
  }
  throw new Error('Could not generate a unique invite code, please retry.');
}

export async function getActiveInvites(
  householdId: string
): Promise<HouseholdInvite[]> {
  const now = Timestamp.fromDate(new Date());
  const q = query(
    invitesCollection(),
    where('householdId', '==', householdId),
    where('revoked', '==', false),
    where('usedBy', '==', null),
    where('expiresAt', '>', now)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapInvite(d.id, d.data()));
}

export async function revokeInvite(code: string): Promise<void> {
  await updateDoc(inviteDoc(code), { revoked: true });
}

export async function joinHousehold(
  code: string,
  userId: string,
  email: string,
  displayName: string | null
): Promise<{ success: true; householdId: string } | { success: false; error: string }> {
  const ref = inviteDoc(code);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { success: false, error: 'Invalid or expired invite code' };
  }
  const invite = mapInvite(snap.id, snap.data());
  if (invite.revoked) {
    return { success: false, error: 'This invite has been revoked' };
  }
  if (invite.usedBy) {
    return { success: false, error: 'This invite has already been used' };
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: 'This invite has expired' };
  }

  try {
    await setDoc(memberDoc(invite.householdId, userId), {
      userId,
      email,
      displayName,
      role: invite.role,
      joinedAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, 'users', userId),
      { householdIds: arrayUnion(invite.householdId) },
      { merge: true }
    );
    await updateDoc(ref, {
      usedBy: userId,
      usedAt: serverTimestamp(),
    });
    return { success: true, householdId: invite.householdId };
  } catch (e) {
    const err = e as { message?: string };
    return {
      success: false,
      error: err.message ?? 'Failed to join household',
    };
  }
}

export async function getHouseholdMembers(
  householdId: string
): Promise<HouseholdMember[]> {
  const snap = await getDocs(membersCollection(householdId));
  return snap.docs
    .map((d) => mapMember(d.id, d.data()))
    .sort((a, b) => {
      const order: Record<HouseholdMember['role'], number> = {
        owner: 0,
        member: 1,
        viewer: 2,
      };
      const diff = order[a.role] - order[b.role];
      if (diff !== 0) return diff;
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
}

export async function updateMemberRole(
  householdId: string,
  userId: string,
  role: HouseholdMember['role']
): Promise<void> {
  await updateDoc(memberDoc(householdId, userId), { role });
}

export async function removeMember(
  householdId: string,
  userId: string
): Promise<void> {
  await deleteDoc(memberDoc(householdId, userId));
  await setDoc(
    doc(db, 'users', userId),
    { householdIds: arrayRemove(householdId) },
    { merge: true }
  );
}
