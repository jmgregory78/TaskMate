import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import { createTask, getTasks } from '../../services/taskService';
import {
  RecurrenceFrequency,
  TaskCategory,
} from '../../types/models';
import {
  WIZARD_CATEGORIES,
  WizardCategory,
  WizardCategoryId,
  SuggestedTask,
  getSuggestedTasksFor,
  getLinkedSuppliesForTasks,
  getSupplyCategoriesForSupplyIds,
  SuggestedSupply,
} from '../../data/suggested';
import { Colors } from '../../constants/colors';

interface TaskGroup {
  category: WizardCategory;
  items: SuggestedTask[];
}

interface TaskDraft {
  name: string;
  firstDue: Date;
  frequency: RecurrenceFrequency;
  intervalText: string;
  reminderDays: number | null;
}

const FREQUENCY_OPTIONS: { key: RecurrenceFrequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const REMINDER_OPTIONS: { days: number | null; label: string }[] = [
  { days: null, label: 'No Advance Reminder' },
  { days: 1, label: '1 day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
];

const REMINDER_PRESET_VALUES = new Set(
  REMINDER_OPTIONS.map((o) => o.days).filter((d): d is number => d !== null)
);

type CustomReminderUnit = 'days' | 'weeks' | 'months';

const CUSTOM_UNIT_OPTIONS: { key: CustomReminderUnit; label: string; multiplier: number }[] = [
  { key: 'days', label: 'Days', multiplier: 1 },
  { key: 'weeks', label: 'Weeks', multiplier: 7 },
  { key: 'months', label: 'Months', multiplier: 30 },
];

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function parsePositiveInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function customReminderLabel(days: number): string {
  if (days % 30 === 0 && days >= 30) {
    const months = days / 30;
    return `${months} ${months === 1 ? 'month' : 'months'} before`;
  }
  if (days % 7 === 0 && days >= 7) {
    const weeks = days / 7;
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} before`;
  }
  return `${days} ${days === 1 ? 'day' : 'days'} before`;
}

function daysToUnitAndValue(days: number): { value: number; unit: CustomReminderUnit } {
  if (days % 30 === 0 && days >= 30) {
    return { value: days / 30, unit: 'months' };
  }
  if (days % 7 === 0 && days >= 7) {
    return { value: days / 7, unit: 'weeks' };
  }
  return { value: days, unit: 'days' };
}

function unitWord(frequency: RecurrenceFrequency, interval: number): string {
  const base =
    frequency === 'daily'
      ? 'day'
      : frequency === 'weekly'
        ? 'week'
        : frequency === 'monthly'
          ? 'month'
          : 'year';
  return interval === 1 ? base : `${base}s`;
}

export default function SuggestedTasksScreen() {
  const navigation = useNavigation<any>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const { user } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [existingTaskNames, setExistingTaskNames] = useState<Set<string>>(new Set());
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<WizardCategoryId>>(new Set());
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<string>>(new Set());

  // Task configuration queue state
  const [configIndex, setConfigIndex] = useState<number | null>(null);
  const [taskQueue, setTaskQueue] = useState<SuggestedTask[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TaskDraft>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedTaskCount, setAddedTaskCount] = useState(0);

  // Supply prompt state (shown after task queue completes)
  const [supplyPromptVisible, setSupplyPromptVisible] = useState(false);
  const [pendingSupplies, setPendingSupplies] = useState<SuggestedSupply[]>([]);
  const [addedTaskIds, setAddedTaskIds] = useState<string[]>([]);

  // Load existing tasks
  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      getTasks(householdId)
        .then((tasks) => {
          if (cancelled) return;
          setExistingTaskNames(new Set(tasks.map((t) => normalize(t.name))));
          setLoaded(true);
        })
        .catch((e) => {
          console.warn('[SuggestedTasksScreen] getTasks failed:', e);
          setLoaded(true);
        });
      return () => {
        cancelled = true;
      };
    }, [householdId])
  );

  // Build task groups (categories with remaining tasks)
  const taskGroups: TaskGroup[] = useMemo(() => {
    const groups: TaskGroup[] = [];
    for (const cat of WIZARD_CATEGORIES) {
      const items = getSuggestedTasksFor(cat.id).filter(
        (t) => !existingTaskNames.has(normalize(t.name))
      );
      if (items.length > 0) groups.push({ category: cat, items });
    }
    return groups;
  }, [existingTaskNames]);

  const totalAvailableTasks = useMemo(
    () => taskGroups.reduce((sum, g) => sum + g.items.length, 0),
    [taskGroups]
  );

  const checkedTasks = useMemo(
    () =>
      taskGroups
        .flatMap((g) => g.items)
        .filter((t) => checkedTaskIds.has(t.id)),
    [taskGroups, checkedTaskIds]
  );

  const allAlreadyAdded = loaded && totalAvailableTasks === 0;

  // Handlers
  const toggleCategoryExpanded = (id: WizardCategoryId) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTask = (id: string) => {
    setCheckedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateDraft = (taskId: string, patch: Partial<TaskDraft>) => {
    setDrafts((prev) => {
      const existing = prev[taskId];
      if (!existing) return prev;
      return { ...prev, [taskId]: { ...existing, ...patch } };
    });
  };

  const startConfigureQueue = () => {
    if (checkedTasks.length === 0) {
      navigation.goBack();
      return;
    }
    setSubmitError(null);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of checkedTasks) {
        if (!next[t.id]) {
          next[t.id] = {
            name: t.name,
            firstDue: new Date(),
            frequency: t.frequency,
            intervalText: String(t.interval),
            reminderDays: null,
          };
        }
      }
      return next;
    });
    setTaskQueue(checkedTasks);
    setConfigIndex(0);
    setShowDatePicker(false);
  };

  const advanceConfigQueue = (nextIndex: number) => {
    setShowDatePicker(false);
    if (nextIndex >= taskQueue.length) {
      // Queue done - check if there are any linked supplies to prompt about
      const linkedSupplies = getLinkedSuppliesForTasks(addedTaskIds);
      if (linkedSupplies.length > 0) {
        setPendingSupplies(linkedSupplies);
        setSupplyPromptVisible(true);
      } else {
        navigation.goBack();
      }
    } else {
      setConfigIndex(nextIndex);
    }
  };

  const handleSupplyPromptSetup = () => {
    setSupplyPromptVisible(false);
    const supplyIds = pendingSupplies.map((s) => s.id);
    const categoryIds = getSupplyCategoriesForSupplyIds(supplyIds);
    navigation.navigate('SuggestedSupplies', {
      filterSupplyIds: supplyIds,
      expandCategoryIds: categoryIds,
      preCheckSupplyIds: supplyIds,
      fromTaskCategory: 'your',
    });
  };

  const handleSupplyPromptSkip = () => {
    setSupplyPromptVisible(false);
    navigation.goBack();
  };

  const handleConfigureSave = async () => {
    if (configIndex === null) return;
    if (!user || !householdId) return;
    const task = taskQueue[configIndex];
    const draft = drafts[task.id];
    if (!draft) return;
    setSubmitting(true);
    setSubmitError(null);
    const userLabel = user.displayName && !user.displayName.includes('@')
      ? user.displayName
      : 'You';
    try {
      await createTask(
        householdId,
        userLabel,
        {
          householdId,
          name: draft.name.trim() || task.name,
          category: task.category,
          description: undefined,
          firstDueDate: draft.firstDue,
          recurrence: {
            frequency: draft.frequency,
            interval: parsePositiveInt(draft.intervalText, 1),
          },
          hasInventory: false,
          instructions: null,
          reminderDaysBefore: draft.reminderDays,
        },
        user.uid
      );
      setAddedTaskCount((c) => c + 1);
      setAddedTaskIds((prev) => [...prev, task.id]);
      setSubmitting(false);
      advanceConfigQueue(configIndex + 1);
    } catch (e) {
      const err = e as { message?: string };
      setSubmitError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  const handleConfigureSkip = () => {
    if (configIndex === null) return;
    setSubmitError(null);
    advanceConfigQueue(configIndex + 1);
  };

  const handleConfigureBack = () => {
    if (configIndex === null) return;
    setSubmitError(null);
    setShowDatePicker(false);
    if (configIndex === 0) {
      // Return to accordion selection
      setConfigIndex(null);
      setTaskQueue([]);
    } else {
      setConfigIndex(configIndex - 1);
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const onChangeFirstDue = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && selected && configIndex !== null) {
      const taskId = taskQueue[configIndex]?.id;
      if (taskId) updateDraft(taskId, { firstDue: selected });
    }
  };

  // Render
  const inConfigQueue = configIndex !== null;

  if (!loaded) {
    return (
      <View style={styles.flex}>
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (allAlreadyAdded) {
    return (
      <View style={styles.flex}>
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <View style={styles.container}>
          <Header
            showBack={false}
            onBack={handleConfigureBack}
            showClose={true}
            onClose={handleClose}
          />
          <View style={[styles.center, styles.padded]}>
            <Text style={styles.bigEmoji}>🎉</Text>
            <Text style={styles.title}>You're all set!</Text>
            <Text style={styles.subtitle}>
              You've added all our suggestions! Check back after future app updates.
            </Text>
          </View>
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleClose}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Header
          showBack={inConfigQueue}
          onBack={handleConfigureBack}
          showClose={!inConfigQueue}
          onClose={handleClose}
        />
        {inConfigQueue && configIndex !== null && drafts[taskQueue[configIndex]?.id] ? (
          <ConfigureTaskStep
            task={taskQueue[configIndex]}
            index={configIndex}
            total={taskQueue.length}
            draft={drafts[taskQueue[configIndex].id]}
            onUpdateDraft={(patch) =>
              updateDraft(taskQueue[configIndex].id, patch)
            }
            showDatePicker={showDatePicker}
            onPressDate={() => setShowDatePicker(true)}
            onChangeDate={onChangeFirstDue}
            onSave={handleConfigureSave}
            onSkip={handleConfigureSkip}
            submitting={submitting}
            error={submitError}
          />
        ) : (
          <TaskAccordion
            groups={taskGroups}
            expandedIds={expandedCategoryIds}
            checkedIds={checkedTaskIds}
            onToggleExpand={toggleCategoryExpanded}
            onToggleTask={toggleTask}
            onAdd={startConfigureQueue}
            checkedCount={checkedTasks.length}
          />
        )}
      </KeyboardAvoidingView>
      {/* Supply Prompt Modal */}
      <Modal
        visible={supplyPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={handleSupplyPromptSkip}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.supplyPromptCard}>
            <Text style={styles.supplyPromptTitle}>Set up your supplies?</Text>
            <Text style={styles.supplyPromptBody}>
              These supplies are used by the tasks you just added. Would you like to set them up now?
            </Text>
            <View style={styles.supplyPreviewList}>
              {pendingSupplies.slice(0, 4).map((s) => (
                <View key={s.id} style={styles.supplyPreviewRow}>
                  <Text style={styles.supplyPreviewIcon}>{s.icon ?? '📦'}</Text>
                  <Text style={styles.supplyPreviewName}>{s.name}</Text>
                </View>
              ))}
              {pendingSupplies.length > 4 ? (
                <Text style={styles.supplyPreviewMore}>
                  + {pendingSupplies.length - 4} more
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.supplyPromptPrimaryButton}
              onPress={handleSupplyPromptSetup}
              activeOpacity={0.85}
            >
              <Text style={styles.supplyPromptPrimaryButtonText}>
                Set Up Supplies →
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.supplyPromptSkipButton}
              onPress={handleSupplyPromptSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.supplyPromptSkipText}>Skip for Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Header component
function Header({
  showBack,
  onBack,
  showClose,
  onClose,
}: {
  showBack: boolean;
  onBack: () => void;
  showClose: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSlot}>
        {showBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.headerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityLabel="Back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.headerTitle}>Suggested Tasks</Text>
      <View style={[styles.headerSlot, styles.headerSlotRight]}>
        {showClose ? (
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityLabel="Close"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// Task Accordion component
function TaskAccordion({
  groups,
  expandedIds,
  checkedIds,
  onToggleExpand,
  onToggleTask,
  onAdd,
  checkedCount,
}: {
  groups: TaskGroup[];
  expandedIds: Set<WizardCategoryId>;
  checkedIds: Set<string>;
  onToggleExpand: (id: WizardCategoryId) => void;
  onToggleTask: (id: string) => void;
  onAdd: () => void;
  checkedCount: number;
}) {
  const selectedCountByCategory = (categoryId: WizardCategoryId): number => {
    const group = groups.find((g) => g.category.id === categoryId);
    if (!group) return 0;
    return group.items.filter((t) => checkedIds.has(t.id)).length;
  };

  return (
    <>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Browse Suggested Tasks</Text>
        <Text style={styles.subtitle}>Choose the tasks you want to track</Text>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {groups.map((g) => {
          const expanded = expandedIds.has(g.category.id);
          const selectedCount = selectedCountByCategory(g.category.id);
          return (
            <View key={g.category.id} style={styles.accordionCard}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => onToggleExpand(g.category.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryEmoji}>{g.category.emoji}</Text>
                <Text style={styles.accordionTitle}>{g.category.name}</Text>
                {selectedCount > 0 ? (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>
                      {selectedCount} selected
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.accordionChevron}>
                  {expanded ? '▾' : '▸'}
                </Text>
              </TouchableOpacity>
              {expanded ? (
                <View style={styles.accordionContent}>
                  {g.items.map((t) => {
                    const checked = checkedIds.has(t.id);
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.itemRow, checked && styles.itemRowOn]}
                        onPress={() => onToggleTask(t.id)}
                        activeOpacity={0.7}
                      >
                        <Checkbox checked={checked} />
                        {t.icon ? (
                          <Text style={styles.itemIcon}>{t.icon}</Text>
                        ) : null}
                        <Text style={styles.itemName}>{t.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            checkedCount === 0 && styles.primaryButtonDisabled,
          ]}
          onPress={onAdd}
          activeOpacity={0.85}
          disabled={checkedCount === 0}
        >
          <Text style={styles.primaryButtonText}>
            {checkedCount === 0
              ? 'Select Tasks'
              : `Add ${checkedCount} ${checkedCount === 1 ? 'Task' : 'Tasks'} →`}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// Checkbox component
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
    </View>
  );
}

// Configure Task Step component
function ConfigureTaskStep({
  task,
  index,
  total,
  draft,
  onUpdateDraft,
  showDatePicker,
  onPressDate,
  onChangeDate,
  onSave,
  onSkip,
  submitting,
  error,
}: {
  task: SuggestedTask;
  index: number;
  total: number;
  draft: TaskDraft;
  onUpdateDraft: (patch: Partial<TaskDraft>) => void;
  showDatePicker: boolean;
  onPressDate: () => void;
  onChangeDate: (e: DateTimePickerEvent, d: Date | undefined) => void;
  onSave: () => void;
  onSkip: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const isCustomValue = draft.reminderDays !== null && !REMINDER_PRESET_VALUES.has(draft.reminderDays);
  const initialCustom = isCustomValue && draft.reminderDays !== null
    ? daysToUnitAndValue(draft.reminderDays)
    : { value: 1, unit: 'days' as CustomReminderUnit };
  const [showCustomInput, setShowCustomInput] = useState(isCustomValue);
  const [customValue, setCustomValue] = useState(String(initialCustom.value));
  const [customUnit, setCustomUnit] = useState<CustomReminderUnit>(initialCustom.unit);

  const handleSelectPreset = (days: number | null) => {
    setShowCustomInput(false);
    onUpdateDraft({ reminderDays: days });
  };

  const handleSelectCustom = () => {
    setShowCustomInput(true);
    const multiplier = CUSTOM_UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
    const num = parseInt(customValue, 10) || 1;
    onUpdateDraft({ reminderDays: num * multiplier });
  };

  const handleCustomValueChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '');
    setCustomValue(digitsOnly);
    const num = parseInt(digitsOnly, 10) || 1;
    const multiplier = CUSTOM_UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
    onUpdateDraft({ reminderDays: num * multiplier });
  };

  const handleUnitChange = (unit: CustomReminderUnit) => {
    setCustomUnit(unit);
    const num = parseInt(customValue, 10) || 1;
    const multiplier = CUSTOM_UNIT_OPTIONS.find((u) => u.key === unit)?.multiplier ?? 1;
    onUpdateDraft({ reminderDays: num * multiplier });
  };

  const handleConfirmCustom = () => {
    const num = parseInt(customValue, 10) || 1;
    const multiplier = CUSTOM_UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
    onUpdateDraft({ reminderDays: num * multiplier });
    setShowCustomInput(false);
  };

  const customDisplayLabel = isCustomValue && draft.reminderDays !== null
    ? customReminderLabel(draft.reminderDays)
    : 'Custom...';

  return (
    <>
      <View style={styles.titleBlock}>
        {total > 1 ? (
          <Text style={styles.queueCounter}>
            Task {index + 1} of {total}
          </Text>
        ) : null}
        <View style={styles.nameCard}>
          {task.icon ? (
            <Text style={styles.taskHeadingIcon}>{task.icon}</Text>
          ) : null}
          <TextInput
            style={styles.nameInput}
            value={draft.name}
            onChangeText={(text) => onUpdateDraft({ name: text })}
            placeholder="Enter task name"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            maxLength={100}
            editable={!submitting}
          />
          <Text style={styles.pencilEmoji}>✏️</Text>
        </View>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.fieldLabel}>When is this first due?</Text>
        <TouchableOpacity
          style={styles.dateRow}
          onPress={onPressDate}
          activeOpacity={0.7}
          disabled={submitting}
        >
          <Text style={styles.dateText}>
            {format(draft.firstDue, 'EEE, MMM d, yyyy')}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        {showDatePicker ? (
          <DateTimePicker
            value={draft.firstDue}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeDate}
          />
        ) : null}

        <Text style={styles.fieldLabel}>How often does it repeat?</Text>
        <View style={styles.frequencyRow}>
          {FREQUENCY_OPTIONS.map((opt) => {
            const active = opt.key === draft.frequency;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.freqChip, active && styles.freqChipOn]}
                onPress={() => onUpdateDraft({ frequency: opt.key })}
                activeOpacity={0.7}
                disabled={submitting}
              >
                <Text
                  style={[
                    styles.freqChipText,
                    active && styles.freqChipTextOn,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.intervalRow}>
          <Text style={styles.intervalEvery}>Every</Text>
          <TextInput
            style={styles.intervalInput}
            value={draft.intervalText}
            onChangeText={(intervalText) => onUpdateDraft({ intervalText })}
            keyboardType="number-pad"
            editable={!submitting}
            selectTextOnFocus
          />
          <Text style={styles.intervalUnit}>
            {unitWord(draft.frequency, parsePositiveInt(draft.intervalText, 1))}
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Advance Reminder</Text>
        <View style={styles.reminderColumn}>
          {REMINDER_OPTIONS.map((opt) => {
            const active = opt.days === draft.reminderDays && !showCustomInput;
            const key = opt.days === null ? 'none' : String(opt.days);
            const isNoAdvanceReminder = opt.days === null;
            return (
              <View key={key}>
                <TouchableOpacity
                  style={[styles.reminderRow, active && styles.reminderRowOn]}
                  onPress={() => handleSelectPreset(opt.days)}
                  activeOpacity={0.7}
                  disabled={submitting}
                >
                  <Text
                    style={[
                      styles.reminderText,
                      active && styles.reminderTextOn,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {active ? (
                    <Text style={styles.reminderCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
                {isNoAdvanceReminder ? (
                  <Text style={styles.reminderSubtitle}>
                    You'll still get a task alert on the due date
                  </Text>
                ) : null}
              </View>
            );
          })}
          {/* Custom option */}
          <TouchableOpacity
            style={[
              styles.reminderRow,
              (isCustomValue || showCustomInput) && styles.reminderRowOn,
            ]}
            onPress={handleSelectCustom}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <Text
              style={[
                styles.reminderText,
                (isCustomValue || showCustomInput) && styles.reminderTextOn,
              ]}
            >
              {customDisplayLabel}
            </Text>
            {isCustomValue && !showCustomInput ? (
              <Text style={styles.reminderCheck}>✓</Text>
            ) : null}
          </TouchableOpacity>
          {showCustomInput ? (
            <View style={styles.customReminderBox}>
              <View style={styles.customReminderRow}>
                <TextInput
                  style={styles.customReminderInput}
                  value={customValue}
                  onChangeText={handleCustomValueChange}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                  editable={!submitting}
                />
                <View style={styles.customUnitRow}>
                  {CUSTOM_UNIT_OPTIONS.map((u) => {
                    const active = customUnit === u.key;
                    return (
                      <TouchableOpacity
                        key={u.key}
                        style={[styles.customUnitChip, active && styles.customUnitChipOn]}
                        onPress={() => handleUnitChange(u.key)}
                        activeOpacity={0.7}
                        disabled={submitting}
                      >
                        <Text
                          style={[
                            styles.customUnitText,
                            active && styles.customUnitTextOn,
                          ]}
                        >
                          {u.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <TouchableOpacity
                style={styles.customConfirmButton}
                onPress={handleConfirmCustom}
                activeOpacity={0.7}
                disabled={submitting}
              >
                <Text style={styles.customConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
          onPress={onSave}
          activeOpacity={0.85}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Add Task</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipFullRow}
          onPress={onSkip}
          activeOpacity={0.7}
          disabled={submitting}
        >
          <Text style={styles.skipText}>
            {index < total - 1 ? 'Skip' : 'Cancel'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeTop: {
    backgroundColor: Colors.headerBackground,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  padded: {
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.headerBackground,
  },
  headerSlot: {
    width: 40,
  },
  headerSlotRight: {
    alignItems: 'flex-end',
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  backIcon: {
    fontSize: 28,
    color: Colors.textOnDark,
    fontWeight: '300',
  },
  closeText: {
    fontSize: 20,
    color: Colors.textOnDark,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  bigEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  accordionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  categoryEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  accordionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  selectedBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  selectedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  accordionChevron: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  accordionContent: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  itemRowOn: {
    backgroundColor: Colors.primaryLight,
  },
  itemIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: Colors.cardBackground,
  },
  checkboxOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  skipFullRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 15,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  queueCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  nameCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  taskHeadingIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  nameInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    padding: 0,
    margin: 0,
  },
  pencilEmoji: {
    fontSize: 16,
    opacity: 0.5,
    paddingLeft: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  chevron: {
    fontSize: 20,
    color: Colors.textMuted,
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  freqChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  freqChipOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  freqChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  freqChipTextOn: {
    color: Colors.primary,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  intervalEvery: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  intervalInput: {
    width: 60,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  intervalUnit: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  reminderColumn: {
    gap: 8,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderRowOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  reminderText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  reminderTextOn: {
    fontWeight: '600',
    color: Colors.primary,
  },
  reminderCheck: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '700',
  },
  reminderSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    marginLeft: 14,
    marginBottom: 4,
  },
  customReminderBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginTop: -4,
  },
  customReminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customReminderInput: {
    width: 60,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  customUnitRow: {
    flexDirection: 'row',
    gap: 6,
  },
  customUnitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
  },
  customUnitChipOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  customUnitText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  customUnitTextOn: {
    color: Colors.primary,
  },
  customConfirmButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  customConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Supply prompt modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 32, 44, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  supplyPromptCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  supplyPromptTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  supplyPromptBody: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  supplyPreviewList: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  supplyPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  supplyPreviewIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  supplyPreviewName: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  supplyPreviewMore: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  supplyPromptPrimaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  supplyPromptPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  supplyPromptSkipButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  supplyPromptSkipText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
