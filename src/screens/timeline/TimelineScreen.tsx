import { useCallback, useMemo, useState } from 'react';
import {
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
import { seedDummyTasks } from '../../utils/seedTasks';
import { Task } from '../../types/models';
import UserAvatar from '../../components/UserAvatar';
import { Colors } from '../../constants/colors';
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
          <Text style={styles.taskMeta}>
            {task.category}
            {task.location ? ` • ${task.location}` : ''}
          </Text>
          {assignedToMe ? (
            <Text style={styles.assignedToMe}>👤 Assigned to you</Text>
          ) : assignedToOther ? (
            <Text style={styles.assignedToOther}>
              👤 {task.assignedToName ?? task.assignedTo}
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
  const headerStyle =
    variant === 'attention'
      ? [styles.sectionHeader, styles.headerAttention]
      : variant === 'soon'
        ? [styles.sectionHeader, styles.headerSoon]
        : [styles.sectionHeader, styles.headerLater];
  const textStyle =
    variant === 'attention'
      ? styles.headerAttentionText
      : variant === 'soon'
        ? styles.headerSoonText
        : styles.headerLaterText;

  const content = (
    <View style={styles.sectionHeaderRow}>
      <Text style={[styles.sectionHeaderText, textStyle]}>
        {title}
        {count > 0 ? ` (${count})` : ''}
      </Text>
      {collapsible ? (
        <Text style={[styles.chevron, textStyle]}>{expanded ? '▼' : '▶'}</Text>
      ) : null}
    </View>
  );

  if (!collapsible) return <View style={headerStyle}>{content}</View>;

  return (
    <TouchableOpacity
      style={headerStyle}
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
  const [seeding, setSeeding] = useState(false);
  const [showAttention, setShowAttention] = useState(true);
  const [showSoon, setShowSoon] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');

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
        .then((result) => {
          if (cancelled || !result) return;
          setTasks(result);
          setLoading(false);
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
    }, [householdId])
  );

  const handleSeed = async () => {
    if (!householdId || !currentUser || seeding) return;
    setSeeding(true);
    setError(null);
    try {
      await seedDummyTasks(
        householdId,
        currentUser.email ?? currentUser.uid,
        currentUser.uid,
        currentUser.displayName ?? currentUser.email ?? currentUser.uid
      );
      const fresh = await getTasks(householdId);
      setTasks(fresh);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? String(e));
    } finally {
      setSeeding(false);
    }
  };

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
        <Text style={styles.title}>TaskMate</Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddTask')}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        {Header}
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (tasks.length === 0) {
    return (
      <View style={styles.container}>
        {Header}
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏠</Text>
          <Text style={styles.emptyText}>
            No tasks yet. Tap + to add your first task.
          </Text>

          {seeding ? (
            <View style={styles.seedLoading}>
              <ActivityIndicator size="large" />
              <Text style={styles.seedLoadingText}>
                Loading demo tasks... (this may take 30 seconds)
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.seedButton}
              onPress={handleSeed}
              activeOpacity={0.8}
              disabled={!currentUser}
            >
              <Text style={styles.seedButtonText}>🌱 Load Demo Data</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const currentUserId = currentUser?.uid ?? null;

  return (
    <View style={styles.container}>
      {Header}
      <ScrollView contentContainerStyle={styles.listContent}>
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
          title="⚠️ Needs Attention"
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
              title="📅 Coming Up Soon"
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
              title="🔮 Coming Up Later"
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
    paddingTop: 0,
    backgroundColor: Colors.headerBackground,
  },
  headerSide: {
    width: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: Colors.textOnDark,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  seedButton: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.urgencyGreen,
    backgroundColor: '#F0FDF4',
  },
  seedButtonText: {
    color: Colors.urgencyGreen,
    fontSize: 15,
    fontWeight: '600',
  },
  seedLoading: {
    marginTop: 24,
    alignItems: 'center',
  },
  seedLoadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chevron: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerAttention: {
    backgroundColor: Colors.needsAttentionBg,
  },
  headerAttentionText: {
    color: Colors.needsAttentionText,
  },
  headerSoon: {
    backgroundColor: Colors.comingSoonBg,
  },
  headerSoonText: {
    color: Colors.comingSoonText,
  },
  headerLater: {
    backgroundColor: Colors.comingLaterBg,
  },
  headerLaterText: {
    color: Colors.comingLaterText,
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
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardCompleted: {
    opacity: 0.7,
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
    fontSize: 17,
    fontWeight: '700',
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
