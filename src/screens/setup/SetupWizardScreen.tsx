import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import { createTask, getTasks } from '../../services/taskService';
import {
  addProductUsageToTask,
  createProduct,
  getProducts,
  updateProduct,
} from '../../services/productService';
import { markSetupWizardComplete } from '../../services/householdService';
import {
  SUGGESTED_SUPPLIES,
  SuggestedSupply,
  SuggestedTask,
  WIZARD_CATEGORIES,
  WizardCategory,
  WizardCategoryId,
  getSuggestedSuppliesFor,
  getSuggestedTasksFor,
} from '../../data/suggested';
import {
  AutoDepletionUnit,
  DepletionMode,
  Product,
  RecurrenceFrequency,
  ThresholdType,
} from '../../types/models';
import { Colors } from '../../constants/colors';

// Smart defaults for threshold based on supply type
function getSmartThresholdDefaults(supplyId: string, supplyName: string): { type: ThresholdType; value: number } {
  const id = supplyId.toLowerCase();
  const name = supplyName.toLowerCase();

  // Percentage defaults (25%)
  if (id.includes('fertilizer') || name.includes('fertilizer')) {
    return { type: 'percentage', value: 25 };
  }
  if (id.includes('pool-') || name.includes('pool ')) {
    return { type: 'percentage', value: 25 };
  }
  if (id.includes('hot-tub') || name.includes('hot tub')) {
    return { type: 'percentage', value: 25 };
  }

  // Quantity defaults with specific values
  if (id.includes('prescription') || name.includes('prescription')) {
    return { type: 'quantity', value: 7 };
  }
  if (id.includes('vitamins') || name.includes('vitamin')) {
    return { type: 'quantity', value: 7 };
  }
  if (id.includes('contacts') || name.includes('contact lens')) {
    return { type: 'quantity', value: 7 };
  }
  if (id.includes('smoke-batteries') || name.includes('smoke detector')) {
    return { type: 'quantity', value: 2 };
  }

  // Default: quantity with value 1
  return { type: 'quantity', value: 1 };
}

export type SetupWizardMode = 'firstTime';

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

interface TaskDraft {
  name: string;
  firstDue: Date;
  frequency: RecurrenceFrequency;
  intervalText: string;
  reminderDays: number | null;
}

type SupplyPromptState =
  | {
      scenario: 'add';
      supply: SuggestedSupply;
      // Id of the task that triggered this prompt — captured so we can write
      // a TaskProductUsage record linking the new supply to the just-created
      // task (so the supply detail page shows it as linked).
      taskId: string;
    }
  | {
      scenario: 'update';
      supply: SuggestedSupply;
      product: Product;
      taskId: string;
    };

const TOTAL_STEPS = 3;

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

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// Tasks that have an associated supply: when one of these tasks is added in
// the wizard's per-task queue, the user is prompted to set up / update the
// matching supply. Keyed by normalized task name → suggested-supply id.
// Some entries map to tasks that don't exist in SUGGESTED_TASKS yet — those
// are forward-looking and only fire if a future task name matches.
const TASK_NAME_TO_SUPPLY_ID: Record<string, string> = {
  'replace hvac filter': 'hvac-filters',
  'replace refrigerator filter': 'fridge-water-filter',
  'replace windshield wipers': 'wipers',
  'car cabin air filter': 'cabin-filter',
  'prescription refill': 'prescription',
  'flea & tick treatment': 'pet-flea-tick',
  'heartworm prevention': 'pet-heartworm',
  'service lawnmower': 'small-engine-oil',
  'test smoke detectors': 'smoke-batteries',
  'clean dishwasher': 'dishwasher-cleaner',
  'clean washing machine': 'washer-cleaner',
  'refill water softener': 'softener-salt',
  'pool chemical check': 'pool-chlorine',
  'hot tub maintenance': 'smartchlor-cartridge',
};

