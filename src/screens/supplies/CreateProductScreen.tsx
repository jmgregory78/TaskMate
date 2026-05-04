import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '../../components/ScreenWrapper';
import ScreenHeader from '../../components/ScreenHeader';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import { createProduct } from '../../services/productService';
import { Colors } from '../../constants/colors';

function parseNumber(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function CreateProductScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const [name, setName] = useState('');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [containerSize, setContainerSize] = useState('1');
  const [containerUnit, setContainerUnit] = useState('');
  const [currentQty, setCurrentQty] = useState('');
  const [lowThreshold, setLowThreshold] = useState('25');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!user || !householdId || !canSubmit) return;
    setError(null);

    const containerSizeN = parseNumber(containerSize, 0);
    if (containerSizeN <= 0) {
      setError('Quantity when full must be greater than 0.');
      return;
    }
    if (containerUnit.trim().length === 0) {
      setError('Unit is required — e.g. filters, doses, bags.');
      return;
    }
    const qty =
      currentQty.trim().length > 0
        ? parseNumber(currentQty, containerSizeN)
        : containerSizeN;
    const threshold = Math.min(100, Math.max(0, parseNumber(lowThreshold, 25)));

    setSubmitting(true);
    try {
      await createProduct(householdId, user.displayName ?? user.email ?? user.uid, {
        householdId,
        name: trimmedName,
        amazonUrl: purchaseUrl.trim(),
        containerSize: containerSizeN,
        containerUnit: containerUnit.trim(),
        currentQuantity: qty,
        lowThresholdPercent: threshold,
      });
      navigation.goBack();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  return (
    <>
      <ScreenHeader
        title="New Supply"
        leftLabel="Supplies"
        rightContent={<View style={{ width: 80 }} />}
      />
      <ScreenWrapper contentContainerStyle={styles.content}>
        <View style={styles.card}>
        <Text style={styles.label}>Product name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Pleatco Hot Tub Filter"
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
        <Text style={styles.hint}>
          Paste an Amazon, Home Depot, or any store link
        </Text>

        <Text style={styles.label}>Quantity when full</Text>
        <Text style={styles.hint}>How many do you have when fully stocked?</Text>
        <TextInput
          style={styles.input}
          value={containerSize}
          onChangeText={setContainerSize}
          keyboardType="decimal-pad"
          placeholder="60"
          placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.label}>Unit (e.g. filters, doses, bags)</Text>
        <TextInput
          style={styles.input}
          value={containerUnit}
          onChangeText={setContainerUnit}
          placeholder="filters"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Current quantity on hand</Text>
        <TextInput
          style={styles.input}
          value={currentQty}
          onChangeText={setCurrentQty}
          keyboardType="decimal-pad"
          placeholder={`Defaults to ${containerSize || '0'}`}
          placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.label}>Low stock threshold (%)</Text>
        <TextInput
          style={styles.input}
          value={lowThreshold}
          onChangeText={setLowThreshold}
          keyboardType="number-pad"
          placeholder="25"
          placeholderTextColor={Colors.textLight}
        />
        <Text style={styles.hint}>Alert me when stock drops below X%</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textOnDark} />
          ) : (
            <Text style={styles.buttonText}>Save Supply</Text>
          )}
        </TouchableOpacity>
        </View>
      </ScreenWrapper>
    </>
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
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
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
});
