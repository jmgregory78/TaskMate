import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { differenceInCalendarDays } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Task } from '../types/models';
import { Colors } from '../constants/colors';
import { recurrenceSummary } from '../utils/recurrence';
import SnoozeSheet, { SnoozeUnit } from './SnoozeSheet';

interface Props {
  tasks: Task[];
  visible: boolean;
  onComplete: (task: Task) => void;
  onSnooze: (task: Task, amount: number, unit: SnoozeUnit) => void;
  onOpenTask: (task: Task) => void;
  onDismiss: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const PAGE_WIDTH = SCREEN_WIDTH - 32; // card has marginHorizontal: 16 each side

function urgencyFor(task: Task): {
  pillBg: string;
  pillLabel: string;
  dueLabel: string;
} {
  const days = differenceInCalendarDays(task.nextDueDate, new Date());
  if (days < 0) {
    const n = Math.abs(days);
    return {
      pillBg: '#E53E3E',
      pillLabel: '⚠️ OVERDUE',
      dueLabel: `Overdue by ${n} day${n === 1 ? '' : 's'}`,
    };
  }
  if (days === 0) {
    return {
      pillBg: Colors.primary,
      pillLabel: '🔔 DUE TODAY',
      dueLabel: 'Due today',
    };
  }
  return {
    pillBg: Colors.primary,
    pillLabel: '🔔 DUE SOON',
    dueLabel: days === 1 ? 'Due tomorrow' : `Due in ${days} days`,
  };
}

export default function TaskAlertModal({
  tasks,
  visible,
  onComplete,
  onSnooze,
  onOpenTask,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(-300);
      setIndex(0);
      setSnoozeOpen(false);
    }
  }, [visible, slideAnim]);

  // If the upstream tasks list shrinks (e.g., user completed/snoozed the
  // last one), keep the index in range.
  useEffect(() => {
    if (index >= tasks.length && tasks.length > 0) {
      setIndex(tasks.length - 1);
      scrollRef.current?.scrollTo({
        x: (tasks.length - 1) * PAGE_WIDTH,
        animated: false,
      });
    }
  }, [tasks.length, index]);

  if (tasks.length === 0) return null;

  const current = tasks[index] ?? tasks[0];
  const urgency = urgencyFor(current);
  const total = tasks.length;
  const showNav = total > 1;

  const goTo = (next: number) => {
    if (next < 0 || next >= total) return;
    setIndex(next);
    scrollRef.current?.scrollTo({ x: next * PAGE_WIDTH, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH);
    if (next !== index) setIndex(next);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop} />
      <Animated.View
        style={[
          styles.cardWrap,
          {
            top: insets.top + 16,
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={[styles.pill, { backgroundColor: urgency.pillBg }]}>
              <Text style={styles.pillText}>{urgency.pillLabel}</Text>
            </View>
            {showNav ? (
              <Text style={styles.counter}>
                {index + 1} of {total}
              </Text>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            scrollEventThrottle={16}
          >
            {tasks.map((t) => (
              <View key={t.id} style={[styles.page, { width: PAGE_WIDTH }]}>
                <Text style={styles.taskIcon}>{t.icon ?? '📋'}</Text>
                <Text style={styles.taskName} numberOfLines={2}>
                  {t.name}
                </Text>
                <Text style={styles.dueLabel}>
                  {urgencyFor(t).dueLabel}
                </Text>
                <Text style={styles.recurrenceLabel}>
                  {recurrenceSummary(t.recurrence)}
                </Text>
              </View>
            ))}
          </ScrollView>

          {showNav ? (
            <View style={styles.navRow}>
              <TouchableOpacity
                onPress={() => goTo(index - 1)}
                disabled={index === 0}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.arrow,
                    index === 0 && styles.arrowDisabled,
                  ]}
                >
                  ‹
                </Text>
              </TouchableOpacity>
              <View style={styles.dotsRow}>
                {tasks.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === index ? styles.dotActive : styles.dotInactive,
                    ]}
                  />
                ))}
              </View>
              <TouchableOpacity
                onPress={() => goTo(index + 1)}
                disabled={index === total - 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.arrow,
                    index === total - 1 && styles.arrowDisabled,
                  ]}
                >
                  ›
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.completeButton}
              onPress={() => onComplete(current)}
              activeOpacity={0.85}
            >
              <Text style={styles.actionText}>✅ Mark Complete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.openButton}
              onPress={() => onOpenTask(current)}
              activeOpacity={0.85}
            >
              <Text style={styles.actionText}>📋 Open Task</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.snoozeButton}
            onPress={() => setSnoozeOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.snoozeText}>😴 Snooze</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <SnoozeSheet
        visible={snoozeOpen}
        taskName={current.name}
        onSnooze={(amount, unit) => {
          setSnoozeOpen(false);
          onSnooze(current, amount, unit);
        }}
        onCancel={() => setSnoozeOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: '#2D3748',
    borderRadius: 20,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  counter: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  page: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
  },
  taskIcon: {
    fontSize: 44,
    textAlign: 'center',
    marginTop: 12,
  },
  taskName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
  },
  dueLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 6,
  },
  recurrenceLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 16,
  },
  arrow: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32,
    paddingHorizontal: 8,
  },
  arrowDisabled: {
    color: 'rgba(255,255,255,0.25)',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    backgroundColor: 'transparent',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  completeButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  openButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  snoozeButton: {
    marginHorizontal: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  snoozeText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
});
