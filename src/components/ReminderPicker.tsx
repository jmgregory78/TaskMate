import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  value: number | null;
  onChange: (next: number | null) => void;
}

interface Preset {
  label: string;
  value: number | null;
}

const PRESETS: Preset[] = [
  { label: 'No Advance Reminder', value: null },
  { label: '1 day before', value: 1 },
  { label: '3 days before', value: 3 },
  { label: '1 week before', value: 7 },
];

const PRESET_NUMERIC_VALUES = new Set(
  PRESETS.map((p) => p.value).filter(
    (v): v is number => typeof v === 'number'
  )
);

type CustomUnit = 'days' | 'weeks' | 'months';

const UNIT_OPTIONS: { key: CustomUnit; label: string; multiplier: number }[] = [
  { key: 'days', label: 'Days', multiplier: 1 },
  { key: 'weeks', label: 'Weeks', multiplier: 7 },
  { key: 'months', label: 'Months', multiplier: 30 },
];

function daysToUnitAndValue(days: number): { value: number; unit: CustomUnit } {
  if (days % 30 === 0 && days >= 30) {
    return { value: days / 30, unit: 'months' };
  }
  if (days % 7 === 0 && days >= 7) {
    return { value: days / 7, unit: 'weeks' };
  }
  return { value: days, unit: 'days' };
}

export function reminderLabel(daysBefore: number | undefined | null): string {
  if (daysBefore === null || daysBefore === undefined) return 'No Advance Reminder';
  const d = daysBefore;
  if (d === 0) return 'Same day';
  if (d === 1) return '1 day before';
  if (d === 7) return '1 week before';
  if (d === 14) return '2 weeks before';
  if (d === 30) return '1 month before';
  if (d % 30 === 0) return `${d / 30} months before`;
  if (d % 7 === 0) return `${d / 7} weeks before`;
  return `${d} days before`;
}

export default function ReminderPicker({ value, onChange }: Props) {
  const isCustom = value !== null && !PRESET_NUMERIC_VALUES.has(value);

  // Custom input state
  const initialCustom = isCustom && value !== null ? daysToUnitAndValue(value) : { value: 1, unit: 'days' as CustomUnit };
  const [customValue, setCustomValue] = useState(String(initialCustom.value));
  const [customUnit, setCustomUnit] = useState<CustomUnit>(initialCustom.unit);
  const [showCustomInput, setShowCustomInput] = useState(isCustom);

  const handleSelectCustom = () => {
    setShowCustomInput(true);
    // Set a default custom value that's not in presets
    const multiplier = UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
    const num = parseInt(customValue, 10) || 1;
    onChange(num * multiplier);
  };

  const handleConfirmCustom = () => {
    const num = parseInt(customValue, 10) || 1;
    const multiplier = UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
    const totalDays = num * multiplier;
    onChange(totalDays);
  };

  const handleSelectPreset = (presetValue: number | null) => {
    setShowCustomInput(false);
    onChange(presetValue);
  };

  const handleCustomValueChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '');
    setCustomValue(digitsOnly);
    // Live update the value
    const num = parseInt(digitsOnly, 10) || 1;
    const multiplier = UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
    onChange(num * multiplier);
  };

  const handleUnitChange = (unit: CustomUnit) => {
    setCustomUnit(unit);
    // Live update the value
    const num = parseInt(customValue, 10) || 1;
    const multiplier = UNIT_OPTIONS.find((u) => u.key === unit)?.multiplier ?? 1;
    onChange(num * multiplier);
  };

  // Compute label for custom display
  const customDisplayLabel = (() => {
    if (!isCustom || value === null) return '';
    return reminderLabel(value);
  })();

  return (
    <View>
      <View style={styles.row}>
        {PRESETS.map((p) => {
          const active = value === p.value && !showCustomInput;
          const key = p.value === null ? 'none' : String(p.value);
          const isNoAdvanceReminder = p.value === null;
          return (
            <View key={key}>
              <TouchableOpacity
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => handleSelectPreset(p.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.pillText, active && styles.pillTextActive]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
              {isNoAdvanceReminder ? (
                <Text style={styles.noReminderSubtitle}>
                  You'll still get a task alert on the due date
                </Text>
              ) : null}
            </View>
          );
        })}
        <TouchableOpacity
          style={[styles.pill, (isCustom || showCustomInput) && styles.pillActive]}
          onPress={handleSelectCustom}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.pillText, (isCustom || showCustomInput) && styles.pillTextActive]}
          >
            {isCustom && !showCustomInput ? customDisplayLabel : 'Custom...'}
          </Text>
        </TouchableOpacity>
      </View>

      {showCustomInput ? (
        <View style={styles.customContainer}>
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={customValue}
              onChangeText={handleCustomValueChange}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
            <View style={styles.unitRow}>
              {UNIT_OPTIONS.map((u) => {
                const active = customUnit === u.key;
                return (
                  <TouchableOpacity
                    key={u.key}
                    style={[styles.unitChip, active && styles.unitChipActive]}
                    onPress={() => handleUnitChange(u.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.unitChipText, active && styles.unitChipTextActive]}>
                      {u.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirmCustom}
            activeOpacity={0.7}
          >
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  pillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  pillText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  customContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customInput: {
    width: 64,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 16,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  unitRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
  },
  unitChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  unitChipText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  unitChipTextActive: {
    color: Colors.primary,
  },
  confirmButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  noReminderSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
