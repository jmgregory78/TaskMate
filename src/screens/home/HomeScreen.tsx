import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { differenceInCalendarDays, format } from 'date-fns';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../../stores/appStore';
import {
  completeTask,
  getTasks,
  snoozeTask,
} from '../../services/taskService';
import { getProducts } from '../../services/productService';
import { getHousehold } from '../../services/householdService';
import {
  getNotificationPrefs,
  scheduleAllTaskReminders,
  scheduleSnoozeNotification,
} from '../../services/notificationService';
import { Product, serializeTask, stockPercent, Task } from '../../types/models';
import { getFirstName } from '../../utils/nameUtils';
import { formatDueDateShort } from '../../utils/dateUtils';
import UserAvatar from '../../components/UserAvatar';
import TaskAlertModal from '../../components/TaskAlertModal';
import Toast from '../../components/Toast';
import { SnoozeUnit } from '../../components/SnoozeSheet';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

interface StarRating {
  stars: 1 | 2 | 3 | 4 | 5;
  color: string;
  label: string;
  message: string;
  toNextStar: string | null;
  overdueCount: number;
  lowStockCount: number;
}

const STAR_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: '#276749',
  4: '#38A169',
  3: '#D69E2E',
  2: '#DD6B20',
  1: '#E53E3E',
};

const STAR_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: 'Excellent',
  4: 'Great',
  3: 'Fair',
  2: 'Needs Work',
  1: 'Attention Needed',
};

const STAR_MESSAGES: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: 'Your household is in great shape! 🎉',
  4: 'Great job — just a few things to tidy up!',
  3: 'Room for improvement.',
  2: 'Your household needs some attention.',
  1: 'Time to catch up — start with the most overdue task.',
};

function calculateStarRating(tasks: Task[], products: Product[]): StarRating {
  const now = new Date();

  const overdueTasks = tasks.filter((t) => {
    if (t.completedToday) return false;
    if (!t.nextDueDate) return false;
    return differenceInCalendarDays(now, t.nextDueDate) > 0;
  });
  const lowStockProducts = products.filter(
    (p) => stockPercent(p) <= p.lowThresholdPercent
  );

  const overdueCount = overdueTasks.length;
  const lowStockCount = lowStockProducts.length;

  let stars: 1 | 2 | 3 | 4 | 5;
  if (overdueCount === 0 && lowStockCount === 0) stars = 5;
  else if (overdueCount <= 1 && lowStockCount <= 2) stars = 4;
  else if (overdueCount <= 3 && lowStockCount <= 4) stars = 3;
  else if (overdueCount <= 5 && lowStockCount <= 7) stars = 2;
  else stars = 1;

  let toNextStar: string | null = null;
  if (stars < 5) {
    const nextThresholds: Record<1 | 2 | 3 | 4, { overdue: number; lowStock: number }> = {
      1: { overdue: 5, lowStock: 7 },
      2: { overdue: 3, lowStock: 4 },
      3: { overdue: 1, lowStock: 2 },
      4: { overdue: 0, lowStock: 0 },
    };
    const next = nextThresholds[stars as 1 | 2 | 3 | 4];
    const parts: string[] = [];
    if (overdueCount > next.overdue) {
      const needed = overdueCount - next.overdue;
      parts.push(`complete ${needed} overdue task${needed > 1 ? 's' : ''}`);
    }
    if (lowStockCount > next.lowStock) {
      const needed = lowStockCount - next.lowStock;
      parts.push(`restock ${needed} supply item${needed > 1 ? 's' : ''}`);
    }
    if (parts.length > 0) {
      toNextStar = `To reach ${stars + 1} stars: ${parts.join(' and ')}`;
    }
  }

  return {
    stars,
    color: STAR_COLORS[stars],
    label: STAR_LABELS[stars],
    message: STAR_MESSAGES[stars],
    toNextStar,
    overdueCount,
    lowStockCount,
  };
}

