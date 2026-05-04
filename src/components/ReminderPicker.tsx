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
  { label: 'No Reminder', value: null },
  { label: 'Same day', value: 0 },
  { label: '1 day before', value: 1 },
  { label: '3 days before', value: 3 },
  { label: '1 week before', value: 7 },
  { label: '2 weeks before', value: 14 },
  { label: '1 month before', value: 30 },
];

const PRESET_NUMERIC_VALUES = new Set(
  PRESETS.map((p) => p.value).filter(
    (v): v is number => typeof v === 'number'
  )
);

export function reminderLabel(daysBefore: number | undefined | null): string {
  if (daysBefore === null) return 'No Reminder';
  const d = typeof daysBefore === 'number' ? daysBefore : 1;
  if (d === 0) return 'Same day';
  if (d === 1) return '1 day before';
  return `${d} days before`;
}

export default function ReminderPicker({ value, onChange }: Props) {
  const isCustom = value !== null && !PRESET_NUMERIC_VALUES.has(value);

  const handleSelectCustom = () => {
    if (isCustom) return;
    // Pick a value not in PRESET_VALUES so the Custom pill stays active.
    onChange(2);
  };

  const handleCustomText = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly === '') {
      onChange(0);
      return;
    }
    const n = parseInt(digitsOnly, 10);
    if (!Number.isFinite(n)) return;
    onChange(Math.max(0, Math.min(365, n)));
  };

  return (
    <View>
      <View style={styles.row}>
        {PRESETS.map((p) => {
          const active = value === p.value;
          const key = p.value === null ? 'none' : String(p.value);
          return (
            <TouchableOpacity
              key={key}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => onChange(p.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.pillText, active && styles.pillTextActive]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.pill, isCustom && styles.pillActive]}
          onPress={handleSelectCustom}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.pillText, isCustom && styles.pillTextActive]}
          >
            Custom...
          </Text>
        </TouchableOpacity>
      </View>

      {isCustom ? (
        <View style={styles.customRow}>
          <Text style={styles.customLeft}>Remind me</Text>
          <TextInput
            style={styles.customInput}
            value={String(value)}
            onChangeText={handleCustomText}
            keyboardType="number-pad"
            maxLength={3}
          />
          <Text style={styles.customRight}>days before</Text>
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
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  customLeft: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  customInput: {
    width: 64,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 15,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  customRight: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
});
