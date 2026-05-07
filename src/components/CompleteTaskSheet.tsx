import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import InventoryBar from './InventoryBar';
import {
  Product,
  stockPercent,
  Task,
  TaskProductUsage,
} from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  visible: boolean;
  task: Task;
  productUsages: TaskProductUsage[];
  products: Product[];
  onConfirm: () => void;
  onConfirmWithoutLogging: () => void;
  onCancel: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

function projectedAfter(p: Product, usageAmount: number): Product {
  return {
    ...p,
    currentQuantity: Math.max(0, p.currentQuantity - usageAmount),
  };
}

export default function CompleteTaskSheet({
  visible,
  task,
  productUsages,
  products,
  onConfirm,
  onConfirmWithoutLogging,
  onCancel,
}: Props) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(translateY, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!visible && finished) setMounted(false);
    });
  }, [visible, translateY]);

  if (!mounted) return null;

  const productMap = new Map(products.map((p) => [p.id, p]));

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.fill}>
        <TouchableWithoutFeedback onPress={onCancel}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerRow}>
              <Text style={styles.icon}>{task.icon ?? '📋'}</Text>
              <Text style={styles.taskName}>{task.name}</Text>
            </View>

            {productUsages.length > 0 && (
              <Text style={styles.sectionHeader}>
                Completing this task will use:
              </Text>
            )}

            {productUsages.map((usage) => {
              const product = productMap.get(usage.productId);
              const displayName = product?.name ?? usage.productName;

              if (!product) {
                return (
                  <View key={usage.id} style={styles.productCard}>
                    <Text style={styles.productName}>{displayName}</Text>
                    <Text style={styles.productMeta}>
                      Uses: {usage.usageAmount} {usage.usageUnit}
                    </Text>
                    <Text style={styles.lowWarning}>
                      ⚠️ Shared product not found — inventory won't be deducted.
                    </Text>
                  </View>
                );
              }

              const after = projectedAfter(product, usage.usageAmount);
              const newPercent = stockPercent(after, product.currentQuantity);
              const remainingApps = Math.floor(
                after.currentQuantity / Math.max(usage.usageAmount, 0.0001)
              );
              const outOfStock = after.currentQuantity <= 0;
              const lowStock =
                !outOfStock && newPercent <= product.lowThresholdPercent;

              return (
                <View key={usage.id} style={styles.productCard}>
                  <Text style={styles.productName}>{displayName}</Text>
                  <Text style={styles.productMeta}>
                    Uses: {usage.usageAmount} {usage.usageUnit}
                  </Text>
                  <View style={styles.barBeforeWrap}>
                    <Text style={styles.barLabel}>Before</Text>
                    <View style={styles.barFaded}>
                      <InventoryBar product={product} showLabel={false} />
                    </View>
                  </View>
                  <View style={styles.barAfterWrap}>
                    <Text style={styles.barLabel}>→ After</Text>
                    <InventoryBar product={after} showLabel={false} />
                  </View>
                  <Text style={styles.afterText}>
                    New level: {after.currentQuantity % 1 === 0 ? after.currentQuantity : after.currentQuantity.toFixed(1)}{' '}
                    {product.containerUnit} ({remainingApps} more{' '}
                    {remainingApps === 1 ? 'use' : 'uses'})
                  </Text>
                  {outOfStock ? (
                    <Text style={styles.criticalWarning}>
                      🚨 Out of stock after this use! Order more before next
                      task.
                    </Text>
                  ) : lowStock ? (
                    <Text style={styles.lowWarning}>
                      ⚠️ Running low! Consider reordering soon.
                    </Text>
                  ) : null}
                </View>
              );
            })}

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>
                ✅ Confirm & Complete
              </Text>
            </TouchableOpacity>

            {productUsages.length > 0 && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={onConfirmWithoutLogging}
                activeOpacity={0.7}
              >
                <Text style={styles.skipButtonText}>
                  Complete Without Updating Inventory
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 32, 44, 0.7)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderDark,
    marginVertical: 8,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  taskName: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 12,
  },
  productCard: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  barBeforeWrap: {
    marginBottom: 8,
  },
  barAfterWrap: {
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  barFaded: {
    opacity: 0.5,
  },
  afterText: {
    fontSize: 12,
    color: Colors.urgencyGreen,
    fontWeight: '600',
    marginTop: 4,
  },
  lowWarning: {
    fontSize: 13,
    color: Colors.urgencyOrange,
    fontWeight: '600',
    marginTop: 8,
  },
  criticalWarning: {
    fontSize: 13,
    color: Colors.urgencyRed,
    fontWeight: '700',
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  confirmButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: Colors.textOnDark,
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  skipButtonText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
