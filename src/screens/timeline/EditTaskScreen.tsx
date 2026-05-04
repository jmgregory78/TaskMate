import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { format } from 'date-fns';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useAuth } from '../../hooks/useAuth';
import {
  assignTask,
  getTask,
  logActivity,
  updateTask,
} from '../../services/taskService';
import {
  MonthlyWeek,
  RecurrenceEndType,
  RecurrenceFrequency,
  RecurrenceRule,
  Task,
} from '../../types/models';
import { weekOfMonthFor } from '../../utils/recurrence';
import AssigneeSelector, {
  Assignee,
} from '../../components/AssigneeSelector';
import ScreenHeader from '../../components/ScreenHeader';
import ReminderPicker from '../../components/ReminderPicker';
import { sendAssignmentNotification } from '../../services/notificationService';
import { getFirstName } from '../../utils/nameUtils';
import { Colors } from '../../constants/colors';

type EditTaskRoute = RouteProp<
  { EditTask: { taskId: string; householdId: string } },
  'EditTask'
>;

const FREQUENCIES: { key: RecurrenceFrequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const WEEK_OPTIONS: { key: MonthlyWeek; label: string }[] = [
  { key: 'first', label: 'first' },
  { key: 'second', label: 'second' },
  { key: 'third', label: 'third' },
  { key: 'fourth', label: 'fourth' },
  { key: 'last', label: 'last' },
];

function parsePositiveInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function recurrenceEqual(a: RecurrenceRule, b: RecurrenceRule): boolean {
  if (a.frequency !== b.frequency || a.interval !== b.interval) return false;
  const aDays = (a.daysOfWeek ?? []).slice().sort();
  const bDays = (b.daysOfWeek ?? []).slice().sort();
  if (aDays.length !== bDays.length || aDays.some((v, i) => v !== bDays[i])) {
    return false;
  }
  if ((a.monthlyType ?? null) !== (b.monthlyType ?? null)) return false;
  if ((a.monthlyDay ?? null) !== (b.monthlyDay ?? null)) return false;
  const aMW = a.monthlyWeekday;
  const bMW = b.monthlyWeekday;
  if ((aMW?.week ?? null) !== (bMW?.week ?? null)) return false;
  if ((aMW?.day ?? null) !== (bMW?.day ?? null)) return false;
  if ((a.endType ?? 'none') !== (b.endType ?? 'none')) return false;
  if ((a.endAfterOccurrences ?? null) !== (b.endAfterOccurrences ?? null)) {
    return false;
  }
  const aEnd = a.endByDate ? a.endByDate.getTime() : null;
  const bEnd = b.endByDate ? b.endByDate.getTime() : null;
  if (aEnd !== bEnd) return false;
  return true;
}

export default function EditTaskScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<EditTaskRoute>();
  const { taskId, householdId } = route.params;
  const { user } = useAuth();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nextDueDate, setNextDueDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [intervalText, setIntervalText] = useState('1');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [monthlyType, setMonthlyType] = useState<'dayOfMonth' | 'dayOfWeek'>(
    'dayOfMonth'
  );
  const [monthlyWeek, setMonthlyWeek] = useState<MonthlyWeek>('first');

  const [endType, setEndType] = useState<RecurrenceEndType>('none');
  const [endAfterText, setEndAfterText] = useState('10');
  const [endByDate, setEndByDate] = useState<Date>(() => new Date());
  const [showEndByPicker, setShowEndByPicker] = useState(false);

  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [reminderDaysBefore, setReminderDaysBefore] = useState<number | null>(1);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTask(householdId, taskId)
      .then((t) => {
        if (cancelled) return;
        if (!t) {
          setLoadError('Task not found');
          setLoading(false);
          return;
        }
        setTask(t);
        setName(t.name);
        setDescription(t.description ?? '');
        setNextDueDate(t.nextDueDate);
        const r = t.recurrence;
        setFrequency(r.frequency);
        setIntervalText(String(r.interval ?? 1));
        setDaysOfWeek(r.daysOfWeek ?? [t.nextDueDate.getDay()]);
        setMonthlyType(r.monthlyType ?? 'dayOfMonth');
        setMonthlyWeek(
          r.monthlyWeekday?.week ?? weekOfMonthFor(t.nextDueDate)
        );
        setEndType(r.endType ?? 'none');
        setEndAfterText(
          r.endAfterOccurrences ? String(r.endAfterOccurrences) : '10'
        );
        setEndByDate(r.endByDate ?? t.nextDueDate);
        setAssignee(
          t.assignedTo
            ? { userId: t.assignedTo, name: t.assignedToName ?? t.assignedTo }
            : null
        );
        setReminderDaysBefore(
          t.reminderDaysBefore === null
            ? null
            : typeof t.reminderDaysBefore === 'number'
              ? t.reminderDaysBefore
              : 1
        );
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e as { message?: string };
        setLoadError(err.message ?? String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, taskId]);

  const buildRecurrence = (): RecurrenceRule => {
    const interval = parsePositiveInt(intervalText, 1);
    const rule: RecurrenceRule = { frequency, interval };

    if (frequency === 'weekly' && daysOfWeek.length > 0) {
      rule.daysOfWeek = [...daysOfWeek].sort((a, b) => a - b);
    }

    if (frequency === 'monthly') {
      rule.monthlyType = monthlyType;
      if (monthlyType === 'dayOfMonth') {
        rule.monthlyDay = nextDueDate.getDate();
      } else {
        rule.monthlyWeekday = {
          week: monthlyWeek,
          day: nextDueDate.getDay(),
        };
      }
    }

    rule.endType = endType;
    if (endType === 'afterOccurrences') {
      rule.endAfterOccurrences = parsePositiveInt(endAfterText, 1);
    }
    if (endType === 'byDate') {
      rule.endByDate = endByDate;
    }

    return rule;
  };

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  const dirty = useMemo(() => {
    if (!task) return false;
    if (trimmedName.length === 0) return false;
    if (trimmedName !== task.name) return true;
    if (trimmedDescription !== (task.description ?? '')) return true;
    if (!sameDay(nextDueDate, task.nextDueDate)) return true;
    if (!recurrenceEqual(buildRecurrence(), task.recurrence)) return true;
    if ((assignee?.userId ?? null) !== (task.assignedTo ?? null)) return true;
    if (reminderDaysBefore !== task.reminderDaysBefore) return true;
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    task,
    trimmedName,
    trimmedDescription,
    nextDueDate,
    frequency,
    intervalText,
    daysOfWeek,
    monthlyType,
    monthlyWeek,
    endType,
    endAfterText,
    endByDate,
    assignee,
    reminderDaysBefore,
  ]);

  const canSave = dirty && !submitting;

  const onChangeDate = (
    event: DateTimePickerEvent,
    selected: Date | undefined,
    setter: (d: Date) => void,
    closer: () => void
  ) => {
    if (Platform.OS === 'android') closer();
    if (event.type === 'set' && selected) {
      setter(selected);
      if (setter === setNextDueDate) {
        const dow = selected.getDay();
        setDaysOfWeek((prev) => (prev.length === 0 ? [dow] : prev));
        setMonthlyWeek(weekOfMonthFor(selected));
      }
    }
  };

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const handleSave = async () => {
    if (!task || !canSave) return;
    setError(null);
    setSubmitting(true);
    try {
      const newRecurrence = buildRecurrence();
      const changed: Partial<Task> = {};
      if (trimmedName !== task.name) changed.name = trimmedName;
      if (trimmedDescription !== (task.description ?? '')) {
        changed.description = trimmedDescription || undefined;
      }
      if (!sameDay(nextDueDate, task.nextDueDate)) {
        changed.nextDueDate = nextDueDate;
        changed.firstDueDate = nextDueDate;
      }
      if (reminderDaysBefore !== task.reminderDaysBefore) {
        changed.reminderDaysBefore = reminderDaysBefore;
      }
      if (!recurrenceEqual(newRecurrence, task.recurrence)) {
        changed.recurrence = newRecurrence;
      }

      await updateTask(householdId, taskId, changed);
      const assigneeChanged =
        (assignee?.userId ?? null) !== (task.assignedTo ?? null);
      if (assigneeChanged && user) {
        await assignTask(
          householdId,
          taskId,
          assignee?.userId ?? null,
          assignee?.name ?? null,
          user.uid,
          user.displayName ?? user.email ?? user.uid
        );
        if (assignee && assignee.userId !== user.uid) {
          void sendAssignmentNotification(
            assignee.userId,
            task.name,
            task.icon ?? '📋',
            getFirstName(user.displayName ?? user.email ?? user.uid),
            householdId,
            taskId
          );
        }
      }
      if (user) {
        await logActivity(
          householdId,
          taskId,
          'edited',
          user.displayName ?? user.email ?? user.uid
        );
      }
      navigation.goBack();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const message = err.code
        ? `${err.code}: ${err.message ?? ''}`
        : (err.message ?? String(e));
      setError(message);
      setSubmitting(false);
    }
  };


  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Edit Task" leftLabel="Back" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError || !task) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Edit Task" leftLabel="Back" />
        <View style={styles.center}>
          <Text style={styles.errorText}>{loadError ?? 'Task not found'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Edit Task"
        leftLabel="Back"
        rightLabel={submitting ? '...' : 'Save'}
        rightDisabled={!canSave}
        onRightPress={handleSave}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Task name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Replace AC filter"
              placeholderTextColor={Colors.textLight}
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Notes about this task"
              placeholderTextColor={Colors.textLight}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={styles.label}>Next due date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dateButtonText}>
                {format(nextDueDate, 'MMMM d, yyyy')}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={nextDueDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, d) =>
                  onChangeDate(e, d, setNextDueDate, () =>
                    setShowDatePicker(false)
                  )
                }
              />
            )}

            <Text style={styles.sectionHeader}>Recurrence pattern</Text>
            <View style={styles.radioGroup}>
              {FREQUENCIES.map((f) => (
                <RadioRow
                  key={f.key}
                  label={f.label}
                  selected={frequency === f.key}
                  onPress={() => setFrequency(f.key)}
                />
              ))}
            </View>

            {frequency === 'daily' && (
              <View style={styles.contextBox}>
                <View style={styles.row}>
                  <Text style={styles.rowText}>Recur every</Text>
                  <TextInput
                    style={styles.intervalInput}
                    value={intervalText}
                    onChangeText={setIntervalText}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.rowText}>day(s)</Text>
                </View>
              </View>
            )}

            {frequency === 'weekly' && (
              <View style={styles.contextBox}>
                <View style={styles.row}>
                  <Text style={styles.rowText}>Recur every</Text>
                  <TextInput
                    style={styles.intervalInput}
                    value={intervalText}
                    onChangeText={setIntervalText}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.rowText}>week(s) on:</Text>
                </View>
                <View style={styles.dayRow}>
                  {WEEKDAY_SHORT.map((label, idx) => {
                    const selected = daysOfWeek.includes(idx);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.dayChip,
                          selected && styles.dayChipSelected,
                        ]}
                        onPress={() => toggleDay(idx)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.dayChipText,
                            selected && styles.dayChipTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {frequency === 'monthly' && (
              <View style={styles.contextBox}>
                <View style={styles.row}>
                  <Text style={styles.rowText}>Recur every</Text>
                  <TextInput
                    style={styles.intervalInput}
                    value={intervalText}
                    onChangeText={setIntervalText}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.rowText}>month(s)</Text>
                </View>
                <RadioRow
                  label={`Day ${nextDueDate.getDate()} of the month`}
                  selected={monthlyType === 'dayOfMonth'}
                  onPress={() => setMonthlyType('dayOfMonth')}
                />
                <RadioRow
                  label={`The ${monthlyWeek} ${WEEKDAY_SHORT[nextDueDate.getDay()]} of the month`}
                  selected={monthlyType === 'dayOfWeek'}
                  onPress={() => setMonthlyType('dayOfWeek')}
                />
                {monthlyType === 'dayOfWeek' && (
                  <View style={styles.weekChips}>
                    {WEEK_OPTIONS.map((w) => {
                      const selected = monthlyWeek === w.key;
                      return (
                        <TouchableOpacity
                          key={w.key}
                          style={[
                            styles.weekChip,
                            selected && styles.weekChipSelected,
                          ]}
                          onPress={() => setMonthlyWeek(w.key)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.weekChipText,
                              selected && styles.weekChipTextSelected,
                            ]}
                          >
                            {w.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {frequency === 'yearly' && (
              <View style={styles.contextBox}>
                <View style={styles.row}>
                  <Text style={styles.rowText}>Recur every</Text>
                  <TextInput
                    style={styles.intervalInput}
                    value={intervalText}
                    onChangeText={setIntervalText}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.rowText}>year(s)</Text>
                </View>
                <Text style={styles.rowText}>
                  On {format(nextDueDate, 'MMMM d')}
                </Text>
              </View>
            )}

            <Text style={styles.sectionHeader}>Range of recurrence</Text>
            <View style={styles.contextBox}>
              <View style={styles.row}>
                <Text style={styles.rowText}>Start:</Text>
                <Text style={[styles.rowText, styles.bold]}>
                  {format(nextDueDate, 'MMMM d, yyyy')}
                </Text>
              </View>

              <RadioRow
                label="No end date"
                selected={endType === 'none'}
                onPress={() => setEndType('none')}
              />

              <RadioRow
                label="End after"
                selected={endType === 'afterOccurrences'}
                onPress={() => setEndType('afterOccurrences')}
                right={
                  <View style={styles.row}>
                    <TextInput
                      style={[
                        styles.intervalInput,
                        endType !== 'afterOccurrences' && styles.disabled,
                      ]}
                      value={endAfterText}
                      onChangeText={setEndAfterText}
                      keyboardType="number-pad"
                      editable={endType === 'afterOccurrences'}
                    />
                    <Text style={styles.rowText}>occurrences</Text>
                  </View>
                }
              />

              <RadioRow
                label="End by"
                selected={endType === 'byDate'}
                onPress={() => setEndType('byDate')}
                right={
                  <TouchableOpacity
                    style={[
                      styles.endByButton,
                      endType !== 'byDate' && styles.disabled,
                    ]}
                    onPress={() => setShowEndByPicker(true)}
                    activeOpacity={0.7}
                    disabled={endType !== 'byDate'}
                  >
                    <Text style={styles.endByText}>
                      {format(endByDate, 'MMM d, yyyy')}
                    </Text>
                  </TouchableOpacity>
                }
              />
              {showEndByPicker && (
                <DateTimePicker
                  value={endByDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, d) =>
                    onChangeDate(e, d, setEndByDate, () =>
                      setShowEndByPicker(false)
                    )
                  }
                />
              )}
            </View>

            <Text style={styles.sectionHeader}>🔔 Remind me</Text>
            <ReminderPicker
              value={reminderDaysBefore}
              onChange={setReminderDaysBefore}
            />

            <Text style={styles.sectionHeader}>👤 Assign To</Text>
            <AssigneeSelector
              householdId={householdId}
              currentAssignee={assignee}
              onSelect={setAssignee}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

interface RadioRowProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  right?: React.ReactNode;
}

function RadioRow({ label, selected, onPress, right }: RadioRowProps) {
  return (
    <TouchableOpacity
      style={styles.radioRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
      {right ? <View style={styles.radioRight}>{right}</View> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  flex: {
    flex: 1,
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
    width: 70,
  },
  headerSideText: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  saveLink: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  saveLinkDisabled: {
    opacity: 0.4,
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 100,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: Colors.cardBackground,
    color: Colors.textPrimary,
  },
  inputMultiline: {
    height: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  dateButton: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.cardBackground,
    justifyContent: 'center',
  },
  dateButtonText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  radioGroup: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 4,
  },
  contextBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginTop: 12,
    gap: 12,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  radioLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
    flex: 1,
  },
  radioRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  bold: {
    fontWeight: '600',
  },
  intervalInput: {
    width: 56,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 15,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
    minWidth: 44,
    alignItems: 'center',
  },
  dayChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  dayChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  dayChipTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  weekChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginLeft: 32,
  },
  weekChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
  },
  weekChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  weekChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  weekChipTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  endByButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
  },
  endByText: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  disabled: {
    opacity: 0.4,
  },
  error: {
    color: Colors.error,
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
  },
});
