import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { differenceInCalendarDays } from 'date-fns';
import { useAppStore } from '../../stores/appStore';
import { getTasks, resetCompletedToday } from '../../services/taskService';
import {
  cancelAllReminders,
  getNotificationPrefs,
  scheduleAllTaskReminders,
} from '../../services/notificationService';
import { Task } from '../../types/models';
import UserAvatar from '../../components/UserAvatar';
import FAB from '../../components/FAB';
import TaskTypeSheet from '../../components/TaskTypeSheet';
import { getFirstName } from '../../utils/nameUtils';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { SafeAreaView } from 'react-native-safe-area-context';

type Urgency = 'overdue' | 'soon' | 'amber' | 'mid' | 'far' | 'completed';

const URGENCY: Record<Urgency, { color: string; bg: string }> = {
  overdue: { color: Colors.urgencyRed, bg: Colors.needsAttentionBg },
  soon: { color: Colors.urgencyOrange, bg: Colors.cardBackground },
  amber: { color: Colors.urgencyAmber, bg: Colors.cardBackground },
  mid: { color: Colors.urgencyBlue, bg: Colors.cardBackground },
  far: { color: Colors.urgencyGray, bg: Colors.cardBackground },
  completed: { color: Colors.urgencyGreen, bg: '#F0FFF4' },
};

function urgencyFor(days: number): Exclude<Urgency, 'completed'> {
  if (days < 0) return 'overdue';
  if (days <= 1) return 'soon';
  if (days <= 7) return 'amber';
  if (days <= 30) return 'mid';
  return 'far';
}

