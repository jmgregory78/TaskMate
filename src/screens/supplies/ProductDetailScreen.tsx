import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
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
import { addDays, format } from 'date-fns';
import {
  flagPurchasePending,
  getProduct,
  getProductUsagesForTask,
  getPurchaseLogs,
  updateStock,
} from '../../services/productService';
import { getTasks } from '../../services/taskService';
import {
  Product,
  PurchaseLog,
  stockPercent,
  Task,
  TaskProductUsage,
} from '../../types/models';
import InventoryBar from '../../components/InventoryBar';
import UpdateStockSheet from '../../components/UpdateStockSheet';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/colors';

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

export default function ProductDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { householdId, productId } = route.params;

  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [usageRefs, setUsageRefs] = useState<UsageRef[]>([]);
  const [purchases, setPurchases] = useState<PurchaseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockSheetVisible, setStockSheetVisible] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [showPurchaseHistory, setShowPurchaseHistory] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);

      Promise.all([
        getProduct(householdId, productId),
        getTasks(householdId),
        getPurchaseLogs(householdId, productId, 5),
      ])
        .then(async ([p, tasks, logs]) => {
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
        user.displayName ?? user.email ?? user.uid
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

  const handleBuy = async () => {
    if (!product) return;
    try {
      await flagPurchasePending(householdId, product.id);
    } catch (e) {
      console.warn('[ProductDetail] flagPurchasePending failed:', e);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Product not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.linkButton}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const today = new Date();
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

  let runOutDate: Date | null = null;
  let reorderByDate: Date | null = null;
  if (totalUsagePerDay > 0) {
    runOutDate = addDays(today, product.currentQuantity / totalUsagePerDay);
    reorderByDate = addDays(runOutDate, -14);
  }
  const percent = stockPercent(product);
  const inRedZone =
    percent <= product.lowThresholdPercent ||
    (reorderByDate !== null &&
      reorderByDate.getTime() <= today.getTime());

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.cancel}>Back</Text>
        </TouchableOpacity>
      </View>

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

      {successBanner ? (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>{successBanner}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Stock</Text>
        <InventoryBar product={product} showLabel={false} />
        <Text style={styles.statText}>
          {product.currentQuantity} {product.containerUnit} on hand ·{' '}
          {applicationsRemaining}{' '}
          {applicationsRemaining === 1 ? 'use' : 'uses'} left
        </Text>
        <Text style={styles.metaText}>
          Estimated run out:{' '}
          {runOutDate ? format(runOutDate, 'MMMM yyyy') : '—'}
        </Text>
        <Text
          style={[
            styles.metaText,
            inRedZone && styles.metaTextRed,
          ]}
        >
          Reorder by: {reorderByDate ? format(reorderByDate, 'MMM d, yyyy') : '—'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.updateStockButton}
        onPress={() => setStockSheetVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.updateStockButtonText}>📝 Update Stock</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Used by</Text>
        {usageRefs.length === 0 ? (
          <Text style={styles.placeholderText}>
            Not yet linked to any task
          </Text>
        ) : (
          usageRefs.map((ref) => (
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
              </View>
            </TouchableOpacity>
          ))
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
                  ${log.price.toFixed(2)} · {log.quantity}×{log.containerSize}{' '}
                  {log.containerUnit} (+{log.totalAdded} {log.containerUnit})
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

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('EditProduct', { product })}
        activeOpacity={0.7}
      >
        <Text style={styles.secondaryButtonText}>Edit Product</Text>
      </TouchableOpacity>
      </ScrollView>
      <UpdateStockSheet
        visible={stockSheetVisible}
        product={product}
        onSave={handleStockSave}
        onCancel={() => setStockSheetVisible(false)}
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
    paddingTop: 56,
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
  headerRow: {
    marginBottom: 8,
  },
  cancel: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
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
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
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
  secondaryButton: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
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
});
