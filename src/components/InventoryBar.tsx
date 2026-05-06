import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Product } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  product: Product;
  showLabel?: boolean;
  compact?: boolean;
}

function calculatePercent(product: Product): number {
  // Use containerSize as the max (100% when full)
  // If containerSize is not set or 0, show 100% (full green)
  if (!product.containerSize || product.containerSize <= 0) {
    return 100;
  }
  // Cap at 100% - never show more than full
  return Math.min(
    100,
    Math.round((product.currentQuantity / product.containerSize) * 100)
  );
}

function colorForStock(product: Product, percent: number): string {
  const containerSize = product.containerSize || 1;

  // Determine effective threshold quantity
  let thresholdQty: number;
  if (
    product.lowThresholdQty !== null &&
    product.lowThresholdQty !== undefined
  ) {
    thresholdQty = product.lowThresholdQty;
  } else {
    // Convert percentage threshold to quantity
    thresholdQty = (product.lowThresholdPercent / 100) * containerSize;
  }

  // Red: critically low - 1 unit remaining or below 10%, whichever is higher
  const criticalQty = Math.max(1, containerSize * 0.1);
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
  showLabel = true,
  compact = false,
}: Props) {
  const percent = calculatePercent(product);
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
              backgroundColor: colorForStock(product, percent),
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
