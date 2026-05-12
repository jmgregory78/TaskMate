import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  differenceInCalendarDays,
  format,
  startOfDay,
} from 'date-fns';
import { useAppStore } from '../../stores/appStore';
import {
  resetCompletedToday,
  subscribeToTasks,
} from '../../services/taskService';
import {
  getProducts,
  getProductUsagesForTask,
} from '../../services/productService';
import {
  cancelAllReminders,
  getNotificationPrefs,
  scheduleAllTaskReminders,
} from '../../services/notificationService';
import { Product, serializeTask, Task, TaskProductUsage } from '../../types/models';
import { recurrenceShortLabel } from '../../utils/recurrence';
import { formatDaysUntilDue } from '../../utils/dateUtils';
import UserAvatar from '../../components/UserAvatar';
import FAB from '../../components/FAB';
import TaskTypeSheet from '../../components/TaskTypeSheet';
import CompletionNoteModal from '../../components/CompletionNoteModal';
import { updateTask } from '../../services/taskService';
import { Colors } from '../../constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

// Types for section list
interface TimelineTask {
  task: Task;
  hasLowStockSupply: boolean;
  isCompletedToday?: boolean;
}

interface TimelineSection {
  key: string;
  title: string;
  variant: 'attention' | 'week' | 'month' | 'future' | 'completedToday';
  data: TimelineTask[];
}

// Helper to check if a product is low stock
function isLowStock(product: Product): boolean {
  let thresholdQty: number;
  if (product.lowThresholdQty !== null && product.lowThresholdQty !== undefined) {
    thresholdQty = product.lowThresholdQty;
  } else {
    // For percentage threshold, use current quantity as base (will always be at threshold)
    // This is a fallback - ideally maxQuantity from history should be used
    thresholdQty = Math.max(1, (product.lowThresholdPercent / 100) * product.currentQuantity);
  }
  return product.currentQuantity <= thresholdQty;
}

// Date chip component
function DateChip({ days }: { days: number }) {
  let label: string;
  let style: object;

  if (days < 0) {
    label = formatDaysUntilDue(days);
    style = styles.chipOverdue;
  } else if (days === 0) {
    label = 'Due Today';
    style = styles.chipToday;
  } else {
    label = formatDaysUntilDue(days);
    style = styles.chipFuture;
  }

  return (
    <View style={[styles.chip, style]}>
      <Text style={[styles.chipText, days < 0 && styles.chipTextOverdue, days === 0 && styles.chipTextToday]}>
        {label}
      </Text>
    </View>
  );
}

