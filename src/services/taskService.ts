import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { computeNextDueDate } from '../utils/recurrence';
import {
  RecurrenceRule,
  Task,
  TaskActivity,
  TaskActivityType,
} from '../types/models';
import { getFirstName } from '../utils/nameUtils';
import { suggestTaskIcon } from './iconService';

type CreateTaskInput = Omit<
  Task,
  | 'id'
  | 'createdAt'
  | 'createdBy'
  | 'nextDueDate'
  | 'lastCompletedAt'
  | 'lastCompletedBy'
  | 'completedToday'
  | 'completedAt'
  | 'assignedTo'
  | 'assignedToName'
  | 'assignedAt'
  | 'assignedBy'
  | 'snoozedUntil'
> & {
  assignedTo?: string | null;
  assignedToName?: string | null;
};

function tasksCollection(householdId: string) {
  return collection(db, 'households', householdId, 'tasks');
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

function serializeRecurrence(r: RecurrenceRule): Record<string, unknown> {
  const out: Record<string, unknown> = {
    frequency: r.frequency,
    interval: r.interval,
  };
  if (r.daysOfWeek) out.daysOfWeek = r.daysOfWeek;
  if (r.monthlyType) out.monthlyType = r.monthlyType;
  if (r.monthlyDay !== undefined) out.monthlyDay = r.monthlyDay;
  if (r.monthlyWeekday) out.monthlyWeekday = r.monthlyWeekday;
  if (r.endType) out.endType = r.endType;
  if (r.endAfterOccurrences !== undefined) {
    out.endAfterOccurrences = r.endAfterOccurrences;
  }
  if (r.endByDate) out.endByDate = Timestamp.fromDate(r.endByDate);
  return out;
}

function deserializeRecurrence(data: any): RecurrenceRule {
  const r: RecurrenceRule = {
    frequency: data?.frequency ?? 'monthly',
    interval: data?.interval ?? 1,
  };
  if (Array.isArray(data?.daysOfWeek)) r.daysOfWeek = data.daysOfWeek;
  if (data?.monthlyType) r.monthlyType = data.monthlyType;
  if (typeof data?.monthlyDay === 'number') r.monthlyDay = data.monthlyDay;
  if (data?.monthlyWeekday) r.monthlyWeekday = data.monthlyWeekday;
  if (data?.endType) r.endType = data.endType;
  if (typeof data?.endAfterOccurrences === 'number') {
    r.endAfterOccurrences = data.endAfterOccurrences;
  }
  if (data?.endByDate) {
    r.endByDate =
      data.endByDate instanceof Timestamp
        ? data.endByDate.toDate()
        : data.endByDate instanceof Date
          ? data.endByDate
          : undefined;
  }
  return r;
}

function mapTaskDoc(id: string, data: any): Task {
  return {
    id,
    householdId: data.householdId,
    name: data.name,
    category: data.category,
    location: data.location ?? undefined,
    description: data.description ?? undefined,
    firstDueDate: toDate(data.firstDueDate),
    recurrence: deserializeRecurrence(data.recurrence),
    nextDueDate: toDate(data.nextDueDate),
    lastCompletedAt: toDateOrNull(data.lastCompletedAt),
    lastCompletedBy: data.lastCompletedBy ?? null,
    hasInventory: !!data.hasInventory,
    instructions: null,
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    completedToday: !!data.completedToday,
    completedAt: toDateOrNull(data.completedAt),
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy,
    assignedTo: data.assignedTo ?? null,
    assignedToName: data.assignedToName ?? null,
    assignedAt: toDateOrNull(data.assignedAt),
    assignedBy: data.assignedBy ?? null,
    reminderDaysBefore:
      data.reminderDaysBefore === null
        ? null
        : typeof data.reminderDaysBefore === 'number'
          ? data.reminderDaysBefore
          : 1,
    snoozedUntil: toDateOrNull(data.snoozedUntil),
  };
}

export async function createTask(
  householdId: string,
  userId: string,
  data: CreateTaskInput,
  creatorUid?: string
): Promise<string> {
  const icon = await suggestTaskIcon(data.name);
  // assignedTo === undefined means "not provided" — default to creator.
  // assignedTo === null means "explicitly unassigned" — leave null.
  const assignedTo =
    data.assignedTo === undefined ? (creatorUid ?? null) : data.assignedTo;
  const assignedToName =
    data.assignedTo === undefined
      ? (data.assignedToName ?? userId)
      : (data.assignedToName ?? null);
  const ref = await addDoc(tasksCollection(householdId), {
    householdId,
    name: data.name,
    category: data.category,
    location: data.location ?? null,
    description: data.description ?? null,
    firstDueDate: Timestamp.fromDate(data.firstDueDate),
    recurrence: serializeRecurrence(data.recurrence),
    nextDueDate: Timestamp.fromDate(data.firstDueDate),
    lastCompletedAt: null,
    lastCompletedBy: null,
    hasInventory: data.hasInventory,
    instructions: null,
    icon,
    completedToday: false,
    completedAt: null,
    createdAt: serverTimestamp(),
    createdBy: userId,
    assignedTo,
    assignedToName,
    assignedAt: assignedTo ? serverTimestamp() : null,
    assignedBy: assignedTo ? (creatorUid ?? userId) : null,
    reminderDaysBefore:
      data.reminderDaysBefore === null
        ? null
        : typeof data.reminderDaysBefore === 'number'
          ? data.reminderDaysBefore
          : 1,
  });
  await logActivity(householdId, ref.id, 'created', userId);
  return ref.id;
}

function activityCollection(householdId: string, taskId: string) {
  return collection(
    db,
    'households',
    householdId,
    'tasks',
    taskId,
    'activity'
  );
}

export async function logActivity(
  householdId: string,
  taskId: string,
  type: TaskActivityType,
  performedBy: string,
  note?: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    type,
    performedBy,
    performedAt: serverTimestamp(),
  };
  if (note && note.trim().length > 0) payload.note = note.trim();
  await addDoc(activityCollection(householdId, taskId), payload);
}

