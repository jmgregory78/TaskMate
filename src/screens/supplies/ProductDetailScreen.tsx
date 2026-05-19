import { useCallback, useMemo, useState } from 'react';
import * as ExpoStatusBar from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { addDays, format, isToday, isBefore, startOfDay, differenceInDays } from 'date-fns';
import {
  calculateDaysRemaining,
  calculateReorderDate,
  calculateRunOutDate,
  getThresholdQty,
  isMinimalThreshold,
  toDailyRate,
} from '../../services/autoDepletionService';
import {
  deleteProduct,
  flagPurchasePending,
  getProduct,
  getProductUsagesForTask,
  getPurchaseLogs,
  updateStock,
} from '../../services/productService';
import { getAllHistoryRecords } from '../../services/supplyHistoryService';
import { completeTask, getTasks } from '../../services/taskService';
import {
  Product,
  PurchaseLog,
  SupplyHistoryRecord,
  Task,
  TaskProductUsage,
} from '../../types/models';
import InventoryBar from '../../components/InventoryBar';
import UpdateStockSheet from '../../components/UpdateStockSheet';
import ScreenHeader from '../../components/ScreenHeader';
import DeleteRowButton from '../../components/DeleteRowButton';
import PurchaseLinkSheet from '../../components/PurchaseLinkSheet';
import SupplyHistoryChart from '../../components/SupplyHistoryChart';
import SupplyActivityLog from '../../components/SupplyActivityLog';
import { openPurchaseUrl } from '../../utils/purchaseLink';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/colors';
import {
  SUGGESTED_SUPPLIES,
  getTasksForSupply,
  SuggestedTask,
} from '../../data/suggested';

type Route = RouteProp<
  { ProductDetail: { householdId: string; productId: string } },
  'ProductDetail'
>;

interface UsageRef {
  task: Task;
  usage: TaskProductUsage;
}

function recurrenceToDays(task: Task): number {
  const i = Math.max(1, task.recurrence.interval);
  switch (task.recurrence.frequency) {
    case 'none':
      // One-time task: treat as no recurring depletion
      return Infinity;
    case 'daily':
      return i * 1;
    case 'weekly':
      return i * 7;
    case 'monthly':
      return i * 30;
    case 'yearly':
      return i * 365;
  }
}

type TaskUrgency = 'overdue' | 'today' | 'this_week' | 'future' | 'completed';

function getTaskUrgency(task: Task): TaskUrgency {
  if (task.completedToday) return 'completed';
  const now = new Date();
  const dueDate = startOfDay(task.nextDueDate);
  const todayStart = startOfDay(now);

  if (isBefore(dueDate, todayStart)) return 'overdue';
  if (isToday(task.nextDueDate)) return 'today';
  const daysUntil = differenceInDays(dueDate, todayStart);
  if (daysUntil <= 7) return 'this_week';
  return 'future';
}

function getMostUrgentTask(refs: UsageRef[]): UsageRef | null {
  if (refs.length === 0) return null;

  // Filter out completed tasks, sort by urgency (overdue first, then today, then this week)
  const urgencyOrder: Record<TaskUrgency, number> = {
    overdue: 0,
    today: 1,
    this_week: 2,
    future: 3,
    completed: 4,
  };

  const sorted = [...refs].sort((a, b) => {
    const urgencyA = getTaskUrgency(a.task);
    const urgencyB = getTaskUrgency(b.task);
    if (urgencyOrder[urgencyA] !== urgencyOrder[urgencyB]) {
      return urgencyOrder[urgencyA] - urgencyOrder[urgencyB];
    }
    // Same urgency, sort by due date
    return a.task.nextDueDate.getTime() - b.task.nextDueDate.getTime();
  });

  const mostUrgent = sorted[0];
  const urgency = getTaskUrgency(mostUrgent.task);
  // Only show banner for overdue, today, or this_week
  if (urgency === 'future' || urgency === 'completed') return null;
  return mostUrgent;
}

