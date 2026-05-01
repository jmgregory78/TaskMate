import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Product, stockPercent } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  products: Product[];
}

const TIER_FILL = {
  excellent: '#38A169',
  medium: '#D69E2E',
  low: '#E53E3E',
} as const;

const TIER_TEXT = {
  excellent: '#276749',
  medium: '#B7791F',
  low: '#C53030',
} as const;

interface SummaryBarProps {
  label: 'Excellent' | 'Medium' | 'Low';
  count: number;
  total: number;
  fillColor: string;
  textColor: string;
}

function SummaryBar({
  label,
  count,
  total,
  fillColor,
  textColor,
}: SummaryBarProps) {
  const target = total > 0 ? (count / total) * 100 : 0;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: target,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [target, anim]);

  const widthInterpolate = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: textColor }]}>{label}</Text>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: widthInterpolate,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>
      <Text style={[styles.barCount, { color: textColor }]}>
        {count} {count === 1 ? 'item' : 'items'}
      </Text>
    </View>
  );
}

export default function StockOverviewCard({ products }: Props) {
  const tiers = useMemo(() => {
    let excellent = 0;
    let medium = 0;
    let low = 0;
    for (const p of products) {
      const pct = stockPercent(p);
      if (pct > 50) excellent += 1;
      else if (pct > 25) medium += 1;
      else low += 1;
    }
    return { excellent, medium, low };
  }, [products]);

  const total = products.length;

  return (
    <View style={styles.cardOuter}>
      <View style={styles.cardInner}>
        <View style={styles.topStrip} />
        <View style={styles.cardBody}>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>Stock Overview</Text>
            <Text style={styles.headerMeta}>
              {total} total {total === 1 ? 'supply' : 'supplies'}
            </Text>
          </View>

          <View style={styles.barsBlock}>
            <SummaryBar
              label="Excellent"
              count={tiers.excellent}
              total={total}
              fillColor={TIER_FILL.excellent}
              textColor={TIER_TEXT.excellent}
            />
            <SummaryBar
              label="Medium"
              count={tiers.medium}
              total={total}
              fillColor={TIER_FILL.medium}
              textColor={TIER_TEXT.medium}
            />
            <SummaryBar
              label="Low"
              count={tiers.low}
              total={total}
              fillColor={TIER_FILL.low}
              textColor={TIER_TEXT.low}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    marginTop: 16,
    marginBottom: 8,
    shadowColor: '#319795',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  cardInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 6,
    borderColor: Colors.primary,
    overflow: 'hidden',
  },
  topStrip: {
    height: 4,
    backgroundColor: Colors.primary,
  },
  cardBody: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  headerMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  barsBlock: {
    gap: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barLabel: {
    width: 80,
    fontSize: 13,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  barCount: {
    width: 60,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
});
