import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
  deleteProduct,
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
import StockOverviewCard from '../../components/StockOverviewCard';
import UserAvatar from '../../components/UserAvatar';
import FAB from '../../components/FAB';
import SupplyTypeSheet from '../../components/SupplyTypeSheet';
import PurchaseLinkSheet from '../../components/PurchaseLinkSheet';
import { openPurchaseUrl } from '../../utils/purchaseLink';
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

export default function SuppliesScreen() {
  const navigation = useNavigation<any>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const [rows, setRows] = useState<SupplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'stock' | 'alpha' | 'task'>('stock');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [linkSheetProduct, setLinkSheetProduct] = useState<Product | null>(
    null
  );

  const openSuggested = () => {
    setSheetOpen(false);
    navigation.navigate('SetupWizard', { mode: 'fromSupplies' });
  };
  const openCustom = () => {
    setSheetOpen(false);
    navigation.navigate('CreateProduct');
  };

  const fabScale = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const goingDown = y > lastScrollY.current + 1;
    const goingUp = y < lastScrollY.current - 1;
    lastScrollY.current = y;
    if (goingDown || goingUp) {
      Animated.spring(fabScale, {
        toValue: goingDown ? 0.85 : 1,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }).start();
    }
  };

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

  type ListItem =
    | { kind: 'header'; key: string; label: string }
    | { kind: 'card'; key: string; row: SupplyRow };

  const listItems = useMemo<ListItem[]>(() => {
    if (rows.length === 0) return [];

    if (sortBy === 'alpha') {
      return [...rows]
        .sort((a, b) =>
          a.product.name.localeCompare(b.product.name, undefined, {
            sensitivity: 'base',
          })
        )
        .map((r) => ({
          kind: 'card' as const,
          key: r.product.id,
          row: r,
        }));
    }

    if (sortBy === 'task') {
      const groups = new Map<string, SupplyRow[]>();
      for (const r of rows) {
        const taskNames =
          r.usages.length > 0
            ? Array.from(new Set(r.usages.map((u) => u.task.name)))
            : ['Not linked to a task'];
        for (const name of taskNames) {
          const arr = groups.get(name) ?? [];
          arr.push(r);
          groups.set(name, arr);
        }
      }
      const orderedNames = [...groups.keys()].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
      const out: ListItem[] = [];
      for (const name of orderedNames) {
        out.push({ kind: 'header', key: `h:${name}`, label: name });
        const sorted = (groups.get(name) ?? []).sort((a, b) =>
          a.product.name.localeCompare(b.product.name, undefined, {
            sensitivity: 'base',
          })
        );
        for (const r of sorted) {
          out.push({
            kind: 'card' as const,
            key: `${name}::${r.product.id}`,
            row: r,
          });
        }
      }
      return out;
    }

    // 'stock' (default): lowest first
    return [...rows]
      .sort((a, b) => stockPercent(a.product) - stockPercent(b.product))
      .map((r) => ({
        kind: 'card' as const,
        key: r.product.id,
        row: r,
      }));
  }, [rows, sortBy]);

  const handleBuy = async (product: Product) => {
    if (!householdId) return;
    const trimmedUrl = (product.amazonUrl ?? '').trim();
    if (trimmedUrl.length === 0) {
      // No URL on file — prompt the user to add one (teach-by-doing).
      // Don't flag purchase-pending until they actually choose to open.
      setLinkSheetProduct(product);
      return;
    }
    try {
      await flagPurchasePending(householdId, product.id);
    } catch (e) {
      console.warn('[Supplies] flagPurchasePending failed:', e);
    }
    await openPurchaseUrl(trimmedUrl);
  };

  const handleLinkSheetClose = (savedUrl?: string) => {
    const product = linkSheetProduct;
    setLinkSheetProduct(null);
    if (product && savedUrl && householdId) {
      // The user saved a URL and we're about to open it — flag pending so the
      // post-purchase prompt fires next time the app comes to foreground, and
      // reflect the saved URL in our local rows so subsequent Buy taps don't
      // re-prompt within the same session.
      flagPurchasePending(householdId, product.id).catch((e) => {
        console.warn('[Supplies] flagPurchasePending failed:', e);
      });
      setRows((prev) =>
        prev.map((r) =>
          r.product.id === product.id
            ? { ...r, product: { ...r.product, amazonUrl: savedUrl } }
            : r
        )
      );
    }
  };

  const goToProduct = (product: Product) => {
    navigation.navigate('ProductDetail', {
      householdId: product.householdId,
      productId: product.id,
    });
  };

  const confirmDelete = (product: Product) => {
    if (!householdId) return;
    Alert.alert(
      `Delete ${product.name}?`,
      'This will remove it from all tasks that use it and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(householdId, product.id);
              setRows((prev) =>
                prev.filter((r) => r.product.id !== product.id)
              );
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

  const showCardMenu = (product: Product) => {
    Alert.alert(product.name, undefined, [
      {
        text: 'Edit',
        onPress: () => navigation.navigate('EditProduct', { product }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDelete(product),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  } else if (rows.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>🛒</Text>
        <Text style={styles.emptyTitle}>No supplies tracked yet</Text>
        <Text style={styles.emptyText}>
          Add supplies to your tasks to track inventory here.
        </Text>
      </View>
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.list}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <StockOverviewCard products={rows.map((r) => r.product)} />

        <View style={styles.sortRow}>
          <SortPill
            label="A–Z"
            active={sortBy === 'alpha'}
            onPress={() => setSortBy('alpha')}
          />
          <SortPill
            label="Stock"
            active={sortBy === 'stock'}
            onPress={() => setSortBy('stock')}
          />
          <SortPill
            label="Task"
            active={sortBy === 'task'}
            onPress={() => setSortBy('task')}
          />
        </View>

        <View style={styles.cardsBlock}>
          {listItems.map((item) =>
            item.kind === 'header' ? (
              <Text key={item.key} style={styles.groupHeader}>
                {item.label}
              </Text>
            ) : (
              <SupplyCard
                key={item.key}
                row={item.row}
                onTap={() => goToProduct(item.row.product)}
                onBuy={() => handleBuy(item.row.product)}
                onMenu={() => showCardMenu(item.row.product)}
              />
            )
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Header />
      {body}
      <FAB
        onPress={() => setSheetOpen(true)}
        scrollScale={fabScale}
      />
      <SupplyTypeSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSuggested={openSuggested}
        onCustom={openCustom}
      />
      <PurchaseLinkSheet
        product={linkSheetProduct}
        householdId={householdId}
        onClose={handleLinkSheetClose}
      />
    </View>
  );
}

interface SortPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function SortPill({ label, active, onPress }: SortPillProps) {
  return (
    <TouchableOpacity
      style={[styles.sortPill, active && styles.sortPillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[styles.sortPillText, active && styles.sortPillTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Header() {
  return (
    <>
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <UserAvatar />
        </View>
        <Text style={styles.title}>Supplies</Text>
        <View style={[styles.headerSide, styles.headerSideRight]} />
      </View>
    </>
  );
}

function borderColorFor(percent: number): string {
  if (percent > 50) return '#38A169';
  if (percent > 25) return '#D69E2E';
  return '#E53E3E';
}

interface SupplyCardProps {
  row: SupplyRow;
  onTap: () => void;
  onBuy: () => void;
  onMenu: () => void;
}

function SupplyCard({ row, onTap, onBuy, onMenu }: SupplyCardProps) {
  const percent = stockPercent(row.product);
  const left = borderColorFor(percent);
  const isRed = row.isRedZone;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { borderLeftColor: left },
        isRed && styles.cardRedBg,
      ]}
      onPress={onTap}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        <Text style={styles.cardName} numberOfLines={2}>
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
      <View style={styles.cardBar}>
        <InventoryBar product={row.product} showLabel={false} compact />
      </View>
      <Text style={styles.cardMeta}>
        {row.applicationsRemaining}{' '}
        {row.applicationsRemaining === 1 ? 'use' : 'uses'} left
        {row.estimatedRunOutDate
          ? ` · runs out ~${format(row.estimatedRunOutDate, 'MMM yyyy')}`
          : ''}
      </Text>
      {isRed && row.reorderByDate ? (
        <Text style={styles.cardReorder}>
          Reorder by {format(row.reorderByDate, 'MMM d, yyyy')}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
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
    width: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sortPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  sortPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  sortPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  sortPillTextActive: {
    color: '#FFFFFF',
  },
  cardsBlock: {
    paddingHorizontal: 0,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardRedBg: {
    backgroundColor: Colors.needsAttentionBg,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  cardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardMenu: {
    color: Colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 6,
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
  cardBar: {
    marginBottom: 8,
  },
  cardMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  cardReorder: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.urgencyRed,
    marginTop: 6,
  },
});
