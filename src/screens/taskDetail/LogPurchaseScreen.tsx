import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { format } from 'date-fns';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import ScreenWrapper from '../../components/ScreenWrapper';
import InventoryBar from '../../components/InventoryBar';
import { Product, stockPercent } from '../../types/models';
import {
  confirmPurchase,
  getProduct,
} from '../../services/productService';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/colors';

type Route = RouteProp<
  {
    LogPurchase: { householdId: string; productId: string };
  },
  'LogPurchase'
>;

function parseNumber(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function LogPurchaseScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { householdId, productId } = route.params;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [priceText, setPriceText] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [purchasedAt, setPurchasedAt] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProduct(householdId, productId)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setError('Product not found');
        } else {
          setProduct(p);
          setPriceText(p.lastPurchasePrice ? String(p.lastPurchasePrice) : '');
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e as { message?: string };
        setError(err.message ?? String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, productId]);

  const previewProduct = useMemo<Product | null>(() => {
    if (!product) return null;
    const qty = Math.max(0, parseNumber(quantityText, 0));
    return {
      ...product,
      currentQuantity: product.currentQuantity + qty * product.containerSize,
    };
  }, [product, quantityText]);

  const onChangeDate = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && selected) setPurchasedAt(selected);
  };

  const handleConfirm = async () => {
    if (!product || !user || submitting) return;
    const price = parseNumber(priceText, 0);
    if (price < 0) {
      setError('Price must be 0 or greater.');
      return;
    }
    const qty = parseNumber(quantityText, 0);
    if (qty <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await confirmPurchase(
        householdId,
        productId,
        price,
        qty,
        user.uid,
        purchasedAt
      );
      navigation.goBack();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error && !product) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!product || !previewProduct) return null;

  const newPercent = stockPercent(previewProduct);

  return (
    <ScreenWrapper contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.heading}>Log Purchase</Text>
      <Text style={styles.productName}>{product.name}</Text>

      <Text style={styles.label}>Price paid ($)</Text>
      <TextInput
        style={styles.input}
        placeholder="24.99"
        placeholderTextColor={Colors.textLight}
        value={priceText}
        onChangeText={setPriceText}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Quantity purchased (containers)</Text>
      <TextInput
        style={styles.input}
        value={quantityText}
        onChangeText={setQuantityText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Date</Text>
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.dateButtonText}>
          {format(purchasedAt, 'MMMM d, yyyy')}
        </Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={purchasedAt}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onChangeDate}
        />
      )}

      <Text style={styles.sectionHeader}>Stock preview</Text>
      <View style={styles.previewRow}>
        <View style={styles.previewCol}>
          <Text style={styles.previewLabel}>Before</Text>
          <View style={styles.previewBefore}>
            <InventoryBar product={product} showLabel={false} />
          </View>
          <Text style={styles.previewSubLabel}>{stockPercent(product)}%</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.previewCol}>
          <Text style={styles.previewLabel}>After</Text>
          <InventoryBar product={previewProduct} showLabel={false} />
          <Text style={styles.previewSubLabel}>{newPercent}%</Text>
        </View>
      </View>
      <Text style={styles.previewSummary}>
        New level: {newPercent}% · {previewProduct.currentQuantity}{' '}
        {previewProduct.containerUnit} on hand
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleConfirm}
        disabled={submitting}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color={Colors.textOnDark} />
        ) : (
          <Text style={styles.buttonText}>Confirm Purchase</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerSpacer: {
    flex: 1,
  },
  cancel: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  productName: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
  },
  dateButton: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.screenBackground,
    justifyContent: 'center',
  },
  dateButtonText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewCol: {
    flex: 1,
  },
  previewLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  previewSubLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  previewBefore: {
    opacity: 0.5,
  },
  arrow: {
    fontSize: 20,
    color: Colors.textLight,
    marginHorizontal: 4,
  },
  previewSummary: {
    fontSize: 14,
    color: Colors.urgencyGreen,
    fontWeight: '600',
    marginTop: 12,
  },
  button: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: Colors.error,
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
});
