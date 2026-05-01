import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Task } from '../types/models';

const EXPO_PROJECT_ID = '26d9eb72-7f17-4bfe-9603-4364feaa3bc1';

export type ReminderTiming = 'dayBefore' | 'sameDay' | 'both';

export type SnoozeDuration = '1hour' | '3hours' | '1day' | '3days';

export interface NotificationPrefs {
  enabled: boolean;
  timing: ReminderTiming;
  snoozeDuration: SnoozeDuration;
  reminderHour: number;
  reminderMinute: number;
}

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  timing: 'both',
  snoozeDuration: '1day',
  reminderHour: 9,
  reminderMinute: 0,
};

export function computeSnoozeTriggerDate(duration: SnoozeDuration): Date {
  const now = new Date();
  switch (duration) {
    case '1hour':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '3hours':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000);
    case '3days': {
      const d = new Date(now);
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case '1day':
    default: {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
  }
}

// Configure how notifications appear when app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(
  userId: string
): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[notifications] only work on physical devices');
    return null;
  }

  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[notifications] permission denied');
      return null;
    }

    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID })
    ).data;

    await updateDoc(doc(db, 'users', userId), {
      expoPushToken: token,
      pushTokenUpdatedAt: new Date(),
    });

    console.log('[notifications] push token registered:', token);
    return token;
  } catch (e) {
    console.warn('[notifications] register failed:', e);
    return null;
  }
}

export async function scheduleTaskReminder(
  taskId: string,
  taskName: string,
  taskIcon: string,
  dueDate: Date,
  householdId: string,
  daysBefore: number,
  reminderHour: number = 9,
  reminderMinute: number = 0
): Promise<string | null> {
  const triggerDate = new Date(dueDate);
  triggerDate.setDate(triggerDate.getDate() - daysBefore);
  triggerDate.setHours(reminderHour, reminderMinute, 0, 0);

  if (triggerDate <= new Date()) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${taskIcon} ${taskName}`,
        body:
          daysBefore === 0
            ? `${taskIcon} ${taskName} is due today!`
            : `Due in ${daysBefore} day${daysBefore > 1 ? 's' : ''}`,
        data: { taskId, householdId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    return id;
  } catch (e) {
    console.warn('[notifications] schedule failed:', e);
    return null;
  }
}

export async function cancelTaskReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    console.warn('[notifications] cancel failed:', e);
  }
}

export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('[notifications] cancelAll failed:', e);
  }
}

export async function scheduleAllTaskReminders(
  tasks: Task[],
  householdId: string,
  // Kept for backward compatibility — per-task `reminderDaysBefore`
  // takes precedence and drives scheduling.
  _timing: ReminderTiming = 'both',
  reminderHour: number = 9,
  reminderMinute: number = 0
): Promise<void> {
  await cancelAllReminders();

  for (const task of tasks) {
    if (!task.nextDueDate || task.completedToday) continue;
    const dueDate =
      task.nextDueDate instanceof Date
        ? task.nextDueDate
        : new Date(task.nextDueDate);

    const daysBefore =
      typeof task.reminderDaysBefore === 'number' ? task.reminderDaysBefore : 1;

    if (daysBefore > 0) {
      await scheduleTaskReminder(
        task.id,
        task.name,
        task.icon || '📋',
        dueDate,
        householdId,
        daysBefore,
        reminderHour,
        reminderMinute
      );
    }

    await scheduleTaskReminder(
      task.id,
      task.name,
      task.icon || '📋',
      dueDate,
      householdId,
      0,
      reminderHour,
      reminderMinute
    );
  }
}

export async function sendAssignmentNotification(
  recipientUserId: string,
  taskName: string,
  taskIcon: string,
  assignedByName: string,
  householdId: string,
  taskId: string
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'users', recipientUserId));
    if (!snap.exists()) return;
    const pushToken = snap.data()?.expoPushToken as string | undefined;
    if (!pushToken) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: `${taskIcon} Task Assigned`,
        body: `${assignedByName} assigned you: ${taskName}`,
        data: { taskId, householdId },
        sound: 'default',
      }),
    });
  } catch (e) {
    console.warn('[notifications] sendAssignment failed:', e);
  }
}

export async function sendTestNotification(
  taskId: string,
  taskName: string,
  householdId: string
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Test Reminder',
      body: `${taskName} is due tomorrow!`,
      data: { taskId, householdId },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
    },
  });
}

export async function getNotificationPrefs(
  userId: string
): Promise<NotificationPrefs> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const data = snap.exists() ? snap.data() : null;
    return {
      enabled: data?.reminderEnabled ?? DEFAULT_PREFS.enabled,
      timing:
        (data?.reminderTiming as ReminderTiming | undefined) ??
        DEFAULT_PREFS.timing,
      snoozeDuration:
        (data?.snoozeDuration as SnoozeDuration | undefined) ??
        DEFAULT_PREFS.snoozeDuration,
      reminderHour:
        typeof data?.reminderHour === 'number'
          ? data.reminderHour
          : DEFAULT_PREFS.reminderHour,
      reminderMinute:
        typeof data?.reminderMinute === 'number'
          ? data.reminderMinute
          : DEFAULT_PREFS.reminderMinute,
    };
  } catch (e) {
    console.warn('[notifications] getPrefs failed:', e);
    return DEFAULT_PREFS;
  }
}

export async function setNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    reminderEnabled: prefs.enabled,
    reminderTiming: prefs.timing,
    snoozeDuration: prefs.snoozeDuration,
    reminderHour: prefs.reminderHour,
    reminderMinute: prefs.reminderMinute,
  });
}
