import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { differenceInCalendarDays, format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import {
  assignTask,
  completeTask,
  dismissNextTimeReminder,
  getActivityLog,
  getCompletions,
  getTask,
  getTasks,
  snoozeTask,
  updateTask,
} from '../../services/taskService';
import { getFirstName } from '../../utils/nameUtils';
import { sendAssignmentNotification } from '../../services/notificationService';
import {
  flagPurchasePending,
  getProducts,
  getProductUsagesForTask,
  updateProductUsage,
} from '../../services/productService';
import { recurrenceSummary } from '../../utils/recurrence';
import {
  Product,
  Task,
  TaskActivity,
  TaskCompletion,
  TaskProductUsage,
} from '../../types/models';
import InventoryBar from '../../components/InventoryBar';
import CompleteTaskSheet from '../../components/CompleteTaskSheet';
import EditProductUsageSheet from '../../components/EditProductUsageSheet';
import TaskCompletedOverlay from '../../components/TaskCompletedOverlay';
import ScreenHeader from '../../components/ScreenHeader';
import {
  Assignee,
  AssigneePickerSheet,
} from '../../components/AssigneeSelector';
import { reminderLabel } from '../../components/ReminderPicker';
import SnoozeSheet, { SnoozeUnit } from '../../components/SnoozeSheet';
import PurchaseLinkSheet from '../../components/PurchaseLinkSheet';
import { openPurchaseUrl } from '../../utils/purchaseLink';
import * as Notifications from 'expo-notifications';
import { getNotificationPrefs, scheduleAllTaskReminders } from '../../services/notificationService';
import { Colors } from '../../constants/colors';

type TaskDetailRoute = RouteProp<{ TaskDetail: { taskId: string } }, 'TaskDetail'>;

const URGENCY_COLORS = {
  overdue: Colors.urgencyRed,
  soon: Colors.urgencyOrange,
  mid: Colors.urgencyBlue,
  far: Colors.urgencyGray,
} as const;

const ACTIVITY_ICONS: Record<TaskActivity['type'], string> = {
  completed: '✅',
  created: '➕',
  edited: '📝',
  assigned: '👤',
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[1][0] ?? '')).toUpperCase();
}

function formatSnoozeTime(snoozedUntil: Date): string {
  const now = new Date();
  const isToday = snoozedUntil.toDateString() === now.toDateString();
  const isTomorrow = differenceInCalendarDays(snoozedUntil, now) === 1;

  const timeStr = snoozedUntil.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) return timeStr;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  return (
    snoozedUntil.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + ` at ${timeStr}`
  );
}

async function cancelTaskNotifications(taskId: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => {
          const data = n.content.data as { taskId?: unknown } | undefined;
          return data?.taskId === taskId;
        })
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier)
        )
    );
  } catch (e) {
    console.warn('[TaskDetail] cancel notifications failed:', e);
  }
}

function dueInfo(nextDueDate: Date): { label: string; color: string } {
  const days = differenceInCalendarDays(nextDueDate, new Date());
  if (days < 0) {
    const overdueBy = Math.abs(days);
    return {
      label: `Overdue by ${overdueBy} ${overdueBy === 1 ? 'day' : 'days'}`,
      color: URGENCY_COLORS.overdue,
    };
  }
  if (days === 0) return { label: 'Due today', color: URGENCY_COLORS.soon };
  if (days === 1) return { label: 'Due tomorrow', color: URGENCY_COLORS.soon };
  if (days <= 3)
    return { label: `Due in ${days} days`, color: URGENCY_COLORS.soon };
  if (days <= 14)
    return { label: `Due in ${days} days`, color: URGENCY_COLORS.mid };
  return { label: `Due in ${days} days`, color: URGENCY_COLORS.far };
}

