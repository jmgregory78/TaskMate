import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Product } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  product: Product;
  maxQuantity?: number;
  showLabel?: boolean;
  compact?: boolean;
}

function calculatePercent(product: Product, maxQuantity: number): number {
  // Use maxQuantity as the max (100% when full)
  // If maxQuantity is not set or 0, show 100% (full green)
  if (!maxQuantity || maxQuantity <= 0) {
    return 100;
  }
  // Cap at 100% - never show more than full
  return Math.min(
    100,
    Math.round((product.currentQuantity / maxQuantity) * 100)
  );
}

function colorForStock(product: Product, maxQuantity: number): string {
  // Determine effective threshold quantity
  let thresholdQty: number;
  if (
    product.lowThresholdQty !== null &&
    product.lowThresholdQty !== undefined
  ) {
    thresholdQty = product.lowThresholdQty;
  } else {
    // Convert percentage threshold to quantity
    thresholdQty = (product.lowThresholdPercent / 100) * maxQuantity;
  }

  // Red: critically low - 1 unit remaining or below 10%, whichever is higher
  const criticalQty = Math.max(1, maxQuantity * 0.1);
  if (product.currentQuantity <= criticalQty) {
    return Colors.urgencyRed;
  }

  // Yellow: at or below reorder threshold
  if (product.currentQuantity <= thresholdQty) {
    return Colors.urgencyAmber;
  }

  // Green: above reorder threshold
  return Colors.urgencyGreen;
}

export default function InventoryBar({
  product,
  maxQuantity,
  showLabel = true,
  compact = false,
}: Props) {
  // Use provided maxQuantity, or fall back to currentQuantity (100% if no history)
  const effectiveMax = maxQuantity && maxQuantity > 0 ? maxQuantity : product.currentQuantity;
  const percent = calculatePercent(product, effectiveMax);
  const animated = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animated, {
      toValue: percent,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [percent, animated]);

  const widthInterpolated = animated.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const trackStyle = compact ? styles.trackCompact : styles.track;

  return (
    <View style={styles.container}>
      <View style={trackStyle}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: widthInterpolated,
              backgroundColor: colorForStock(product, effectiveMax),
            },
          ]}
        />
      </View>
      {showLabel && (
        <Text style={styles.label}>
          {percent}% remaining · {product.currentQuantity}{' '}
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
  track: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  trackCompact: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 6,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
