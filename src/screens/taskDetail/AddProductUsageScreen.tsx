import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import ScreenWrapper from '../../components/ScreenWrapper';
import InventoryBar from '../../components/InventoryBar';
import { useAuth } from '../../hooks/useAuth';
import {
  addProductUsageToTask,
  createProduct,
  getProducts,
  getProductUsagesForTask,
} from '../../services/productService';
import { Product, TaskProductUsage } from '../../types/models';
import { Colors } from '../../constants/colors';

type Route = RouteProp<
  { AddProductUsage: { householdId: string; taskId: string } },
  'AddProductUsage'
>;

type Mode = 'search' | 'edit-existing' | 'create-new';

function parseNumber(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function AddProductUsageScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { householdId, taskId } = route.params;

  const [mode, setMode] = useState<Mode>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [existingUsages, setExistingUsages] = useState<TaskProductUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [usageAmount, setUsageAmount] = useState('1');

  const [newName, setNewName] = useState('');
  const [newAmazonUrl, setNewAmazonUrl] = useState('');
  const [newContainerSize, setNewContainerSize] = useState('1');
  const [newContainerUnit, setNewContainerUnit] = useState('');
  const [newCurrentQty, setNewCurrentQty] = useState('');
  const [newLowThreshold, setNewLowThreshold] = useState('25');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getProducts(householdId),
      getProductUsagesForTask(householdId, taskId),
    ])
      .then(([products, usages]) => {
        if (cancelled) return;
        setAllProducts(products);
        setExistingUsages(usages);
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
  }, [householdId, taskId]);

  const linkedProductIds = useMemo(
    () => new Set(existingUsages.map((u) => u.productId)),
    [existingUsages]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [allProducts, searchQuery]);

  const goBackToSearch = () => {
    setMode('search');
    setSelectedProduct(null);
    setError(null);
  };

  const handleSelectProduct = (p: Product) => {
    if (linkedProductIds.has(p.id)) {
      setError(
        'This supply is already linked to this task. Edit the usage amount instead.'
      );
      return;
    }
    setSelectedProduct(p);
    setUsageAmount('1');
    setMode('edit-existing');
    setError(null);
  };

  const handleStartCreate = () => {
    setNewName(searchQuery.trim());
    setMode('create-new');
    setError(null);
  };

  const handleSaveExisting = async () => {
    if (!selectedProduct || submitting) return;
    const amount = parseNumber(usageAmount, 0);
    if (amount <= 0) {
      setError('Usage amount must be greater than 0.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await addProductUsageToTask(
        householdId,
        taskId,
        selectedProduct.id,
        selectedProduct.name,
        amount,
        selectedProduct.containerUnit
      );
      navigation.goBack();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  const handleSaveNew = async () => {
    if (!user || submitting) return;
    const trimmedName = newName.trim();
    const trimmedUrl = newAmazonUrl.trim();
    if (trimmedName.length === 0) {
      setError('Product name is required.');
      return;
    }
    const containerSizeN = parseNumber(newContainerSize, 0);
    if (containerSizeN <= 0) {
      setError('Container size must be greater than 0.');
      return;
    }
    const usageN = parseNumber(usageAmount, 0);
    if (usageN <= 0) {
      setError('Usage amount must be greater than 0.');
      return;
    }
    const currentQty =
      newCurrentQty.trim().length > 0
        ? parseNumber(newCurrentQty, containerSizeN)
        : containerSizeN;
    const unit = newContainerUnit.trim();

    setError(null);
    setSubmitting(true);
    try {
      const productId = await createProduct(householdId, user.uid, {
        householdId,
        name: trimmedName,
        amazonUrl: trimmedUrl,
        containerSize: containerSizeN,
        containerUnit: unit,
        currentQuantity: currentQty,
        lowThresholdPercent: parseNumber(newLowThreshold, 25),
      });
      await addProductUsageToTask(
        householdId,
        taskId,
        productId,
        trimmedName,
        usageN,
        unit
      );
      navigation.goBack();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  const renderHeader = (title: string) => (
    <View style={styles.headerRow}>
      <TouchableOpacity
        onPress={() =>
          mode === 'search' ? navigation.goBack() : goBackToSearch()
        }
        activeOpacity={0.7}
      >
        <Text style={styles.cancel}>
          {mode === 'search' ? 'Cancel' : 'Back'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.heading}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (mode === 'edit-existing' && selectedProduct) {
    return (
      <ScreenWrapper contentContainerStyle={styles.content}>
        {renderHeader('Add to Task')}

        <View style={styles.productPreview}>
          <Text style={styles.productPreviewName}>{selectedProduct.name}</Text>
          <View style={styles.barWrap}>
            <InventoryBar product={selectedProduct} />
          </View>
        </View>

        <Text style={styles.label}>How much does this task use per completion?</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={usageAmount}
            onChangeText={setUsageAmount}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.unitText}>{selectedProduct.containerUnit}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSaveExisting}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textOnDark} />
          ) : (
            <Text style={styles.buttonText}>Add to Task</Text>
          )}
        </TouchableOpacity>
      </ScreenWrapper>
    );
  }

  if (mode === 'create-new') {
    return (
      <ScreenWrapper contentContainerStyle={styles.content}>
        {renderHeader('New Supply')}

        <Text style={styles.label}>Product name</Text>
        <TextInput
          style={styles.input}
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Pleatco Hot Tub Filter"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Where to buy (link)</Text>
        <TextInput
          style={styles.input}
          value={newAmazonUrl}
          onChangeText={setNewAmazonUrl}
          placeholder="https://amazon.com/dp/..."
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.row}>
          <View style={styles.halfCol}>
            <Text style={styles.label}>Container size</Text>
            <TextInput
              style={styles.input}
              value={newContainerSize}
              onChangeText={setNewContainerSize}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={Colors.textLight}
            />
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.label}>Unit</Text>
            <TextInput
              style={styles.input}
              value={newContainerUnit}
              onChangeText={setNewContainerUnit}
              placeholder="oz, filters, qt"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
            />
          </View>
        </View>

        <Text style={styles.label}>
          Current quantity on hand (defaults to full)
        </Text>
        <TextInput
          style={styles.input}
          value={newCurrentQty}
          onChangeText={setNewCurrentQty}
          keyboardType="decimal-pad"
          placeholder={`Defaults to ${newContainerSize || '0'}`}
          placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.label}>Low stock threshold (%)</Text>
        <TextInput
          style={styles.input}
          value={newLowThreshold}
          onChangeText={setNewLowThreshold}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Usage for this task per completion</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={usageAmount}
            onChangeText={setUsageAmount}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.unitText}>
            {newContainerUnit.trim() || 'unit'}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSaveNew}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textOnDark} />
          ) : (
            <Text style={styles.buttonText}>Save & Add to Task</Text>
          )}
        </TouchableOpacity>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper contentContainerStyle={styles.content}>
      {renderHeader('Add Supply')}

      <TextInput
        style={styles.input}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search your supplies..."
        placeholderTextColor={Colors.textLight}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.resultsList}>
          {filtered.length === 0 ? (
            <Text style={styles.emptyResults}>
              {allProducts.length === 0
                ? 'No supplies yet — create your first one below.'
                : 'No supplies match your search.'}
            </Text>
          ) : (
            filtered.map((p) => {
              const alreadyLinked = linkedProductIds.has(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.resultRow,
                    alreadyLinked && styles.resultRowLinked,
                  ]}
                  onPress={() => handleSelectProduct(p)}
                  activeOpacity={0.7}
                >
                  <View style={styles.resultNameRow}>
                    <Text style={styles.resultName}>{p.name}</Text>
                    {alreadyLinked ? (
                      <Text style={styles.linkedBadge}>Already linked</Text>
                    ) : null}
                  </View>
                  <View style={styles.resultBar}>
                    <InventoryBar product={p} compact />
                  </View>
                  <Text style={styles.resultMeta}>
                    {p.currentQuantity} {p.containerUnit} on hand
                  </Text>
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity
            style={styles.createRow}
            onPress={handleStartCreate}
            activeOpacity={0.7}
          >
            <Text style={styles.createRowText}>➕ Create new supply</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 56,
  },
  cancel: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    width: 56,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
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
    alignItems: 'center',
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  amountInput: {
    flex: 1,
  },
  unitText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  resultsList: {
    marginTop: 16,
  },
  emptyResults: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  resultRow: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 8,
  },
  resultRowLinked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  resultNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  linkedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  resultBar: {
    marginTop: 8,
  },
  resultMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  createRow: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  createRowText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  productPreview: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  productPreviewName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  barWrap: {
    marginTop: 4,
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
    fontWeight: '600',
  },
  error: {
    color: Colors.error,
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
  },
});