function findAssociatedSupply(taskName: string): SuggestedSupply | null {
  const supplyId = TASK_NAME_TO_SUPPLY_ID[normalize(taskName)];
  if (!supplyId) return null;
  for (const cat of SUGGESTED_SUPPLIES) {
    const found = cat.supplies.find((s) => s.id === supplyId);
    if (found) return found;
  }
  return null;
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

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<WizardCategoryId>>(new Set());
  const [expandedSupplyCategoryIds, setExpandedSupplyCategoryIds] = useState<Set<WizardCategoryId>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existingTaskNames, setExistingTaskNames] = useState<Set<string>>(
    new Set()
  );
  const [existingSupplyNames, setExistingSupplyNames] = useState<Set<string>>(
    new Set()
  );
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
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
  // the current task in `taskQueue`. Per-task edits live in `drafts` (keyed
  // by suggested-task id) so navigating Back/forward preserves user input.
  const [configIndex, setConfigIndex] = useState<number | null>(null);
  const [taskQueue, setTaskQueue] = useState<SuggestedTask[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TaskDraft>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [supplyPrompt, setSupplyPrompt] = useState<SupplyPromptState | null>(
    null
  );
  // Tracks supply ids we've already prompted for in this wizard session, so a
  // shared supply (e.g. two tasks both linked to the same filter) only prompts
  // once.
  const promptedSupplyIds = useRef<Set<string>>(new Set());

  // Load existing data on mount
  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;
    Promise.all([getTasks(householdId), getProducts(householdId)])
      .then(([tasks, products]) => {
        if (cancelled) return;
        setExistingTaskNames(new Set(tasks.map((t) => normalize(t.name))));
        setExistingSupplyNames(new Set(products.map((p) => normalize(p.name))));
        setExistingProducts(products);
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

  // All categories with at least one remaining task (for accordion display)
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

  // All categories with at least one remaining supply
  const supplyGroups: SupplyGroup[] = useMemo(() => {
    const groups: SupplyGroup[] = [];
    for (const cat of WIZARD_CATEGORIES) {
      const items = getSuggestedSuppliesFor(cat.id).filter(
        (s) => !existingSupplyNames.has(normalize(s.name))
      );
      if (items.length > 0) groups.push({ category: cat, items });
    }
    return groups;
  }, [existingSupplyNames]);

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
  // Step 1 (accordion tasks) -> configure queue -> Step 2 (supplies) -> Step 3 (done)
  const advanceFrom1 = () => {
    if (supplyGroups.length > 0) setStep(2);
    else setStep(3);
  };

  const updateDraft = (taskId: string, patch: Partial<TaskDraft>) => {
    setDrafts((prev) => {
      const existing = prev[taskId];
      if (!existing) return prev;
      return { ...prev, [taskId]: { ...existing, ...patch } };
    });
  };

  // CHANGE 2: kick off the per-task configuration queue.
  const startConfigureQueue = () => {
    if (checkedTasks.length === 0) {
      advanceFrom1();
      return;
    }
    setSubmitError(null);
    // Ensure each task has a draft. Existing drafts (from a prior visit
    // through the queue) are preserved.
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
      // Queue done — exit config mode and continue to supplies
      setConfigIndex(null);
      setTaskQueue([]);
      advanceFrom1();
    } else {
      setConfigIndex(nextIndex);
    }
  };

  const handleConfigureSave = async () => {
    if (configIndex === null) return;
    if (!user || !householdId) return;
    const task = taskQueue[configIndex];
    const draft = drafts[task.id];
    if (!draft) return;
    setSubmitting(true);
    setSubmitError(null);
    const userLabel = user.displayName ?? user.email ?? user.uid;
    try {
      const newTaskId = await createTask(
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
      setSubmitting(false);

      // CHANGE 2: prompt for associated supply (if any) before advancing.
      const supply = findAssociatedSupply(task.name);
      if (supply && !promptedSupplyIds.current.has(supply.id)) {
        promptedSupplyIds.current.add(supply.id);
        const existing = existingProducts.find(
          (p) => normalize(p.name) === normalize(supply.name)
        );
        if (existing) {
          setSupplyPrompt({
            scenario: 'update',
            supply,
            product: existing,
            taskId: newTaskId,
          });
        } else {
          setSupplyPrompt({ scenario: 'add', supply, taskId: newTaskId });
        }
        return; // queue advance happens after the prompt resolves
      }

      advanceConfigQueue(configIndex + 1);
    } catch (e) {
      const err = e as { message?: string };
      setSubmitError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  // ----- Supply prompt handlers (CHANGE 2) -----
  const closeSupplyPromptAndAdvance = () => {
    const next = configIndex !== null ? configIndex + 1 : 0;
    setSupplyPrompt(null);
    if (configIndex !== null) advanceConfigQueue(next);
  };

  const handleSupplyPromptAdd = async (data: {
    name: string;
    qty: number;
    unit: string;
    amazonUrl: string;
    thresholdType: 'qty' | 'pct';
    thresholdQty: number;
    thresholdPct: number;
    depletionMode: DepletionMode;
    autoDepletionRate: number;
    autoDepletionUnit: AutoDepletionUnit;
  }) => {
    if (supplyPrompt?.scenario !== 'add') return;
    if (!user || !householdId) return;
    const userLabel = user.displayName ?? user.email ?? user.uid;
    const supply = supplyPrompt.supply;
    const taskId = supplyPrompt.taskId;
    try {
      const thresholdType: ThresholdType = data.thresholdType === 'qty' ? 'quantity' : 'percentage';
      const thresholdValue = data.thresholdType === 'qty' ? data.thresholdQty : data.thresholdPct;
      const newId = await createProduct(householdId, userLabel, {
        householdId,
        name: data.name,
        amazonUrl: data.amazonUrl,
        containerUnit: data.unit,
        currentQuantity: data.qty,
        thresholdType,
        thresholdValue,
        depletionMode: data.depletionMode,
        autoDepletionRate: data.autoDepletionRate,
        autoDepletionUnit: data.autoDepletionUnit,
      });
      // Link the new supply to the task that triggered this prompt by writing
      // a TaskProductUsage record. Default usage = 1 of the supply's unit per
      // task completion. Without this, the supply detail page would show
      // "Not yet linked to any task" even though the user just created it
      // through the per-task wizard flow.
      try {
        await addProductUsageToTask(
          householdId,
          taskId,
          newId,
          data.name,
          1,
          data.unit
        );
      } catch (e) {
        console.warn('[SetupWizard] link new supply to task failed:', e);
      }
      // Reflect the new product locally so a subsequent prompt for the same
      // supply (shouldn't happen due to promptedSupplyIds, but defensive)
      // would see scenario 'update', and the supplies-step filtering hides it.
      setExistingSupplyNames((prev) => {
        const next = new Set(prev);
        next.add(normalize(data.name));
        return next;
      });
      setExistingProducts((prev) => [
        ...prev,
        {
          id: newId,
          householdId,
          name: data.name,
          amazonUrl: data.amazonUrl,
          containerUnit: data.unit,
          currentQuantity: data.qty,
          thresholdType: data.thresholdType === 'qty' ? 'quantity' : 'percentage',
          thresholdValue: data.thresholdType === 'qty' ? data.thresholdQty : data.thresholdPct,
          lowThresholdPercent: data.thresholdType === 'pct' ? data.thresholdPct : 25,
          lowThresholdQty: data.thresholdType === 'qty' ? data.thresholdQty : null,
          lastPurchasedAt: null,
          lastPurchasePrice: null,
          purchasePending: false,
          purchasePendingAt: null,
          createdAt: new Date(),
          createdBy: userLabel,
          depletionMode: data.depletionMode,
          autoDepletionRate: data.autoDepletionRate,
          autoDepletionUnit: data.autoDepletionUnit,
          lastAutoDepletedAt: null,
          lowStockNotifiedAt: null,
        },
      ]);
      setAddedSupplyCount((c) => c + 1);
    } catch (e) {
      console.warn('[SetupWizard] supply prompt add failed:', e);
    }
    closeSupplyPromptAndAdvance();
  };

  const handleSupplyPromptUpdate = async (qty: number) => {
    if (supplyPrompt?.scenario !== 'update') return;
    if (!householdId) return;
    const product = supplyPrompt.product;
    const supply = supplyPrompt.supply;
    const taskId = supplyPrompt.taskId;
    try {
      await updateProduct(householdId, product.id, { currentQuantity: qty });
      setExistingProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, currentQuantity: qty } : p
        )
      );
    } catch (e) {
      console.warn('[SetupWizard] supply prompt update failed:', e);
    }
    // Also link the existing supply to the just-created task. Without this,
    // the user has the supply on hand but the supply detail screen wouldn't
    // know the new task uses it.
    try {
      await addProductUsageToTask(
        householdId,
        taskId,
        product.id,
        product.name,
        1,
        product.containerUnit || supply.unit
      );
    } catch (e) {
      console.warn('[SetupWizard] link existing supply to task failed:', e);
    }
    closeSupplyPromptAndAdvance();
  };

  const handleSupplyPromptDismiss = () => {
    closeSupplyPromptAndAdvance();
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
      // First task → return to the accordion task selection (Step 1).
      // Drafts are intentionally NOT cleared so re-entering the queue
      // restores the user's edits.
      setConfigIndex(null);
      setTaskQueue([]);
      setStep(1);
    } else {
      setConfigIndex(configIndex - 1);
    }
  };

  const handleAddSupplies = async () => {
    if (!user || !householdId) return;
    if (checkedSupplies.length === 0) {
      setStep(3);
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
            const thresholdDefaults = getSmartThresholdDefaults(s.id, s.name);
            await createProduct(householdId, userLabel, {
              householdId,
              name: s.name,
              amazonUrl: '',
              containerUnit: s.unit,
              currentQuantity: s.defaultQty,
              thresholdType: thresholdDefaults.type,
              thresholdValue: thresholdDefaults.value,
            });
            writtenSupplyIds.current.add(s.id);
          })
      );
      setAddedSupplyCount(writtenSupplyIds.current.size);
      setSubmitting(false);
      setStep(3);
    } catch (e) {
      const err = e as { message?: string };
      setSubmitError(err.message ?? String(e));
      setAddedSupplyCount(writtenSupplyIds.current.size);
      setSubmitting(false);
    }
  };

  const handleSkipTasks = () => {
    setSubmitError(null);
    advanceFrom1();
  };
  const handleSkipSupplies = () => {
    setSubmitError(null);
    setStep(3);
  };

  const handleClose = () => {
    // First-time wizard - reset navigation to main screen
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const handleDone = async () => {
    // Mark setup wizard as complete
    if (user) {
      try {
        await markSetupWizardComplete(user.uid);
      } catch (e) {
        console.warn('[SetupWizard] markSetupWizardComplete failed:', e);
      }
    }
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const toggleCategoryExpanded = (id: WizardCategoryId) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSupplyCategoryExpanded = (id: WizardCategoryId) => {
    setExpandedSupplyCategoryIds((prev) => {
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
    if (event.type === 'set' && selected && configIndex !== null) {
      const taskId = taskQueue[configIndex]?.id;
      if (taskId) updateDraft(taskId, { firstDue: selected });
    }
  };

  // ----- Render -----
  const inConfigQueue = configIndex !== null;
  // In first-time wizard, don't show close button (user should complete the wizard)
  const showCloseButton = false;
  const showBackButton = inConfigQueue;

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
            showBack={false}
            onBack={handleConfigureBack}
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Header
          showBack={showBackButton}
          onBack={handleConfigureBack}
          showClose={showCloseButton}
          onClose={handleClose}
          step={step}
        />
        {inConfigQueue &&
        configIndex !== null &&
        drafts[taskQueue[configIndex]?.id] ? (
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
        ) : step === 1 ? (
          <Step1Accordion
            groups={taskGroups}
            expandedIds={expandedCategoryIds}
            checkedIds={checkedTaskIds}
            onToggleExpand={toggleCategoryExpanded}
            onToggleTask={toggleTask}
            onSkip={handleSkipTasks}
            onAdd={startConfigureQueue}
            checkedCount={checkedTasks.length}
          />
        ) : step === 2 ? (
          <Step2Supplies
            groups={supplyGroups}
            expandedIds={expandedSupplyCategoryIds}
            checkedIds={checkedSupplyIds}
            onToggleExpand={toggleSupplyCategoryExpanded}
            onToggle={toggleSupply}
            onSkip={handleSkipSupplies}
            onAdd={handleAddSupplies}
            submitting={submitting}
            error={submitError}
            checkedCount={checkedSupplies.length}
          />
        ) : step === 3 ? (
          <Step3Done
            taskCount={addedTaskCount}
            supplyCount={addedSupplyCount}
            onDone={handleDone}
          />
        ) : null}
      </KeyboardAvoidingView>
      <SupplySheet
        prompt={supplyPrompt}
        onAdd={handleSupplyPromptAdd}
        onUpdate={handleSupplyPromptUpdate}
        onDismiss={handleSupplyPromptDismiss}
      />
    </View>
  );
}

// ----- Header -----
function Header({
  step,
  showBack,
  onBack,
  showClose,
  onClose,
}: {
  step: 1 | 2 | 3 | null;
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

// ----- Step 1: Accordion Tasks -----
function Step1Accordion({
  groups,
  expandedIds,
  checkedIds,
  onToggleExpand,
  onToggleTask,
  onSkip,
  onAdd,
  checkedCount,
}: {
  groups: TaskGroup[];
  expandedIds: Set<WizardCategoryId>;
  checkedIds: Set<string>;
  onToggleExpand: (id: WizardCategoryId) => void;
  onToggleTask: (id: string) => void;
  onSkip: () => void;
  onAdd: () => void;
  checkedCount: number;
}) {
  // Count selected tasks per category
  const selectedCountByCategory = (categoryId: WizardCategoryId): number => {
    const group = groups.find((g) => g.category.id === categoryId);
    if (!group) return 0;
    return group.items.filter((t) => checkedIds.has(t.id)).length;
  };

  return (
    <>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Set up your household</Text>
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
              ? 'Add 0 Tasks'
              : `Add ${checkedCount} ${checkedCount === 1 ? 'Task' : 'Tasks'} →`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSkip}
          style={styles.skipFullRow}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
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
  // Custom reminder state
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
    // Set a default custom value
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
    ? `${customReminderLabel(draft.reminderDays)} ✏️`
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
          <View style={styles.pencilIcon}>
            <Text style={styles.pencilEmoji}>✏️</Text>
          </View>
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
                <Text style={styles.customConfirmText}>Set Reminder</Text>
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

// ----- Step 2: Supplies (Accordion pattern) -----
function Step2Supplies({
  groups,
  expandedIds,
  checkedIds,
  onToggleExpand,
  onToggle,
  onSkip,
  onAdd,
  submitting,
  error,
  checkedCount,
}: {
  groups: SupplyGroup[];
  expandedIds: Set<WizardCategoryId>;
  checkedIds: Set<string>;
  onToggleExpand: (id: WizardCategoryId) => void;
  onToggle: (id: string) => void;
  onSkip: () => void;
  onAdd: () => void;
  submitting: boolean;
  error: string | null;
  checkedCount: number;
}) {
  // Count selected supplies per category
  const selectedCountByCategory = (categoryId: WizardCategoryId): number => {
    const group = groups.find((g) => g.category.id === categoryId);
    if (!group) return 0;
    return group.items.filter((s) => checkedIds.has(s.id)).length;
  };

  return (
    <>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Suggested Supplies</Text>
        <Text style={styles.subtitle}>Choose the supplies you want to track</Text>
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
                disabled={submitting}
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
              ) : null}
            </View>
          );
        })}
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
        <TouchableOpacity
          onPress={onSkip}
          style={styles.skipFullRow}
          activeOpacity={0.7}
          disabled={submitting}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// ----- SupplySheet (prompt after a task is saved) -----
type SheetThresholdType = 'qty' | 'pct';

function SupplySheet({
  prompt,
  onAdd,
  onUpdate,
  onDismiss,
}: {
  prompt: SupplyPromptState | null;
  onAdd: (data: {
    name: string;
    qty: number;
    unit: string;
    amazonUrl: string;
    thresholdType: SheetThresholdType;
    thresholdQty: number;
    thresholdPct: number;
    depletionMode: DepletionMode;
    autoDepletionRate: number;
    autoDepletionUnit: AutoDepletionUnit;
  }) => void;
  onUpdate: (qty: number) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();

  // State for all editable fields
  const [nameText, setNameText] = useState('');
  const [qtyText, setQtyText] = useState('0');
  const [unitText, setUnitText] = useState('');
  const [amazonUrl, setAmazonUrl] = useState('');

  // Reorder threshold state
  const [thresholdType, setThresholdType] = useState<SheetThresholdType>('qty');
  const [thresholdQtyText, setThresholdQtyText] = useState('1');
  const [thresholdPctText, setThresholdPctText] = useState('25');

  // Depletion mode state
  const [depletionMode, setDepletionMode] = useState<DepletionMode>('task');
  const [autoRateText, setAutoRateText] = useState('1');
  const [autoUnit, setAutoUnit] = useState<AutoDepletionUnit>('day');

  // Track which prompt we've seeded for
  const seedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!prompt) {
      seedKeyRef.current = null;
      return;
    }
    const key = `${prompt.scenario}:${prompt.supply.id}`;
    if (seedKeyRef.current !== key) {
      seedKeyRef.current = key;
      // Seed all fields based on scenario
      if (prompt.scenario === 'add') {
        setNameText(prompt.supply.name);
        setQtyText(String(prompt.supply.defaultQty));
        setUnitText(prompt.supply.unit);
        setAmazonUrl('');
        // Reset threshold to defaults
        setThresholdType('qty');
        setThresholdQtyText('1');
        setThresholdPctText('25');

        // Smart defaults for depletion mode based on supply name/id
        const supplyId = prompt.supply.id.toLowerCase();
        const supplyName = prompt.supply.name.toLowerCase();
        const autoSupplies = [
          'prescription', 'vitamins', 'contacts', 'contact lenses',
          'dishwasher-cleaner', 'washer-cleaner', 'softener-salt',
          'septic-tablets', 'lawn-fertilizer',
        ];
        const isAutoSupply = autoSupplies.some(
          (s) => supplyId.includes(s) || supplyName.includes(s.replace('-', ' '))
        );

        if (isAutoSupply) {
          setDepletionMode('auto');
          // Set smart defaults for rate
          if (supplyId.includes('prescription') || supplyId.includes('vitamins') || supplyId.includes('contacts')) {
            setAutoRateText('1');
            setAutoUnit('day');
          } else if (supplyId.includes('dishwasher') || supplyId.includes('washer') ||
                     supplyId.includes('softener') || supplyId.includes('septic') ||
                     supplyId.includes('fertilizer')) {
            setAutoRateText('1');
            setAutoUnit('month');
          } else {
            setAutoRateText('1');
            setAutoUnit('day');
          }
        } else {
          setDepletionMode('task');
          setAutoRateText('1');
          setAutoUnit('day');
        }
      } else {
        setNameText(prompt.product.name);
        setQtyText(String(prompt.product.currentQuantity));
        setUnitText(prompt.product.containerUnit || prompt.supply.unit);
        setAmazonUrl(prompt.product.amazonUrl || '');
        // Use existing depletion settings for updates
        setDepletionMode(prompt.product.depletionMode || 'task');
        setAutoRateText(String(prompt.product.autoDepletionRate || 1));
        setAutoUnit(prompt.product.autoDepletionUnit || 'day');
      }
    }
  }, [prompt]);

  if (!prompt) return null;

  const supply = prompt.supply;
  const isAdd = prompt.scenario === 'add';

  const parsedQty = parseInt(qtyText, 10);
  const safeQty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;
  const inc = () => setQtyText(String(safeQty + 1));
  const dec = () => setQtyText(String(Math.max(0, safeQty - 1)));

  const title = isAdd ? 'Add New Supply' : 'Update Supply';

  // Parse threshold values
  const parsedThresholdQty = parseInt(thresholdQtyText, 10);
  const safeThresholdQty =
    Number.isFinite(parsedThresholdQty) && parsedThresholdQty >= 0
      ? parsedThresholdQty
      : 1;
  const parsedThresholdPct = parseInt(thresholdPctText, 10);
  const safeThresholdPct =
    Number.isFinite(parsedThresholdPct) && parsedThresholdPct >= 0 && parsedThresholdPct <= 100
      ? parsedThresholdPct
      : 25;

  // Calculate what the percentage threshold means in quantity terms (based on current qty)
  const pctAsQty = Math.floor((safeThresholdPct / 100) * safeQty);

  // Parse auto depletion rate
  const parsedAutoRate = parseInt(autoRateText, 10);
  const safeAutoRate = Number.isFinite(parsedAutoRate) && parsedAutoRate > 0 ? parsedAutoRate : 1;

  // Calculate estimated duration
  const calcDuration = (): string => {
    if (depletionMode !== 'auto') return '';
    if (safeAutoRate <= 0 || safeQty <= 0) return '';

    let daysPerUnit: number;
    switch (autoUnit) {
      case 'day':
        daysPerUnit = 1;
        break;
      case 'week':
        daysPerUnit = 7;
        break;
      case 'month':
        daysPerUnit = 30;
        break;
    }
    const totalDays = Math.floor((safeQty / safeAutoRate) * daysPerUnit);

    if (totalDays >= 365) {
      const years = Math.floor(totalDays / 365);
      const months = Math.floor((totalDays % 365) / 30);
      return months > 0
        ? `${years} year${years === 1 ? '' : 's'} ${months} month${months === 1 ? '' : 's'}`
        : `${years} year${years === 1 ? '' : 's'}`;
    }
    if (totalDays >= 30) {
      const months = Math.floor(totalDays / 30);
      return `${months} month${months === 1 ? '' : 's'}`;
    }
    if (totalDays >= 7) {
      const weeks = Math.floor(totalDays / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'}`;
    }
    return `${totalDays} day${totalDays === 1 ? '' : 's'}`;
  };

  const handlePrimary = () => {
    if (isAdd) {
      onAdd({
        name: nameText.trim() || supply.name,
        qty: safeQty,
        unit: unitText.trim() || supply.unit,
        amazonUrl: amazonUrl.trim(),
        thresholdType,
        thresholdQty: safeThresholdQty,
        thresholdPct: safeThresholdPct,
        depletionMode,
        autoDepletionRate: safeAutoRate,
        autoDepletionUnit: autoUnit,
      });
    } else {
      onUpdate(safeQty);
    }
  };

  const primaryLabel = isAdd ? 'Add to Supplies' : 'Update Quantity';
  const secondaryLabel = isAdd ? 'Skip for Now' : 'Looks Good';
  const canSubmit = isAdd ? nameText.trim().length > 0 : true;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={sheetStyles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={sheetStyles.overlay} onPress={onDismiss}>
          <Pressable
            style={[sheetStyles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={() => {}}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={sheetStyles.handle} />
              {isAdd ? (
                <View style={sheetStyles.nameCard}>
                  {supply.icon ? (
                    <Text style={sheetStyles.supplyHeadingIcon}>{supply.icon}</Text>
                  ) : null}
                  <TextInput
                    style={sheetStyles.nameInput}
                    value={nameText}
                    onChangeText={setNameText}
                    placeholder="Enter supply name"
                    placeholderTextColor="#9CA3AF"
                    returnKeyType="done"
                    maxLength={100}
                  />
                  <Text style={sheetStyles.pencilEmoji}>✏️</Text>
                </View>
              ) : (
                <Text style={sheetStyles.title}>{title}</Text>
              )}

              {isAdd ? (
                <>
                  {/* Quantity */}
                  <Text style={sheetStyles.fieldLabel}>
                    How many do you have on hand?
                  </Text>
                  <View style={sheetStyles.qtyRow}>
                    <TouchableOpacity
                      onPress={dec}
                      style={sheetStyles.stepperButton}
                      activeOpacity={0.7}
                      accessibilityLabel="Decrease quantity"
                    >
                      <Text style={sheetStyles.stepperButtonText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={sheetStyles.qtyInput}
                      value={qtyText}
                      onChangeText={(v) => setQtyText(v.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      onPress={inc}
                      style={sheetStyles.stepperButton}
                      activeOpacity={0.7}
                      accessibilityLabel="Increase quantity"
                    >
                      <Text style={sheetStyles.stepperButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Unit */}
                  <Text style={sheetStyles.fieldLabel}>
                    Unit (e.g. filters, doses, bags)
                  </Text>
                  <TextInput
                    style={sheetStyles.textInput}
                    value={unitText}
                    onChangeText={setUnitText}
                    placeholder={supply.unit}
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="none"
                  />

                  {/* Purchase URL */}
                  <Text style={sheetStyles.fieldLabel}>
                    Online Purchase Link (optional)
                  </Text>
                  <TextInput
                    style={sheetStyles.textInput}
                    value={amazonUrl}
                    onChangeText={setAmazonUrl}
                    placeholder="Paste a link e.g. Amazon, Chewy, Walmart"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />

                  {/* Reorder Alert Section */}
                  <Text style={sheetStyles.sectionLabel}>Reorder Alert</Text>
                  <Text style={sheetStyles.sectionHint}>
                    Alert me when I'm running low
                  </Text>

                  {/* Option 1: By Quantity */}
                  <TouchableOpacity
                    style={[
                      sheetStyles.thresholdOption,
                      thresholdType === 'qty' && sheetStyles.thresholdOptionActive,
                    ]}
                    onPress={() => {
                      if (thresholdType === 'pct') {
                        // Convert percentage to quantity
                        if (safeQty > 0) {
                          const qty = Math.round((safeThresholdPct / 100) * safeQty);
                          setThresholdQtyText(String(Math.max(1, qty)));
                        } else {
                          setThresholdQtyText('1');
                        }
                      }
                      setThresholdType('qty');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={sheetStyles.thresholdRadio}>
                      {thresholdType === 'qty' ? (
                        <View style={sheetStyles.thresholdRadioInner} />
                      ) : null}
                    </View>
                    <View style={sheetStyles.thresholdContent}>
                      <Text style={sheetStyles.thresholdLabel}>
                        Alert me when I reach
                      </Text>
                      <View style={sheetStyles.thresholdInputRow}>
                        <TextInput
                          style={sheetStyles.thresholdInput}
                          value={thresholdQtyText}
                          onChangeText={(v) =>
                            setThresholdQtyText(v.replace(/[^0-9]/g, ''))
                          }
                          keyboardType="number-pad"
                          selectTextOnFocus
                          editable={thresholdType === 'qty'}
                        />
                        <Text style={sheetStyles.thresholdUnit}>
                          {unitText.trim() || supply.unit} remaining
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Option 2: By Percentage */}
                  <TouchableOpacity
                    style={[
                      sheetStyles.thresholdOption,
                      thresholdType === 'pct' && sheetStyles.thresholdOptionActive,
                    ]}
                    onPress={() => {
                      if (thresholdType === 'qty') {
                        // Convert quantity to percentage
                        if (safeQty > 0) {
                          const pct = Math.round((safeThresholdQty / safeQty) * 100);
                          setThresholdPctText(String(Math.min(99, Math.max(1, pct))));
                        } else {
                          setThresholdPctText('25');
                        }
                      }
                      setThresholdType('pct');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={sheetStyles.thresholdRadio}>
                      {thresholdType === 'pct' ? (
                        <View style={sheetStyles.thresholdRadioInner} />
                      ) : null}
                    </View>
                    <View style={sheetStyles.thresholdContent}>
                      <Text style={sheetStyles.thresholdLabel}>
                        Alert me when I'm below
                      </Text>
                      <View style={sheetStyles.thresholdInputRow}>
                        <TextInput
                          style={sheetStyles.thresholdInput}
                          value={thresholdPctText}
                          onChangeText={(v) =>
                            setThresholdPctText(v.replace(/[^0-9]/g, ''))
                          }
                          keyboardType="number-pad"
                          selectTextOnFocus
                          editable={thresholdType === 'pct'}
                        />
                        <Text style={sheetStyles.thresholdUnit}>
                          % of my supply
                        </Text>
                      </View>
                      {thresholdType === 'pct' && safeQty > 0 ? (
                        <Text style={sheetStyles.thresholdHelper}>
                          That's when you reach {pctAsQty}{' '}
                          {unitText.trim() || supply.unit} remaining
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>

                  {/* Depletion Mode Section */}
                  <Text style={sheetStyles.sectionLabel}>How is this supply used?</Text>
                  <TouchableOpacity
                    style={[
                      sheetStyles.modeCard,
                      depletionMode === 'task' && sheetStyles.modeCardActive,
                    ]}
                    onPress={() => setDepletionMode('task')}
                    activeOpacity={0.7}
                  >
                    <Text style={sheetStyles.modeIcon}>✅</Text>
                    <View style={sheetStyles.modeContent}>
                      <Text style={[
                        sheetStyles.modeTitle,
                        depletionMode === 'task' && sheetStyles.modeTitleActive,
                      ]}>
                        When I complete a task
                      </Text>
                      <Text style={sheetStyles.modeDesc}>
                        Supply decreases when you mark a linked task as done
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      sheetStyles.modeCard,
                      depletionMode === 'auto' && sheetStyles.modeCardActive,
                    ]}
                    onPress={() => setDepletionMode('auto')}
                    activeOpacity={0.7}
                  >
                    <Text style={sheetStyles.modeIcon}>⏱️</Text>
                    <View style={sheetStyles.modeContent}>
                      <Text style={[
                        sheetStyles.modeTitle,
                        depletionMode === 'auto' && sheetStyles.modeTitleActive,
                      ]}>
                        Automatically over time
                      </Text>
                      <Text style={sheetStyles.modeDesc}>
                        Supply decreases on a schedule without needing a task
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {depletionMode === 'auto' ? (
                    <View style={sheetStyles.autoSection}>
                      <View style={sheetStyles.autoRateRow}>
                        <Text style={sheetStyles.autoLabel}>I use</Text>
                        <TextInput
                          style={sheetStyles.autoRateInput}
                          value={autoRateText}
                          onChangeText={(v) => setAutoRateText(v.replace(/[^0-9]/g, ''))}
                          keyboardType="number-pad"
                          selectTextOnFocus
                        />
                        <Text style={sheetStyles.autoLabel}>every</Text>
                      </View>
                      <View style={sheetStyles.unitChipRow}>
                        {(['day', 'week', 'month'] as AutoDepletionUnit[]).map((unit) => (
                          <TouchableOpacity
                            key={unit}
                            style={[
                              sheetStyles.unitChip,
                              autoUnit === unit && sheetStyles.unitChipActive,
                            ]}
                            onPress={() => setAutoUnit(unit)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                sheetStyles.unitChipText,
                                autoUnit === unit && sheetStyles.unitChipTextActive,
                              ]}
                            >
                              {unit.charAt(0).toUpperCase() + unit.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {calcDuration() ? (
                        <Text style={sheetStyles.durationHint}>
                          At this rate, your {safeQty} {unitText.trim() || supply.unit} will last {calcDuration()}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  {/* Supply Name - display only for existing supplies */}
                  <View style={sheetStyles.displayNameRow}>
                    <Text style={sheetStyles.displayNameLabel}>Supply:</Text>
                    <Text style={sheetStyles.displayNameValue}>
                      {prompt.product.name}
                    </Text>
                  </View>

                  {/* Quantity */}
                  <Text style={sheetStyles.fieldLabel}>
                    How many do you currently have on hand?
                  </Text>
                  <View style={sheetStyles.qtyRow}>
                    <TouchableOpacity
                      onPress={dec}
                      style={sheetStyles.stepperButton}
                      activeOpacity={0.7}
                      accessibilityLabel="Decrease quantity"
                    >
                      <Text style={sheetStyles.stepperButtonText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={sheetStyles.qtyInput}
                      value={qtyText}
                      onChangeText={(v) => setQtyText(v.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      onPress={inc}
                      style={sheetStyles.stepperButton}
                      activeOpacity={0.7}
                      accessibilityLabel="Increase quantity"
                    >
                      <Text style={sheetStyles.stepperButtonText}>+</Text>
                    </TouchableOpacity>
                    <Text style={sheetStyles.unitLabel}>{unitText}</Text>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[
                  sheetStyles.primaryButton,
                  !canSubmit && sheetStyles.primaryButtonDisabled,
                ]}
                onPress={handlePrimary}
                activeOpacity={0.85}
                disabled={!canSubmit}
              >
                <Text style={sheetStyles.primaryText}>{primaryLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={sheetStyles.secondaryButton}
                onPress={onDismiss}
                activeOpacity={0.85}
              >
                <Text style={sheetStyles.secondaryText}>{secondaryLabel}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  nameCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  supplyHeadingIcon: {
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
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    backgroundColor: '#FFFFFF',
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  displayNameLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginRight: 8,
  },
  displayNameValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  qtyInput: {
    minWidth: 80,
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  unitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  thresholdOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
    marginBottom: 10,
  },
  thresholdOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  thresholdRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  thresholdRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  thresholdContent: {
    flex: 1,
  },
  thresholdLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  thresholdInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thresholdInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  thresholdUnit: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  thresholdHelper: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
    marginBottom: 10,
    gap: 12,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  modeIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modeTitleActive: {
    color: Colors.primary,
  },
  modeDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  autoSection: {
    padding: 14,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  autoRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  autoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  autoRateInput: {
    width: 50,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: Colors.cardBackground,
    color: Colors.textPrimary,
  },
  unitChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  unitChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  unitChipTextActive: {
    color: '#FFFFFF',
  },
  durationHint: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});

// ----- Step 3: Done -----
function Step3Done({
  taskCount,
  supplyCount,
  onDone,
}: {
  taskCount: number;
  supplyCount: number;
  onDone: () => void;
}) {
  const summary =
    taskCount === 0 && supplyCount === 0
      ? "We're ready when you are."
      : `Added ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} and ${supplyCount} ${supplyCount === 1 ? 'supply' : 'supplies'} to your household`;
  const buttonLabel = "Let's go!";

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
  },
  headerSlot: {
    width: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSlotRight: {
    justifyContent: 'flex-end',
  },
  headerButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 32,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingBottom: 100,
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
  accordionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  accordionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  accordionChevron: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  accordionContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  selectedBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  selectedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  taskHeadingIcon: {
    fontSize: 32,
  },
  nameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  nameInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    padding: 0,
    margin: 0,
  },
  pencilIcon: {
    padding: 4,
  },
  pencilEmoji: {
    fontSize: 16,
    opacity: 0.5,
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
  reminderSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 2,
    marginLeft: 14,
  },
  customReminderBox: {
    marginTop: 8,
    marginLeft: 8,
    padding: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  customReminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customReminderInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 16,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  customUnitRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  customUnitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
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
    color: Colors.textMuted,
    fontWeight: '600',
  },
  customUnitTextOn: {
    color: Colors.primary,
  },
  customConfirmButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  customConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
