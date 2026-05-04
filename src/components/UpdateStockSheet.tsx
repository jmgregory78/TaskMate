import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import InventoryBar from './InventoryBar';
import { Product, stockPercent } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  visible: boolean;
  product: Product;
  onSave: (newQuantity: number, note: string) => void;
  onCancel: () => void;
}

function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function UpdateStockSheet({
  visible,
  product,
  onSave,
  onCancel,
}: Props) {
  const [quantityText, setQuantityText] = useState(
    String(product.currentQuantity)
  );
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setQuantityText(String(product.currentQuantity));
      setNote('');
    }
  }, [visible, product.currentQuantity]);

  const parsed = parseQuantity(quantityText);
  const previewProduct = useMemo<Product>(
    () => ({
      ...product,
      currentQuantity: parsed ?? product.currentQuantity,
    }),
    [product, parsed]
  );

  const previewQuantity = previewProduct.currentQuantity;
  const previewPercent = stockPercent(previewProduct);
  const difference =
    parsed !== null ? parsed - product.currentQuantity : 0;
  const canSave = parsed !== null && difference !== 0;

  const handleSave = () => {
    if (!canSave || parsed === null) return;
    Keyboard.dismiss();
    onSave(parsed, note.trim());
  };

  const diffLabel =
    parsed === null
      ? '—'
      : difference === 0
        ? 'No change'
        : `${difference > 0 ? '+' : ''}${difference} ${product.containerUnit}`;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} activeOpacity={0.6}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              Update Stock
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.6}
            >
              <Text style={[styles.save, !canSave && styles.saveDisabled]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.beforeAfterRow}>
              <View style={styles.side}>
                <Text style={styles.sideLabel}>Before</Text>
                <InventoryBar product={product} showLabel={false} compact />
                <Text style={styles.sideValue}>
                  {product.currentQuantity} {product.containerUnit}
                </Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.side}>
                <Text style={styles.sideLabel}>After</Text>
                <InventoryBar
                  product={previewProduct}
                  showLabel={false}
                  compact
                />
                <Text style={styles.sideValue}>
                  {previewQuantity} {product.containerUnit}{' '}
                  <Text style={styles.sidePercent}>({previewPercent}%)</Text>
                </Text>
              </View>
            </View>

            <View style={styles.inputBlock}>
              <TextInput
                style={styles.bigNumber}
                value={quantityText}
                onChangeText={setQuantityText}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#cbd5e0"
                autoFocus
                selectTextOnFocus
              />
              <Text style={styles.bigUnit}>{product.containerUnit}</Text>
              <View
                style={[
                  styles.diffPill,
                  difference > 0 && styles.diffPillPositive,
                  difference < 0 && styles.diffPillNegative,
                  difference === 0 && styles.diffPillNeutral,
                ]}
              >
                <Text
                  style={[
                    styles.diffPillText,
                    difference > 0 && styles.diffPillTextPositive,
                    difference < 0 && styles.diffPillTextNegative,
                    difference === 0 && styles.diffPillTextNeutral,
                  ]}
                >
                  {diffLabel}
                </Text>
              </View>
            </View>

            <View style={styles.reasonRow}>
              <Text style={styles.reasonLabel}>Reason:</Text>
              <TextInput
                style={styles.reasonInput}
                value={note}
                onChangeText={setNote}
                placeholder="optional"
                placeholderTextColor="#a0aec0"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 32, 44, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    height: '65%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  cancel: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  save: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  saveDisabled: {
    color: Colors.borderDark,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  beforeAfterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  side: {
    flex: 1,
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sideValue: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  sidePercent: {
    color: Colors.textMuted,
    fontWeight: '500',
  },
  arrow: {
    fontSize: 22,
    color: Colors.textLight,
    paddingHorizontal: 4,
  },
  inputBlock: {
    alignItems: 'center',
    marginTop: 16,
  },
  bigNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    minWidth: 120,
    paddingVertical: 4,
  },
  bigUnit: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  diffPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  diffPillPositive: {
    backgroundColor: Colors.successBg,
  },
  diffPillNegative: {
    backgroundColor: Colors.errorBg,
  },
  diffPillNeutral: {
    backgroundColor: '#edf2f7',
  },
  diffPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  diffPillTextPositive: {
    color: Colors.urgencyGreen,
  },
  diffPillTextNegative: {
    color: '#b91c1c',
  },
  diffPillTextNeutral: {
    color: '#64748b',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    height: 48,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  reasonInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
  },
});
