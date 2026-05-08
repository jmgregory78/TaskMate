import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
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
import { AutoDepletionUnit, DepletionMode, Product, ThresholdType } from '../../types/models';
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
  const [containerUnit, setContainerUnit] = useState(product.containerUnit);
  const [currentQty, setCurrentQty] = useState(String(product.currentQuantity));
  const [thresholdType, setThresholdType] = useState<ThresholdType>(
    product.thresholdType ?? (product.lowThresholdQty !== null ? 'quantity' : 'percentage')
  );
  const [thresholdValue, setThresholdValue] = useState(
    String(product.thresholdValue ?? (product.lowThresholdQty ?? product.lowThresholdPercent ?? 1))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Depletion mode state
  const [depletionMode, setDepletionMode] = useState<DepletionMode>(
    product.depletionMode ?? 'task'
  );
  const [autoDepletionRate, setAutoDepletionRate] = useState(
    String(product.autoDepletionRate ?? 1)
  );
  const [autoDepletionUnit, setAutoDepletionUnit] = useState<AutoDepletionUnit>(
    product.autoDepletionUnit ?? 'day'
  );

  const trimmedName = name.trim();

  const changedFields = useMemo<Partial<Product> | null>(() => {
    if (trimmedName.length === 0) return null;
    const qtyN = parseNumber(currentQty, 1);
    if (qtyN <= 0) return null;
    const thresholdValueN = Math.max(0, parseNumber(thresholdValue, 1));
    const rateN = Math.max(1, parseNumber(autoDepletionRate, 1));

    const changes: Partial<Product> = {};
    if (trimmedName !== product.name) changes.name = trimmedName;
    if (purchaseUrl.trim() !== product.amazonUrl)
      changes.amazonUrl = purchaseUrl.trim();
    if (containerUnit.trim() !== product.containerUnit)
      changes.containerUnit = containerUnit.trim();
    if (qtyN !== product.currentQuantity) changes.currentQuantity = qtyN;
    // New threshold fields
    if (thresholdType !== product.thresholdType)
      changes.thresholdType = thresholdType;
    if (thresholdValueN !== product.thresholdValue)
      changes.thresholdValue = thresholdValueN;
    // Update legacy fields for compatibility
    if (thresholdType === 'percentage') {
      changes.lowThresholdPercent = thresholdValueN;
      changes.lowThresholdQty = null;
    } else {
      changes.lowThresholdPercent = 25;
      changes.lowThresholdQty = thresholdValueN;
    }
    // Depletion mode changes
    if (depletionMode !== (product.depletionMode ?? 'task'))
      changes.depletionMode = depletionMode;
    if (rateN !== (product.autoDepletionRate ?? 1))
      changes.autoDepletionRate = rateN;
    if (autoDepletionUnit !== (product.autoDepletionUnit ?? 'day'))
      changes.autoDepletionUnit = autoDepletionUnit;

    return Object.keys(changes).length > 0 ? changes : null;
  }, [
    trimmedName,
    purchaseUrl,
    containerUnit,
    currentQty,
    thresholdType,
    thresholdValue,
    depletionMode,
    autoDepletionRate,
    autoDepletionUnit,
    product,
  ]);

  const canSave = changedFields !== null && !submitting;

  const handleSave = async () => {
    if (!householdId || !canSave || !changedFields) return;
    setError(null);

    // Validate threshold
    const qtyN = parseNumber(currentQty, 1);
    const thresholdValueN = parseNumber(thresholdValue, 1);
    const effectiveThreshold = thresholdType === 'quantity'
      ? thresholdValueN
      : (thresholdValueN / 100) * qtyN;

    if (effectiveThreshold <= 0) {
      setError('Reorder threshold must be at least 1');
      return;
    }
    if (effectiveThreshold >= qtyN) {
      setError('Reorder threshold must be less than your current quantity');
      return;
    }

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
      <StatusBar barStyle="dark-content" />
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

        <Text style={styles.label}>Online Purchase Link (optional)</Text>
        <TextInput
          style={styles.input}
          value={purchaseUrl}
          onChangeText={setPurchaseUrl}
          placeholder="Paste a link e.g. Amazon, Chewy, Walmart"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.label}>Current quantity on hand</Text>
        <TextInput
          style={styles.input}
          value={currentQty}
          onChangeText={setCurrentQty}
          keyboardType="decimal-pad"
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

        <Text style={styles.label}>Alert me when stock is low</Text>

        {/* Threshold toggle cards */}
        <View style={styles.thresholdCardRow}>
          {/* Card 1: By Quantity */}
          <TouchableOpacity
            style={[
              styles.thresholdCard,
              thresholdType === 'quantity' && styles.thresholdCardActive,
            ]}
            onPress={() => {
              if (thresholdType === 'percentage') {
                // Convert percentage to quantity
                const maxQty = parseNumber(currentQty, product.currentQuantity);
                if (maxQty > 0) {
                  const qty = Math.round((parseNumber(thresholdValue, 25) / 100) * maxQty);
                  setThresholdValue(String(Math.max(1, qty)));
                } else {
                  setThresholdValue('1');
                }
              } else if (thresholdValue === '' || parseNumber(thresholdValue, 0) === 0) {
                setThresholdValue('1');
              }
              setThresholdType('quantity');
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.thresholdCardLabel,
              thresholdType === 'quantity' && styles.thresholdCardLabelActive,
            ]}>
              By Quantity
            </Text>
          </TouchableOpacity>

          {/* Card 2: By Percentage */}
          <TouchableOpacity
            style={[
              styles.thresholdCard,
              thresholdType === 'percentage' && styles.thresholdCardActive,
            ]}
            onPress={() => {
              if (thresholdType === 'quantity') {
                // Convert quantity to percentage
                const maxQty = parseNumber(currentQty, product.currentQuantity);
                if (maxQty > 0) {
                  const pct = Math.round((parseNumber(thresholdValue, 1) / maxQty) * 100);
                  setThresholdValue(String(Math.min(99, Math.max(1, pct))));
                } else {
                  setThresholdValue('25');
                }
              } else if (thresholdValue === '' || parseNumber(thresholdValue, 0) === 0) {
                setThresholdValue('25');
              }
              setThresholdType('percentage');
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.thresholdCardLabel,
              thresholdType === 'percentage' && styles.thresholdCardLabelActive,
            ]}>
              By Percentage
            </Text>
          </TouchableOpacity>
        </View>

        {/* Threshold input based on selected type */}
        {thresholdType === 'quantity' ? (
          <View style={styles.thresholdInputSection}>
            <Text style={styles.thresholdDescription}>When I reach</Text>
            <View style={styles.thresholdInputRow}>
              <TextInput
                style={styles.thresholdInput}
                value={thresholdValue}
                onChangeText={(v) => setThresholdValue(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <Text style={styles.thresholdUnit}>
                {containerUnit.trim() || 'units'} remaining
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.thresholdInputSection}>
            <Text style={styles.thresholdDescription}>When I'm below</Text>
            <View style={styles.thresholdInputRow}>
              <TextInput
                style={styles.thresholdInput}
                value={thresholdValue}
                onChangeText={(v) => {
                  const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
                  const clamped = Math.min(100, Number.isFinite(num) ? num : 0);
                  setThresholdValue(String(clamped));
                }}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <Text style={styles.thresholdUnit}>% of my supply</Text>
            </View>
            {parseNumber(currentQty, 0) > 0 ? (
              <Text style={styles.thresholdHelper}>
                That's about{' '}
                {Math.round((parseNumber(thresholdValue, 25) / 100) * parseNumber(currentQty, 1))}{' '}
                {containerUnit.trim() || 'units'} remaining
              </Text>
            ) : null}
          </View>
        )}

        <Text style={[styles.label, { marginTop: 24 }]}>How does this supply get used?</Text>
        <View style={styles.modeCardRow}>
          <TouchableOpacity
            style={[
              styles.modeCard,
              depletionMode === 'task' && styles.modeCardActive,
            ]}
            onPress={() => setDepletionMode('task')}
            activeOpacity={0.7}
          >
            <Text style={styles.modeIcon}>✅</Text>
            <Text style={[
              styles.modeTitle,
              depletionMode === 'task' && styles.modeTitleActive,
            ]}>
              When I complete a task
            </Text>
            <Text style={styles.modeDesc}>
              Supply decreases each time you mark a linked task as done
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeCard,
              depletionMode === 'auto' && styles.modeCardActive,
            ]}
            onPress={() => setDepletionMode('auto')}
            activeOpacity={0.7}
          >
            <Text style={styles.modeIcon}>⏱️</Text>
            <Text style={[
              styles.modeTitle,
              depletionMode === 'auto' && styles.modeTitleActive,
            ]}>
              Automatically over time
            </Text>
            <Text style={styles.modeDesc}>
              Supply decreases on a set schedule without needing a task
            </Text>
          </TouchableOpacity>
        </View>

        {depletionMode === 'auto' ? (
          <View style={styles.autoSection}>
            <View style={styles.autoRateRow}>
              <Text style={styles.autoLabel}>I use</Text>
              <TextInput
                style={styles.autoRateInput}
                value={autoDepletionRate}
                onChangeText={setAutoDepletionRate}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={Colors.textLight}
              />
              <Text style={styles.autoLabel}>every</Text>
            </View>
            <View style={styles.unitChipRow}>
              {(['day', 'week', 'month'] as AutoDepletionUnit[]).map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.unitChip,
                    autoDepletionUnit === unit && styles.unitChipActive,
                  ]}
                  onPress={() => setAutoDepletionUnit(unit)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.unitChipText,
                      autoDepletionUnit === unit && styles.unitChipTextActive,
                    ]}
                  >
                    {unit.charAt(0).toUpperCase() + unit.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

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
  modeCardRow: {
    gap: 10,
    marginTop: 8,
  },
  modeCard: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: Colors.cardBackground,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modeTitleActive: {
    color: Colors.primary,
  },
  modeDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  autoSection: {
    marginTop: 16,
    padding: 14,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
  },
  autoRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  autoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  autoRateInput: {
    width: 50,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: Colors.cardBackground,
    color: Colors.textPrimary,
  },
  unitChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  unitChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  unitChipTextActive: {
    color: '#FFFFFF',
  },
  thresholdCardRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  thresholdCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
  },
  thresholdCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  thresholdCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  thresholdCardLabelActive: {
    color: Colors.primary,
  },
  thresholdInputSection: {
    marginTop: 12,
    padding: 14,
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thresholdDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  thresholdInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thresholdInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: Colors.cardBackground,
    color: Colors.textPrimary,
  },
  thresholdUnit: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  thresholdHelper: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
