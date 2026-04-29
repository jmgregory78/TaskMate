import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { addDays, format } from 'date-fns';
import { useAppStore } from '../../stores/appStore';
import { getTasks } from '../../services/taskService';
import {
  flagPurchasePending,
  getProducts,
  getProductUsagesForTask,
} from '../../services/productService';
import {
  Product,
  stockPercent,
  Task,
  TaskProductUsage,
} from '../../types/models';
import InventoryBar from '../../components/InventoryBar';
import UserAvatar from '../../components/UserAvatar';
import { Colors } from '../../constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

interface UsageRef {
  task: Task;
  usage: TaskProductUsage;
}

interface SupplyRow {
  product: Product;
  usages: UsageRef[];
  totalUsagePerDay: number;
  applicationsRemaining: number;
  estimatedRunOutDate: Date | null;
  reorderByDate: Date | null;
  isRedZone: boolean;
}

function recurrenceToDays(task: Task): number {
  const i = Math.max(1, task.recurrence.interval);
  switch (task.recurrence.frequency) {
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

function dotColor(percent: number): string {
  if (percent < 25) return Colors.urgencyRed;
  if (percent <= 50) return Colors.urgencyAmber;
  return Colors.urgencyGreen;
}

export default function SuppliesScreen() {
  const navigation = useNavigation<any>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const [rows, setRows] = useState<SupplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      setLoading(true);
      setError(null);
      const today = new Date();

      Promise.all([getProducts(householdId), getTasks(householdId)])
        .then(async ([products, tasks]) => {
          const usagesByTask = await Promise.all(
            tasks.map((t) => getProductUsagesForTask(householdId, t.id))
          );

          const byProduct = new Map<string, UsageRef[]>();
          tasks.forEach((task, idx) => {
            for (const usage of usagesByTask[idx]) {
              const arr = byProduct.get(usage.productId) ?? [];
              arr.push({ task, usage });
              byProduct.set(usage.productId, arr);
            }
          });

          const built: SupplyRow[] = products.map((product) => {
            const usages = byProduct.get(product.id) ?? [];
            let totalUsagePerDay = 0;
            for (const ref of usages) {
              const days = recurrenceToDays(ref.task);
              if (days > 0)
                totalUsagePerDay += ref.usage.usageAmount / days;
            }
            const avgPerApp =
              usages.length > 0
                ? usages.reduce((sum, r) => sum + r.usage.usageAmount, 0) /
                  usages.length
                : 0;
            const applicationsRemaining =
              avgPerApp > 0
                ? Math.floor(product.currentQuantity / avgPerApp)
                : 0;
            let estimatedRunOutDate: Date | null = null;
            let reorderByDate: Date | null = null;
            if (totalUsagePerDay > 0) {
              const daysUntilEmpty =
                product.currentQuantity / totalUsagePerDay;
              estimatedRunOutDate = addDays(today, daysUntilEmpty);
              reorderByDate = addDays(estimatedRunOutDate, -14);
            }
            const percent = stockPercent(product);
            const isRedZone =
              percent <= product.lowThresholdPercent ||
              (reorderByDate !== null &&
                reorderByDate.getTime() <= today.getTime());
            return {
              product,
              usages,
              totalUsagePerDay,
              applicationsRemaining,
              estimatedRunOutDate,
              reorderByDate,
              isRedZone,
            };
          });

          if (cancelled) return;
          setRows(built);
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
    }, [householdId])
  );

  const { redRows, wellStocked } = useMemo(() => {
    const red: SupplyRow[] = [];
    const well: SupplyRow[] = [];
    const sorted = [...rows].sort(
      (a, b) => stockPercent(a.product) - stockPercent(b.product)
    );
    for (const row of sorted) {
      (row.isRedZone ? red : well).push(row);
    }
    return { redRows: red, wellStocked: well };
  }, [rows]);

  const handleBuy = async (product: Product) => {
    if (!householdId) return;
    try {
      await flagPurchasePending(householdId, product.id);
    } catch (e) {
      console.warn('[Supplies] flagPurchasePending failed:', e);
    }
    try {
      const ok = await Linking.canOpenURL(product.amazonUrl);
      if (ok) await Linking.openURL(product.amazonUrl);
      else Alert.alert('Cannot open URL', product.amazonUrl);
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Could not open link', err.message ?? String(e));
    }
  };

  const goToProduct = (product: Product) => {
    navigation.navigate('ProductDetail', {
      householdId: product.householdId,
      productId: product.id,
    });
  };

  const showCardMenu = (product: Product) => {
    Alert.alert(product.name, undefined, [
      {
        text: 'Edit',
        onPress: () => navigation.navigate('EditProduct', { product }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>No supplies tracked yet</Text>
          <Text style={styles.emptyText}>
            Add supplies to your tasks to track inventory here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <Text style={styles.statValue}>{rows.length}</Text>
          <Text style={styles.statLabel}>
            {rows.length === 1 ? 'supply tracked' : 'supplies tracked'}
          </Text>
        </View>
        <View style={[styles.statPill, styles.statPillRed]}>
          <Text style={[styles.statValue, styles.statValueRed]}>
            {redRows.length}
          </Text>
          <Text style={[styles.statLabel, styles.statLabelRed]}>
            low supply
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {redRows.map((row) => (
          <RedCard
            key={row.product.id}
            row={row}
            onTap={() => goToProduct(row.product)}
            onBuy={() => handleBuy(row.product)}
            onMenu={() => showCardMenu(row.product)}
          />
        ))}

        {wellStocked.length > 0 ? (
          <View style={styles.grid}>
            {wellStocked.map((row) => (
              <WellGridCard
                key={row.product.id}
                row={row}
                onTap={() => goToProduct(row.product)}
                onMenu={() => showCardMenu(row.product)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Header() {
  const navigation = useNavigation<any>();
  return (
    <>
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <UserAvatar />
        </View>
        <Text style={styles.title}>Supplies</Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('CreateProduct')}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

interface RedCardProps {
  row: SupplyRow;
  onTap: () => void;
  onBuy: () => void;
  onMenu: () => void;
}

function RedCard({ row, onTap, onBuy, onMenu }: RedCardProps) {
  return (
    <TouchableOpacity
      style={styles.redCard}
      onPress={onTap}
      activeOpacity={0.7}
    >
      <View style={styles.redCardHeader}>
        <Text style={styles.redCardName} numberOfLines={2}>
          {row.product.name}
        </Text>
        <TouchableOpacity
          onPress={onMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Text style={styles.cardMenu}>···</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buyPill}
          onPress={onBuy}
          activeOpacity={0.8}
        >
          <Text style={styles.buyPillText}>Buy</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.redCardBar}>
        <InventoryBar product={row.product} showLabel={false} />
      </View>
      <Text style={styles.redCardMeta}>
        {row.product.currentQuantity} {row.product.containerUnit} remaining ·{' '}
        {row.applicationsRemaining}{' '}
        {row.applicationsRemaining === 1 ? 'use' : 'uses'} left
      </Text>
      {row.reorderByDate ? (
        <Text style={styles.redCardReorder}>
          Reorder by {format(row.reorderByDate, 'MMM d, yyyy')}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

interface WellCardProps {
  row: SupplyRow;
  onTap: () => void;
  onMenu: () => void;
}

function WellGridCard({ row, onTap, onMenu }: WellCardProps) {
  const percent = stockPercent(row.product);
  const dot = dotColor(percent);
  return (
    <TouchableOpacity
      style={styles.gridCard}
      onPress={onTap}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        onPress={onMenu}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        activeOpacity={0.6}
        style={styles.gridMenuButton}
      >
        <Text style={styles.cardMenu}>···</Text>
      </TouchableOpacity>
      <Text style={styles.gridName} numberOfLines={2}>
        {row.product.name}
      </Text>
      <View style={styles.gridDotRow}>
        <View style={[styles.gridDot, { backgroundColor: dot }]} />
        <Text style={styles.gridPercent}>{percent}%</Text>
      </View>
      <View style={styles.gridBar}>
        <InventoryBar product={row.product} showLabel={false} compact />
      </View>
      <Text style={styles.gridMeta}>
        {row.applicationsRemaining}{' '}
        {row.applicationsRemaining === 1 ? 'use' : 'uses'} left
      </Text>
    </TouchableOpacity>
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
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textOnDark,
    textAlign: 'center',
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  statPill: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statPillRed: {
    backgroundColor: Colors.needsAttentionBg,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statValueRed: {
    color: Colors.needsAttentionText,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statLabelRed: {
    color: Colors.needsAttentionText,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  redCard: {
    backgroundColor: Colors.needsAttentionBg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.urgencyRed,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  redCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  redCardName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  buyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  cardMenu: {
    color: Colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  gridMenuButton: {
    position: 'absolute',
    top: 4,
    right: 6,
    zIndex: 1,
  },
  buyPillText: {
    color: Colors.textOnDark,
    fontSize: 13,
    fontWeight: '600',
  },
  redCardBar: {
    marginBottom: 8,
  },
  redCardMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  redCardReorder: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.urgencyRed,
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  gridName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    minHeight: 36,
  },
  gridDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  gridDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  gridPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gridBar: {
    marginBottom: 6,
  },
  gridMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
