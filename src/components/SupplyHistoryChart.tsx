import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { format, subDays, subMonths, subYears, differenceInDays } from 'date-fns';
import { Product, SupplyHistoryRecord } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  product: Product;
  history: SupplyHistoryRecord[];
}

type ChartWindow = {
  label: string;
  fromDate: Date;
  formatTick: (date: Date) => string;
};

function getChartWindow(product: Product, history: SupplyHistoryRecord[]): ChartWindow {
  const now = new Date();
  const unit = product.depletionMode === 'auto' ? product.autoDepletionUnit : 'month';

  switch (unit) {
    case 'day':
      return {
        label: 'Last 90 days',
        fromDate: subDays(now, 90),
        formatTick: (d: Date) => format(d, 'MMM d'),
      };
    case 'week':
      return {
        label: 'Last 6 months',
        fromDate: subMonths(now, 6),
        formatTick: (d: Date) => format(d, 'MMM'),
      };
    case 'month':
    default:
      const oldestRecord = history.length > 0 ? history[0].date : now;
      const daysOfHistory = differenceInDays(now, oldestRecord);

      if (daysOfHistory > 365 * 2) {
        return {
          label: 'All time',
          fromDate: oldestRecord,
          formatTick: (d: Date) => format(d, 'yyyy'),
        };
      } else if (daysOfHistory > 365) {
        return {
          label: 'Last 2 years',
          fromDate: subYears(now, 2),
          formatTick: (d: Date) => format(d, 'MMM yy'),
        };
      }
      return {
        label: 'Last 12 months',
        fromDate: subMonths(now, 12),
        formatTick: (d: Date) => format(d, 'MMM'),
      };
  }
}

const CHART_HEIGHT = 180;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 64; // Account for card padding

export default function SupplyHistoryChart({ product, history }: Props) {
  if (history.length < 2) {
    return null;
  }

  const window = getChartWindow(product, history);
  const filteredHistory = history.filter((h) => h.date >= window.fromDate);
  const chartData = filteredHistory.length >= 2 ? filteredHistory : history;

  // Calculate maxQuantity from history (ensure whole number)
  const rawMax = Math.max(...chartData.map((h) => h.quantity), product.currentQuantity);
  const maxQuantity = Math.ceil(rawMax);

  // Calculate threshold
  const thresholdQty =
    product.lowThresholdQty !== null && product.lowThresholdQty !== undefined
      ? product.lowThresholdQty
      : (product.lowThresholdPercent / 100) * maxQuantity;

  // Ensure maxY is a whole number for clean Y-axis labels
  const maxY = Math.max(maxQuantity, Math.ceil(Math.max(...chartData.map((h) => h.quantity))));

  // Cap sections at reasonable number (max 6) to avoid cluttered Y-axis
  // Ensure at least 1 section to avoid crash when maxY is 0
  const numSections = Math.max(1, Math.min(maxY, 6));
  const stepValue = maxY > 6 ? Math.ceil(maxY / 6) : 1;
  const adjustedMaxY = numSections * stepValue;

  // Generate Y-axis labels as whole numbers
  const yLabels = Array.from(
    { length: numSections + 1 },
    (_, i) => (i * stepValue).toString()
  );

  // Determine how many x-axis labels to show (max 4-5 labels)
  const labelInterval = Math.max(1, Math.floor(chartData.length / 4));

  // Prepare data for gifted-charts
  const data = chartData.map((h, index) => ({
    value: h.quantity,
    label: index % labelInterval === 0 ? window.formatTick(h.date) : '',
    dataPointColor:
      h.eventType === 'purchase'
        ? Colors.urgencyGreen
        : h.eventType === 'task_completion'
        ? Colors.primary
        : Colors.primary,
    customDataPoint:
      h.eventType === 'purchase'
        ? () => <View style={styles.purchaseDot} />
        : h.eventType === 'task_completion'
        ? () => <View style={styles.taskDot} />
        : undefined,
  }));

  // Calculate spacing to fill chart width evenly
  const chartSpacing = chartData.length > 1
    ? Math.max(20, (CHART_WIDTH - 60) / (chartData.length - 1))
    : 40;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stock History</Text>
        <Text style={styles.subtitle}>{window.label}</Text>
      </View>

      <View style={styles.chartWrapper}>
        <LineChart
          data={data}
          color={Colors.primary}
          thickness={2}
          startFillColor={Colors.primary}
          startOpacity={0.3}
          endOpacity={0}
          areaChart
          curved
          hideDataPoints={false}
          dataPointsRadius={5}
          yAxisColor="transparent"
          xAxisColor={Colors.border}
          yAxisTextStyle={styles.axisLabel}
          xAxisLabelTextStyle={styles.xAxisLabel}
          rulesColor={Colors.divider}
          rulesType="solid"
          showReferenceLine1
          referenceLine1Position={thresholdQty}
          referenceLine1Config={{
            color: Colors.urgencyAmber,
            dashWidth: 6,
            dashGap: 4,
            labelText: 'Reorder',
            labelTextStyle: styles.referenceLabel,
          }}
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          initialSpacing={10}
          endSpacing={10}
          spacing={chartSpacing}
          noOfSections={numSections}
          stepValue={stepValue}
          maxValue={adjustedMaxY}
          yAxisLabelTexts={yLabels}
          yAxisOffset={0}
          hideRules={false}
          showVerticalLines={false}
          verticalLinesColor="transparent"
        />
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.urgencyGreen }]} />
          <Text style={styles.legendText}>Restocked</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotOutline]} />
          <Text style={styles.legendText}>Task done</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDash} />
          <Text style={styles.legendText}>Reorder point</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Inside a section card
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  chartWrapper: {
    marginLeft: -16, // Offset card padding for full-width chart
    overflow: 'hidden',
    width: '100%',
  },
  axisLabel: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  xAxisLabel: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  referenceLabel: {
    color: Colors.urgencyAmber,
    fontSize: 10,
  },
  purchaseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.urgencyGreen,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDotOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  legendDash: {
    width: 12,
    height: 2,
    backgroundColor: Colors.urgencyAmber,
  },
  legendText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});
