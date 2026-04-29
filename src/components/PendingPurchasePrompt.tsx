import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { format } from 'date-fns';
import { Product } from '../types/models';
import { Colors } from '../constants/colors';

export interface PendingItem {
  product: Product;
}

interface Props {
  visible: boolean;
  items: PendingItem[];
  index: number;
  onYes: (item: PendingItem) => void;
  onNo: (item: PendingItem) => void;
  onDismissAll: () => void;
}

export default function PendingPurchasePrompt({
  visible,
  items,
  index,
  onYes,
  onNo,
  onDismissAll,
}: Props) {
  const item = items[index];
  if (!visible || !item) return null;

  const purchasePendingAt = item.product.purchasePendingAt;
  const dateLabel = purchasePendingAt
    ? format(purchasePendingAt, 'MMM d')
    : 'recently';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismissAll}
    >
      <TouchableWithoutFeedback onPress={onDismissAll}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {items.length > 1 && (
                <Text style={styles.progress}>
                  {index + 1} of {items.length}
                </Text>
              )}
              <Text style={styles.title}>
                Did you buy {item.product.name}?
              </Text>
              <Text style={styles.subtext}>
                You tapped "Buy" on {dateLabel}
              </Text>

              <TouchableOpacity
                style={[styles.button, styles.yesButton]}
                onPress={() => onYes(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.yesButtonText}>✅ Yes, I bought it</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.noButton]}
                onPress={() => onNo(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.noButtonText}>❌ No, not yet</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 32, 44, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  progress: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  yesButton: {
    backgroundColor: Colors.primary,
  },
  yesButtonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  noButton: {
    backgroundColor: Colors.screenBackground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noButtonText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
