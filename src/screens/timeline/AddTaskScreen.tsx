import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import { createTask } from '../../services/taskService';
import {
  addProductUsageToTask,
  getProducts,
} from '../../services/productService';
import {
  MonthlyWeek,
  Product,
  RecurrenceEndType,
  RecurrenceFrequency,
  RecurrenceRule,
  TaskCategory,
} from '../../types/models';
import { weekOfMonthFor } from '../../utils/recurrence';
import ScreenWrapper from '../../components/ScreenWrapper';
import ScreenHeader from '../../components/ScreenHeader';
import AssigneeSelector, {
  Assignee,
} from '../../components/AssigneeSelector';
import ReminderPicker from '../../components/ReminderPicker';
import { Colors } from '../../constants/colors';

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

type AddTaskRoute = RouteProp<
  {
    AddTask:
      | {
          prefill?: {
            name?: string;
            category?: TaskCategory;
            frequency?: RecurrenceFrequency;
            interval?: number;
            reminderDaysBefore?: number;
          };
        }
      | undefined;
  },
  'AddTask'
>;

export default function AddTaskScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<AddTaskRoute>();
  const prefill = route.params?.prefill;
  const { user } = useAuth();
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const today = useMemo(() => new Date(), []);
  const [name, setName] = useState(prefill?.name ?? '');
  const [description, setDescription] = useState('');
  const [firstDueDate, setFirstDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDateError, setShowDateError] = useState(false);

  const [category] = useState<TaskCategory>(prefill?.category ?? 'Other');

  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    prefill?.frequency ?? 'monthly'
  );
  const [intervalText, setIntervalText] = useState(
    prefill?.interval ? String(prefill.interval) : '1'
  );

  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([today.getDay()]);

  const [monthlyType, setMonthlyType] = useState<'dayOfMonth' | 'dayOfWeek'>(
    'dayOfMonth'
  );
  const [monthlyWeek, setMonthlyWeek] = useState<MonthlyWeek>(
    weekOfMonthFor(today)
  );

  const [endType, setEndType] = useState<RecurrenceEndType>('none');
  const [endAfterText, setEndAfterText] = useState('10');
  const [endByDate, setEndByDate] = useState<Date>(today);
  const [showEndByPicker, setShowEndByPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reminderDaysBefore, setReminderDaysBefore] = useState<number>(
    prefill?.reminderDaysBefore ?? 1
  );

  const [assignee, setAssignee] = useState<Assignee | null>(() =>
    user
      ? {
          userId: user.uid,
          name: user.displayName ?? user.email ?? user.uid,
        }
      : null
  );

  useEffect(() => {
    if (!user) return;
    setAssignee((prev) =>
      prev
        ? prev
        : {
            userId: user.uid,
            name: user.displayName ?? user.email ?? user.uid,
          }
    );
  }, [user]);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [supplyQuery, setSupplyQuery] = useState('');
  const [selectedSupplies, setSelectedSupplies] = useState<
    { product: Product; usageText: string }[]
  >([]);

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;
    getProducts(householdId)
      .then((products) => {
        if (cancelled) return;
        setAllProducts(products);
      })
      .catch((e) => {
        console.warn('[AddTaskScreen] getProducts failed:', e);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  const filteredSupplies = (() => {
    const q = supplyQuery.trim().toLowerCase();
    if (q.length === 0) return [];
    const selectedIds = new Set(selectedSupplies.map((s) => s.product.id));
    return allProducts
      .filter((p) => !selectedIds.has(p.id))
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  })();

  const addSupply = (product: Product) => {
    setSelectedSupplies((prev) => [...prev, { product, usageText: '1' }]);
    setSupplyQuery('');
  };

  const removeSupply = (productId: string) => {
    setSelectedSupplies((prev) =>
      prev.filter((s) => s.product.id !== productId)
    );
  };

  const updateSupplyUsage = (productId: string, value: string) => {
    setSelectedSupplies((prev) =>
      prev.map((s) =>
        s.product.id === productId ? { ...s, usageText: value } : s
      )
    );
  };

  const trimmedName = name.trim();
  const hasDate = firstDueDate !== null;
  const canSubmit = trimmedName.length > 0 && hasDate && !submitting;

  const onChangeFirstDate = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && selected) {
      setFirstDueDate(selected);
      setShowDateError(false);
      const dow = selected.getDay();
      setDaysOfWeek((prev) => (prev.length === 0 ? [dow] : prev));
      setMonthlyWeek(weekOfMonthFor(selected));
    }
  };

  const onChangeEndDate = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === 'android') setShowEndByPicker(false);
    if (event.type === 'set' && selected) {
      setEndByDate(selected);
    }
  };

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const buildRecurrence = (dueDate: Date): RecurrenceRule => {
    const interval = parsePositiveInt(intervalText, 1);
    const rule: RecurrenceRule = { frequency, interval };

    if (frequency === 'weekly' && daysOfWeek.length > 0) {
      rule.daysOfWeek = [...daysOfWeek].sort((a, b) => a - b);
    }

    if (frequency === 'monthly') {
      rule.monthlyType = monthlyType;
      if (monthlyType === 'dayOfMonth') {
        rule.monthlyDay = dueDate.getDate();
      } else {
        rule.monthlyWeekday = {
          week: monthlyWeek,
          day: dueDate.getDay(),
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

  const handleSubmit = async () => {
    if (!user || !householdId || !canSubmit || !firstDueDate) {
      if (!firstDueDate) setShowDateError(true);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const taskId = await createTask(
        householdId,
        user.displayName ?? user.email ?? user.uid,
        {
          householdId,
          name: trimmedName,
          category,
          description: description.trim() || undefined,
          firstDueDate,
          recurrence: buildRecurrence(firstDueDate),
          hasInventory: false,
          instructions: null,
          assignedTo: assignee?.userId ?? null,
          assignedToName: assignee?.name ?? null,
          reminderDaysBefore,
        },
        user.uid
      );

      for (const sel of selectedSupplies) {
        const amount = parseFloat(sel.usageText);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        await addProductUsageToTask(
          householdId,
          taskId,
          sel.product.id,
          sel.product.name,
          amount,
          sel.product.containerUnit
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

  return (
    <>
      <ScreenHeader title="New Task" leftLabel="Back" />
      <ScreenWrapper contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.suggestedShortcut}
          onPress={() => navigation.navigate('SuggestedTasks')}
          activeOpacity={0.7}
        >
          <Text style={styles.suggestedShortcutText}>
            ✨ Pick from suggested tasks →
          </Text>
        </TouchableOpacity>
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

      <Text style={styles.label}>First due date</Text>
      <TouchableOpacity
        style={[
          styles.dateButton,
          !firstDueDate && styles.dateButtonEmpty,
          showDateError && !firstDueDate && styles.dateButtonError,
        ]}
        onPress={() => setShowDatePicker(true)}
        activeOpacity={0.7}
      >
        <Text
          style={
            firstDueDate ? styles.dateButtonText : styles.dateButtonPlaceholder
          }
        >
          {firstDueDate
            ? format(firstDueDate, 'MMMM d, yyyy')
            : 'Tap to set due date'}
        </Text>
      </TouchableOpacity>
      {showDateError && !firstDueDate ? (
        <Text style={styles.dateErrorHint}>Please set a due date</Text>
      ) : null}
      {showDatePicker && (
        <DateTimePicker
          value={firstDueDate ?? today}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onChangeFirstDate}
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
                  style={[styles.dayChip, selected && styles.dayChipSelected]}
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
            label={
              firstDueDate
                ? `Day ${firstDueDate.getDate()} of the month`
                : 'Day of the month'
            }
            selected={monthlyType === 'dayOfMonth'}
            onPress={() => setMonthlyType('dayOfMonth')}
          />
          <RadioRow
            label={
              firstDueDate
                ? `The ${monthlyWeek} ${WEEKDAY_SHORT[firstDueDate.getDay()]} of the month`
                : `The ${monthlyWeek} weekday of the month`
            }
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
            {firstDueDate ? `On ${format(firstDueDate, 'MMMM d')}` : 'On the selected date'}
          </Text>
        </View>
      )}

      <Text style={styles.sectionHeader}>Range of recurrence</Text>
      <View style={styles.contextBox}>
        <View style={styles.row}>
          <Text style={styles.rowText}>Start:</Text>
          <Text style={[styles.rowText, styles.bold]}>
            {firstDueDate ? format(firstDueDate, 'MMMM d, yyyy') : '—'}
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
            onChange={onChangeEndDate}
          />
        )}
      </View>

      <Text style={styles.sectionHeader}>🧴 Supplies Needed</Text>
      <Text style={styles.suppliesHint}>
        Optional — link supplies this task uses
      </Text>

      {allProducts.length === 0 ? (
        <Text style={styles.suppliesEmpty}>
          No supplies in your library yet. Add supplies from the Supplies tab
          first.
        </Text>
      ) : (
        <View style={styles.suppliesBox}>
          {selectedSupplies.map((sel) => (
            <View key={sel.product.id} style={styles.supplyRow}>
              <View style={styles.supplyRowMain}>
                <Text style={styles.supplyRowName}>{sel.product.name}</Text>
                <View style={styles.supplyUsageRow}>
                  <Text style={styles.supplyUsageLabel}>Uses:</Text>
                  <TextInput
                    style={styles.supplyUsageInput}
                    value={sel.usageText}
                    onChangeText={(v) => updateSupplyUsage(sel.product.id, v)}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.supplyUsageUnit}>
                    {sel.product.containerUnit} per use
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => removeSupply(sel.product.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
              >
                <Text style={styles.supplyRemove}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TextInput
            style={styles.input}
            value={supplyQuery}
            onChangeText={setSupplyQuery}
            placeholder="Search your supplies..."
            placeholderTextColor={Colors.textLight}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {filteredSupplies.length > 0 ? (
            <View style={styles.supplyDropdown}>
              {filteredSupplies.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.supplyDropdownRow}
                  onPress={() => addSupply(p)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.supplyDropdownName}>{p.name}</Text>
                  <Text style={styles.supplyDropdownMeta}>
                    {p.currentQuantity} {p.containerUnit} on hand
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      )}

      <Text style={styles.sectionHeader}>🔔 Remind me</Text>
      <ReminderPicker
        value={reminderDaysBefore}
        onChange={setReminderDaysBefore}
      />

      <Text style={styles.sectionHeader}>👤 Assign To</Text>
      {householdId ? (
        <AssigneeSelector
          householdId={householdId}
          currentAssignee={assignee}
          onSelect={setAssignee}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {submitting ? 'Adding...' : 'Save Task'}
        </Text>
      </TouchableOpacity>
      </ScreenWrapper>
    </>
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
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
    backgroundColor: Colors.screenBackground,
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
    backgroundColor: Colors.screenBackground,
    justifyContent: 'center',
  },
  dateButtonEmpty: {
    borderStyle: 'dashed',
  },
  dateButtonError: {
    borderColor: Colors.error,
  },
  dateButtonText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  dateButtonPlaceholder: {
    fontSize: 16,
    color: Colors.textLight,
    fontWeight: '400',
  },
  dateErrorHint: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.error,
  },
  suggestedShortcut: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignSelf: 'flex-start',
  },
  suggestedShortcutText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  radioGroup: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 4,
  },
  contextBox: {
    backgroundColor: Colors.screenBackground,
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
    backgroundColor: Colors.cardBackground,
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
    backgroundColor: Colors.cardBackground,
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
    backgroundColor: Colors.cardBackground,
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
    backgroundColor: Colors.cardBackground,
  },
  endByText: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  disabled: {
    opacity: 0.4,
  },
  button: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: Colors.error,
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  suppliesHint: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
  },
  suppliesEmpty: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  suppliesBox: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginTop: 4,
    gap: 12,
  },
  supplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  supplyRowMain: {
    flex: 1,
  },
  supplyRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  supplyUsageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supplyUsageLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  supplyUsageInput: {
    width: 56,
    height: 32,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    backgroundColor: Colors.cardBackground,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  supplyUsageUnit: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  supplyRemove: {
    fontSize: 18,
    color: Colors.textMuted,
    paddingHorizontal: 4,
  },
  supplyDropdown: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  supplyDropdownRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  supplyDropdownName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  supplyDropdownMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
