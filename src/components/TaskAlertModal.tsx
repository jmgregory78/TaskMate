import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { differenceInCalendarDays } from 'date-fns';
import { formatDaysUntilDue } from '../utils/dateUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Task } from '../types/models';
import { Colors } from '../constants/colors';
import { recurrenceSummary } from '../utils/recurrence';
import SnoozeSheet, { SnoozeUnit } from './SnoozeSheet';

interface Props {
  tasks: Task[];
  visible: boolean;
  onComplete: (
    task: Task,
    completionNote?: string,
    remindNextTime?: boolean
  ) => void;
  onSnooze: (task: Task, amount: number, unit: SnoozeUnit) => void;
  onSnoozeUntilTomorrow: (task: Task) => void;
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
    return {
      pillBg: '#E53E3E',
      pillLabel: '⚠️ OVERDUE',
      dueLabel: formatDaysUntilDue(days),
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
    dueLabel: `Due ${formatDaysUntilDue(days)}`,
  };
}

export default function TaskAlertModal({
  tasks,
  visible,
  onComplete,
  onSnooze,
  onSnoozeUntilTomorrow,
  onOpenTask,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [remindNextTime, setRemindNextTime] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Synchronous guard to prevent multiple completion calls from rapid taps
  // before the next render flushes the isCompleting state.
  const isCompletingRef = useRef(false);

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
      setShowConfirmModal(false);
      setNoteExpanded(false);
      setNoteText('');
      setRemindNextTime(false);
      setIsCompleting(false);
      isCompletingRef.current = false;
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

  const currentId = tasks[index]?.id ?? tasks[0]?.id;

  // When the displayed task changes (e.g., after completing one and the list
  // shrinks), treat the new task as a fresh, independent task: clear the
  // completion guard and any leftover note/checkbox state.
  useEffect(() => {
    isCompletingRef.current = false;
    setIsCompleting(false);
    setNoteExpanded(false);
    setNoteText('');
    setRemindNextTime(false);
  }, [currentId]);

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
            <View style={styles.headerRight}>
              {showNav ? (
                <Text style={styles.counter}>
                  {index + 1} of {total}
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => onSnoozeUntilTomorrow(current)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.6}
                accessibilityLabel="Snooze until tomorrow"
              >
                <Text style={styles.closeIcon}>×</Text>
              </TouchableOpacity>
            </View>
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
                {t.lastCompletionNote ? (
                  <Text style={styles.lastCompletionNote} numberOfLines={1}>
                    Last time: {t.lastCompletionNote}
                  </Text>
                ) : null}
                {t.nextTimeReminder ? (
                  <View style={styles.reminderCard}>
                    <Text style={styles.reminderCardHeader}>
                      📝 Note from last time:
                    </Text>
                    <Text style={styles.reminderCardText} numberOfLines={2}>
                      {t.nextTimeReminder}
                    </Text>
                  </View>
                ) : null}
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
              {total <= 5 ? (
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
              ) : (
                <Text style={styles.counter}>
                  {index + 1} of {total}
                </Text>
              )}
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

          <View style={styles.actionColumn}>
            <TouchableOpacity
              style={[styles.completeButton, isCompleting && styles.disabled]}
              onPress={() => {
                if (isCompletingRef.current) return;
                setNoteExpanded(false);
                setNoteText('');
                setRemindNextTime(false);
                setShowConfirmModal(true);
              }}
              disabled={isCompleting}
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
            <TouchableOpacity
              style={styles.snoozeButton}
              onPress={() => setSnoozeOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.snoozeText}>😴 Snooze</Text>
            </TouchableOpacity>
          </View>
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

      {/* Completion Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowConfirmModal(false);
          setNoteExpanded(false);
          setNoteText('');
          setRemindNextTime(false);
        }}
      >
        <View style={styles.confirmOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Mark as Complete?</Text>
              <Text style={styles.confirmSubtitle}>{current.name}</Text>

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
                    placeholderTextColor="rgba(255,255,255,0.45)"
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
                style={[styles.confirmBtn, isCompleting && styles.disabled]}
                onPress={() => {
                  if (isCompletingRef.current) return;
                  isCompletingRef.current = true;
                  setIsCompleting(true);
                  setShowConfirmModal(false);
                  onComplete(current, noteText.trim(), remindNextTime);
                }}
                disabled={isCompleting}
              >
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowConfirmModal(false);
                  setNoteExpanded(false);
                  setNoteText('');
                  setRemindNextTime(false);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 24,
    fontWeight: '400',
    lineHeight: 26,
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
  actionColumn: {
    flexDirection: 'column',
    gap: 10,
    paddingHorizontal: 20,
  },
  completeButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  openButton: {
    backgroundColor: '#0D9488',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  snoozeText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '600',
  },
  lastCompletionNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  reminderCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  reminderCardHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  reminderCardText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  // Confirmation Modal styles (dark theme to match the alert card)
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 16,
  },
  confirmCard: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 16,
  },
  addNoteLinkContainer: {
    marginBottom: 20,
  },
  addNoteLink: {
    color: '#5EEAD4',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  noteContainer: {
    width: '100%',
    marginBottom: 20,
  },
  noteInput: {
    width: '100%',
    minWidth: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
    height: 100,
    fontSize: 14,
    color: '#FFFFFF',
    textAlignVertical: 'top',
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    borderColor: '#5EEAD4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  remindText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
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
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
});
