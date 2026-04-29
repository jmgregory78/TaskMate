import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Product, TaskProductUsage } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  usage: TaskProductUsage | null;
  product: Product | null;
  visible: boolean;
  onSave: (newUsageAmount: number) => Promise<void> | void;
  onCancel: () => void;
}

export default function EditProductUsageSheet({
  usage,
  product,
  visible,
  onSave,
  onCancel,
}: Props) {
  const [amountText, setAmountText] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAmountText(
      usage ? String(usage.usageAmount) : '1'
    );
    setError(null);
    setSubmitting(false);
  }, [visible, usage]);

  if (!usage || !product) return null;

  const parsed = parseFloat(amountText);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  const usesRemaining =
    amount > 0 && product.currentQuantity > 0
      ? Math.floor(product.currentQuantity / amount)
      : 0;
  const canSave = amount > 0 && amount !== usage.usageAmount && !submitting;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSave(amount);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Could not save usage.');
      setSubmitting(false);
    }
  };

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
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              Edit Usage · {product.name}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.saveText,
                  !canSave && styles.saveTextDisabled,
                ]}
              >
                {submitting ? '...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.currentUsage}>
            Currently uses {usage.usageAmount} {usage.usageUnit} per completion
          </Text>

          <Text style={styles.label}>Amount used per completion</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={styles.unitText}>{usage.usageUnit}</Text>
          </View>

          <View style={styles.previewBox}>
            <Text style={styles.previewLine}>
              Each completion uses {amount > 0 ? amount : '—'} {usage.usageUnit}
            </Text>
            <Text style={styles.previewLine}>
              At current stock, that's {usesRemaining} use
              {usesRemaining === 1 ? '' : 's'} remaining
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {submitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : null}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  cancelText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  saveText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  saveTextDisabled: {
    opacity: 0.4,
  },
  currentUsage: {
    color: Colors.textMuted,
    fontSize: 13,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 26,
    fontWeight: '700',
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  unitText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    minWidth: 50,
  },
  previewBox: {
    marginTop: 16,
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  previewLine: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  error: {
    marginTop: 12,
    color: Colors.error,
    fontSize: 13,
    textAlign: 'center',
  },
  submittingRow: {
    paddingTop: 12,
    alignItems: 'center',
  },
});
