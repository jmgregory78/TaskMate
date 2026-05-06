import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAppStore } from '../../stores/appStore';
import {
  deleteProduct,
  updateProduct,
} from '../../services/productService';
import { Product } from '../../types/models';
import { Colors } from '../../constants/colors';

type Route = RouteProp<{ EditProduct: { product: Product } }, 'EditProduct'>;

function parseNumber(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function EditProductScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { product } = route.params;
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const [name, setName] = useState(product.name);
  const [purchaseUrl, setPurchaseUrl] = useState(product.amazonUrl);
  const [containerSize, setContainerSize] = useState(
    String(product.containerSize)
  );
  const [containerUnit, setContainerUnit] = useState(product.containerUnit);
  const [currentQty, setCurrentQty] = useState(String(product.currentQuantity));
  const [lowThreshold, setLowThreshold] = useState(
    String(product.lowThresholdPercent)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();

  const changedFields = useMemo<Partial<Product> | null>(() => {
    if (trimmedName.length === 0) return null;
    const sizeN = parseNumber(containerSize, 0);
    if (sizeN <= 0) return null;
    const qtyN = parseNumber(currentQty, sizeN);
    const thresholdN = Math.min(
      100,
      Math.max(0, parseNumber(lowThreshold, 25))
    );

    const changes: Partial<Product> = {};
    if (trimmedName !== product.name) changes.name = trimmedName;
    if (purchaseUrl.trim() !== product.amazonUrl)
      changes.amazonUrl = purchaseUrl.trim();
    if (sizeN !== product.containerSize) changes.containerSize = sizeN;
    if (containerUnit.trim() !== product.containerUnit)
      changes.containerUnit = containerUnit.trim();
    if (qtyN !== product.currentQuantity) changes.currentQuantity = qtyN;
    if (thresholdN !== product.lowThresholdPercent)
      changes.lowThresholdPercent = thresholdN;
    return Object.keys(changes).length > 0 ? changes : null;
  }, [
    trimmedName,
    purchaseUrl,
    containerSize,
    containerUnit,
    currentQty,
    lowThreshold,
    product,
  ]);

  const canSave = changedFields !== null && !submitting;

  const handleSave = async () => {
    if (!householdId || !canSave || !changedFields) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateProduct(householdId, product.id, changedFields);
      navigation.goBack();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!householdId) return;
    Alert.alert(
      `Delete ${product.name}?`,
      'This will remove it from all tasks that use it and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(householdId, product.id);
              navigation.popToTop();
              navigation.navigate('Main', { screen: 'Supplies' });
            } catch (e) {
              const err = e as { message?: string };
              Alert.alert(
                'Delete failed',
                err.message ?? 'Unable to delete supply'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenWrapper contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Edit Supply</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Product name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Product name"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Where to buy (link)</Text>
        <TextInput
          style={styles.input}
          value={purchaseUrl}
          onChangeText={setPurchaseUrl}
          placeholder="https://..."
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.label}>How many come in a full pack/container?</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.sizeInput]}
            value={containerSize}
            onChangeText={setContainerSize}
            keyboardType="decimal-pad"
            placeholder="4"
            placeholderTextColor={Colors.textLight}
          />
          <TextInput
            style={[styles.input, styles.unitInput]}
            value={containerUnit}
            onChangeText={setContainerUnit}
            placeholder="filters"
            placeholderTextColor={Colors.textLight}
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.label}>Current quantity on hand</Text>
        <TextInput
          style={styles.input}
          value={currentQty}
          onChangeText={setCurrentQty}
          keyboardType="decimal-pad"
          placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.label}>Low stock threshold (%)</Text>
        <TextInput
          style={styles.input}
          value={lowThreshold}
          onChangeText={setLowThreshold}
          keyboardType="number-pad"
          placeholderTextColor={Colors.textLight}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, !canSave && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textOnDark} />
          ) : (
            <Text style={styles.buttonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.deleteLink}
        onPress={handleDelete}
        activeOpacity={0.7}
      >
        <Text style={styles.deleteLinkText}>Delete Supply</Text>
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 56,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  backLink: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  saveLink: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  saveLinkDisabled: {
    color: Colors.textLight,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  sizeInput: {
    flex: 2,
  },
  unitInput: {
    flex: 1,
  },
  button: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: Colors.error,
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  deleteLink: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  deleteLinkText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
});
