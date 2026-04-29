import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
} from '../../types/models';
import { weekOfMonthFor } from '../../utils/recurrence';
import ScreenWrapper from '../../components/ScreenWrapper';
import AssigneeSelector, {
  Assignee,
} from '../../components/AssigneeSelector';
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

export default function AddTaskScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const today = useMemo(() => new Date(), []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [firstDueDate, setFirstDueDate] = useState<Date>(today);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [intervalText, setIntervalText] = useState('1');

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
  const canSubmit = trimmedName.length > 0 && !submitting;

  const onChangeDate = (
    event: DateTimePickerEvent,
    selected: Date | undefined,
    setter: (d: Date) => void,
    closer: () => void
  ) => {
    if (Platform.OS === 'android') closer();
    if (event.type === 'set' && selected) {
      setter(selected);
      const dow = selected.getDay();
      if (setter === setFirstDueDate) {
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

  const buildRecurrence = (): RecurrenceRule => {
    const interval = parsePositiveInt(intervalText, 1);
    const rule: RecurrenceRule = { frequency, interval };

    if (frequency === 'weekly' && daysOfWeek.length > 0) {
      rule.daysOfWeek = [...daysOfWeek].sort((a, b) => a - b);
    }

    if (frequency === 'monthly') {
      rule.monthlyType = monthlyType;
      if (monthlyType === 'dayOfMonth') {
        rule.monthlyDay = firstDueDate.getDate();
      } else {
        rule.monthlyWeekday = {
          week: monthlyWeek,
          day: firstDueDate.getDay(),
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
    if (!user || !householdId || !canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const taskId = await createTask(
        householdId,
        user.displayName ?? user.email ?? user.uid,
        {
          householdId,
          name: trimmedName,
          category: 'Other',
          description: description.trim() || undefined,
          firstDueDate,
          recurrence: buildRecurrence(),
          hasInventory: false,
          instructions: null,
          assignedTo: assignee?.userId ?? null,
          assignedToName: assignee?.name ?? null,
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
    <ScreenWrapper contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>New Task</Text>
        <View style={styles.headerSpacer} />
      </View>

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
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.dateButtonText}>
          {format(firstDueDate, 'MMMM d, yyyy')}
        </Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={firstDueDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) =>
            onChangeDate(e, d, setFirstDueDate, () => setShowDatePicker(false))
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
            label={`Day ${firstDueDate.getDate()} of the month`}
            selected={monthlyType === 'dayOfMonth'}
            onPress={() => setMonthlyType('dayOfMonth')}
          />
          <RadioRow
            label={`The ${monthlyWeek} ${WEEKDAY_SHORT[firstDueDate.getDay()]} of the month`}
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
            On {format(firstDueDate, 'MMMM d')}
          </Text>
        </View>
      )}

      <Text style={styles.sectionHeader}>Range of recurrence</Text>
      <View style={styles.contextBox}>
        <View style={styles.row}>
          <Text style={styles.rowText}>Start:</Text>
          <Text style={[styles.rowText, styles.bold]}>
            {format(firstDueDate, 'MMMM d, yyyy')}
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
        disabled={!canSubmit}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color={Colors.textOnDark} />
        ) : (
          <Text style={styles.buttonText}>Save Task</Text>
        )}
      </TouchableOpacity>
    </ScreenWrapper>
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
    paddingTop: 56,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 56,
  },
  cancel: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    width: 56,
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
  dateButtonText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
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