// Task Card component
function TaskCard({
  item,
  onPress,
  onNotePress,
  isNeedsAttention,
  isCompletedToday,
}: {
  item: TimelineTask;
  onPress: () => void;
  onNotePress?: () => void;
  isNeedsAttention: boolean;
  isCompletedToday?: boolean;
}) {
  const { task, hasLowStockSupply } = item;
  const today = startOfDay(new Date());
  const days = differenceInCalendarDays(task.nextDueDate, today);
  const isOverdue = days < 0 && !isCompletedToday;
  const isCompleted = isCompletedToday ?? false;

  const borderColor = isCompleted
    ? Colors.successBorder
    : isOverdue
      ? Colors.urgencyRed
      : isNeedsAttention
        ? Colors.primary
        : Colors.border;

  const hasNote = !!(task.lastCompletionNote && task.lastCompletionNote.trim());

  const cardContent = (
    <View style={styles.cardContent}>
      {/* Icon box */}
      <View style={[styles.iconBox, isCompleted && styles.iconBoxCompleted]}>
        <Text style={styles.iconText}>{task.icon ?? '📋'}</Text>
      </View>

      {/* Main content */}
      <View style={styles.cardMain}>
        <View style={styles.cardTopRow}>
          <View style={styles.taskNameRow}>
            <Text
              style={[styles.taskName, isCompleted && styles.taskNameCompleted]}
              numberOfLines={1}
            >
              {task.name}
            </Text>
            {hasLowStockSupply && !isCompleted && (
              <Text style={styles.lowStockIndicator}>🔸</Text>
            )}
          </View>
          {!isCompleted && <DateChip days={days} />}
          {isCompleted && (
            <View style={[styles.chip, styles.chipCompleted]}>
              <Text style={styles.chipTextCompleted}>Done ✓</Text>
            </View>
          )}
        </View>
        <Text style={styles.recurrenceText}>
          {recurrenceShortLabel(task.recurrence)}
        </Text>
        {/* Note link for completed tasks */}
        {isCompleted && onNotePress && (
          <TouchableOpacity
            style={styles.noteLink}
            onPress={(e) => {
              e.stopPropagation();
              onNotePress();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Text style={styles.noteLinkText}>
              {hasNote ? '📝 View note' : '+ Add a note'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // Completed tasks navigate to read-only detail view
  if (isCompleted) {
    return (
      <TouchableOpacity
        style={[
          styles.card,
          styles.cardCompletedToday,
          { borderLeftColor: borderColor },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { borderLeftColor: borderColor },
        isOverdue && styles.cardOverdue,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {cardContent}
    </TouchableOpacity>
  );
}

// Section header component
function TimelineSectionHeader({ section }: { section: TimelineSection }) {
  const isAttention = section.variant === 'attention';
  const isCompletedToday = section.variant === 'completedToday';

  return (
    <View style={[styles.sectionHeader, isCompletedToday && styles.sectionHeaderCompletedToday]}>
      {/* Divider above for completedToday section */}
      {isCompletedToday && <View style={styles.sectionDivider} />}
      <View style={styles.sectionHeaderContent}>
        {isAttention && <View style={styles.redDot} />}
        <Text style={[
          styles.sectionHeaderText,
          isCompletedToday && styles.sectionHeaderTextCompleted,
        ]}>
          {section.title}
        </Text>
      </View>
      {/* Divider below for other sections */}
      {!isCompletedToday && <View style={styles.sectionDivider} />}
    </View>
  );
}

// All caught up card
function AllCaughtUpCard() {
  return (
    <View style={styles.caughtUpCard}>
      <Text style={styles.caughtUpIcon}>✓</Text>
      <Text style={styles.caughtUpText}>You're all caught up!</Text>
    </View>
  );
}

// Empty state component
function EmptyState({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>📋</Text>
      <Text style={styles.emptyTitle}>No tasks yet</Text>
      <Text style={styles.emptySubtext}>
        Tap + to add your first task or use Suggested Tasks to get started quickly
      </Text>
      <TouchableOpacity
        style={styles.getStartedButton}
        onPress={onGetStarted}
        activeOpacity={0.85}
      >
        <Text style={styles.getStartedText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TimelineScreen() {
  const navigation = useNavigation<any>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const currentUser = useAppStore((s) => s.currentUser);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taskUsages, setTaskUsages] = useState<Map<string, TaskProductUsage[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [noteModalTask, setNoteModalTask] = useState<Task | null>(null);

  const openSuggested = () => {
    setSheetOpen(false);
    navigation.navigate('SuggestedTasks');
  };
  const openCustom = () => {
    setSheetOpen(false);
    navigation.navigate('AddTask');
  };

  // Note modal handlers
  const handleNoteSave = async (note: string, remindNextTime: boolean) => {
    if (!noteModalTask || !householdId) {
      setNoteModalTask(null);
      return;
    }
    try {
      await updateTask(householdId, noteModalTask.id, {
        lastCompletionNote: note.trim() || undefined,
        nextTimeReminder: remindNextTime ? note.trim() : undefined,
      });
    } catch (e) {
      console.warn('[TimelineScreen] save note failed:', e);
    }
    setNoteModalTask(null);
  };

  const handleNoteSkip = () => {
    setNoteModalTask(null);
  };

  const fabScale = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const goingDown = y > lastScrollY.current + 1;
    const goingUp = y < lastScrollY.current - 1;
    lastScrollY.current = y;
    if (goingDown || goingUp) {
      Animated.spring(fabScale, {
        toValue: goingDown ? 0.85 : 1,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }).start();
    }
  };

  // Load products and usages
  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;

    const loadProductData = async () => {
      try {
        const prods = await getProducts(householdId);
        if (cancelled) return;
        setProducts(prods);
      } catch (e) {
        console.warn('[TimelineScreen] getProducts failed:', e);
      }
    };

    loadProductData();
    return () => { cancelled = true; };
  }, [householdId]);

  // Load task usages when tasks change
  useEffect(() => {
    if (!householdId || tasks.length === 0) return;
    let cancelled = false;

    const loadUsages = async () => {
      const usageMap = new Map<string, TaskProductUsage[]>();
      await Promise.all(
        tasks.map(async (task) => {
          try {
            const usages = await getProductUsagesForTask(householdId, task.id);
            if (!cancelled) {
              usageMap.set(task.id, usages);
            }
          } catch (e) {
            // Ignore individual failures
          }
        })
      );
      if (!cancelled) {
        setTaskUsages(usageMap);
      }
    };

    loadUsages();
    return () => { cancelled = true; };
  }, [householdId, tasks]);

  // Real-time subscription to tasks
  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;

      setLoading(true);
      setError(null);

      // Reset completed today flags first
      resetCompletedToday(householdId).catch((e) => {
        console.warn('[TimelineScreen] resetCompletedToday failed:', e);
      });

      // Subscribe to real-time updates
      const unsubscribe = subscribeToTasks(
        householdId,
        async (newTasks) => {
          setTasks(newTasks);
          setLoading(false);

          // Schedule notifications
          if (currentUser?.uid) {
            try {
              const prefs = await getNotificationPrefs(currentUser.uid);
              if (prefs.enabled) {
                await scheduleAllTaskReminders(
                  newTasks,
                  householdId,
                  prefs.timing,
                  prefs.reminderHour,
                  prefs.reminderMinute
                );
              } else {
                await cancelAllReminders();
              }
            } catch (e) {
              console.warn('[TimelineScreen] schedule reminders failed:', e);
            }
          }
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );

      return unsubscribe;
    }, [householdId, currentUser?.uid])
  );

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (filter === 'mine' && currentUser?.uid) {
      return tasks.filter((t) => t.assignedTo === currentUser.uid);
    }
    return tasks;
  }, [tasks, filter, currentUser?.uid]);

  // Check if task has low stock supply
  const hasLowStockSupply = useCallback(
    (taskId: string): boolean => {
      const usages = taskUsages.get(taskId) || [];
      for (const usage of usages) {
        const product = products.find((p) => p.id === usage.productId);
        if (product && isLowStock(product)) {
          return true;
        }
      }
      return false;
    },
    [taskUsages, products]
  );

  // Build sections
  const sections = useMemo<TimelineSection[]>(() => {
    const today = startOfDay(new Date());
    const result: TimelineSection[] = [];

    // Separate tasks into buckets
    const needsAttention: TimelineTask[] = [];
    const completedToday: TimelineTask[] = [];
    const thisWeek: TimelineTask[] = [];
    const thisMonth: TimelineTask[] = [];
    const futureMonths = new Map<string, TimelineTask[]>();

    // Helper to check if a date is in the current calendar month
    const isCurrentMonth = (date: Date) =>
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    for (const task of filteredTasks) {
      const item: TimelineTask = {
        task,
        hasLowStockSupply: hasLowStockSupply(task.id),
        isCompletedToday: task.completedToday,
      };

      const days = differenceInCalendarDays(task.nextDueDate, today);

      // Tasks completed today: show in "COMPLETED TODAY" section
      if (task.completedToday) {
        completedToday.push(item);
      } else if (days <= 0) {
        // Overdue or due today (but not completed)
        needsAttention.push(item);
      } else if (days > 0 && days <= 7) {
        // This week (future)
        thisWeek.push(item);
      } else if (days > 7 && isCurrentMonth(task.nextDueDate)) {
        // This month (more than a week away, but still in current calendar month)
        thisMonth.push(item);
      } else if (days > 7) {
        // All future months - group by the task's actual due date month/year
        const dueDate = task.nextDueDate;
        const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
        if (!futureMonths.has(monthKey)) {
          futureMonths.set(monthKey, []);
        }
        futureMonths.get(monthKey)!.push(item);
      }
    }

    // Sort needs attention: most overdue first, then today
    needsAttention.sort((a, b) => {
      const daysA = differenceInCalendarDays(a.task.nextDueDate, today);
      const daysB = differenceInCalendarDays(b.task.nextDueDate, today);
      return daysA - daysB;
    });

    // Sort completed today: most recently completed first
    completedToday.sort((a, b) => {
      const aTime = a.task.completedAt?.getTime() ?? 0;
      const bTime = b.task.completedAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    // Always show Needs Attention section (even if empty for the "all caught up" message)
    result.push({
      key: 'attention',
      title: 'NEEDS ATTENTION',
      variant: 'attention',
      data: needsAttention,
    });

    // Show "COMPLETED TODAY" section if there are completed tasks
    if (completedToday.length > 0) {
      result.push({
        key: 'completedToday',
        title: 'COMPLETED TODAY',
        variant: 'completedToday',
        data: completedToday,
      });
    }

    // This Week (only if has tasks)
    if (thisWeek.length > 0) {
      thisWeek.sort((a, b) =>
        differenceInCalendarDays(a.task.nextDueDate, today) -
        differenceInCalendarDays(b.task.nextDueDate, today)
      );
      result.push({
        key: 'week',
        title: 'THIS WEEK',
        variant: 'week',
        data: thisWeek,
      });
    }

    // This Month (only if has tasks)
    if (thisMonth.length > 0) {
      thisMonth.sort((a, b) =>
        differenceInCalendarDays(a.task.nextDueDate, today) -
        differenceInCalendarDays(b.task.nextDueDate, today)
      );
      result.push({
        key: 'month',
        title: 'THIS MONTH',
        variant: 'month',
        data: thisMonth,
      });
    }

    // Future months
    const sortedMonthKeys = [...futureMonths.keys()].sort();
    for (const monthKey of sortedMonthKeys) {
      const monthTasks = futureMonths.get(monthKey)!;
      monthTasks.sort((a, b) =>
        differenceInCalendarDays(a.task.nextDueDate, today) -
        differenceInCalendarDays(b.task.nextDueDate, today)
      );
      // Parse month key to create proper date without timezone issues
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 1); // month is 0-indexed
      const monthLabel = format(monthDate, 'MMMM yyyy').toUpperCase();
      result.push({
        key: monthKey,
        title: monthLabel,
        variant: 'future',
        data: monthTasks,
      });
    }

    return result;
  }, [filteredTasks, hasLowStockSupply]);

  const Header = (
    <>
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <UserAvatar />
        </View>
        <Text style={styles.title}>Tasks</Text>
        <View style={[styles.headerSide, styles.headerSideRight]} />
      </View>
    </>
  );

  const renderSectionHeader = ({ section }: { section: TimelineSection }) => {
    // Don't render header if it's "needs attention" and empty (we show the caught up card instead)
    if (section.key === 'attention' && section.data.length === 0) {
      return null;
    }
    return <TimelineSectionHeader section={section} />;
  };

  const renderItem = ({ item, section }: { item: TimelineTask; section: TimelineSection }) => {
    const isCompletedToday = section.variant === 'completedToday';
    return (
      <TaskCard
        item={item}
        onPress={() => {
          if (isCompletedToday) {
            navigation.navigate('CompletedTaskDetail', { taskId: item.task.id, task: serializeTask(item.task) });
          } else {
            navigation.navigate('TaskDetail', { taskId: item.task.id });
          }
        }}
        onNotePress={isCompletedToday ? () => setNoteModalTask(item.task) : undefined}
        isNeedsAttention={section.variant === 'attention'}
        isCompletedToday={isCompletedToday}
      />
    );
  };

  const renderSectionFooter = ({ section }: { section: TimelineSection }) => {
    // Show "all caught up" only for empty needs attention section
    if (section.key === 'attention' && section.data.length === 0) {
      return <AllCaughtUpCard />;
    }
    return null;
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  } else if (tasks.length === 0) {
    body = <EmptyState onGetStarted={openSuggested} />;
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.task.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        contentContainerStyle={styles.listContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                filter === 'all' && styles.filterPillActive,
              ]}
              onPress={() => setFilter('all')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filter === 'all' && styles.filterPillTextActive,
                ]}
              >
                All Tasks
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterPill,
                filter === 'mine' && styles.filterPillActive,
              ]}
              onPress={() => setFilter('mine')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filter === 'mine' && styles.filterPillTextActive,
                ]}
              >
                Assigned to me
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      {Header}
      {body}
      <FAB onPress={() => setSheetOpen(true)} scrollScale={fabScale} />
      <TaskTypeSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSuggested={openSuggested}
        onCustom={openCustom}
      />
      <CompletionNoteModal
        visible={noteModalTask !== null}
        taskName={noteModalTask?.name ?? ''}
        taskIcon={noteModalTask?.icon}
        onSave={handleNoteSave}
        onSkip={handleNoteSkip}
      />
    </View>
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
  title: {
    flex: 1,
    color: Colors.textOnDark,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  filterPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterPillTextActive: {
    color: Colors.primary,
  },
  // Section header styles
  sectionHeader: {
    marginTop: 20,
    marginBottom: 12,
  },
  sectionHeaderCompletedToday: {
    marginTop: 28,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
  },
  sectionHeaderTextCompleted: {
    color: Colors.textLight,
    marginTop: 12,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.urgencyRed,
    marginRight: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  // Card styles
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 10,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardOverdue: {
    backgroundColor: Colors.needsAttentionBg,
  },
  cardCompleted: {
    opacity: 0.7,
  },
  cardCompletedToday: {
    opacity: 0.6,
    borderLeftColor: Colors.successBorder,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBoxCompleted: {
    backgroundColor: Colors.successBg,
  },
  iconText: {
    fontSize: 20,
  },
  cardMain: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  taskNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  taskName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  lowStockIndicator: {
    fontSize: 12,
    marginLeft: 4,
  },
  recurrenceText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  noteLink: {
    marginTop: 4,
  },
  noteLinkText: {
    color: '#6B7280',
    fontSize: 13,
  },
  // Chip styles
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipOverdue: {
    backgroundColor: Colors.urgencyRed,
  },
  chipToday: {
    backgroundColor: Colors.urgencyOrange,
  },
  chipFuture: {
    backgroundColor: Colors.border,
  },
  chipCompleted: {
    backgroundColor: Colors.successBg,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextOverdue: {
    color: Colors.textOnDark,
  },
  chipTextToday: {
    color: Colors.textOnDark,
  },
  chipTextCompleted: {
    color: Colors.successText,
    fontSize: 11,
    fontWeight: '600',
  },
  // Caught up card
  caughtUpCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 12,
  },
  caughtUpIcon: {
    fontSize: 32,
    color: Colors.primary,
    marginBottom: 8,
  },
  caughtUpText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.urgencyGreen,
  },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  getStartedButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  getStartedText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
});