export default function TaskDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<TaskDetailRoute>();
  const { taskId } = route.params;
  const { user } = useAuth();
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const [task, setTask] = useState<Task | null>(null);
  const [productUsages, setProductUsages] = useState<TaskProductUsage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [assigneeSheetVisible, setAssigneeSheetVisible] = useState(false);
  const [editUsageId, setEditUsageId] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayTaskName, setOverlayTaskName] = useState('');
  const [overlayTaskIcon, setOverlayTaskIcon] = useState('📋');
  const [snoozeSheetVisible, setSnoozeSheetVisible] = useState(false);
  const [linkSheetProduct, setLinkSheetProduct] = useState<Product | null>(
    null
  );
  const [snoozeConfirmation, setSnoozeConfirmation] = useState<string | null>(
    null
  );
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Completion confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [remindNextTime, setRemindNextTime] = useState(false);

  // Guard to prevent multiple simultaneous completion calls
  const isCompletingRef = useRef(false);

  const currentAssignee = useMemo<Assignee | null>(() => {
    if (!task?.assignedTo) return null;
    return {
      userId: task.assignedTo,
      name: task.assignedToName ?? task.assignedTo,
    };
  }, [task?.assignedTo, task?.assignedToName]);

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      setLoading(true);
      setError(null);
      Promise.all([
        getTask(householdId, taskId),
        getProductUsagesForTask(householdId, taskId),
        getProducts(householdId),
        getActivityLog(householdId, taskId),
        getCompletions(householdId, taskId),
      ])
        .then(([t, usages, allProducts, activityLog, completionHistory]) => {
          if (cancelled) return;
          setTask(t);
          setProductUsages(usages);
          setProducts(allProducts);
          setActivity(activityLog);
          setCompletions(completionHistory);
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          const err = e as { message?: string };
          setError(err.message ?? String(e));
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [householdId, taskId])
  );

  const handleBuyOnAmazon = async (product: Product) => {
    if (!householdId) return;
    const trimmedUrl = (product.amazonUrl ?? '').trim();
    if (trimmedUrl.length === 0) {
      setLinkSheetProduct(product);
      return;
    }
    try {
      await flagPurchasePending(householdId, product.id);
    } catch (e) {
      console.warn('[TaskDetail] flagPurchasePending failed:', e);
    }
    await openPurchaseUrl(trimmedUrl);
  };

  const handleLinkSheetClose = (savedUrl?: string) => {
    const product = linkSheetProduct;
    setLinkSheetProduct(null);
    if (product && savedUrl && householdId) {
      flagPurchasePending(householdId, product.id).catch((e) => {
        console.warn('[TaskDetail] flagPurchasePending failed:', e);
      });
    }
  };

  const handleOpenComplete = () => {
    if (!task || actionPending || task.completedToday || isCompletingRef.current) return;
    // Reset modal state and show confirmation
    setNoteExpanded(false);
    setNoteText('');
    setRemindNextTime(false);
    setShowConfirmModal(true);
  };

  const refreshTask = async () => {
    if (!householdId) return;
    const [
      refreshed,
      refreshedUsages,
      refreshedProducts,
      refreshedActivity,
      refreshedCompletions,
    ] = await Promise.all([
      getTask(householdId, taskId),
      getProductUsagesForTask(householdId, taskId),
      getProducts(householdId),
      getActivityLog(householdId, taskId),
      getCompletions(householdId, taskId),
    ]);
    if (refreshed) setTask(refreshed);
    setProductUsages(refreshedUsages);
    setProducts(refreshedProducts);
    setActivity(refreshedActivity);
    setCompletions(refreshedCompletions);
    return refreshed;
  };

  const runCompleteTask = async (deductInventory: boolean, completionNote?: string, shouldRemindNextTime?: boolean) => {
    // Prevent multiple simultaneous completion calls
    if (isCompletingRef.current) {
      console.log('[TaskDetail] Already completing, ignoring');
      return;
    }
    if (!task || !user || !householdId) {
      console.log('[TaskDetail] Missing required data');
      return;
    }

    isCompletingRef.current = true;
    setActionPending(true);

    try {
      // Build activity note if deducting inventory
      const activityNote =
        deductInventory && productUsages.length > 0
          ? `Used ${productUsages
              .map((u) => `${u.usageAmount} ${u.usageUnit} ${u.productName}`.trim())
              .join(', ')}`
          : undefined;

      const displayName = user.displayName && !user.displayName.includes('@')
        ? user.displayName
        : 'You';

      // Complete the task - this handles everything:
      // - Firestore update
      // - Next due date calculation
      // - Inventory deduction (if not skipped)
      await completeTask(
        householdId,
        taskId,
        user.uid,
        activityNote,
        {
          completionNote: completionNote?.trim() ?? '',
          remindNextTime: shouldRemindNextTime ?? false,
          displayName,
          skipInventoryDeduction: !deductInventory,
        }
      );

      // Clear snooze (non-critical)
      try {
        if (task.snoozedUntil) {
          await updateTask(householdId, taskId, { snoozedUntil: null });
        }
        await cancelTaskNotifications(taskId);
      } catch (e) {
        console.warn('[TaskDetail] snooze/notification cleanup failed:', e);
      }

      // Hide modals/sheets
      setSheetVisible(false);
      setShowConfirmModal(false);
      setActionPending(false);

      // Navigate back to timeline
      (navigation as any).navigate('Main', { screen: 'Tasks' });

    } catch (e: any) {
      console.error('[TaskDetail] COMPLETION FAILED:', e?.message, e);
      isCompletingRef.current = false;
      setActionPending(false);
      Alert.alert('Error', 'Could not complete task. Please try again.');
    }
  };

  const handleOverlayDismiss = () => {
    setOverlayVisible(false);
  };

  const handleConfirmComplete = () => {
    // Complete the task immediately (with inventory deduction) and note
    void runCompleteTask(true, noteText, remindNextTime);
  };

  const handleConfirmWithoutLogging = () => {
    // Complete the task immediately (without inventory deduction) but with note
    void runCompleteTask(false, noteText, remindNextTime);
  };

  const handleCancelConfirmModal = () => {
    setShowConfirmModal(false);
    setNoteExpanded(false);
    setNoteText('');
    setRemindNextTime(false);
  };

  const handleCancelComplete = () => {
    setSheetVisible(false);
  };

  const handleDismissReminder = async () => {
    if (!householdId) return;
    try {
      await dismissNextTimeReminder(householdId, taskId);
      setTask((prev) =>
        prev ? { ...prev, nextTimeReminder: undefined } : prev
      );
    } catch (e) {
      console.warn('[TaskDetail] dismiss reminder failed:', e);
    }
  };


  const handleSnooze = async (amount: number, unit: SnoozeUnit) => {
    if (!task || !householdId || !user?.uid) return;
    setSnoozeSheetVisible(false);

    let snoozeDate: Date;
    if (unit === 'minutes') {
      snoozeDate = new Date(Date.now() + amount * 60 * 1000);
    } else if (unit === 'hours') {
      snoozeDate = new Date(Date.now() + amount * 60 * 60 * 1000);
    } else {
      snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + amount);
      snoozeDate.setHours(9, 0, 0, 0);
    }

    try {
      // Cancel any previously scheduled notifications for this task so a
      // re-snooze doesn't stack reminders from the prior snooze window.
      await cancelTaskNotifications(task.id);

      // Persist the snoozedUntil so the proactive HomeScreen alert respects it.
      await snoozeTask(householdId, task.id, snoozeDate);

      // Refresh the regular schedule first so the snooze we add survives.
      const allTasks = await getTasks(householdId);
      const prefs = await getNotificationPrefs(user.uid);
      if (prefs.enabled) {
        await scheduleAllTaskReminders(
          allTasks,
          householdId,
          prefs.timing,
          prefs.reminderHour,
          prefs.reminderMinute
        );
      }

      // Then add the additive one-off snooze reminder.
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${task.icon || '📋'} ${task.name}`,
          body: 'Snoozed reminder — this task is still due!',
          data: { taskId: task.id, householdId },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: snoozeDate,
        },
      });

      // Reflect the new snooze immediately in the banner.
      setTask((prev) => (prev ? { ...prev, snoozedUntil: snoozeDate } : prev));

      let confirmation: string;
      if (unit === 'hours') {
        confirmation = `Snoozed — reminder in ${amount} hour${
          amount === 1 ? '' : 's'
        }`;
      } else {
        const dateLabel = snoozeDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });
        confirmation = `Snoozed — reminder set for ${dateLabel} at 9:00 AM`;
      }
      setSnoozeConfirmation(confirmation);
      setTimeout(() => setSnoozeConfirmation(null), 3000);
    } catch (e) {
      console.warn('[TaskDetail] snooze failed:', e);
      Alert.alert('Snooze failed', 'Could not schedule a snooze reminder.');
    }
  };

  const handleSaveUsage = async (newAmount: number) => {
    if (!householdId || !editUsageId) return;
    await updateProductUsage(householdId, taskId, editUsageId, newAmount);
    setEditUsageId(null);
    await refreshTask();
  };

  const handleAssigneeSelected = async (next: Assignee | null) => {
    if (!task || !user || !householdId) return;
    if ((next?.userId ?? null) === (task.assignedTo ?? null)) return;
    try {
      await assignTask(
        householdId,
        taskId,
        next?.userId ?? null,
        next?.name ?? null,
        user.uid,
        user.displayName && !user.displayName.includes('@') ? user.displayName : 'You'
      );
      if (next && next.userId !== user.uid) {
        void sendAssignmentNotification(
          next.userId,
          task.name,
          task.icon ?? '📋',
          getFirstName(user.displayName && !user.displayName.includes('@') ? user.displayName : 'You'),
          householdId,
          taskId
        );
      }
      await refreshTask();
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Error', err.message ?? 'Failed to update assignee');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Task not found'}</Text>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.linkButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const due = dueInfo(task.nextDueDate);

  return (
    <>
      <ScreenHeader
        title=""
        leftLabel="Tasks"
        rightLabel="Edit"
        rightTone="white"
        onRightPress={() => {
          if (!householdId) return;
          (navigation as any).navigate('EditTask', {
            taskId,
            householdId,
          });
        }}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      {task.completedToday ? (
        <View style={styles.completedBanner}>
          <Text style={styles.completedBannerText}>
            ✅ Completed today! Next due:{' '}
            {format(task.nextDueDate, 'MMM d, yyyy')}
          </Text>
        </View>
      ) : (() => {
        const now = new Date();
        const isSnoozed =
          !!task.snoozedUntil && task.snoozedUntil.getTime() > now.getTime();

        if (isSnoozed && task.snoozedUntil) {
          return (
            <View style={styles.reminderBanner}>
              <Text style={styles.reminderBannerSnoozedHeader}>
                😴 Snoozed until {formatSnoozeTime(task.snoozedUntil)}
              </Text>
              <Text style={styles.reminderBannerSnoozedSubtext}>
                Task is still due — complete it or set a new reminder
              </Text>
              <View style={styles.reminderBannerActions}>
                <TouchableOpacity
                  style={[styles.reminderCompleteButton, actionPending && styles.disabled]}
                  onPress={handleOpenComplete}
                  disabled={actionPending}
                  activeOpacity={0.85}
                >
                  <Text style={styles.reminderCompleteText}>
                    ✅ Mark Complete
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reminderSnoozeButton}
                  onPress={() => setSnoozeSheetVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reminderSnoozeText}>
                    😴 Snooze Again
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }

        const days = differenceInCalendarDays(task.nextDueDate, now);
        if (days > 7) return null;
        const isOverdue = days < 0;
        const urgencyText = isOverdue
          ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
          : days === 0
            ? 'Due today!'
            : days === 1
              ? 'Due tomorrow'
              : `Due in ${days} days`;
        const emoji = isOverdue ? '⚠️' : '🔔';
        const textStyle = isOverdue
          ? styles.reminderBannerTextOverdue
          : styles.reminderBannerTextDefault;
        return (
          <View style={styles.reminderBanner}>
            <Text style={[styles.reminderBannerHeader, textStyle]}>
              {emoji} {urgencyText}
            </Text>
            <View style={styles.reminderBannerActions}>
              <TouchableOpacity
                style={[styles.reminderCompleteButton, actionPending && styles.disabled]}
                onPress={handleOpenComplete}
                disabled={actionPending}
                activeOpacity={0.85}
              >
                <Text style={styles.reminderCompleteText}>
                  ✅ Mark Complete
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reminderSnoozeButton}
                onPress={() => setSnoozeSheetVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.reminderSnoozeText}>😴 Snooze</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {snoozeConfirmation ? (
        <View style={styles.snoozeConfirmation}>
          <Text style={styles.snoozeConfirmationText}>
            ✅ {snoozeConfirmation}
          </Text>
        </View>
      ) : null}

      {task.nextTimeReminder ? (
        <View style={styles.nextTimeReminderCard}>
          <View style={styles.nextTimeReminderContent}>
            <Text style={styles.nextTimeReminderHeader}>
              📝 Note from last time:
            </Text>
            <Text style={styles.nextTimeReminderText}>
              {task.nextTimeReminder}
            </Text>
            {task.lastCompletedAt ? (
              <Text style={styles.nextTimeReminderDate}>
                Completed {format(task.lastCompletedAt, 'MMMM yyyy')}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.nextTimeReminderDismiss}
            onPress={handleDismissReminder}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Text style={styles.nextTimeReminderDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <Text style={styles.icon}>{task.icon ?? '📋'}</Text>
        <Text style={styles.taskName}>{task.name}</Text>
        <Text style={[styles.due, { color: due.color }]}>{due.label}</Text>
        <Text style={styles.recurrence}>
          {recurrenceSummary(task.recurrence, task.firstDueDate)}
        </Text>
      </View>

      {task.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Description</Text>
          <Text style={styles.bodyText}>{task.description}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Schedule</Text>
        <Text style={styles.bodyText}>
          Next due: {format(task.nextDueDate, 'EEEE, MMMM d, yyyy')}
        </Text>
        {task.lastCompletedAt ? (
          <Text style={styles.bodyText}>
            Last completed: {format(task.lastCompletedAt, 'MMM d, yyyy')}
          </Text>
        ) : null}
        <Text style={styles.reminderText}>
          🔔 Reminder: {reminderLabel(task.reminderDaysBefore)}
        </Text>
        {task.isEnded ? (
          <Text style={styles.endedText}>
            ✅ Task series completed
          </Text>
        ) : task.recurrence?.endType === 'afterOccurrences' && task.recurrence?.endAfterOccurrences ? (
          <Text style={styles.endInfoText}>
            🔄 Ends after {task.recurrence.endAfterOccurrences} times · {Math.max(0, task.recurrence.endAfterOccurrences - (task.completedOccurrences ?? 0))} remaining
          </Text>
        ) : task.recurrence?.endType === 'byDate' && task.recurrence?.endByDate ? (
          <Text style={styles.endInfoText}>
            📅 Ends on {format(task.recurrence.endByDate, 'MMMM d, yyyy')}
          </Text>
        ) : null}
      </View>

      <View style={styles.assignmentRow}>
        {currentAssignee ? (
          <>
            <View style={styles.assignmentAvatar}>
              <Text style={styles.assignmentAvatarText}>
                {initialsFor(currentAssignee.name)}
              </Text>
            </View>
            <Text style={styles.assignmentText}>
              👤 Assigned to{' '}
              {currentAssignee.userId === user?.uid
                ? 'you'
                : getFirstName(currentAssignee.name)}
            </Text>
          </>
        ) : (
          <Text style={styles.assignmentTextMuted}>👤 Unassigned</Text>
        )}
        <TouchableOpacity
          style={styles.reassignButton}
          onPress={() => setAssigneeSheetVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.reassignButtonText}>Reassign</Text>
        </TouchableOpacity>
      </View>

      {(() => {
        // Determine if alert banner is showing (due within 7 days or snoozed)
        const now = new Date();
        const days = differenceInCalendarDays(task.nextDueDate, now);
        const isSnoozed = !!task.snoozedUntil && task.snoozedUntil.getTime() > now.getTime();
        const hasActiveAlert = !task.completedToday && (days <= 7 || isSnoozed);

        if (task.completedToday) {
          return (
            <View style={[styles.completeButton, styles.completeButtonDone]}>
              <Text style={styles.completeButtonText}>Completed ✓</Text>
            </View>
          );
        }

        // If alert banner is showing, don't show duplicate button
        if (hasActiveAlert) {
          return null;
        }

        // Future task (no alert banner) - show "Mark as Done Early" outlined button
        return (
          <TouchableOpacity
            style={[styles.earlyCompleteButton, actionPending && styles.disabled]}
            onPress={handleOpenComplete}
            disabled={actionPending}
            activeOpacity={0.8}
          >
            <Text style={styles.earlyCompleteButtonText}>Mark as Done Early</Text>
          </TouchableOpacity>
        );
      })()}

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Inventory & Supplies</Text>
        {productUsages.length === 0 ? (
          <Text style={[styles.placeholderText, styles.suppliesEmpty]}>
            No supplies linked yet.
          </Text>
        ) : (
          productUsages.map((usage) => {
            const product = products.find((p) => p.id === usage.productId);
            const displayName = product?.name ?? usage.productName;
            return (
              <View key={usage.id} style={styles.productCard}>
                {/* Row 1: name + Buy */}
                <View style={styles.productHeaderRow}>
                  <Text
                    style={styles.productName}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {displayName}
                  </Text>
                  {product ? (
                    <TouchableOpacity
                      style={styles.buyPill}
                      onPress={() => handleBuyOnAmazon(product)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.buyPillText}>Buy</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Row 2: inventory bar */}
                {product ? (
                  <View style={styles.productBar}>
                    <InventoryBar product={product} />
                  </View>
                ) : null}

                {/* Row 3: usage + Edit */}
                <View style={styles.usageRow}>
                  <Text
                    style={styles.usageMeta}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {usage.usageAmount} {usage.usageUnit} per completion
                  </Text>
                  <TouchableOpacity
                    style={styles.editPill}
                    onPress={() => setEditUsageId(usage.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.editPillText}>✏️ Edit</Text>
                  </TouchableOpacity>
                </View>

                {!product ? (
                  <Text style={styles.productMeta}>
                    ⚠️ Linked supply not found
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
        <TouchableOpacity
          style={styles.addSupplyButton}
          onPress={() =>
            (navigation as any).navigate('AddProductUsage', {
              householdId,
              taskId,
            })
          }
          activeOpacity={0.8}
        >
          <Text style={styles.addSupplyButtonText}>➕ Add Supply</Text>
        </TouchableOpacity>
      </View>

      {task.notes ? (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Notes</Text>
            <TouchableOpacity
              style={styles.editNotesLink}
              onPress={() => {
                if (!householdId) return;
                (navigation as any).navigate('EditTask', {
                  taskId,
                  householdId,
                });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Text style={styles.editNotesLinkText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.notesText}>{task.notes}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addNotesLink}
          onPress={() => {
            if (!householdId) return;
            (navigation as any).navigate('EditTask', {
              taskId,
              householdId,
            });
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.addNotesLinkText}>+ Add notes</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Activity</Text>
        {activity.length === 0 ? (
          <Text style={[styles.placeholderText, styles.activityEmpty]}>
            No activity yet
          </Text>
        ) : (
          activity.map((a, idx) => (
            <View
              key={a.id}
              style={[
                styles.activityRow,
                idx < activity.length - 1 && styles.activityRowDivider,
              ]}
            >
              <Text style={styles.activityIcon}>{ACTIVITY_ICONS[a.type]}</Text>
              <View style={styles.activityBody}>
                <Text style={styles.activityTitle}>
                  {a.type === 'assigned' && a.note
                    ? a.note
                    : `${getFirstName(a.performedBy)} ${a.type} this task`}
                </Text>
                <Text style={styles.activityDate}>
                  {format(a.performedAt, 'MMM d, yyyy · h:mm a')}
                </Text>
                {a.type !== 'assigned' && a.note ? (
                  <Text style={styles.activityNote}>{a.note}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>History</Text>
        {completions.length === 0 ? (
          <Text style={[styles.placeholderText, styles.historyEmpty]}>
            No completion history yet
          </Text>
        ) : (
          <>
            {(showAllHistory ? completions : completions.slice(0, 5)).map(
              (c, idx, arr) => (
                <View
                  key={c.id}
                  style={[
                    styles.historyRow,
                    idx < arr.length - 1 && styles.historyRowDivider,
                  ]}
                >
                  <Text style={styles.historyIcon}>✅</Text>
                  <View style={styles.historyBody}>
                    <Text style={styles.historyMeta}>
                      {format(c.completedAt, 'MMMM d, yyyy')} ·{' '}
                      {getFirstName(c.displayName)}
                    </Text>
                    {c.note ? (
                      <Text style={styles.historyNote}>"{c.note}"</Text>
                    ) : null}
                  </View>
                </View>
              )
            )}
            {completions.length > 5 && !showAllHistory ? (
              <TouchableOpacity
                style={styles.viewAllHistoryLink}
                onPress={() => setShowAllHistory(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.viewAllHistoryText}>
                  View all history ({completions.length} completions)
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>

      </ScrollView>

      {/* Completion Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelConfirmModal}
      >
        <View style={styles.confirmOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Mark as Complete?</Text>
              <Text style={styles.confirmSubtitle}>{task.name}</Text>

              <TouchableOpacity
                onPress={() => setNoteExpanded(true)}
                style={styles.addNoteLinkContainer}
              >
                <Text style={styles.addNoteLink}>+ Add a note</Text>
              </TouchableOpacity>

              {noteExpanded && (
                <View style={styles.noteContainer}>
                  <TextInput
                    style={styles.noteInput}
                    value={noteText}
                    onChangeText={setNoteText}
                    placeholder="Notes for next time..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={() => setRemindNextTime(!remindNextTime)}
                    style={styles.remindRow}
                  >
                    <View style={[styles.checkbox, remindNextTime && styles.checkboxChecked]}>
                      {remindNextTime && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>
                    <Text style={styles.remindText}>Remind me next time</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[styles.confirmBtn, isCompletingRef.current && styles.disabled]}
                onPress={handleConfirmComplete}
                disabled={isCompletingRef.current}
              >
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelConfirmModal}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <CompleteTaskSheet
        visible={sheetVisible}
        task={task}
        productUsages={productUsages}
        products={products}
        onConfirm={handleConfirmComplete}
        onConfirmWithoutLogging={handleConfirmWithoutLogging}
        onCancel={handleCancelComplete}
      />
      {householdId ? (
        <AssigneePickerSheet
          visible={assigneeSheetVisible}
          householdId={householdId}
          currentAssignee={currentAssignee}
          onSelect={(next) => {
            void handleAssigneeSelected(next);
          }}
          onClose={() => setAssigneeSheetVisible(false)}
        />
      ) : null}
      <EditProductUsageSheet
        visible={editUsageId !== null}
        usage={
          editUsageId
            ? (productUsages.find((u) => u.id === editUsageId) ?? null)
            : null
        }
        product={(() => {
          const u = editUsageId
            ? productUsages.find((x) => x.id === editUsageId)
            : null;
          return u ? (products.find((p) => p.id === u.productId) ?? null) : null;
        })()}
        onSave={handleSaveUsage}
        onCancel={() => setEditUsageId(null)}
      />
      <TaskCompletedOverlay
        visible={overlayVisible}
        taskName={overlayTaskName}
        taskIcon={overlayTaskIcon}
        onDismiss={handleOverlayDismiss}
      />
      <SnoozeSheet
        visible={snoozeSheetVisible}
        taskName={task.name}
        onSnooze={(amount, unit) => {
          void handleSnooze(amount, unit);
        }}
        onCancel={() => setSnoozeSheetVisible(false)}
      />
      <PurchaseLinkSheet
        product={linkSheetProduct}
        householdId={householdId}
        onClose={handleLinkSheetClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  content: {
    paddingBottom: 64,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  reminderBanner: {
    backgroundColor: '#2D3748',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  reminderBannerHeader: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  reminderBannerTextDefault: {
    color: '#FFFFFF',
  },
  reminderBannerTextOverdue: {
    color: '#FC8181',
  },
  reminderBannerSnoozedHeader: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  reminderBannerSnoozedSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 12,
  },
  reminderBannerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  reminderCompleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#319795',
  },
  reminderCompleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  reminderSnoozeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  reminderSnoozeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  snoozeConfirmation: {
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: Colors.successBg,
    borderColor: Colors.successBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  snoozeConfirmationText: {
    color: Colors.successText,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  titleBlock: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 28,
    backgroundColor: Colors.headerBackground,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  taskName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textOnDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  due: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  recurrence: {
    fontSize: 14,
    color: Colors.textOnDarkMuted,
  },
  section: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  reminderText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 6,
  },
  endInfoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  endedText: {
    fontSize: 13,
    color: Colors.successText,
    fontWeight: '600',
    marginTop: 6,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  activityEmpty: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  activityRow: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  activityRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activityIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  activityBody: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  activityDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  activityNote: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  productCard: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  productName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  productBar: {
    marginVertical: 8,
  },
  productMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  productHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  usageMeta: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
  },
  editPill: {
    flexShrink: 0,
    minHeight: 34,
    minWidth: 50,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPillText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  suppliesEmpty: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  buyPill: {
    flexShrink: 0,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  addSupplyButton: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  addSupplyButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  completeButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginHorizontal: 16,
  },
  completeButtonDone: {
    backgroundColor: '#86EFAC',
  },
  completeButtonText: {
    color: Colors.textOnDark,
    fontSize: 17,
    fontWeight: '700',
  },
  earlyCompleteButton: {
    height: 48,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginHorizontal: 16,
  },
  earlyCompleteButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  completedBanner: {
    backgroundColor: Colors.successBg,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  completedBannerText: {
    color: Colors.successText,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  assignmentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentAvatarText: {
    color: Colors.textOnDark,
    fontWeight: '700',
    fontSize: 12,
  },
  assignmentText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  assignmentTextMuted: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  reassignButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    backgroundColor: Colors.cardBackground,
  },
  reassignButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  linkButton: {
    paddingVertical: 8,
  },
  linkButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  // Next time reminder card (amber)
  nextTimeReminderCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  nextTimeReminderContent: {
    flex: 1,
  },
  nextTimeReminderHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 6,
  },
  nextTimeReminderText: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
    marginBottom: 6,
  },
  nextTimeReminderDate: {
    fontSize: 12,
    color: '#B45309',
  },
  nextTimeReminderDismiss: {
    paddingLeft: 12,
  },
  nextTimeReminderDismissText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  // Notes section
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  editNotesLink: {
    padding: 4,
  },
  editNotesLinkText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  addNotesLink: {
    marginTop: 16,
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addNotesLinkText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  // History section
  historyEmpty: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  historyRow: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  historyRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  historyBody: {
    flex: 1,
  },
  historyMeta: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  historyNote: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  viewAllHistoryLink: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  viewAllHistoryText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  // Confirmation Modal styles
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 16,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  addNoteLinkContainer: {
    marginBottom: 20,
  },
  addNoteLink: {
    color: '#0D9488',
    fontSize: 14,
    textAlign: 'center',
  },
  noteContainer: {
    width: '100%',
    marginBottom: 20,
  },
  noteInput: {
    width: '100%',
    minWidth: '100%',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    height: 100,
    fontSize: 14,
    color: '#111827',
    textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
    marginBottom: 10,
  },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#0D9488',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  remindText: {
    fontSize: 13,
    color: '#6B7280',
  },
  confirmBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#9CA3AF',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
});
