import { StyleSheet, Text, View } from 'react-native';
import { Product } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  product: Product;
  maxQuantity?: number;
  showLabel?: boolean;
  compact?: boolean;
}

function getThresholdQty(product: Product, maxQuantity: number): number {
  if (product.thresholdType === 'quantity') {
    return product.thresholdValue;
  }
  if (product.thresholdType === 'percentage') {
    return (product.thresholdValue / 100) * maxQuantity;
  }
  if (product.lowThresholdQty !== null && product.lowThresholdQty !== undefined) {
    return product.lowThresholdQty;
  }
  return (product.lowThresholdPercent / 100) * maxQuantity;
}

function getBarColor(currentQty: number, thresholdQty: number): string {
  // Red: out of stock
  if (currentQty === 0) return '#EF4444';
  // Amber: at or below threshold but still has stock
  if (currentQty <= thresholdQty) return '#F59E0B';
  // Green: above threshold
  return '#10B981';
}

export default function InventoryBar({
  product,
  maxQuantity,
  showLabel = true,
  compact = false,
}: Props) {
  // Use provided maxQuantity, or fall back to currentQuantity (100% if no history)
  const effectiveMax = maxQuantity && maxQuantity > 0 ? maxQuantity : product.currentQuantity;
  const thresholdQty = getThresholdQty(product, effectiveMax);
  const barColor = getBarColor(product.currentQuantity, thresholdQty);

  // Calculate fill percentage
  const fillPct = effectiveMax > 0
    ? (product.currentQuantity / effectiveMax) * 100
    : 0;

  // Minimum visible sliver when not zero
  let displayPct: number;
  if (product.currentQuantity === 0) {
    displayPct = 2; // Tiny sliver for empty
  } else if (product.currentQuantity >= effectiveMax) {
    displayPct = 100; // Full bar
  } else {
    displayPct = Math.max(fillPct, 3); // At least 3% wide
  }

  // Calculate display percent for label
  const labelPercent = effectiveMax > 0
    ? Math.min(100, Math.round((product.currentQuantity / effectiveMax) * 100))
    : 100;

  const isFull = displayPct >= 100;
  const barHeight = compact ? 8 : 12;
  const borderRadius = compact ? 4 : 6;

  return (
    <View style={styles.container}>
      <View style={[styles.barContainer, { height: barHeight, borderRadius }]}>
        {/* Filled portion */}
        <View
          style={[
            styles.barFill,
            {
              width: `${displayPct}%`,
              backgroundColor: barColor,
              borderTopLeftRadius: borderRadius,
              borderBottomLeftRadius: borderRadius,
              borderTopRightRadius: isFull ? borderRadius : 0,
              borderBottomRightRadius: isFull ? borderRadius : 0,
            },
          ]}
        />
        {/* Empty portion (only if not full) */}
        {!isFull && (
          <View
            style={[
              styles.barEmpty,
              { width: `${100 - displayPct}%` },
            ]}
          />
        )}
      </View>
      {showLabel && (
        <Text style={styles.label}>
          {labelPercent}% remaining · {product.currentQuantity}{' '}
          {product.containerUnit} on hand
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  barContainer: {
    width: '100%',
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  barFill: {
    height: '100%',
  },
  barEmpty: {
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
