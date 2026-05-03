import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';

export type SnoozeUnit = 'minutes' | 'hours' | 'days';

interface Props {
  taskName: string;
  visible: boolean;
  onSnooze: (amount: number, unit: SnoozeUnit) => void;
  onCancel: () => void;
}

interface PresetOption {
  label: string;
  amount: number;
  unit: SnoozeUnit;
}

const PRESETS: PresetOption[] = [
  { label: '1 Hour', amount: 1, unit: 'hours' },
  { label: '24 Hours', amount: 24, unit: 'hours' },
  { label: '1 Week', amount: 7, unit: 'days' },
];

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const NUMBER_ITEMS = Array.from({ length: 999 }, (_, i) => String(i + 1));
const UNIT_ITEMS = ['Minutes', 'Hours', 'Days', 'Weeks'] as const;
type WheelUnit = (typeof UNIT_ITEMS)[number];

const DEFAULT_NUMBER_INDEX = 4; // value '5'
const DEFAULT_UNIT_INDEX = 1; // 'Hours'

const CUSTOM_BLOCK_HEIGHT = WHEEL_HEIGHT + 12 + 44 + 12 * 2; // wheels + gap + button + vertical padding
const CUSTOM_BLOCK_MARGIN = 8;

function WheelPicker({
  items,
  selectedIndex,
  initialIndex,
  onSelect,
}: {
  items: readonly string[];
  selectedIndex: number;
  initialIndex: number;
  onSelect: (index: number) => void;
}) {
  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    onSelect(Math.max(0, Math.min(index, items.length - 1)));
  };

  return (
    <View style={styles.wheelWrap}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={styles.wheelContent}
        contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
        onMomentumScrollEnd={handleScrollEnd}
      >
        {items.map((item, i) => (
          <View key={i} style={styles.wheelItem}>
            <Text
              style={[
                styles.wheelItemText,
                selectedIndex === i && styles.wheelItemTextActive,
              ]}
            >
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.wheelHighlight} pointerEvents="none" />
    </View>
  );
}

function singularize(unit: WheelUnit): string {
  return unit.slice(0, -1).toLowerCase();
}

export default function SnoozeSheet({
  taskName,
  visible,
  onSnooze,
  onCancel,
}: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customMounted, setCustomMounted] = useState(false);
  const [numberIndex, setNumberIndex] = useState(DEFAULT_NUMBER_INDEX);
  const [unitIndex, setUnitIndex] = useState(DEFAULT_UNIT_INDEX);
  const expand = useRef(new Animated.Value(0)).current;
  const initialNumberIndex = useRef(DEFAULT_NUMBER_INDEX);
  const initialUnitIndex = useRef(DEFAULT_UNIT_INDEX);

  useEffect(() => {
    if (!visible) {
      setShowCustom(false);
      setCustomMounted(false);
      setNumberIndex(DEFAULT_NUMBER_INDEX);
      setUnitIndex(DEFAULT_UNIT_INDEX);
      initialNumberIndex.current = DEFAULT_NUMBER_INDEX;
      initialUnitIndex.current = DEFAULT_UNIT_INDEX;
      expand.setValue(0);
    }
  }, [visible, expand]);

  useEffect(() => {
    if (showCustom) {
      // Capture current selection as initial offset for the freshly-mounted wheels
      initialNumberIndex.current = numberIndex;
      initialUnitIndex.current = unitIndex;
      setCustomMounted(true);
      Animated.timing(expand, {
        toValue: 1,
        duration: 240,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(expand, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setCustomMounted(false);
      });
    }
    // We intentionally only react to showCustom changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCustom]);

  const value = numberIndex + 1;
  const unit = UNIT_ITEMS[unitIndex];
  const unitLabel = value === 1 ? singularize(unit) : unit.toLowerCase();
  const buttonLabel = `Remind me in ${value} ${unitLabel}`;

  const submitCustom = () => {
    if (unit === 'Minutes') onSnooze(value, 'minutes');
    else if (unit === 'Hours') onSnooze(value, 'hours');
    else if (unit === 'Days') onSnooze(value, 'days');
    else onSnooze(value * 7, 'days');
  };

  const customHeight = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CUSTOM_BLOCK_HEIGHT],
  });
  const customMargin = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CUSTOM_BLOCK_MARGIN],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={styles.cardWrap} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>😴 Snooze Reminder</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            Remind me about {taskName} again in...
          </Text>

          <View style={styles.optionList}>
            {PRESETS.map((o) => (
              <TouchableOpacity
                key={o.label}
                style={styles.option}
                onPress={() => onSnooze(o.amount, o.unit)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>{o.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.option, showCustom && styles.optionActive]}
              onPress={() => setShowCustom((v) => !v)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.optionText,
                  showCustom && styles.optionTextActive,
                ]}
              >
                Custom...
              </Text>
            </TouchableOpacity>
          </View>

          <Animated.View
            style={[
              styles.customBlock,
              {
                height: customHeight,
                marginTop: customMargin,
                opacity: expand,
              },
            ]}
          >
            {customMounted ? (
              <>
                <View style={styles.wheelRow}>
                  <View style={styles.wheelCol}>
                    <WheelPicker
                      items={NUMBER_ITEMS}
                      selectedIndex={numberIndex}
                      initialIndex={initialNumberIndex.current}
                      onSelect={setNumberIndex}
                    />
                  </View>
                  <View style={styles.wheelDivider} />
                  <View style={[styles.wheelCol, styles.wheelColUnit]}>
                    <WheelPicker
                      items={UNIT_ITEMS as unknown as string[]}
                      selectedIndex={unitIndex}
                      initialIndex={initialUnitIndex.current}
                      onSelect={setUnitIndex}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={submitCustom}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Animated.View>

          <TouchableOpacity
            style={styles.cancelRow}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 32, 44, 0.5)',
  },
  cardWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  optionList: {
    gap: 8,
  },
  option: {
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  optionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  optionTextActive: {
    color: Colors.primary,
  },
  customBlock: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  wheelRow: {
    flexDirection: 'row',
    height: WHEEL_HEIGHT,
  },
  wheelCol: {
    flex: 1,
  },
  wheelColUnit: {
    flex: 1.5,
  },
  wheelDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderDark,
    marginHorizontal: 4,
  },
  wheelWrap: {
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  wheelContent: {
    paddingVertical: ITEM_HEIGHT * 2,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 20,
    fontWeight: '400',
    color: Colors.textLight,
  },
  wheelItemTextActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  wheelHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: 'rgba(49,151,149,0.12)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.primary,
  },
  primaryButton: {
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelRow: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
