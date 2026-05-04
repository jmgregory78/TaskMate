import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import { createTask, getTasks } from '../../services/taskService';
import { createProduct, getProducts } from '../../services/productService';
import { markSetupWizardComplete } from '../../services/householdService';
import {
  SuggestedSupply,
  SuggestedTask,
  WIZARD_CATEGORIES,
  WizardCategory,
  WizardCategoryId,
  getSuggestedSuppliesFor,
  getSuggestedTasksFor,
} from '../../data/suggested';
import { RecurrenceFrequency } from '../../types/models';
import { Colors } from '../../constants/colors';

export type SetupWizardMode = 'firstTime' | 'fromTasks' | 'fromSupplies';

type SetupWizardRoute = RouteProp<
  { SetupWizard: { mode: SetupWizardMode } },
  'SetupWizard'
>;

interface TaskGroup {
  category: WizardCategory;
  items: SuggestedTask[];
}

interface SupplyGroup {
  category: WizardCategory;
  items: SuggestedSupply[];
}

const TOTAL_STEPS = 4;

const FREQUENCY_OPTIONS: { key: RecurrenceFrequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const REMINDER_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: '1 day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
];

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// Pick the closest reminder option for a suggestion default like 30 days.
function snapToReminderOption(days: number): number {
  if (days <= 1) return 1;
  if (days <= 3) return 3;
  return 7;
}

function parsePositiveInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function SetupWizardScreen() {
  const route = useRoute<SetupWizardRoute>();
  const navigation = useNavigation<any>();
  const mode = route.params?.mode ?? 'firstTime';
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existingTaskNames, setExistingTaskNames] = useState<Set<string>>(
    new Set()
  );
  const [existingSupplyNames, setExistingSupplyNames] = useState<Set<string>>(
    new Set()
  );
  // CHANGE 1: all category/task/supply selections start EMPTY (nothing
  // pre-checked). User must opt in.
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<
    Set<WizardCategoryId>
  >(new Set());
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<string>>(new Set());
  const [checkedSupplyIds, setCheckedSupplyIds] = useState<Set<string>>(
    new Set()
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedTaskCount, setAddedTaskCount] = useState(0);
  const [addedSupplyCount, setAddedSupplyCount] = useState(0);
  const writtenSupplyIds = useRef<Set<string>>(new Set());

  // CHANGE 2: per-task configure-queue state
  // configIndex is null when the queue isn't active, otherwise it points to
  // the current task in `taskQueue`.
  const [configIndex, setConfigIndex] = useState<number | null>(null);
  const [taskQueue, setTaskQueue] = useState<SuggestedTask[]>([]);
  const [cfgFirstDue, setCfgFirstDue] = useState<Date>(new Date());
  const [cfgFrequency, setCfgFrequency] =
    useState<RecurrenceFrequency>('monthly');
  const [cfgIntervalText, setCfgIntervalText] = useState('1');
  const [cfgReminderDays, setCfgReminderDays] = useState<number>(1);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Load existing data on mount
  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;
    Promise.all([getTasks(householdId), getProducts(householdId)])
      .then(([tasks, products]) => {
        if (cancelled) return;
        setExistingTaskNames(new Set(tasks.map((t) => normalize(t.name))));
        setExistingSupplyNames(new Set(products.map((p) => normalize(p.name))));
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e as { message?: string };
        setLoadError(err.message ?? String(e));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  // Categories with at least one un-added task or supply
  const availableCategories: WizardCategory[] = useMemo(() => {
    return WIZARD_CATEGORIES.filter((cat) => {
      const remTasks = getSuggestedTasksFor(cat.id).some(
        (t) => !existingTaskNames.has(normalize(t.name))
      );
      const remSupplies = getSuggestedSuppliesFor(cat.id).some(
        (s) => !existingSupplyNames.has(normalize(s.name))
      );
      return remTasks || remSupplies;
    });
  }, [existingTaskNames, existingSupplyNames]);

  const taskGroups: TaskGroup[] = useMemo(() => {
    const groups: TaskGroup[] = [];
    for (const cat of WIZARD_CATEGORIES) {
      if (!selectedCategoryIds.has(cat.id)) continue;
      const items = getSuggestedTasksFor(cat.id).filter(
        (t) => !existingTaskNames.has(normalize(t.name))
      );
      if (items.length > 0) groups.push({ category: cat, items });
    }
    return groups;
  }, [selectedCategoryIds, existingTaskNames]);

  const supplyGroups: SupplyGroup[] = useMemo(() => {
    const groups: SupplyGroup[] = [];
    for (const cat of WIZARD_CATEGORIES) {
      if (!selectedCategoryIds.has(cat.id)) continue;
      const items = getSuggestedSuppliesFor(cat.id).filter(
        (s) => !existingSupplyNames.has(normalize(s.name))
      );
      if (items.length > 0) groups.push({ category: cat, items });
    }
    return groups;
  }, [selectedCategoryIds, existingSupplyNames]);

  const totalAvailableTasks = useMemo(
    () =>
      WIZARD_CATEGORIES.reduce(
        (sum, cat) =>
          sum +
          getSuggestedTasksFor(cat.id).filter(
            (t) => !existingTaskNames.has(normalize(t.name))
          ).length,
        0
      ),
    [existingTaskNames]
  );
  const totalAvailableSupplies = useMemo(
    () =>
      WIZARD_CATEGORIES.reduce(
        (sum, cat) =>
          sum +
          getSuggestedSuppliesFor(cat.id).filter(
            (s) => !existingSupplyNames.has(normalize(s.name))
          ).length,
        0
      ),
    [existingSupplyNames]
  );
  const allAlreadyAdded =
    loaded && totalAvailableTasks === 0 && totalAvailableSupplies === 0;

  const checkedTasks = useMemo(
    () =>
      taskGroups
        .flatMap((g) => g.items)
        .filter((t) => checkedTaskIds.has(t.id)),
    [taskGroups, checkedTaskIds]
  );
  const checkedSupplies = useMemo(
    () =>
      supplyGroups
        .flatMap((g) => g.items)
        .filter((s) => checkedSupplyIds.has(s.id)),
    [supplyGroups, checkedSupplyIds]
  );

  // ----- Step navigation -----
  const advanceFrom1 = () => {
    if (taskGroups.length > 0) setStep(2);
    else if (supplyGroups.length > 0) setStep(3);
    else setStep(4);
  };
  const advanceFrom2 = () => {
    if (supplyGroups.length > 0) setStep(3);
    else setStep(4);
  };

  // CHANGE 2: kick off the per-task configuration queue.
  const startConfigureQueue = () => {
    if (checkedTasks.length === 0) {
      advanceFrom2();
      return;
    }
    setSubmitError(null);
    setTaskQueue(checkedTasks);
    setConfigIndex(0);
    primeConfigForTask(checkedTasks[0]);
  };

  const primeConfigForTask = (task: SuggestedTask) => {
    setCfgFirstDue(new Date());
    setCfgFrequency(task.frequency);
    setCfgIntervalText(String(task.interval));
    setCfgReminderDays(snapToReminderOption(task.reminderDaysBefore));
    setShowDatePicker(false);
  };

  const advanceConfigQueue = (nextIndex: number) => {
    if (nextIndex >= taskQueue.length) {
      // Queue done — exit config mode and continue to supplies
      setConfigIndex(null);
      setTaskQueue([]);
      advanceFrom2();
    } else {
      setConfigIndex(nextIndex);
      primeConfigForTask(taskQueue[nextIndex]);
    }
  };

  const handleConfigureSave = async () => {
    if (configIndex === null) return;
    if (!user || !householdId) return;
    const task = taskQueue[configIndex];
    setSubmitting(true);
    setSubmitError(null);
    const userLabel = user.displayName ?? user.email ?? user.uid;
    try {
      await createTask(
        householdId,
        userLabel,
        {
          householdId,
          name: task.name,
          category: task.category,
          description: undefined,
          firstDueDate: cfgFirstDue,
          recurrence: {
            frequency: cfgFrequency,
            interval: parsePositiveInt(cfgIntervalText, 1),
          },
          hasInventory: false,
          instructions: null,
          reminderDaysBefore: cfgReminderDays,
        },
        user.uid
      );
      setAddedTaskCount((c) => c + 1);
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

  const handleAddSupplies = async () => {
    if (!user || !householdId) return;
    if (checkedSupplies.length === 0) {
      setStep(4);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const userLabel = user.displayName ?? user.email ?? user.uid;
    try {
      await Promise.all(
        checkedSupplies
          .filter((s) => !writtenSupplyIds.current.has(s.id))
          .map(async (s) => {
            await createProduct(householdId, userLabel, {
              householdId,
              name: s.name,
              amazonUrl: '',
              containerSize: s.defaultQty,
              containerUnit: s.unit,
              currentQuantity: s.defaultQty,
              lowThresholdPercent: 25,
            });
            writtenSupplyIds.current.add(s.id);
          })
      );
      setAddedSupplyCount(writtenSupplyIds.current.size);
      setSubmitting(false);
      setStep(4);
    } catch (e) {
      const err = e as { message?: string };
      setSubmitError(err.message ?? String(e));
      setAddedSupplyCount(writtenSupplyIds.current.size);
      setSubmitting(false);
    }
  };

  const handleSkipTasks = () => {
    setSubmitError(null);
    advanceFrom2();
  };
  const handleSkipSupplies = () => {
    setSubmitError(null);
    setStep(4);
  };

  const handleClose = () => {
    if (mode === 'firstTime') {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } else {
      navigation.goBack();
    }
  };

  const handleDone = async () => {
    if (user) {
      try {
        await markSetupWizardComplete(user.uid);
      } catch (e) {
        console.warn('[SetupWizard] markSetupWizardComplete failed:', e);
      }
    }
    if (mode === 'firstTime') {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } else {
      navigation.goBack();
    }
  };

  const toggleCategory = (id: WizardCategoryId) => {
    setSelectedCategoryIds((prev) => {
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
  const toggleSupply = (id: string) => {
    setCheckedSupplyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onChangeFirstDue = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && selected) {
      setCfgFirstDue(selected);
    }
  };

  // ----- Render -----
  const inConfigQueue = configIndex !== null;
  const showCloseButton =
    mode !== 'firstTime' && step !== 4 && !inConfigQueue;

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

  if (loadError) {
    return (
      <View style={styles.flex}>
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <View style={[styles.container, styles.center]}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleClose}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Close</Text>
          </TouchableOpacity>
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
            showClose={showCloseButton}
            onClose={handleClose}
            step={null}
          />
          <View style={[styles.center, styles.padded]}>
            <Text style={styles.bigEmoji}>🎉</Text>
            <Text style={styles.title}>You're all set!</Text>
            <Text style={styles.subtitle}>
              You've already added all our suggestions. Check back after future
              updates.
            </Text>
          </View>
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleDone}
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
      <View style={styles.container}>
        <Header
          showClose={showCloseButton}
          onClose={handleClose}
          step={step}
        />
        {inConfigQueue && configIndex !== null ? (
          <ConfigureTaskStep
            task={taskQueue[configIndex]}
            index={configIndex}
            total={taskQueue.length}
            firstDue={cfgFirstDue}
            frequency={cfgFrequency}
            intervalText={cfgIntervalText}
            reminderDays={cfgReminderDays}
            showDatePicker={showDatePicker}
            onPressDate={() => setShowDatePicker(true)}
            onChangeDate={onChangeFirstDue}
            onChangeFrequency={setCfgFrequency}
            onChangeInterval={setCfgIntervalText}
            onChangeReminder={setCfgReminderDays}
            onSave={handleConfigureSave}
            onSkip={handleConfigureSkip}
            submitting={submitting}
            error={submitError}
          />
        ) : step === 1 ? (
          <Step1
            categories={availableCategories}
            selectedIds={selectedCategoryIds}
            onToggle={toggleCategory}
            onNext={advanceFrom1}
          />
        ) : step === 2 ? (
          <Step2
            groups={taskGroups}
            checkedIds={checkedTaskIds}
            onToggle={toggleTask}
            onSkip={handleSkipTasks}
            onAdd={startConfigureQueue}
            checkedCount={checkedTasks.length}
          />
        ) : step === 3 ? (
          <Step3
            groups={supplyGroups}
            checkedIds={checkedSupplyIds}
            onToggle={toggleSupply}
            onSkip={handleSkipSupplies}
            onAdd={handleAddSupplies}
            submitting={submitting}
            error={submitError}
            checkedCount={checkedSupplies.length}
          />
        ) : step === 4 ? (
          <Step4
            mode={mode}
            taskCount={addedTaskCount}
            supplyCount={addedSupplyCount}
            onDone={handleDone}
          />
        ) : null}
      </View>
    </View>
  );
}

// ----- Header -----
function Header({
  step,
  showClose,
  onClose,
}: {
  step: 1 | 2 | 3 | 4 | null;
  showClose: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.progressRow}>
        {step !== null
          ? Array.from({ length: TOTAL_STEPS }).map((_, i) => {
              const idx = i + 1;
              const active = idx === step;
              const done = idx < step;
              return (
                <View
                  key={i}
                  style={[
                    styles.progressDot,
                    active && styles.progressDotActive,
                    done && styles.progressDotDone,
                  ]}
                />
              );
            })
          : null}
      </View>
      {showClose ? (
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.closeButton} />
      )}
    </View>
  );
}

// ----- Step 1 -----
function Step1({
  categories,
  selectedIds,
  onToggle,
  onNext,
}: {
  categories: WizardCategory[];
  selectedIds: Set<WizardCategoryId>;
  onToggle: (id: WizardCategoryId) => void;
  onNext: () => void;
}) {
  return (
    <>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Let's set up your household</Text>
        <Text style={styles.subtitle}>
          Select everything that applies — we'll suggest the right tasks and
          supplies
        </Text>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((cat) => {
          const selected = selectedIds.has(cat.id);
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryCard, selected && styles.categoryCardOn]}
              onPress={() => onToggle(cat.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text
                style={[
                  styles.categoryName,
                  selected && styles.categoryNameOn,
                ]}
              >
                {cat.name}
              </Text>
              <Checkbox checked={selected} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            selectedIds.size === 0 && styles.primaryButtonDisabled,
          ]}
          onPress={onNext}
          activeOpacity={0.85}
          disabled={selectedIds.size === 0}
        >
          <Text style={styles.primaryButtonText}>Next →</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// ----- Step 2 -----
function Step2({
  groups,
  checkedIds,
  onToggle,
  onSkip,
  onAdd,
  checkedCount,
}: {
  groups: TaskGroup[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onSkip: () => void;
  onAdd: () => void;
  checkedCount: number;
}) {
  return (
    <>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text style={styles.title}>Suggested Tasks</Text>
            <Text style={styles.subtitle}>
              Check the tasks you want to add to your household.
            </Text>
          </View>
          <TouchableOpacity
            onPress={onSkip}
            style={styles.skipLink}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
      >
        {groups.map((g) => (
          <View key={g.category.id} style={styles.groupBlock}>
            <Text style={styles.groupHeader}>
              {g.category.emoji} {g.category.name}
            </Text>
            {g.items.map((t) => {
              const checked = checkedIds.has(t.id);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.itemRow, checked && styles.itemRowOn]}
                  onPress={() => onToggle(t.id)}
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
        ))}
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
              ? 'Add 0 Tasks'
              : `Add ${checkedCount} ${checkedCount === 1 ? 'Task' : 'Tasks'} →`}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// ----- ConfigureTaskStep (one card per checked task) -----
function ConfigureTaskStep({
  task,
  index,
  total,
  firstDue,
  frequency,
  intervalText,
  reminderDays,
  showDatePicker,
  onPressDate,
  onChangeDate,
  onChangeFrequency,
  onChangeInterval,
  onChangeReminder,
  onSave,
  onSkip,
  submitting,
  error,
}: {
  task: SuggestedTask;
  index: number;
  total: number;
  firstDue: Date;
  frequency: RecurrenceFrequency;
  intervalText: string;
  reminderDays: number;
  showDatePicker: boolean;
  onPressDate: () => void;
  onChangeDate: (e: DateTimePickerEvent, d: Date | undefined) => void;
  onChangeFrequency: (f: RecurrenceFrequency) => void;
  onChangeInterval: (v: string) => void;
  onChangeReminder: (days: number) => void;
  onSave: () => void;
  onSkip: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <>
      <View style={styles.titleBlock}>
        {total > 1 ? (
          <Text style={styles.queueCounter}>
            Task {index + 1} of {total}
          </Text>
        ) : null}
        <View style={styles.taskHeading}>
          {task.icon ? (
            <Text style={styles.taskHeadingIcon}>{task.icon}</Text>
          ) : null}
          <Text style={styles.title}>{task.name}</Text>
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
            {format(firstDue, 'EEE, MMM d, yyyy')}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        {showDatePicker ? (
          <DateTimePicker
            value={firstDue}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeDate}
          />
        ) : null}

        <Text style={styles.fieldLabel}>How often does it repeat?</Text>
        <View style={styles.frequencyRow}>
          {FREQUENCY_OPTIONS.map((opt) => {
            const active = opt.key === frequency;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.freqChip, active && styles.freqChipOn]}
                onPress={() => onChangeFrequency(opt.key)}
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
            value={intervalText}
            onChangeText={onChangeInterval}
            keyboardType="number-pad"
            editable={!submitting}
            selectTextOnFocus
          />
          <Text style={styles.intervalUnit}>
            {unitWord(frequency, parsePositiveInt(intervalText, 1))}
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Remind me</Text>
        <View style={styles.reminderColumn}>
          {REMINDER_OPTIONS.map((opt) => {
            const active = opt.days === reminderDays;
            return (
              <TouchableOpacity
                key={opt.days}
                style={[styles.reminderRow, active && styles.reminderRowOn]}
                onPress={() => onChangeReminder(opt.days)}
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
            );
          })}
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
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </>
  );
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

// ----- Step 3 -----
function Step3({
  groups,
  checkedIds,
  onToggle,
  onSkip,
  onAdd,
  submitting,
  error,
  checkedCount,
}: {
  groups: SupplyGroup[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onSkip: () => void;
  onAdd: () => void;
  submitting: boolean;
  error: string | null;
  checkedCount: number;
}) {
  return (
    <>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text style={styles.title}>Suggested Supplies</Text>
            <Text style={styles.subtitle}>
              Check the supplies you'd like to track.
            </Text>
          </View>
          <TouchableOpacity
            onPress={onSkip}
            style={styles.skipLink}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
      >
        {groups.map((g) => (
          <View key={g.category.id} style={styles.groupBlock}>
            <Text style={styles.groupHeader}>
              {g.category.emoji} {g.category.name}
            </Text>
            {g.items.map((s) => {
              const checked = checkedIds.has(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.itemRow, checked && styles.itemRowOn]}
                  onPress={() => onToggle(s.id)}
                  activeOpacity={0.7}
                  disabled={submitting}
                >
                  <Checkbox checked={checked} />
                  {s.icon ? (
                    <Text style={styles.itemIcon}>{s.icon}</Text>
                  ) : null}
                  <View style={styles.flex}>
                    <Text style={styles.itemName}>{s.name}</Text>
                    <Text style={styles.itemMeta}>
                      Default: {s.defaultQty} {s.unit}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={styles.bottomBar}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (checkedCount === 0 || submitting) && styles.primaryButtonDisabled,
          ]}
          onPress={onAdd}
          activeOpacity={0.85}
          disabled={submitting || checkedCount === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {checkedCount === 0
                ? 'Add 0 Supplies'
                : `Add ${checkedCount} ${checkedCount === 1 ? 'Supply' : 'Supplies'} →`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

// ----- Step 4 -----
function Step4({
  mode,
  taskCount,
  supplyCount,
  onDone,
}: {
  mode: SetupWizardMode;
  taskCount: number;
  supplyCount: number;
  onDone: () => void;
}) {
  const summary =
    taskCount === 0 && supplyCount === 0
      ? "We're ready when you are."
      : `Added ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} and ${supplyCount} ${supplyCount === 1 ? 'supply' : 'supplies'} to your household`;
  const buttonLabel = mode === 'firstTime' ? "Let's go!" : 'Done';

  return (
    <>
      <View style={[styles.flex, styles.center, styles.padded]}>
        <Text style={styles.bigEmoji}>🎉</Text>
        <Text style={styles.title}>Your household is ready</Text>
        <Text style={styles.subtitle}>{summary}</Text>
      </View>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onDone}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// ----- Checkbox -----
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeTop: {
    backgroundColor: Colors.headerBackground,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padded: {
    paddingHorizontal: 28,
  },
  header: {
    backgroundColor: Colors.headerBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressDotActive: {
    width: 24,
    backgroundColor: Colors.primary,
  },
  progressDotDone: {
    backgroundColor: Colors.primary,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  bigEmoji: {
    fontSize: 72,
    marginBottom: 16,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 12,
  },
  categoryCardOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  categoryEmoji: {
    fontSize: 28,
  },
  categoryName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  categoryNameOn: {
    color: Colors.primary,
  },
  groupBlock: {
    marginBottom: 18,
  },
  groupHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  itemRowOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  itemIcon: {
    fontSize: 20,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
  },
  checkboxOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  skipLink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  skipFullRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: Colors.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  // Configure-task-step styles
  queueCounter: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  taskHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taskHeadingIcon: {
    fontSize: 32,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  chevron: {
    fontSize: 22,
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
    backgroundColor: Colors.primary,
  },
  freqChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  freqChipTextOn: {
    color: '#FFFFFF',
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  intervalEvery: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  intervalInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    textAlign: 'center',
    color: Colors.textPrimary,
    backgroundColor: Colors.cardBackground,
  },
  intervalUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  reminderColumn: {
    gap: 6,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderRowOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  reminderText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  reminderTextOn: {
    color: Colors.primary,
  },
  reminderCheck: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
});
