import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Product, stockPercent } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  product: Product;
  showLabel?: boolean;
  compact?: boolean;
}

function colorForPercent(percent: number): string {
  if (percent < 25) return Colors.urgencyRed;
  if (percent <= 50) return Colors.urgencyAmber;
  return Colors.urgencyGreen;
}

export default function InventoryBar({
  product,
  showLabel = true,
  compact = false,
}: Props) {
  const percent = stockPercent(product);
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
              backgroundColor: colorForPercent(percent),
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
