import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Household } from '../types/models';

export async function createHousehold(
  userId: string,
  name: string,
  email: string = '',
  displayName: string | null = null
): Promise<string> {
  console.log('Starting createHousehold for userId: ' + userId);
  try {
    const householdRef = doc(collection(db, 'households'));
    const householdId = householdRef.id;

    console.log('About to write household doc...');
    await setDoc(householdRef, {
      id: householdId,
      name,
      createdBy: userId,
      createdAt: serverTimestamp(),
    });
    console.log('Household doc written, id: ' + householdId);

    console.log('About to write member doc...');
    await setDoc(doc(db, 'households', householdId, 'members', userId), {
      userId,
      email,
      displayName,
      role: 'owner',
      joinedAt: serverTimestamp(),
    });
    console.log('Member doc written');

    console.log('About to update user doc...');
    await setDoc(
      doc(db, 'users', userId),
      { householdIds: [householdId] },
      { merge: true }
    );
    console.log('User doc updated');

    return householdId;
  } catch (e) {
    console.log('[createHousehold] failed:', e);
    throw e;
  }
}

export async function getHousehold(
  householdId: string
): Promise<Household | null> {
  const snap = await getDoc(doc(db, 'households', householdId));
  if (!snap.exists()) return null;
  const data = snap.data();
  const createdAt =
    data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
  return {
    id: snap.id,
    name: data.name,
    createdBy: data.createdBy,
    createdAt,
  };
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await setDoc(
    doc(db, 'users', userId),
    { onboardingComplete: true },
    { merge: true }
  );
}

export async function hasCompletedOnboarding(
  userId: string
): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return false;
  return snap.data().onboardingComplete === true;
}

export async function markSetupWizardComplete(userId: string): Promise<void> {
  await setDoc(
    doc(db, 'users', userId),
    { setupWizardComplete: true },
    { merge: true }
  );
}

export async function hasCompletedSetupWizard(
  userId: string
): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return false;
  return snap.data().setupWizardComplete === true;
}

export async function getUserHousehold(userId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return null;
  const ids = snap.data().householdIds;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  return ids[0];
}

export async function testFirestoreWrite(): Promise<string> {
  try {
    const testRef = doc(collection(db, 'test'), 'ping');
    await setDoc(testRef, { timestamp: new Date().toISOString() });
    return 'SUCCESS';
  } catch (e: any) {
    return 'FAILED: ' + e.message + ' code: ' + e.code;
  }
}
