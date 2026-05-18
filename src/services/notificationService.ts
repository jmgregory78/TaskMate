import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert, Linking, Platform } from 'react-native';
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
  taskDueAlertsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number; // hour 0-23
  quietHoursEnd: number; // hour 0-23
}

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  timing: 'both',
  snoozeDuration: '1day',
  reminderHour: 9,
  reminderMinute: 0,
  taskDueAlertsEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: 22, // 10 PM
  quietHoursEnd: 8, // 8 AM
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
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions with iOS-specific options.
 * Shows an alert if permissions are denied with option to open Settings.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('[notifications] only work on physical devices');
    return false;
  }

  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[notifications] permission denied');
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications for TaskMate in Settings to receive task reminders.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
      return false;
    }

    return true;
  } catch (e) {
    console.warn('[notifications] permission request failed:', e);
    return false;
  }
}

export async function registerForPushNotifications(
  userId: string
): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return null;
  }

  try {
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

  const now = Date.now();
  const triggerTime = triggerDate.getTime();

  if (triggerTime <= now) return null;

  // Use seconds-based trigger for better background compatibility
  const secondsUntilTrigger = Math.floor((triggerTime - now) / 1000);

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${taskIcon} ${taskName}`,
        body:
          daysBefore === 0
            ? `${taskIcon} ${taskName} is due today!`
            : `Due in ${daysBefore} day${daysBefore > 1 ? 's' : ''}`,
        data: { taskId, householdId },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilTrigger,
        repeats: false,
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

/**
 * Schedule a snooze notification for a task.
 * Cancels any existing pending notification for this task first.
 * Returns the new notification ID so it can be stored on the task.
 */
export async function scheduleSnoozeNotification(
  task: { id: string; name: string; icon?: string; pendingNotificationId?: string | null },
  snoozeUntil: Date,
  householdId: string
): Promise<string | null> {
  // Cancel any existing pending notification for this task
  if (task.pendingNotificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(task.pendingNotificationId);
    } catch (e) {
      console.warn('[notifications] cancel existing snooze failed:', e);
    }
  }

  const now = Date.now();
  const snoozeTime = snoozeUntil.getTime();

  // Don't schedule if the snooze time is in the past
  if (snoozeTime <= now) {
    return null;
  }

  // Use seconds-based trigger for better background compatibility
  const secondsUntilSnooze = Math.floor((snoozeTime - now) / 1000);

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Task Reminder',
        body: `${task.icon || '📋'} ${task.name} needs your attention`,
        data: { taskId: task.id, householdId },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilSnooze,
        repeats: false,
      },
    });

    // Log for debugging
    console.log(
      `[notifications] Snooze scheduled: ${notificationId} for ${task.name} in ${secondsUntilSnooze} seconds`
    );

    return notificationId;
  } catch (e) {
    console.warn('[notifications] schedule snooze failed:', e);
    return null;
  }
}

export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('[notifications] cancelAll failed:', e);
  }
}

/**
 * Cancel all scheduled notifications EXCEPT those in the preserveIds list.
 * Used to preserve active snooze notifications when rescheduling regular reminders.
 */
export async function cancelRemindersExcept(preserveIds: string[]): Promise<void> {
  try {
    const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const preserveSet = new Set(preserveIds);

    for (const notification of allNotifications) {
      if (!preserveSet.has(notification.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch (e) {
    console.warn('[notifications] cancelRemindersExcept failed:', e);
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
  // Collect notification IDs from snoozed tasks to preserve them
  const preserveIds: string[] = [];
  for (const task of tasks) {
    if (task.pendingNotificationId) {
      preserveIds.push(task.pendingNotificationId);
    }
  }

  // Cancel all reminders EXCEPT the preserved snooze notifications
  await cancelRemindersExcept(preserveIds);

  for (const task of tasks) {
    if (!task.nextDueDate || task.completedToday) continue;
    const dueDate =
      task.nextDueDate instanceof Date
        ? task.nextDueDate
        : new Date(task.nextDueDate);

    // null = "No Reminder" — opt-out of all push notifications for this task.
    // The in-app due alert still surfaces it on the due date.
    if (task.reminderDaysBefore === null) continue;

    const daysBefore =
      typeof task.reminderDaysBefore === 'number' ? task.reminderDaysBefore : 1;

    const taskHour = typeof task.reminderHour === 'number' ? task.reminderHour : reminderHour;
    const taskMinute = typeof task.reminderMinute === 'number' ? task.reminderMinute : reminderMinute;

    if (daysBefore > 0) {
      await scheduleTaskReminder(
        task.id,
        task.name,
        task.icon || '📋',
        dueDate,
        householdId,
        daysBefore,
        taskHour,
        taskMinute
      );
    }

    await scheduleTaskReminder(
      task.id,
      task.name,
      task.icon || '📋',
      dueDate,
      householdId,
      0,
      taskHour,
      taskMinute
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

/**
 * Schedule a test notification that fires in 10 seconds.
 * Use this to verify notifications are working in the background.
 */
export async function scheduleTestNotification(): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Test Notification',
      body: 'If you see this in the background, notifications are working!',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      repeats: false,
    },
  });
  console.log('[notifications] Test notification scheduled:', id);
  return id;
}

/**
 * Legacy test notification function.
 * @deprecated Use scheduleTestNotification instead
 */
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
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      repeats: false,
    },
  });
}

/**
 * Get all pending scheduled notifications.
 * Useful for debugging to confirm notifications were registered.
 */
export async function getAllPendingNotifications(): Promise<Notifications.NotificationRequest[]> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  console.log('[notifications] Pending notifications:', JSON.stringify(pending, null, 2));
  return pending;
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
      taskDueAlertsEnabled:
        typeof data?.taskDueAlertsEnabled === 'boolean'
          ? data.taskDueAlertsEnabled
          : DEFAULT_PREFS.taskDueAlertsEnabled,
      quietHoursEnabled:
        typeof data?.quietHoursEnabled === 'boolean'
          ? data.quietHoursEnabled
          : DEFAULT_PREFS.quietHoursEnabled,
      quietHoursStart:
        typeof data?.quietHoursStart === 'number'
          ? data.quietHoursStart
          : DEFAULT_PREFS.quietHoursStart,
      quietHoursEnd:
        typeof data?.quietHoursEnd === 'number'
          ? data.quietHoursEnd
          : DEFAULT_PREFS.quietHoursEnd,
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
    taskDueAlertsEnabled: prefs.taskDueAlertsEnabled,
    quietHoursEnabled: prefs.quietHoursEnabled,
    quietHoursStart: prefs.quietHoursStart,
    quietHoursEnd: prefs.quietHoursEnd,
  });
}
