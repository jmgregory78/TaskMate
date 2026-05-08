import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
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
import { AutoDepletionUnit, DepletionMode, ThresholdType } from '../../types/models';
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
  const [containerUnit, setContainerUnit] = useState('');
  const [currentQty, setCurrentQty] = useState('');
  const [thresholdType, setThresholdType] = useState<ThresholdType>('quantity');
  const [thresholdValue, setThresholdValue] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Depletion mode state
  const [depletionMode, setDepletionMode] = useState<DepletionMode>('task');
  const [autoDepletionRate, setAutoDepletionRate] = useState('1');
  const [autoDepletionUnit, setAutoDepletionUnit] = useState<AutoDepletionUnit>('day');

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!user || !householdId || !canSubmit) return;
    setError(null);

    if (containerUnit.trim().length === 0) {
      setError('Unit is required — e.g. filters, doses, bags.');
      return;
    }
    const qty = parseNumber(currentQty, 1);
    if (qty <= 0) {
      setError('Current quantity must be greater than 0.');
      return;
    }
    const thresholdValueN = Math.max(0, parseNumber(thresholdValue, 1));

    // Validate threshold
    if (thresholdValueN < 0) {
      setError('Threshold cannot be negative');
      return;
    }
    if (thresholdType === 'quantity' && thresholdValueN > qty) {
      setError('Threshold cannot exceed your current quantity');
      return;
    }
    if (thresholdType === 'percentage' && thresholdValueN > 100) {
      setError('Threshold percentage cannot exceed 100%');
      return;
    }

    setSubmitting(true);
    try {
      await createProduct(householdId, user.displayName ?? user.email ?? user.uid, {
        householdId,
        name: trimmedName,
        amazonUrl: purchaseUrl.trim(),
        containerUnit: containerUnit.trim(),
        currentQuantity: qty,
        thresholdType,
        thresholdValue: thresholdValueN,
        depletionMode,
        autoDepletionRate: parseNumber(autoDepletionRate, 1),
        autoDepletionUnit,
      });
      navigation.goBack();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  // Calculate estimated duration for auto-depletion
  const calcDuration = (): string => {
    const qty = parseNumber(currentQty, 1);
    const rate = parseNumber(autoDepletionRate, 1);
    if (rate <= 0 || qty <= 0) return '';

    let daysPerUnit: number;
    switch (autoDepletionUnit) {
      case 'day':
        daysPerUnit = 1;
        break;
      case 'week':
        daysPerUnit = 7;
        break;
      case 'month':
        daysPerUnit = 30;
        break;
    }
    const totalDays = Math.floor((qty / rate) * daysPerUnit);

    if (totalDays >= 365) {
      const years = Math.floor(totalDays / 365);
      const months = Math.floor((totalDays % 365) / 30);
      return months > 0
        ? `${years} year${years === 1 ? '' : 's'} ${months} month${months === 1 ? '' : 's'}`
        : `${years} year${years === 1 ? '' : 's'}`;
    }
    if (totalDays >= 30) {
      const months = Math.floor(totalDays / 30);
      return `${months} month${months === 1 ? '' : 's'}`;
    }
    if (totalDays >= 7) {
      const weeks = Math.floor(totalDays / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'}`;
    }
    return `${totalDays} day${totalDays === 1 ? '' : 's'}`;
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
          placeholder="e.g. 60"
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
                const maxQty = parseNumber(currentQty, 0);
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
                const maxQty = parseNumber(currentQty, 0);
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
            {parseNumber(currentQty, 0) === 1 && parseNumber(thresholdValue, 0) === 1 ? (
              <Text style={styles.thresholdHelper}>
                You'll be alerted when you're on your last one
              </Text>
            ) : parseNumber(currentQty, 0) === 0 ? (
              <Text style={styles.thresholdHelper}>
                You'll be alerted when you run out
              </Text>
            ) : null}
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
            {calcDuration() ? (
              <Text style={styles.durationHint}>
                At this rate, your {parseNumber(currentQty, 1)} {containerUnit || 'units'} will last {calcDuration()}
              </Text>
            ) : null}
          </View>
        ) : null}

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

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>Cancel</Text>
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
    flexWrap: 'wrap',
    gap: 8,
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
    gap: 6,
  },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  unitChipTextActive: {
    color: '#FFFFFF',
  },
  durationHint: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    fontStyle: 'italic',
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
  cancelButton: {
    alignItems: 'center',
    padding: 16,
    marginBottom: 16,
  },
  cancelText: {
    color: '#6B7280',
    fontSize: 16,
  },
});
