import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { db } from '../config/firebase';
import { computeNextDueDate } from '../utils/recurrence';
import {
  RecurrenceRule,
  Task,
  TaskActivity,
  TaskActivityType,
  TaskCompletion,
} from '../types/models';
import { getFirstName } from '../utils/nameUtils';
import { suggestTaskIcon } from './iconService';
import {
  deductProductUsage,
  getProductUsagesForTask,
} from './productService';

type CreateTaskInput = Omit<
  Task,
  | 'id'
  | 'createdAt'
  | 'createdBy'
  | 'nextDueDate'
  | 'lastCompletedAt'
  | 'lastCompletedBy'
  | 'lastCompletedByName'
  | 'completedToday'
  | 'completedAt'
  | 'assignedTo'
  | 'assignedToName'
  | 'assignedAt'
  | 'assignedBy'
  | 'snoozedUntil'
  | 'pendingNotificationId'
  | 'nextTimeReminder'
  | 'lastCompletionNote'
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
    lastCompletedByName: data.lastCompletedByName ?? null,
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
    pendingNotificationId: data.pendingNotificationId ?? null,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    nextTimeReminder:
      typeof data.nextTimeReminder === 'string'
        ? data.nextTimeReminder
        : undefined,
    lastCompletionNote:
      typeof data.lastCompletionNote === 'string'
        ? data.lastCompletionNote
        : undefined,
    completedOccurrences:
      typeof data.completedOccurrences === 'number'
        ? data.completedOccurrences
        : undefined,
    isEnded: !!data.isEnded,
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
    lastCompletedByName: null,
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
    notes: data.notes ?? null,
    nextTimeReminder: null,
    lastCompletionNote: null,
    completedOccurrences: 0,
    isEnded: false,
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
  snoozedUntil: Date,
  pendingNotificationId?: string | null
): Promise<void> {
  const payload: Record<string, unknown> = {
    snoozedUntil: Timestamp.fromDate(snoozedUntil),
  };
  if (pendingNotificationId !== undefined) {
    payload.pendingNotificationId = pendingNotificationId;
  }
  await updateDoc(
    doc(db, 'households', householdId, 'tasks', taskId),
    payload
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

export interface CompleteTaskOptions {
  completionNote?: string;
  remindNextTime?: boolean;
  displayName?: string;
  skipInventoryDeduction?: boolean;
}

export async function completeTask(
  householdId: string,
  taskId: string,
  userId: string,
  note?: string,
  options?: CompleteTaskOptions
): Promise<Date> {
  console.log('[completeTask] Starting for task:', taskId);
  const task = await getTask(householdId, taskId);
  if (!task) throw new Error('Task not found');
  console.log('[completeTask] Task found:', task.name);

  // Cancel any pending snooze notification for this task
  if (task.pendingNotificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(task.pendingNotificationId);
    } catch (e) {
      console.warn('[completeTask] Failed to cancel pending notification:', e);
    }
  }

  const completedAt = new Date();

  // Safely compute next due date with fallback
  let nextDueDate: Date;
  try {
    // Check if recurrence exists and is valid
    if (!task.recurrence || !task.recurrence.frequency) {
      console.log('[completeTask] No valid recurrence, using 30 days default');
      // One-time or invalid task: default to 30 days from now
      nextDueDate = new Date(completedAt);
      nextDueDate.setDate(nextDueDate.getDate() + 30);
    } else {
      console.log('[completeTask] Computing next due date with recurrence:', task.recurrence);
      nextDueDate = computeNextDueDate(completedAt, task.recurrence);
    }
  } catch (recurrenceError: any) {
    console.error('[completeTask] Error computing next due date:', recurrenceError?.message);
    // Fallback to 30 days if computation fails
    nextDueDate = new Date(completedAt);
    nextDueDate.setDate(nextDueDate.getDate() + 30);
  }
  console.log('[completeTask] Next due date calculated:', nextDueDate.toISOString());
  console.log('[completeTask] Recurrence:', JSON.stringify(task.recurrence));
  const ref = doc(db, 'households', householdId, 'tasks', taskId);

  const completionNote = options?.completionNote ?? '';
  const remindNextTime = options?.remindNextTime ?? false;
  const displayName = options?.displayName ?? userId;

  // Increment completed occurrences
  const newCompletedOccurrences = (task.completedOccurrences ?? 0) + 1;

  // Check end conditions
  let taskEnded = false;
  const endType = task.recurrence?.endType;

  if (endType === 'afterOccurrences') {
    const maxOccurrences = task.recurrence?.endAfterOccurrences ?? 0;
    if (maxOccurrences > 0 && newCompletedOccurrences >= maxOccurrences) {
      taskEnded = true;
      console.log('[completeTask] Task ended - max occurrences reached:', newCompletedOccurrences, '/', maxOccurrences);
    }
  }

  if (endType === 'byDate') {
    const endByDate = task.recurrence?.endByDate;
    if (endByDate && nextDueDate > endByDate) {
      taskEnded = true;
      console.log('[completeTask] Task ended - next due date exceeds end date:', nextDueDate, '>', endByDate);
    }
  }

  // Mark original task as completed (keep original dueDate, just mark status)
  const completionPayload: Record<string, unknown> = {
    lastCompletedAt: Timestamp.fromDate(completedAt),
    lastCompletedBy: userId,
    lastCompletedByName: displayName,
    completedAt: Timestamp.fromDate(completedAt),
    completedToday: true,
    status: 'completed',
    snoozedUntil: null,
    pendingNotificationId: null,
    lastCompletionNote: completionNote || null,
    completedOccurrences: newCompletedOccurrences,
    isEnded: taskEnded,
  };

  console.log('[completeTask] Marking original task as completed');
  await updateDoc(ref, completionPayload);
  console.log('[completeTask] Original task marked completed');

  // Write to completions subcollection on original task
  try {
    const completionsRef = collection(
      db,
      'households',
      householdId,
      'tasks',
      taskId,
      'completions'
    );
    await addDoc(completionsRef, {
      completedAt: Timestamp.fromDate(completedAt),
      completedBy: userId,
      displayName,
      note: completionNote,
      remindNextTime,
    });
    console.log('[completeTask] Completion record written');
  } catch (completionError: any) {
    console.warn('[completeTask] Failed to write completion record:', completionError?.message);
    // Don't throw - task is already marked complete
  }

  try {
    await logActivity(householdId, taskId, 'completed', userId, note);
    console.log('[completeTask] Activity logged');
  } catch (activityError: any) {
    console.warn('[completeTask] Failed to log activity:', activityError?.message);
    // Don't throw - task is already marked complete
  }

  // Create NEW pending task for next occurrence (unless task has ended)
  if (!taskEnded) {
    try {
      const newTaskRef = doc(collection(db, 'households', householdId, 'tasks'));

      // Determine nextTimeReminder for new task
      let newNextTimeReminder: string | null = null;
      if (remindNextTime && completionNote) {
        newNextTimeReminder = completionNote;
      }

      await setDoc(newTaskRef, {
        householdId: task.householdId,
        name: task.name,
        category: task.category,
        location: task.location ?? null,
        description: task.description ?? null,
        firstDueDate: Timestamp.fromDate(task.firstDueDate),
        recurrence: serializeRecurrence(task.recurrence),
        nextDueDate: Timestamp.fromDate(nextDueDate),
        lastCompletedAt: Timestamp.fromDate(completedAt),
        lastCompletedBy: userId,
        lastCompletedByName: displayName,
        hasInventory: task.hasInventory,
        instructions: null,
        icon: task.icon ?? null,
        completedToday: false,
        completedAt: null,
        status: 'pending',
        createdAt: serverTimestamp(),
        createdBy: task.createdBy,
        assignedTo: task.assignedTo,
        assignedToName: task.assignedToName,
        assignedAt: task.assignedAt ? Timestamp.fromDate(task.assignedAt) : null,
        assignedBy: task.assignedBy,
        reminderDaysBefore: task.reminderDaysBefore,
        snoozedUntil: null,
        pendingNotificationId: null,
        notes: task.notes ?? null,
        nextTimeReminder: newNextTimeReminder,
        lastCompletionNote: completionNote || null,
        completedOccurrences: newCompletedOccurrences,
        isEnded: false,
      });

      console.log('[completeTask] New occurrence created for:', task.name, nextDueDate.toISOString());
    } catch (newTaskError: any) {
      console.error('[completeTask] Failed to create next occurrence:', newTaskError?.message);
      // This is more serious - log but don't throw since original is marked complete
    }
  } else {
    console.log('[completeTask] Task ended, no new occurrence created');
  }

  // Deduct linked product usage when task is completed (unless skipped)
  if (!options?.skipInventoryDeduction) {
    try {
      const usages = await getProductUsagesForTask(householdId, taskId);
      if (usages.length > 0) {
        console.log('[completeTask] Deducting inventory for', usages.length, 'products');
        await Promise.all(
          usages.map((usage) =>
            deductProductUsage(householdId, usage.productId, usage.usageAmount, task.name)
          )
        );
        console.log('[completeTask] Inventory deducted');
      }
    } catch (e: any) {
      console.warn('[completeTask] Failed to deduct product usage:', e?.message);
      // Don't throw - task is already marked complete
    }
  }

  console.log('[completeTask] Complete!');
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
  const tasksToReset = snap.docs.filter((d) => {
    const completedAt = toDateOrNull(d.data().completedAt);
    return completedAt !== null && completedAt < startOfToday;
  });
  console.log('[resetCompletedToday] Found', snap.docs.length, 'completed tasks,', tasksToReset.length, 'need reset');
  await Promise.all(
    tasksToReset.map((d) => {
      console.log('[resetCompletedToday] Resetting task:', d.id, d.data().name);
      return updateDoc(d.ref, { completedToday: false });
    })
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

  const completionsSnap = await getDocs(
    collection(db, 'households', householdId, 'tasks', taskId, 'completions')
  );
  await Promise.all(completionsSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(doc(db, 'households', householdId, 'tasks', taskId));
}

/**
 * Subscribe to real-time task updates for a household.
 * Returns an unsubscribe function to stop listening.
 */
export function subscribeToTasks(
  householdId: string,
  onTasks: (tasks: Task[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    tasksCollection(householdId),
    orderBy('nextDueDate', 'asc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map((d) => mapTaskDoc(d.id, d.data()));
      onTasks(tasks);
    },
    (error) => {
      console.error('[subscribeToTasks] Error:', error);
      onError?.(error);
    }
  );
}

/**
 * Get tasks where snooze has expired (snoozedUntil <= now) and not completed today.
 * Used to show TaskAlertModal when app becomes active.
 */
export async function getExpiredSnoozedTasks(householdId: string): Promise<Task[]> {
  const now = new Date();
  const allTasks = await getTasks(householdId);
  return allTasks.filter((task) => {
    if (task.completedToday) return false;
    if (!task.snoozedUntil) return false;
    // Snooze has expired if snoozedUntil is in the past
    return task.snoozedUntil.getTime() <= now.getTime();
  });
}

/**
 * Get completion history for a task, ordered by most recent first.
 */
export async function getCompletions(
  householdId: string,
  taskId: string,
  limitCount?: number
): Promise<TaskCompletion[]> {
  const completionsRef = collection(
    db,
    'households',
    householdId,
    'tasks',
    taskId,
    'completions'
  );
  const q = limitCount
    ? query(completionsRef, orderBy('completedAt', 'desc'), fbLimit(limitCount))
    : query(completionsRef, orderBy('completedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      completedAt: toDate(data.completedAt),
      completedBy: data.completedBy ?? '',
      displayName: data.displayName ?? data.completedBy ?? '',
      note: data.note ?? '',
      remindNextTime: !!data.remindNextTime,
    };
  });
}

/**
 * Dismiss the "remember for next time" reminder on a task.
 */
export async function dismissNextTimeReminder(
  householdId: string,
  taskId: string
): Promise<void> {
  const ref = doc(db, 'households', householdId, 'tasks', taskId);
  await updateDoc(ref, { nextTimeReminder: null });
}