function dueLabel(daysFromToday: number): { text: string; color: string } {
  if (daysFromToday < 0) {
    return {
      text: formatDueDateShort(daysFromToday),
      color: Colors.urgencyRed,
    };
  }
  if (daysFromToday === 0) return { text: 'Due today', color: Colors.urgencyOrange };
  if (daysFromToday === 1) return { text: 'Due tomorrow', color: Colors.urgencyOrange };
  if (daysFromToday <= 7) return { text: formatDueDateShort(daysFromToday), color: Colors.urgencyAmber };
  return { text: formatDueDateShort(daysFromToday), color: Colors.urgencyGray };
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const currentUser = useAppStore((s) => s.currentUser);
  const pendingAlertTaskIds = useAppStore((s) => s.pendingAlertTaskIds);
  const clearPendingAlertTaskIds = useAppStore((s) => s.clearPendingAlertTaskIds);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [householdName, setHouseholdName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [urgentTasks, setUrgentTasks] = useState<Task[]>([]);
  const [showAlert, setShowAlert] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      setLoading(true);
      Promise.all([
        getTasks(householdId),
        getProducts(householdId),
        getHousehold(householdId),
      ])
        .then(([t, p, h]) => {
          if (cancelled) return;
          setTasks(t);
          setProducts(p);
          setHouseholdName(h?.name ?? '');
          setLoading(false);

          const now = new Date();
          const urgent = t.filter((task) => {
            if (task.completedToday) return false;
            if (
              task.snoozedUntil &&
              task.snoozedUntil.getTime() > now.getTime()
            ) {
              return false;
            }
            return differenceInCalendarDays(task.nextDueDate, now) <= 0;
          });
          if (urgent.length > 0) {
            setUrgentTasks(urgent);
            setShowAlert(true);
          } else {
            setUrgentTasks([]);
            setShowAlert(false);
          }
        })
        .catch((e) => {
          if (cancelled) return;
          console.warn('[HomeScreen] load failed:', e);
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [householdId])
  );

  // Handle pending alert task IDs from notifications or expired snoozes
  useEffect(() => {
    if (pendingAlertTaskIds.length === 0 || tasks.length === 0) return;

    // Find the tasks that match the pending IDs
    const pendingTasks = tasks.filter(
      (t) => pendingAlertTaskIds.includes(t.id) && !t.completedToday
    );

    if (pendingTasks.length > 0) {
      // Merge with existing urgent tasks (avoiding duplicates)
      setUrgentTasks((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const newTasks = pendingTasks.filter((t) => !existingIds.has(t.id));
        return [...prev, ...newTasks];
      });
      setShowAlert(true);
    }

    // Clear the pending IDs after processing
    clearPendingAlertTaskIds();
  }, [pendingAlertTaskIds, tasks, clearPendingAlertTaskIds]);

  const today = new Date();
  const firstName = getFirstName(
    currentUser?.displayName && !currentUser.displayName.includes('@')
      ? currentUser.displayName
      : null
  );
  const rating = calculateStarRating(tasks, products);

  const starAnims = useRef(
    [0, 1, 2, 3, 4].map(() => new Animated.Value(0.5))
  ).current;
  useEffect(() => {
    starAnims.forEach((a) => a.setValue(0.5));
    Animated.stagger(
      100,
      starAnims.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [rating.stars, starAnims]);

  const removeUrgent = (taskId: string) => {
    setUrgentTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId);
      if (next.length === 0) setShowAlert(false);
      return next;
    });
  };

  const handleAlertComplete = async (
    task: Task,
    completionNote?: string,
    remindNextTime?: boolean
  ) => {
    if (!householdId || !currentUser) return;
    console.log('[HomeScreen] Completing task with note:', {
      taskId: task.id,
      completionNote,
      remindNextTime,
    });
    const displayName =
      currentUser.displayName && !currentUser.displayName.includes('@')
        ? currentUser.displayName
        : 'You';
    try {
      await completeTask(householdId, task.id, currentUser.uid, undefined, {
        completionNote: completionNote ?? '',
        remindNextTime: remindNextTime ?? false,
        displayName,
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, completedToday: true, completedAt: new Date() }
            : t
        )
      );
      removeUrgent(task.id);
    } catch (e) {
      console.warn('[HomeScreen] completeTask failed:', e);
    }
  };

  const handleAlertSnooze = async (
    task: Task,
    amount: number,
    unit: SnoozeUnit
  ) => {
    if (!householdId || !currentUser) return;
    const snoozeDate =
      unit === 'minutes'
        ? new Date(Date.now() + amount * 60 * 1000)
        : unit === 'hours'
          ? new Date(Date.now() + amount * 60 * 60 * 1000)
          : (() => {
              const d = new Date();
              d.setDate(d.getDate() + amount);
              d.setHours(9, 0, 0, 0);
              return d;
            })();

    try {
      // Schedule snooze notification (cancels any existing one first)
      const notificationId = await scheduleSnoozeNotification(
        task,
        snoozeDate,
        householdId
      );

      // Save snooze time and notification ID to Firestore
      await snoozeTask(householdId, task.id, snoozeDate, notificationId);

      // Reschedule regular task reminders
      const allTasks = await getTasks(householdId);
      const prefs = await getNotificationPrefs(currentUser.uid);
      if (prefs.enabled) {
        await scheduleAllTaskReminders(
          allTasks,
          householdId,
          prefs.timing,
          prefs.reminderHour,
          prefs.reminderMinute
        );
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, snoozedUntil: snoozeDate, pendingNotificationId: notificationId }
            : t
        )
      );
      removeUrgent(task.id);
    } catch (e) {
      console.warn('[HomeScreen] snooze failed:', e);
    }
  };

  const handleAlertOpen = (task: Task) => {
    setShowAlert(false);
    navigation.navigate('TaskDetail', { taskId: task.id });
  };

  const handleAlertDismissAndSnooze = async (task: Task) => {
    // Close the modal immediately, then snooze the current task to tomorrow
    // 9:00am via the existing snooze pipeline (also reschedules notifications).
    setShowAlert(false);
    try {
      await handleAlertSnooze(task, 1, 'days');
      setToastMessage('Snoozed until tomorrow');
    } catch (e) {
      console.warn('[HomeScreen] dismiss-and-snooze failed:', e);
    }
  };

  const taskAttention = tasks.filter(
    (t) =>
      !t.completedToday && differenceInCalendarDays(t.nextDueDate, today) <= 7
  ).length;

  const lowStock = products.filter(
    (p) => stockPercent(p) <= p.lowThresholdPercent
  );
  const outOfStock = products.filter((p) => p.currentQuantity <= 0);

  const upNext = [...tasks]
    .filter((t) => !t.completedToday)
    .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
    .slice(0, 3);

  const recentlyCompleted = [...tasks]
    .filter((t) => t.completedToday || isCompletedToday(t.lastCompletedAt))
    .sort((a, b) => {
      const aTime = (a.completedAt ?? a.lastCompletedAt)?.getTime() ?? 0;
      const bTime = (b.completedAt ?? b.lastCompletedAt)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <UserAvatar />
        </View>
        <Text style={styles.headerTitle}>TaskMate</Text>
        <View style={[styles.headerSide, styles.headerSideRight]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            {greetingFor(today)}, {firstName}!
          </Text>
          {householdName ? (
            <Text style={styles.householdName}>{householdName}</Text>
          ) : null}
          <Text style={styles.greetingDate}>
            {format(today, 'EEEE, MMMM d')}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Household Score */}
            <View
              style={[styles.healthCard, { borderLeftColor: rating.color }]}
            >
              <Text style={styles.healthTitle}>Household Score</Text>

              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const earned = n <= rating.stars;
                  return (
                    <Animated.Text
                      key={n}
                      style={[
                        styles.star,
                        {
                          color: earned ? rating.color : Colors.border,
                          transform: [{ scale: starAnims[n - 1] }],
                        },
                      ]}
                    >
                      {earned ? '★' : '☆'}
                    </Animated.Text>
                  );
                })}
              </View>

              <Text style={[styles.ratingLabel, { color: rating.color }]}>
                {rating.label}
              </Text>
              <Text style={styles.ratingMessage}>{rating.message}</Text>

              {rating.toNextStar ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Tasks')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.toNextStar}>{rating.toNextStar}</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.statPillRow}>
                <View
                  style={[
                    styles.statPill,
                    rating.overdueCount > 0
                      ? styles.statPillRed
                      : styles.statPillGreen,
                  ]}
                >
                  <Text style={styles.statPillText}>
                    {rating.overdueCount} overdue
                  </Text>
                </View>
                <View
                  style={[
                    styles.statPill,
                    rating.lowStockCount > 0
                      ? styles.statPillRed
                      : styles.statPillGreen,
                  ]}
                >
                  <Text style={styles.statPillText}>
                    {rating.lowStockCount} low stock
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick stats */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.navigate('Tasks')}
                activeOpacity={0.8}
              >
                <Text style={styles.statTitle}>📋 Tasks</Text>
                <Text style={styles.statBig}>{taskAttention}</Text>
                <Text style={styles.statSub}>need attention</Text>
                {rating.overdueCount > 0 ? (
                  <Text style={styles.statRed}>
                    {rating.overdueCount} overdue
                  </Text>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.navigate('Supplies')}
                activeOpacity={0.8}
              >
                <Text style={styles.statTitle}>🛒 Supplies</Text>
                <Text style={styles.statBig}>{lowStock.length}</Text>
                <Text style={styles.statSub}>low stock</Text>
                {outOfStock.length > 0 ? (
                  <Text style={styles.statRed}>
                    {outOfStock.length} out of stock
                  </Text>
                ) : null}
              </TouchableOpacity>
            </View>

            {/* Up Next */}
            <View style={styles.sectionPillRow}>
              <View style={[styles.sectionPill, styles.sectionPillTeal]}>
                <Text style={styles.sectionPillText}>
                  UP NEXT • {upNext.length}
                </Text>
              </View>
            </View>
            <View style={styles.listCard}>
              {upNext.length === 0 ? (
                <Text style={styles.emptyRow}>🎉 No upcoming tasks</Text>
              ) : (
                upNext.map((t, idx) => {
                  const days = differenceInCalendarDays(t.nextDueDate, today);
                  const due = dueLabel(days);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() =>
                        navigation.navigate('TaskDetail', { taskId: t.id })
                      }
                      activeOpacity={0.7}
                      style={[
                        styles.taskRow,
                        idx < upNext.length - 1 && styles.taskRowDivider,
                      ]}
                    >
                      <Text style={styles.taskRowIcon}>{t.icon ?? '📋'}</Text>
                      <Text style={styles.taskRowName} numberOfLines={1}>
                        {t.name}
                      </Text>
                      <Text style={[styles.taskRowDue, { color: due.color }]}>
                        {due.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
              {upNext.length > 0 ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Tasks')}
                  activeOpacity={0.7}
                  style={styles.seeAllRow}
                >
                  <Text style={styles.seeAllText}>See all tasks →</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Recently Completed */}
            {recentlyCompleted.length > 0 ? (
              <>
                <View style={styles.sectionPillRow}>
                  <View style={[styles.sectionPill, styles.sectionPillGray]}>
                    <Text style={styles.sectionPillText}>
                      RECENTLY COMPLETED • {recentlyCompleted.length}
                    </Text>
                  </View>
                </View>
                <View style={styles.listCard}>
                  {recentlyCompleted.map((t, idx) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.taskRow,
                        idx < recentlyCompleted.length - 1 &&
                          styles.taskRowDivider,
                      ]}
                      onPress={() =>
                        navigation.navigate('CompletedTaskDetail', {
                          taskId: t.id,
                          task: serializeTask(t),
                        })
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.taskRowIcon}>✅</Text>
                      <View style={styles.completedMain}>
                        <Text
                          style={[styles.taskRowName, styles.taskRowNameDone]}
                          numberOfLines={1}
                        >
                          {t.name}
                        </Text>
                        {(t.lastCompletedByName || t.lastCompletedBy) ? (
                          <Text style={styles.completedBy}>
                            Completed by {getFirstName(
                              t.lastCompletedByName && !t.lastCompletedByName.includes('@')
                                ? t.lastCompletedByName
                                : currentUser?.displayName && !currentUser.displayName.includes('@')
                                  ? currentUser.displayName
                                  : 'You'
                            )}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <TaskAlertModal
        tasks={urgentTasks}
        visible={showAlert && urgentTasks.length > 0}
        onComplete={handleAlertComplete}
        onSnooze={handleAlertSnooze}
        onSnoozeUntilTomorrow={handleAlertDismissAndSnooze}
        onOpenTask={handleAlertOpen}
        onDismiss={() => setShowAlert(false)}
      />
      <Toast
        message={toastMessage}
        onDone={() => setToastMessage(null)}
      />
    </View>
  );
}

function isCompletedToday(d: Date | null): boolean {
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  safeTop: {
    backgroundColor: Colors.headerBackground,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: Colors.headerBackground,
  },
  headerSide: {
    width: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  greetingBlock: {
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  householdName: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  greetingDate: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 4,
  },
  loadingBlock: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  healthCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    borderLeftWidth: 4,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
  healthTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  star: {
    fontSize: 44,
    lineHeight: 52,
    marginHorizontal: 2,
  },
  ratingLabel: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  ratingMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  toNextStar: {
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.textMuted,
    marginTop: 8,
  },
  statPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statPillRed: {
    backgroundColor: Colors.urgencyRed,
  },
  statPillGreen: {
    backgroundColor: Colors.urgencyGreen,
  },
  statPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  statTitle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  statBig: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -1,
  },
  statSub: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  statRed: {
    ...Typography.caption,
    color: Colors.urgencyRed,
    fontWeight: '700',
    marginTop: 4,
  },
  sectionPillRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 12,
  },
  sectionPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sectionPillTeal: {
    backgroundColor: Colors.primary,
  },
  sectionPillRed: {
    backgroundColor: Colors.urgencyRed,
  },
  sectionPillGray: {
    backgroundColor: Colors.textMuted,
  },
  sectionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  listCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  taskRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  taskRowIcon: {
    fontSize: 20,
  },
  taskRowName: {
    flex: 1,
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  taskRowNameDone: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    fontWeight: '500',
  },
  taskRowDue: {
    ...Typography.small,
    fontWeight: '700',
  },
  completedMain: {
    flex: 1,
  },
  completedBy: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  emptyRow: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  seeAllRow: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  seeAllText: {
    ...Typography.bodyBold,
    color: Colors.primary,
  },
});
