import { useState, useEffect } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  value: number | null;
  onChange: (next: number | null) => void;
}

interface Option {
  label: string;
  value: number | null | 'custom';
}

type CustomUnit = 'days' | 'weeks' | 'months';

const OPTIONS: Option[] = [
  { label: 'No Advance Reminder', value: null },
  { label: '1 Day Before', value: 1 },
  { label: '1 Week Before', value: 7 },
  { label: 'Custom', value: 'custom' },
];

const UNIT_OPTIONS: { key: CustomUnit; label: string; multiplier: number }[] = [
  { key: 'days', label: 'Days', multiplier: 1 },
  { key: 'weeks', label: 'Weeks', multiplier: 7 },
  { key: 'months', label: 'Months', multiplier: 30 },
];

const NUMBER_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);

function daysToUnitAndValue(days: number): { value: number; unit: CustomUnit } {
  if (days % 30 === 0 && days >= 30) {
    return { value: days / 30, unit: 'months' };
  }
  if (days % 7 === 0 && days >= 7) {
    return { value: days / 7, unit: 'weeks' };
  }
  return { value: Math.min(days, 30), unit: 'days' };
}

export function reminderLabel(daysBefore: number | undefined | null): string {
  if (daysBefore === null || daysBefore === undefined) return 'No Advance Reminder';
  const d = daysBefore;
  if (d === 0) return 'Same day';
  if (d === 1) return '1 Day Before';
  if (d === 7) return '1 Week Before';
  if (d === 14) return '2 Weeks Before';
  if (d === 30) return '1 Month Before';
  if (d % 30 === 0) return `${d / 30} months before`;
  if (d % 7 === 0) return `${d / 7} weeks before`;
  return `${d} days before`;
}

function isCustomValue(value: number | null): boolean {
  if (value === null) return false;
  return value !== 1 && value !== 7;
}

export default function ReminderPicker({ value, onChange }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(() => isCustomValue(value));
  const [showNumberPicker, setShowNumberPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  // Initialize custom values from current value
  const initialCustom = value && isCustomValue(value) ? daysToUnitAndValue(value) : { value: 1, unit: 'days' as CustomUnit };
  const [customNumber, setCustomNumber] = useState(initialCustom.value);
  const [customUnit, setCustomUnit] = useState<CustomUnit>(initialCustom.unit);

  const isCustom = isCustomValue(value);
  const displayLabel = isCustom
    ? reminderLabel(value)
    : (OPTIONS.find((o) => o.value === value)?.label ?? 'No Advance Reminder');

  // Update custom fields when value changes externally
  useEffect(() => {
    if (value && isCustomValue(value)) {
      const parsed = daysToUnitAndValue(value);
      setCustomNumber(parsed.value);
      setCustomUnit(parsed.unit);
      setShowCustomFields(true);
    } else {
      setShowCustomFields(false);
    }
  }, [value]);

  const handleSelect = (option: Option) => {
    if (option.value === 'custom') {
      setShowDropdown(false);
      setShowCustomFields(true);
      // Set initial custom value
      const multiplier = UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
      onChange(customNumber * multiplier);
    } else {
      onChange(option.value as number | null);
      setShowDropdown(false);
      setShowCustomFields(false);
    }
  };

  const handleCustomNumberChange = (num: number) => {
    setCustomNumber(num);
    setShowNumberPicker(false);
    const multiplier = UNIT_OPTIONS.find((u) => u.key === customUnit)?.multiplier ?? 1;
    onChange(num * multiplier);
  };

  const handleCustomUnitChange = (unit: CustomUnit) => {
    setCustomUnit(unit);
    setShowUnitPicker(false);
    const multiplier = UNIT_OPTIONS.find((u) => u.key === unit)?.multiplier ?? 1;
    onChange(customNumber * multiplier);
  };

  const unitLabel = UNIT_OPTIONS.find((u) => u.key === customUnit)?.label ?? 'Days';

  return (
    <View>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setShowDropdown(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.dropdownText}>{displayLabel}</Text>
        <Text style={styles.dropdownArrow}>▼</Text>
      </TouchableOpacity>

      {value === null ? (
        <Text style={styles.noReminderSubtitle}>
          You'll still get a task alert on the due date
        </Text>
      ) : null}

      {/* Custom Fields - shown inline when Custom is selected */}
      {showCustomFields ? (
        <View style={styles.customFieldsContainer}>
          <View style={styles.customFieldsRow}>
            {/* Number Picker */}
            <TouchableOpacity
              style={styles.customField}
              onPress={() => setShowNumberPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.customFieldText}>{customNumber}</Text>
              <Text style={styles.customFieldArrow}>▼</Text>
            </TouchableOpacity>

            {/* Unit Picker */}
            <TouchableOpacity
              style={styles.customField}
              onPress={() => setShowUnitPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.customFieldText}>{unitLabel}</Text>
              <Text style={styles.customFieldArrow}>▼</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.customFieldsHint}>before due date</Text>
        </View>
      ) : null}

      {/* Main Dropdown Modal */}
      <Modal
        visible={showDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDropdown(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDropdown(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Advance Reminder</Text>
            {OPTIONS.map((option) => {
              const isSelected = option.value === 'custom'
                ? isCustom
                : option.value === value;
              return (
                <TouchableOpacity
                  key={option.value === null ? 'none' : String(option.value)}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => handleSelect(option)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                  {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Number Picker Modal */}
      <Modal
        visible={showNumberPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNumberPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowNumberPicker(false)}
        >
          <View style={styles.pickerModalContent}>
            <Text style={styles.modalTitle}>Select Number</Text>
            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
              {NUMBER_OPTIONS.map((num) => {
                const isSelected = num === customNumber;
                return (
                  <TouchableOpacity
                    key={num}
                    style={[styles.pickerRow, isSelected && styles.optionRowSelected]}
                    onPress={() => handleCustomNumberChange(num)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pickerText, isSelected && styles.optionTextSelected]}>
                      {num}
                    </Text>
                    {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit Picker Modal */}
      <Modal
        visible={showUnitPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnitPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUnitPicker(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Unit</Text>
            {UNIT_OPTIONS.map((unit) => {
              const isSelected = unit.key === customUnit;
              return (
                <TouchableOpacity
                  key={unit.key}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => handleCustomUnitChange(unit.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {unit.label}
                  </Text>
                  {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  dropdownArrow: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  noReminderSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  customFieldsContainer: {
    marginTop: 12,
  },
  customFieldsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  customField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  customFieldText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  customFieldArrow: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  customFieldsHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  pickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 16,
    maxHeight: 400,
    overflow: 'hidden',
  },
  pickerScroll: {
    maxHeight: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  pickerText: {
    fontSize: 18,
    color: Colors.textPrimary,
  },
  optionRowSelected: {
    backgroundColor: Colors.primaryLight,
  },
  optionText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: Colors.primary,
    fontWeight: '700',
  },
});
