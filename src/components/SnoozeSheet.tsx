import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  taskName: string;
  visible: boolean;
  onSnooze: (days: number) => void;
  onCancel: () => void;
}

interface Option {
  label: string;
  days: number;
}

const OPTIONS: Option[] = [
  { label: 'Tomorrow morning', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

export default function SnoozeSheet({
  taskName,
  visible,
  onSnooze,
  onCancel,
}: Props) {
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
            {OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.days}
                style={styles.option}
                onPress={() => onSnooze(o.days)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

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
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
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