export async function getActivityLog(
  householdId: string,
  taskId: string
): Promise<TaskActivity[]> {
  const q = query(
    activityCollection(householdId, taskId),
    orderBy('performedAt', 'desc'),
    fbLimit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      taskId,
      householdId,
      type: (data.type ?? 'completed') as TaskActivityType,
      performedBy: data.performedBy ?? '',
      performedAt: toDate(data.performedAt),
      note: typeof data.note === 'string' ? data.note : undefined,
    };
  });
}

export async function getTasks(householdId: string): Promise<Task[]> {
  const q = query(
    tasksCollection(householdId),
    orderBy('nextDueDate', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapTaskDoc(d.id, d.data()));
}

export async function getTask(
  householdId: string,
  taskId: string
): Promise<Task | null> {
  const ref = doc(db, 'households', householdId, 'tasks', taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapTaskDoc(snap.id, snap.data());
}

export async function updateTask(
  householdId: string,
  taskId: string,
  data: Partial<Task>
): Promise<void> {
  const ref = doc(db, 'households', householdId, 'tasks', taskId);
  const payload: Record<string, unknown> = { ...data };
  delete payload.id;
  if (data.firstDueDate instanceof Date) {
    payload.firstDueDate = Timestamp.fromDate(data.firstDueDate);
  }
  if (data.nextDueDate instanceof Date) {
    payload.nextDueDate = Timestamp.fromDate(data.nextDueDate);
  }
  if (data.lastCompletedAt instanceof Date) {
    payload.lastCompletedAt = Timestamp.fromDate(data.lastCompletedAt);
  }
  if (data.assignedAt instanceof Date) {
    payload.assignedAt = Timestamp.fromDate(data.assignedAt);
  }
  if (data.snoozedUntil instanceof Date) {
    payload.snoozedUntil = Timestamp.fromDate(data.snoozedUntil);
  }
  if (data.recurrence) {
    payload.recurrence = serializeRecurrence(data.recurrence);
  }
  await updateDoc(ref, payload);
}

export async function snoozeTask(
  householdId: string,
  taskId: string,
  snoozedUntil: Date
): Promise<void> {
  await updateDoc(
    doc(db, 'households', householdId, 'tasks', taskId),
    { snoozedUntil: Timestamp.fromDate(snoozedUntil) }
  );
}

export async function assignTask(
  householdId: string,
  taskId: string,
  assignedTo: string | null,
  assignedToName: string | null,
  assignedBy: string,
  assignedByName: string
): Promise<void> {
  const ref = doc(db, 'households', householdId, 'tasks', taskId);
  await updateDoc(ref, {
    assignedTo,
    assignedToName,
    assignedAt: assignedTo ? serverTimestamp() : null,
    assignedBy: assignedTo ? assignedBy : null,
  });
  const byFirst = getFirstName(assignedByName);
  const toFirst = assignedToName ? getFirstName(assignedToName) : null;
  const note = assignedTo
    ? `${byFirst} assigned this to ${toFirst ?? assignedTo}`
    : `${byFirst} unassigned this task`;
  await logActivity(householdId, taskId, 'assigned', assignedBy, note);
}

export async function completeTask(
  householdId: string,
  taskId: string,
  userId: string,
  note?: string
): Promise<Date> {
  const task = await getTask(householdId, taskId);
  if (!task) throw new Error('Task not found');
  const completedAt = new Date();
  const nextDueDate = computeNextDueDate(completedAt, task.recurrence);
  const ref = doc(db, 'households', householdId, 'tasks', taskId);
  await updateDoc(ref, {
    lastCompletedAt: Timestamp.fromDate(completedAt),
    lastCompletedBy: userId,
    completedAt: Timestamp.fromDate(completedAt),
    completedToday: true,
    nextDueDate: Timestamp.fromDate(nextDueDate),
  });
  await logActivity(householdId, taskId, 'completed', userId, note);
  return nextDueDate;
}

export async function resetCompletedToday(householdId: string): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const q = query(
    tasksCollection(householdId),
    where('completedToday', '==', true)
  );
  const snap = await getDocs(q);
  await Promise.all(
    snap.docs
      .filter((d) => {
        const completedAt = toDateOrNull(d.data().completedAt);
        return completedAt !== null && completedAt < startOfToday;
      })
      .map((d) => updateDoc(d.ref, { completedToday: false }))
  );
}

export async function deleteTask(
  householdId: string,
  taskId: string
): Promise<void> {
  // Delete subcollections first (Firestore doesn't cascade automatically).
  const usagesSnap = await getDocs(
    collection(db, 'households', householdId, 'tasks', taskId, 'productUsages')
  );
  await Promise.all(usagesSnap.docs.map((d) => deleteDoc(d.ref)));

  const activitySnap = await getDocs(
    collection(db, 'households', householdId, 'tasks', taskId, 'activity')
  );
  await Promise.all(activitySnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(doc(db, 'households', householdId, 'tasks', taskId));
}