export default function ProductDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { householdId, productId } = route.params;

  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [usageRefs, setUsageRefs] = useState<UsageRef[]>([]);
  const [purchases, setPurchases] = useState<PurchaseLog[]>([]);
  const [historyRecords, setHistoryRecords] = useState<SupplyHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockSheetVisible, setStockSheetVisible] = useState(false);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [showPurchaseHistory, setShowPurchaseHistory] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  // Set light status bar for dark header screen
  useFocusEffect(
    useCallback(() => {
      ExpoStatusBar.setStatusBarStyle('light');
      return () => {
        ExpoStatusBar.setStatusBarStyle('light');
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);

      Promise.all([
        getProduct(householdId, productId),
        getTasks(householdId),
        getPurchaseLogs(householdId, productId, 5),
        getAllHistoryRecords(householdId, productId),
      ])
        .then(async ([p, tasks, logs, history]) => {
          if (cancelled) return;
          if (!p) {
            setError('Product not found');
            setLoading(false);
            return;
          }
          const usagesByTask = await Promise.all(
            tasks.map((t) => getProductUsagesForTask(householdId, t.id))
          );
          const refs: UsageRef[] = [];
          tasks.forEach((task, idx) => {
            for (const usage of usagesByTask[idx]) {
              if (usage.productId === productId) {
                refs.push({ task, usage });
              }
            }
          });
          if (cancelled) return;
          setProduct(p);
          setUsageRefs(refs);
          setPurchases(logs);
          setHistoryRecords(history);
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          const err = e as { message?: string };
          setError(err.message ?? String(e));
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [householdId, productId])
  );

  // Find suggested tasks that link to this supply (by matching names to suggested supply IDs)
  // Only show suggestions for supplies NOT in auto mode (auto mode supplies don't use tasks)
  // MUST be declared before any early returns to maintain consistent hook count
  const suggestedTasksForSupply: SuggestedTask[] = useMemo(() => {
    if (!product) return [];
    const isAutoMode = product.depletionMode === 'auto';
    if (isAutoMode) return [];
    const prodName = product.name.toLowerCase();
    // Find a matching suggested supply by name similarity
    for (const cat of SUGGESTED_SUPPLIES) {
      for (const supply of cat.supplies) {
        const supplyName = supply.name.toLowerCase();
        // Check if names match or are very similar
        if (prodName.includes(supplyName) || supplyName.includes(prodName) ||
            prodName === supplyName) {
          const linkedTaskIds = usageRefs.map(r => r.task.name.toLowerCase());
          // Get tasks that link to this supply, excluding ones already formally linked
          const tasks = getTasksForSupply(supply.id);
          return tasks.filter(t => !linkedTaskIds.includes(t.name.toLowerCase()));
        }
      }
    }
    return [];
  }, [product, usageRefs]);

  const handleStockSave = async (newQuantity: number, note: string) => {
    if (!product || !user) return;
    const previousProduct = product;
    setProduct({ ...product, currentQuantity: newQuantity });
    setStockSheetVisible(false);
    setSuccessBanner('✅ Stock updated');
    setTimeout(() => setSuccessBanner(null), 2000);

    try {
      await updateStock(
        householdId,
        previousProduct.id,
        newQuantity,
        note,
        user.displayName && !user.displayName.includes('@') ? user.displayName : 'You'
      );
      const refreshed = await getProduct(householdId, previousProduct.id);
      if (refreshed) setProduct(refreshed);
    } catch (e) {
      setProduct(previousProduct);
      setSuccessBanner(null);
      const err = e as { message?: string };
      Alert.alert('Error', err.message ?? 'Failed to update stock');
    }
  };

  const handleDelete = () => {
    if (!product) return;
    Alert.alert(
      `Delete ${product.name}?`,
      'It will be removed from all tasks that use it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(householdId, product.id);
              navigation.popToTop();
              navigation.navigate('Main', { screen: 'Supplies' });
            } catch (e) {
              const err = e as { message?: string };
              Alert.alert(
                'Delete failed',
                err.message ?? 'Unable to delete supply'
              );
            }
          },
        },
      ]
    );
  };

  const handleBuy = async () => {
    if (!product) return;
    const trimmedUrl = (product.amazonUrl ?? '').trim();
    if (trimmedUrl.length === 0) {
      setLinkSheetOpen(true);
      return;
    }
    try {
      await flagPurchasePending(householdId, product.id);
    } catch (e) {
      console.warn('[ProductDetail] flagPurchasePending failed:', e);
    }
    await openPurchaseUrl(trimmedUrl);
  };

  const handleLinkSheetClose = (savedUrl?: string) => {
    setLinkSheetOpen(false);
    if (product && savedUrl) {
      flagPurchasePending(householdId, product.id).catch((e) => {
        console.warn('[ProductDetail] flagPurchasePending failed:', e);
      });
      setProduct({ ...product, amazonUrl: savedUrl });
    }
  };

  const refreshData = async () => {
    try {
      const [p, tasks, logs, history] = await Promise.all([
        getProduct(householdId, productId),
        getTasks(householdId),
        getPurchaseLogs(householdId, productId, 5),
        getAllHistoryRecords(householdId, productId),
      ]);
      if (!p) return;
      const usagesByTask = await Promise.all(
        tasks.map((t) => getProductUsagesForTask(householdId, t.id))
      );
      const refs: UsageRef[] = [];
      tasks.forEach((task, idx) => {
        for (const usage of usagesByTask[idx]) {
          if (usage.productId === productId) {
            refs.push({ task, usage });
          }
        }
      });
      setProduct(p);
      setUsageRefs(refs);
      setPurchases(logs);
      setHistoryRecords(history);
    } catch (e) {
      console.warn('[ProductDetail] refreshData failed:', e);
    }
  };

  const handleMarkComplete = (taskRef: UsageRef) => {
    if (!user) return;
    const task = taskRef.task;
    const usage = taskRef.usage;

    // Check if product has enough quantity
    if (product && product.currentQuantity < usage.usageAmount) {
      Alert.alert(
        'Insufficient Stock',
        `This task requires ${usage.usageAmount} ${usage.usageUnit}, but you only have ${product.currentQuantity} ${product.containerUnit} remaining. Complete anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Complete Anyway',
            onPress: () => executeTaskCompletion(task),
          },
        ]
      );
      return;
    }

    Alert.alert(
      `Complete "${task.name}"?`,
      `This will deduct ${usage.usageAmount} ${usage.usageUnit} from your stock.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: () => executeTaskCompletion(task),
        },
      ]
    );
  };

  const executeTaskCompletion = async (task: Task) => {
    if (!user) return;
    setCompletingTaskId(task.id);
    try {
      await completeTask(householdId, task.id, user.uid);
      setSuccessBanner(`✅ "${task.name}" completed`);
      setTimeout(() => setSuccessBanner(null), 2500);
      await refreshData();
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Error', err.message ?? 'Failed to complete task');
    } finally {
      setCompletingTaskId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.errorText}>{error ?? 'Product not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.linkButton}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const today = new Date();
  const isAutoMode = product.depletionMode === 'auto';

  // Calculate maxQuantity from history records
  const maxQuantity = Math.max(
    ...historyRecords.map(r => r.quantity),
    product.currentQuantity
  );

  // Task-based usage calculations
  let totalUsagePerDay = 0;
  for (const ref of usageRefs) {
    const days = recurrenceToDays(ref.task);
    if (days > 0) totalUsagePerDay += ref.usage.usageAmount / days;
  }
  const avgPerApp =
    usageRefs.length > 0
      ? usageRefs.reduce((sum, r) => sum + r.usage.usageAmount, 0) /
        usageRefs.length
      : 0;
  const applicationsRemaining =
    avgPerApp > 0 ? Math.floor(product.currentQuantity / avgPerApp) : 0;

  // Derive unit action from linked task name (e.g., "HVAC Filter Replacement" -> "replacements")
  const deriveUnitAction = (): string => {
    if (usageRefs.length === 0) return '';
    const taskName = usageRefs[0].task.name.toLowerCase();
    if (taskName.includes('replacement') || taskName.includes('replace')) return 'replacements';
    if (taskName.includes('treatment') || taskName.includes('treat')) return 'treatments';
    if (taskName.includes('dose') || taskName.includes('medication') || taskName.includes('prescription')) return 'doses';
    if (taskName.includes('application') || taskName.includes('apply')) return 'applications';
    if (taskName.includes('cleaning') || taskName.includes('clean')) return 'cleanings';
    if (taskName.includes('change')) return 'changes';
    if (taskName.includes('filter')) return 'replacements';
    return 'uses';
  };
  const unitAction = deriveUnitAction();

  // Format auto-depletion rate for display
  const autoRateLabel = (): string => {
    const rate = product.autoDepletionRate;
    const unit = product.autoDepletionUnit;
    if (rate === 1) return `1 per ${unit}`;
    return `${rate} per ${unit}`;
  };

  // Calculate percent for display (uses maxQuantity from history as 100%)
  const percent =
    maxQuantity > 0
      ? Math.min(100, Math.round((product.currentQuantity / maxQuantity) * 100))
      : 100;

  // Determine threshold quantity using the new threshold fields
  let thresholdQty: number;
  if (product.thresholdType === 'quantity') {
    thresholdQty = product.thresholdValue;
  } else if (product.thresholdType === 'percentage') {
    thresholdQty = (product.thresholdValue / 100) * maxQuantity;
  } else if (product.lowThresholdQty !== null && product.lowThresholdQty !== undefined) {
    // Fallback to legacy fields
    thresholdQty = product.lowThresholdQty;
  } else {
    thresholdQty = (product.lowThresholdPercent / 100) * maxQuantity;
  }
  const isLowStock = product.currentQuantity <= thresholdQty;

  // Format threshold display text
  const thresholdDisplayText = (): string => {
    if (product.thresholdType === 'quantity') {
      return `Alert when: ${product.thresholdValue} ${product.containerUnit} remaining`;
    } else if (product.thresholdType === 'percentage') {
      const approxQty = Math.round((product.thresholdValue / 100) * maxQuantity);
      return `Alert when: below ${product.thresholdValue}% (~${approxQty} ${product.containerUnit})`;
    } else if (product.lowThresholdQty !== null) {
      return `Alert when: ${product.lowThresholdQty} ${product.containerUnit} remaining`;
    } else {
      const approxQty = Math.round((product.lowThresholdPercent / 100) * maxQuantity);
      return `Alert when: below ${product.lowThresholdPercent}% (~${approxQty} ${product.containerUnit})`;
    }
  };

  // Calculate run-out and reorder dates based on depletion mode
  let runOutDate: Date | null = null;
  let reorderByDate: Date | null = null;
  let daysRemaining: number | null = null;

  if (isAutoMode) {
    // Use auto-depletion calculations
    daysRemaining = calculateDaysRemaining(product);
    runOutDate = calculateRunOutDate(product);
    reorderByDate = calculateReorderDate(product);
  } else if (totalUsagePerDay > 0) {
    // Use task-based calculations
    const daysUntilEmpty = product.currentQuantity / totalUsagePerDay;
    runOutDate = addDays(today, daysUntilEmpty);
    daysRemaining = Math.floor(daysUntilEmpty);

    // Calculate reorder date: when we reach the threshold
    const daysUntilThreshold = (product.currentQuantity - thresholdQty) / totalUsagePerDay;
    if (daysUntilThreshold > 0) {
      reorderByDate = addDays(today, daysUntilThreshold);
    } else {
      // Already at or below threshold
      reorderByDate = today;
    }
  }

  // Determine reorder date status for display
  const reorderInPast = reorderByDate !== null && reorderByDate.getTime() <= today.getTime();
  const reorderWithin7Days = reorderByDate !== null &&
    !reorderInPast &&
    reorderByDate.getTime() <= addDays(today, 7).getTime();
  const showMinimalThresholdWarning = isAutoMode && isMinimalThreshold(product);

  // Red zone: critically low (1 unit remaining or below 10%, whichever is higher) OR past reorder date
  const criticalQty = Math.max(1, maxQuantity * 0.1);
  const isCriticallyLow = product.currentQuantity <= criticalQty;
  const inRedZone =
    isCriticallyLow ||
    isLowStock ||
    (reorderByDate !== null &&
      reorderByDate.getTime() <= today.getTime());

  // Task status banner - only show for task-based (not auto) supplies
  const mostUrgentRef = isAutoMode ? null : getMostUrgentTask(usageRefs);
  const urgentTaskUrgency = mostUrgentRef ? getTaskUrgency(mostUrgentRef.task) : null;

  const formatDueText = (task: Task, urgency: TaskUrgency): string => {
    if (urgency === 'overdue') {
      const daysOverdue = differenceInDays(startOfDay(new Date()), startOfDay(task.nextDueDate));
      return daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`;
    }
    if (urgency === 'today') return 'Due today';
    if (urgency === 'this_week') {
      const daysUntil = differenceInDays(startOfDay(task.nextDueDate), startOfDay(new Date()));
      return daysUntil === 1 ? 'Due tomorrow' : `Due in ${daysUntil} days`;
    }
    return '';
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <ScreenHeader
        title=""
        leftLabel="Supplies"
        rightLabel="Edit"
        rightTone="white"
        onRightPress={() => navigation.navigate('EditProduct', { product })}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {product.name}
        </Text>
        <TouchableOpacity
          style={styles.buyPill}
          onPress={handleBuy}
          activeOpacity={0.8}
        >
          <Text style={styles.buyPillText}>Buy</Text>
        </TouchableOpacity>
      </View>

      {/* Out of stock warning banner */}
      {product.currentQuantity === 0 ? (
        <View style={styles.outOfStockBanner}>
          <View style={styles.outOfStockContent}>
            <Text style={styles.outOfStockText}>
              {'\u26A0\uFE0F'} Out of stock — reorder now!
            </Text>
          </View>
          {(product.amazonUrl ?? '').trim().length > 0 ? (
            <TouchableOpacity
              style={styles.outOfStockBuyButton}
              onPress={handleBuy}
              activeOpacity={0.8}
            >
              <Text style={styles.outOfStockBuyText}>Buy Now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {successBanner ? (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>{successBanner}</Text>
        </View>
      ) : null}

      {/* Task Status Banner - shows for task-based supplies with upcoming/overdue linked tasks */}
      {mostUrgentRef && urgentTaskUrgency && (
        <View
          style={[
            styles.taskBanner,
            urgentTaskUrgency === 'overdue' && styles.taskBannerOverdue,
            urgentTaskUrgency === 'today' && styles.taskBannerToday,
            urgentTaskUrgency === 'this_week' && styles.taskBannerThisWeek,
          ]}
        >
          <View style={styles.taskBannerContent}>
            <Text style={styles.taskBannerIcon}>{mostUrgentRef.task.icon ?? '📋'}</Text>
            <View style={styles.taskBannerText}>
              <Text
                style={[
                  styles.taskBannerTitle,
                  urgentTaskUrgency === 'overdue' && styles.taskBannerTitleOverdue,
                  urgentTaskUrgency === 'today' && styles.taskBannerTitleToday,
                  urgentTaskUrgency === 'this_week' && styles.taskBannerTitleThisWeek,
                ]}
              >
                {mostUrgentRef.task.name}
              </Text>
              <Text
                style={[
                  styles.taskBannerDue,
                  urgentTaskUrgency === 'overdue' && styles.taskBannerDueOverdue,
                  urgentTaskUrgency === 'today' && styles.taskBannerDueToday,
                  urgentTaskUrgency === 'this_week' && styles.taskBannerDueThisWeek,
                ]}
              >
                {formatDueText(mostUrgentRef.task, urgentTaskUrgency)} · Uses {mostUrgentRef.usage.usageAmount} {mostUrgentRef.usage.usageUnit}
              </Text>
            </View>
          </View>
          {(urgentTaskUrgency === 'overdue' || urgentTaskUrgency === 'today') && (
            <TouchableOpacity
              style={[
                styles.taskBannerButton,
                urgentTaskUrgency === 'overdue' && styles.taskBannerButtonOverdue,
                urgentTaskUrgency === 'today' && styles.taskBannerButtonToday,
              ]}
              onPress={() => handleMarkComplete(mostUrgentRef)}
              activeOpacity={0.8}
              disabled={completingTaskId === mostUrgentRef.task.id}
            >
              {completingTaskId === mostUrgentRef.task.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.taskBannerButtonText}>Mark Complete</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Stock</Text>
          {isAutoMode ? (
            <View style={styles.autoModeBadge}>
              <Text style={styles.autoModeBadgeText}>⏱️ Auto-tracking {product.autoDepletionUnit === 'day' ? 'daily' : product.autoDepletionUnit === 'week' ? 'weekly' : 'monthly'}</Text>
            </View>
          ) : null}
        </View>
        <InventoryBar product={product} maxQuantity={maxQuantity} showLabel={false} />
        <Text style={[styles.statText, product.currentQuantity === 0 && styles.statTextRed]}>
          {product.currentQuantity === 0
            ? 'Out of stock'
            : isAutoMode
              ? `${product.currentQuantity} ${product.containerUnit} remaining${daysRemaining !== null ? ` · ${daysRemaining} days left` : ''}`
              : usageRefs.length > 0
                ? `${product.currentQuantity} ${product.name} ${unitAction} remaining`
                : `${product.currentQuantity} ${product.containerUnit} on hand`}
        </Text>
        <Text style={styles.thresholdDisplayText}>{thresholdDisplayText()}</Text>
        {!isAutoMode && usageRefs.length === 0 ? (
          <Text style={styles.metaText}>Link a task to track usage</Text>
        ) : null}
        <Text style={styles.metaText}>
          {product.currentQuantity === 0
            ? 'Has run out'
            : `Estimated run out: ${runOutDate ? format(runOutDate, 'MMMM d, yyyy') : '—'}`}
        </Text>
        <Text
          style={[
            styles.metaText,
            (reorderInPast || product.currentQuantity === 0) && styles.metaTextRed,
            reorderWithin7Days && !reorderInPast && product.currentQuantity > 0 && styles.metaTextAmber,
          ]}
        >
          {product.currentQuantity === 0
            ? 'Reorder now!'
            : reorderInPast
              ? "Reorder now — you've reached your threshold"
              : `Reorder by: ${reorderByDate ? format(reorderByDate, 'MMMM d, yyyy') : '—'}`}
        </Text>
        {showMinimalThresholdWarning && !reorderInPast ? (
          <Text style={styles.warningText}>
            ⚠️ Consider increasing your reorder threshold to give yourself more time
          </Text>
        ) : null}
      </View>

      {/* Activity Chart & Log */}
      {historyRecords.length >= 2 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, styles.sectionHeaderMargin]}>Activity</Text>
          <SupplyHistoryChart product={product} history={historyRecords} />
          <SupplyActivityLog history={historyRecords} containerUnit={product.containerUnit} />
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, styles.sectionHeaderMargin]}>Activity</Text>
          <View style={styles.emptyActivityState}>
            <Text style={styles.emptyActivityIcon}>📊</Text>
            <Text style={styles.emptyActivityText}>
              Stock history will appear here after your first purchase or task completion.
            </Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.updateStockButton}
        onPress={() => setStockSheetVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.updateStockButtonText}>📝 Update Stock</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={[styles.sectionHeader, styles.sectionHeaderMargin]}>
          {isAutoMode ? 'Tracking' : 'Used by'}
        </Text>
        {isAutoMode ? (
          <View style={styles.autoTrackingInfo}>
            <Text style={styles.autoTrackingIcon}>⏱️</Text>
            <View style={styles.autoTrackingText}>
              <Text style={styles.autoTrackingTitle}>Automatically tracked</Text>
              <Text style={styles.autoTrackingDesc}>
                Decreases by {autoRateLabel()}
              </Text>
            </View>
          </View>
        ) : usageRefs.length === 0 ? (
          <Text style={styles.placeholderText}>
            Not yet linked to any task
          </Text>
        ) : (
          usageRefs.map((ref) => {
            const taskUrgency = getTaskUrgency(ref.task);
            const dueText = taskUrgency === 'completed'
              ? 'Completed today'
              : formatDueText(ref.task, taskUrgency);
            return (
              <TouchableOpacity
                key={ref.usage.id}
                style={styles.usageRow}
                onPress={() =>
                  navigation.navigate('TaskDetail', { taskId: ref.task.id })
                }
                activeOpacity={0.7}
              >
                <Text style={styles.usageIcon}>{ref.task.icon ?? '📋'}</Text>
                <View style={styles.usageRowText}>
                  <Text style={styles.usageTaskName}>{ref.task.name}</Text>
                  <Text style={styles.usageMeta}>
                    {ref.usage.usageAmount} {ref.usage.usageUnit} per use
                  </Text>
                  {dueText ? (
                    <Text
                      style={[
                        styles.usageTaskStatus,
                        taskUrgency === 'overdue' && styles.usageTaskStatusOverdue,
                        taskUrgency === 'today' && styles.usageTaskStatusToday,
                        taskUrgency === 'this_week' && styles.usageTaskStatusThisWeek,
                        taskUrgency === 'completed' && styles.usageTaskStatusCompleted,
                      ]}
                    >
                      {dueText}
                    </Text>
                  ) : (
                    <Text style={styles.usageTaskStatus}>
                      Due {format(ref.task.nextDueDate, 'MMM d')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {/* Suggested task hints */}
        {suggestedTasksForSupply.length > 0 && (
          <View style={styles.suggestedTasksSection}>
            {suggestedTasksForSupply.slice(0, 2).map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.suggestedTaskRow}
                onPress={() => navigation.navigate('SuggestedTasks', { preSelected: task.id })}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestedTaskIcon}>💡</Text>
                <View style={styles.suggestedTaskText}>
                  <Text style={styles.suggestedTaskLabel}>Often used with:</Text>
                  <Text style={styles.suggestedTaskName}>{task.name}</Text>
                </View>
                <Text style={styles.suggestedTaskChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setShowPurchaseHistory((s) => !s)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionHeader}>Purchase History</Text>
          <Text style={styles.sectionChevron}>
            {showPurchaseHistory ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>
        {showPurchaseHistory &&
          (purchases.length === 0 ? (
            <Text style={styles.placeholderText}>No purchases logged yet</Text>
          ) : (
            purchases.map((log) => (
              <View key={log.id} style={styles.purchaseRow}>
                <Text style={styles.purchaseDate}>
                  {format(log.purchasedAt, 'MMM d, yyyy')}
                </Text>
                <Text style={styles.purchaseDetails}>
                  ${log.price.toFixed(2)} · +{log.totalAdded} {log.containerUnit}
                </Text>
              </View>
            ))
          ))}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() =>
          navigation.navigate('LogPurchase', {
            householdId,
            productId: product.id,
          })
        }
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>Log Purchase</Text>
      </TouchableOpacity>

      <DeleteRowButton
        label="Delete from Supply List"
        onPress={handleDelete}
      />
      </ScrollView>
      <UpdateStockSheet
        visible={stockSheetVisible}
        product={product}
        onSave={handleStockSave}
        onCancel={() => setStockSheetVisible(false)}
      />
      <PurchaseLinkSheet
        product={linkSheetOpen ? product : null}
        householdId={householdId}
        onClose={handleLinkSheetClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 64,
    paddingHorizontal: 16,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 24,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  buyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  buyPillText: {
    color: Colors.textOnDark,
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    marginBottom: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHeaderMargin: {
    marginBottom: 12,
  },
  autoModeBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  autoModeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sectionChevron: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 12,
  },
  statText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statTextRed: {
    color: '#EF4444',
  },
  thresholdDisplayText: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  successBanner: {
    backgroundColor: Colors.successBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  successBannerText: {
    color: Colors.successText,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  outOfStockBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  outOfStockContent: {
    flex: 1,
  },
  outOfStockText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#B91C1C',
  },
  outOfStockBuyButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  outOfStockBuyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  updateStockButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  updateStockButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  metaText: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  metaTextRed: {
    color: Colors.urgencyRed,
    fontWeight: '700',
  },
  metaTextAmber: {
    color: '#D69E2E',
    fontWeight: '600',
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    color: '#D69E2E',
    fontStyle: 'italic',
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  usageIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  usageRowText: {
    flex: 1,
  },
  usageTaskName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  usageMeta: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  usageTaskStatus: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  usageTaskStatusOverdue: {
    color: '#EF4444',
    fontWeight: '600',
  },
  usageTaskStatusToday: {
    color: '#F59E0B',
    fontWeight: '600',
  },
  usageTaskStatusThisWeek: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  usageTaskStatusCompleted: {
    color: Colors.successText,
    fontWeight: '500',
  },
  // Task status banner styles
  taskBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  taskBannerOverdue: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  taskBannerToday: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  taskBannerThisWeek: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  taskBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskBannerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  taskBannerText: {
    flex: 1,
  },
  taskBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  taskBannerTitleOverdue: {
    color: '#B91C1C',
  },
  taskBannerTitleToday: {
    color: '#B45309',
  },
  taskBannerTitleThisWeek: {
    color: '#1D4ED8',
  },
  taskBannerDue: {
    fontSize: 13,
    marginTop: 2,
  },
  taskBannerDueOverdue: {
    color: '#DC2626',
  },
  taskBannerDueToday: {
    color: '#D97706',
  },
  taskBannerDueThisWeek: {
    color: '#2563EB',
  },
  taskBannerButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  taskBannerButtonOverdue: {
    backgroundColor: '#EF4444',
  },
  taskBannerButtonToday: {
    backgroundColor: '#F59E0B',
  },
  taskBannerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  purchaseRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  purchaseDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  purchaseDetails: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  primaryButton: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  linkButton: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  autoTrackingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  autoTrackingIcon: {
    fontSize: 28,
  },
  autoTrackingText: {
    flex: 1,
  },
  autoTrackingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  autoTrackingDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyActivityState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyActivityIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyActivityText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  // Suggested tasks hints section
  suggestedTasksSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  suggestedTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  suggestedTaskIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  suggestedTaskText: {
    flex: 1,
  },
  suggestedTaskLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  suggestedTaskName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  suggestedTaskChevron: {
    fontSize: 20,
    color: Colors.textMuted,
    marginLeft: 8,
  },
});