function dueLabel(days: number): string {
  if (days < 0) {
    const overdueBy = Math.abs(days);
    return `OVERDUE by ${overdueBy} ${overdueBy === 1 ? 'day' : 'days'}`;
  }
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 13) return `In ${days} days`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `In ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  const months = Math.floor(days / 30);
  return `In ${months} ${months === 1 ? 'month' : 'months'}`;
}

function TaskCard({
  task,
  currentUserId,
  onPress,
}: {
  task: Task;
  currentUserId: string | null;
  onPress: () => void;
}) {
  const days = differenceInCalendarDays(task.nextDueDate, new Date());
  const completed = task.completedToday;
  const palette = completed ? URGENCY.completed : URGENCY[urgencyFor(days)];
  const label = completed ? '✅ Completed today' : dueLabel(days);
  const isOverdue = !completed && days < 0;

  const assignedToMe = !!task.assignedTo && task.assignedTo === currentUserId;
  const assignedToOther = !!task.assignedTo && task.assignedTo !== currentUserId;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { borderLeftColor: palette.color, backgroundColor: palette.bg },
        completed && styles.cardCompleted,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {isOverdue ? (
        <View style={styles.overdueOverlay} pointerEvents="none" />
      ) : null}
      <View style={styles.cardDueRow}>
        <Text style={[styles.dueLabel, { color: palette.color }]}>{label}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.taskIcon}>{task.icon ?? '📋'}</Text>
        <View style={styles.cardBodyText}>
          <Text
            style={[
              styles.taskName,
              completed && styles.taskNameCompleted,
            ]}
          >
            {task.name}
          </Text>
          {assignedToMe ? (
            <Text style={styles.assignedToMe}>👤 Assigned to you</Text>
          ) : assignedToOther ? (
            <Text style={styles.assignedToOther}>
              👤 {getFirstName(task.assignedToName ?? task.assignedTo)}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface SectionHeaderProps {
  title: string;
  count: number;
  variant: 'attention' | 'soon' | 'later';
  collapsible: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

function SectionHeader({
  title,
  count,
  variant,
  collapsible,
  expanded,
  onToggle,
}: SectionHeaderProps) {
  const pillBg =
    variant === 'attention'
      ? styles.pillAttention
      : variant === 'soon'
        ? styles.pillSoon
        : styles.pillLater;

  const content = (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionPill, pillBg]}>
        <Text style={styles.sectionPillText}>
          {title}
          {count > 0 ? ` • ${count}` : ''}
        </Text>
      </View>
      {collapsible ? (
        <Text style={styles.chevron}>{expanded ? '▼' : '▶'}</Text>
      ) : null}
    </View>
  );

  if (!collapsible) return <View style={styles.sectionWrap}>{content}</View>;

  return (
    <TouchableOpacity
      style={styles.sectionWrap}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      {content}
    </TouchableOpacity>
  );
}

export default function TimelineScreen() {
  const navigation = useNavigation<any>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const currentUser = useAppStore((s) => s.currentUser);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAttention, setShowAttention] = useState(true);
  const [showSoon, setShowSoon] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  const openSuggested = () => {
    setSheetOpen(false);
    navigation.navigate('SetupWizard', { mode: 'fromTasks' });
  };
  const openCustom = () => {
    setSheetOpen(false);
    navigation.navigate('AddTask');
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

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      setLoading(true);
      setError(null);
      resetCompletedToday(householdId)
        .catch((e) => {
          console.warn('[TimelineScreen] resetCompletedToday failed:', e);
        })
        .then(() => getTasks(householdId))
        .then(async (result) => {
          if (cancelled || !result) return;
          setTasks(result);
          setLoading(false);
          if (currentUser?.uid) {
            try {
              const prefs = await getNotificationPrefs(currentUser.uid);
              if (prefs.enabled) {
                await scheduleAllTaskReminders(
                  result,
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
        })
        .catch((e) => {
          if (cancelled) return;
          const err = e as { code?: string; message?: string };
          setError(err.message ?? String(e));
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [householdId, currentUser?.uid])
  );

  const filteredTasks = useMemo(() => {
    if (filter === 'mine' && currentUser?.uid) {
      return tasks.filter((t) => t.assignedTo === currentUser.uid);
    }
    return tasks;
  }, [tasks, filter, currentUser?.uid]);

  const buckets = useMemo(() => {
    const today = new Date();
    const active: Task[] = [];
    const completed: Task[] = [];
    const comingUpSoon: Task[] = [];
    const comingUpLater: Task[] = [];
    for (const task of filteredTasks) {
      if (task.completedToday) {
        completed.push(task);
        continue;
      }
      const days = differenceInCalendarDays(task.nextDueDate, today);
      if (days <= 7) active.push(task);
      else if (days <= 30) comingUpSoon.push(task);
      else comingUpLater.push(task);
    }
    active.sort(
      (a, b) =>
        differenceInCalendarDays(a.nextDueDate, today) -
        differenceInCalendarDays(b.nextDueDate, today)
    );
    return {
      needsAttention: [...active, ...completed],
      comingUpSoon,
      comingUpLater,
    };
  }, [filteredTasks]);

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

  const currentUserId = currentUser?.uid ?? null;

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  } else if (tasks.length === 0) {
    body = (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📋</Text>
        <Text style={styles.emptyTitle}>No tasks yet</Text>
        <Text style={styles.emptySubtext}>
          Get started by adding your first task
        </Text>
        <TouchableOpacity
          style={styles.emptyPrimaryButton}
          onPress={() => setSheetOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.emptyPrimaryText}>＋ Add a Task</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.listContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
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

        <SectionHeader
          title="NEEDS ATTENTION"
          count={buckets.needsAttention.length}
          variant="attention"
          collapsible
          expanded={showAttention}
          onToggle={() => setShowAttention((s) => !s)}
        />
        {showAttention &&
          (buckets.needsAttention.length === 0 ? (
            <View style={styles.emptyAttention}>
              <Text style={styles.emptyAttentionText}>
                🎉 You're all caught up!
              </Text>
            </View>
          ) : (
            buckets.needsAttention.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                currentUserId={currentUserId}
                onPress={() =>
                  navigation.navigate('TaskDetail', { taskId: t.id })
                }
              />
            ))
          ))}

        {buckets.comingUpSoon.length > 0 && (
          <>
            <SectionHeader
              title="COMING UP SOON"
              count={buckets.comingUpSoon.length}
              variant="soon"
              collapsible
              expanded={showSoon}
              onToggle={() => setShowSoon((s) => !s)}
            />
            {showSoon &&
              buckets.comingUpSoon.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  currentUserId={currentUserId}
                  onPress={() =>
                    navigation.navigate('TaskDetail', { taskId: t.id })
                  }
                />
              ))}
          </>
        )}

        {buckets.comingUpLater.length > 0 && (
          <>
            <SectionHeader
              title="COMING UP LATER"
              count={buckets.comingUpLater.length}
              variant="later"
              collapsible
              expanded={showLater}
              onToggle={() => setShowLater((s) => !s)}
            />
            {showLater &&
              buckets.comingUpLater.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  currentUserId={currentUserId}
                  onPress={() =>
                    navigation.navigate('TaskDetail', { taskId: t.id })
                  }
                />
              ))}
          </>
        )}
      </ScrollView>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
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
    paddingTop: 0,
    backgroundColor: Colors.headerBackground,
  },
  headerSide: {
    width: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
    gap: 8,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
    paddingHorizontal: 16,
  },
  emptyPrimaryButton: {
    alignSelf: 'stretch',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
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
  sectionWrap: {
    marginTop: 20,
    marginBottom: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sectionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  pillAttention: {
    backgroundColor: Colors.urgencyRed,
  },
  pillSoon: {
    backgroundColor: Colors.primary,
  },
  pillLater: {
    backgroundColor: Colors.textMuted,
  },
  chevron: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  emptyAttention: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyAttentionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.urgencyGreen,
  },
  card: {
    borderRadius: 16,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
  },
  cardCompleted: {
    opacity: 0.7,
  },
  overdueOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(229,62,62,0.03)',
  },
  cardDueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  calendarIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  dueLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  cardBodyText: {
    flex: 1,
  },
  taskName: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  assignedToMe: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 4,
  },
  assignedToOther: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
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
});
