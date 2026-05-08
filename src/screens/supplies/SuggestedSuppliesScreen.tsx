import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import { createProduct, getProducts } from '../../services/productService';
import { AutoDepletionUnit, DepletionMode, ThresholdType } from '../../types/models';
import {
  WIZARD_CATEGORIES,
  WizardCategory,
  WizardCategoryId,
  SuggestedSupply,
  getSuggestedSuppliesFor,
  getSuggestedSupplyById,
} from '../../data/suggested';
import { Colors } from '../../constants/colors';

type SuggestedSuppliesRoute = RouteProp<
  {
    SuggestedSupplies: {
      filterSupplyIds?: string[];
      expandCategoryIds?: string[];
      preCheckSupplyIds?: string[];
      fromTaskCategory?: string;
    };
  },
  'SuggestedSupplies'
>;

interface SupplyGroup {
  category: WizardCategory;
  items: SuggestedSupply[];
}

interface SupplyDraft {
  name: string;
  qty: number;
  unit: string;
  amazonUrl: string;
  thresholdType: ThresholdType;
  thresholdValue: number;
  depletionMode: DepletionMode;
  autoDepletionRate: number;
  autoDepletionUnit: AutoDepletionUnit;
}

// Smart defaults for threshold based on supply type
function getSmartThresholdDefaults(supplyId: string, supplyName: string): { type: ThresholdType; value: number } {
  const id = supplyId.toLowerCase();
  const name = supplyName.toLowerCase();

  // Percentage defaults (25%)
  if (id.includes('fertilizer') || name.includes('fertilizer')) {
    return { type: 'percentage', value: 25 };
  }
  if (id.includes('pool-') || name.includes('pool ')) {
    return { type: 'percentage', value: 25 };
  }
  if (id.includes('hot-tub') || name.includes('hot tub')) {
    return { type: 'percentage', value: 25 };
  }

  // Quantity defaults with specific values
  if (id.includes('prescription') || name.includes('prescription')) {
    return { type: 'quantity', value: 7 };
  }
  if (id.includes('vitamins') || name.includes('vitamin')) {
    return { type: 'quantity', value: 7 };
  }
  if (id.includes('contacts') || name.includes('contact lens')) {
    return { type: 'quantity', value: 7 };
  }
  if (id.includes('smoke-batteries') || name.includes('smoke detector')) {
    return { type: 'quantity', value: 2 };
  }

  // Default: quantity with value 1
  return { type: 'quantity', value: 1 };
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export default function SuggestedSuppliesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<SuggestedSuppliesRoute>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Extract route params for pre-filtering
  const filterSupplyIds = route.params?.filterSupplyIds;
  const initialExpandCategoryIds = route.params?.expandCategoryIds;
  const initialPreCheckSupplyIds = route.params?.preCheckSupplyIds;
  const fromTaskCategory = route.params?.fromTaskCategory;
  const isFiltered = !!filterSupplyIds && filterSupplyIds.length > 0;

  const [loaded, setLoaded] = useState(false);
  const [existingSupplyNames, setExistingSupplyNames] = useState<Set<string>>(new Set());
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<WizardCategoryId>>(
    new Set(initialExpandCategoryIds as WizardCategoryId[] | undefined)
  );
  const [checkedSupplyIds, setCheckedSupplyIds] = useState<Set<string>>(
    new Set(initialPreCheckSupplyIds)
  );

  // Supply configuration queue state
  const [configIndex, setConfigIndex] = useState<number | null>(null);
  const [supplyQueue, setSupplyQueue] = useState<SuggestedSupply[]>([]);
  const [currentDraft, setCurrentDraft] = useState<SupplyDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedSupplyCount, setAddedSupplyCount] = useState(0);

  // Load existing supplies
  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      getProducts(householdId)
        .then((products) => {
          if (cancelled) return;
          setExistingSupplyNames(new Set(products.map((p) => normalize(p.name))));
          setLoaded(true);
        })
        .catch((e) => {
          console.warn('[SuggestedSuppliesScreen] getProducts failed:', e);
          setLoaded(true);
        });
      return () => {
        cancelled = true;
      };
    }, [householdId])
  );

  // Build supply groups (categories with remaining supplies)
  const supplyGroups: SupplyGroup[] = useMemo(() => {
    const groups: SupplyGroup[] = [];
    for (const cat of WIZARD_CATEGORIES) {
      let items = getSuggestedSuppliesFor(cat.id).filter(
        (s) => !existingSupplyNames.has(normalize(s.name))
      );
      // If filtering by specific supply IDs, only show those
      if (isFiltered && filterSupplyIds) {
        items = items.filter((s) => filterSupplyIds.includes(s.id));
      }
      if (items.length > 0) groups.push({ category: cat, items });
    }
    return groups;
  }, [existingSupplyNames, isFiltered, filterSupplyIds]);

  const totalAvailableSupplies = useMemo(
    () => supplyGroups.reduce((sum, g) => sum + g.items.length, 0),
    [supplyGroups]
  );

  const checkedSupplies = useMemo(
    () =>
      supplyGroups
        .flatMap((g) => g.items)
        .filter((s) => checkedSupplyIds.has(s.id)),
    [supplyGroups, checkedSupplyIds]
  );

  const allAlreadyAdded = loaded && totalAvailableSupplies === 0;

  // Handlers
  const toggleCategoryExpanded = (id: WizardCategoryId) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSupply = (id: string) => {
    setCheckedSupplyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startConfigureQueue = () => {
    if (checkedSupplies.length === 0) {
      navigation.goBack();
      return;
    }
    setSubmitError(null);
    setSupplyQueue(checkedSupplies);
    setConfigIndex(0);
    initDraftForSupply(checkedSupplies[0]);
  };

  const initDraftForSupply = (supply: SuggestedSupply) => {
    // Smart defaults for depletion mode based on supply name/id
    const supplyId = supply.id.toLowerCase();
    const supplyName = supply.name.toLowerCase();
    const autoSupplies = [
      'prescription', 'vitamins', 'contacts', 'contact lenses',
      'dishwasher-cleaner', 'washer-cleaner', 'softener-salt',
      'septic-tablets', 'lawn-fertilizer',
    ];
    const isAutoSupply = autoSupplies.some(
      (s) => supplyId.includes(s) || supplyName.includes(s.replace('-', ' '))
    );

    let depletionMode: DepletionMode = 'task';
    let autoUnit: AutoDepletionUnit = 'day';

    if (isAutoSupply) {
      depletionMode = 'auto';
      if (supplyId.includes('prescription') || supplyId.includes('vitamins') || supplyId.includes('contacts')) {
        autoUnit = 'day';
      } else if (supplyId.includes('dishwasher') || supplyId.includes('washer') ||
                 supplyId.includes('softener') || supplyId.includes('septic') ||
                 supplyId.includes('fertilizer')) {
        autoUnit = 'month';
      }
    }

    // Get smart threshold defaults
    const thresholdDefaults = getSmartThresholdDefaults(supply.id, supply.name);

    setCurrentDraft({
      name: supply.name,
      qty: supply.defaultQty,
      unit: supply.unit,
      amazonUrl: '',
      thresholdType: thresholdDefaults.type,
      thresholdValue: thresholdDefaults.value,
      depletionMode,
      autoDepletionRate: 1,
      autoDepletionUnit: autoUnit,
    });
  };

  const advanceConfigQueue = (nextIndex: number) => {
    if (nextIndex >= supplyQueue.length) {
      // Queue done - go back to supplies screen
      navigation.goBack();
    } else {
      setConfigIndex(nextIndex);
      initDraftForSupply(supplyQueue[nextIndex]);
    }
  };

  const handleConfigureSave = async () => {
    if (configIndex === null || !currentDraft) return;
    if (!user || !householdId) return;
    setSubmitting(true);
    setSubmitError(null);
    const userLabel = user.displayName ?? user.email ?? user.uid;
    try {
      await createProduct(householdId, userLabel, {
        householdId,
        name: currentDraft.name.trim(),
        amazonUrl: currentDraft.amazonUrl.trim(),
        containerUnit: currentDraft.unit.trim(),
        currentQuantity: currentDraft.qty,
        thresholdType: currentDraft.thresholdType,
        thresholdValue: currentDraft.thresholdValue,
        depletionMode: currentDraft.depletionMode,
        autoDepletionRate: currentDraft.autoDepletionRate,
        autoDepletionUnit: currentDraft.autoDepletionUnit,
      });
      // Update existing names to prevent duplicates if re-entering
      setExistingSupplyNames((prev) => {
        const next = new Set(prev);
        next.add(normalize(currentDraft.name));
        return next;
      });
      setAddedSupplyCount((c) => c + 1);
      setSubmitting(false);
      advanceConfigQueue(configIndex + 1);
    } catch (e) {
      const err = e as { message?: string };
      setSubmitError(err.message ?? String(e));
      setSubmitting(false);
    }
  };

  const handleConfigureSkip = () => {
    if (configIndex === null) return;
    setSubmitError(null);
    advanceConfigQueue(configIndex + 1);
  };

  const handleConfigureBack = () => {
    if (configIndex === null) return;
    setSubmitError(null);
    if (configIndex === 0) {
      // Return to accordion selection
      setConfigIndex(null);
      setSupplyQueue([]);
      setCurrentDraft(null);
    } else {
      const prevIndex = configIndex - 1;
      setConfigIndex(prevIndex);
      initDraftForSupply(supplyQueue[prevIndex]);
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  // Render
  const inConfigQueue = configIndex !== null && currentDraft !== null;

  if (!loaded) {
    return (
      <View style={styles.flex}>
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (allAlreadyAdded) {
    return (
      <View style={styles.flex}>
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <View style={styles.container}>
          <Header
            showBack={false}
            onBack={handleConfigureBack}
            showClose={true}
            onClose={handleClose}
          />
          <View style={[styles.center, styles.padded]}>
            <Text style={styles.bigEmoji}>🎉</Text>
            <Text style={styles.title}>You're all set!</Text>
            <Text style={styles.subtitle}>
              You've added all our suggestions! Check back after future app updates.
            </Text>
          </View>
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleClose}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Header
          showBack={inConfigQueue}
          onBack={handleConfigureBack}
          showClose={!inConfigQueue}
          onClose={handleClose}
        />
        {inConfigQueue && configIndex !== null ? (
          <ConfigureSupplySheet
            supply={supplyQueue[configIndex]}
            index={configIndex}
            total={supplyQueue.length}
            draft={currentDraft}
            onUpdateDraft={(patch) => setCurrentDraft((prev) => prev ? { ...prev, ...patch } : null)}
            onSave={handleConfigureSave}
            onSkip={handleConfigureSkip}
            submitting={submitting}
            error={submitError}
          />
        ) : (
          <SupplyAccordion
            groups={supplyGroups}
            expandedIds={expandedCategoryIds}
            checkedIds={checkedSupplyIds}
            onToggleExpand={toggleCategoryExpanded}
            onToggleSupply={toggleSupply}
            onAdd={startConfigureQueue}
            checkedCount={checkedSupplies.length}
            title={isFiltered && fromTaskCategory ? `Set up ${fromTaskCategory} supplies` : undefined}
            subtitle={isFiltered ? 'These supplies are used by the tasks you just added' : undefined}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// Header component
function Header({
  showBack,
  onBack,
  showClose,
  onClose,
}: {
  showBack: boolean;
  onBack: () => void;
  showClose: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSlot}>
        {showBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.headerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityLabel="Back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.headerTitle}>Suggested Supplies</Text>
      <View style={[styles.headerSlot, styles.headerSlotRight]}>
        {showClose ? (
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityLabel="Close"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// Supply Accordion component
function SupplyAccordion({
  groups,
  expandedIds,
  checkedIds,
  onToggleExpand,
  onToggleSupply,
  onAdd,
  checkedCount,
  title,
  subtitle,
}: {
  groups: SupplyGroup[];
  expandedIds: Set<WizardCategoryId>;
  checkedIds: Set<string>;
  onToggleExpand: (id: WizardCategoryId) => void;
  onToggleSupply: (id: string) => void;
  onAdd: () => void;
  checkedCount: number;
  title?: string;
  subtitle?: string;
}) {
  const selectedCountByCategory = (categoryId: WizardCategoryId): number => {
    const group = groups.find((g) => g.category.id === categoryId);
    if (!group) return 0;
    return group.items.filter((s) => checkedIds.has(s.id)).length;
  };

  return (
    <>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title ?? 'Browse Suggested Supplies'}</Text>
        <Text style={styles.subtitle}>{subtitle ?? 'Choose the supplies you want to track'}</Text>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {groups.map((g) => {
          const expanded = expandedIds.has(g.category.id);
          const selectedCount = selectedCountByCategory(g.category.id);
          return (
            <View key={g.category.id} style={styles.accordionCard}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => onToggleExpand(g.category.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryEmoji}>{g.category.emoji}</Text>
                <Text style={styles.accordionTitle}>{g.category.name}</Text>
                {selectedCount > 0 ? (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>
                      {selectedCount} selected
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.accordionChevron}>
                  {expanded ? '▾' : '▸'}
                </Text>
              </TouchableOpacity>
              {expanded ? (
                <View style={styles.accordionContent}>
                  {g.items.map((s) => {
                    const checked = checkedIds.has(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.itemRow, checked && styles.itemRowOn]}
                        onPress={() => onToggleSupply(s.id)}
                        activeOpacity={0.7}
                      >
                        <Checkbox checked={checked} />
                        {s.icon ? (
                          <Text style={styles.itemIcon}>{s.icon}</Text>
                        ) : null}
                        <View style={styles.flex}>
                          <Text style={styles.itemName}>{s.name}</Text>
                          <Text style={styles.itemMeta}>
                            Default: {s.defaultQty} {s.unit}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            checkedCount === 0 && styles.primaryButtonDisabled,
          ]}
          onPress={onAdd}
          activeOpacity={0.85}
          disabled={checkedCount === 0}
        >
          <Text style={styles.primaryButtonText}>
            {checkedCount === 0
              ? 'Select Supplies'
              : `Add ${checkedCount} ${checkedCount === 1 ? 'Supply' : 'Supplies'} →`}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// Checkbox component
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
    </View>
  );
}

// Configure Supply Sheet component
function ConfigureSupplySheet({
  supply,
  index,
  total,
  draft,
  onUpdateDraft,
  onSave,
  onSkip,
  submitting,
  error,
}: {
  supply: SuggestedSupply;
  index: number;
  total: number;
  draft: SupplyDraft;
  onUpdateDraft: (patch: Partial<SupplyDraft>) => void;
  onSave: () => void;
  onSkip: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const inc = () => onUpdateDraft({ qty: draft.qty + 1 });
  const dec = () => onUpdateDraft({ qty: Math.max(0, draft.qty - 1) });

  // Calculate what the percentage threshold means in quantity terms
  const pctAsQty = draft.thresholdType === 'percentage'
    ? Math.floor((draft.thresholdValue / 100) * draft.qty)
    : 0;

  // Calculate estimated duration
  const calcDuration = (): string => {
    if (draft.depletionMode !== 'auto') return '';
    if (draft.autoDepletionRate <= 0 || draft.qty <= 0) return '';

    let daysPerUnit: number;
    switch (draft.autoDepletionUnit) {
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
    const totalDays = Math.floor((draft.qty / draft.autoDepletionRate) * daysPerUnit);

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

  const canSubmit = draft.name.trim().length > 0;

  return (
    <>
      <View style={styles.titleBlock}>
        {total > 1 ? (
          <Text style={styles.queueCounter}>
            Supply {index + 1} of {total}
          </Text>
        ) : null}
        <View style={styles.nameCard}>
          {supply.icon ? (
            <Text style={styles.supplyHeadingIcon}>{supply.icon}</Text>
          ) : null}
          <TextInput
            style={styles.nameInput}
            value={draft.name}
            onChangeText={(name) => onUpdateDraft({ name })}
            placeholder="Enter supply name"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            maxLength={100}
            editable={!submitting}
          />
          <Text style={styles.pencilEmoji}>✏️</Text>
        </View>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Quantity */}
        <Text style={styles.fieldLabel}>
          How many do you have on hand?
        </Text>
        <View style={styles.qtyRow}>
          <TouchableOpacity
            onPress={dec}
            style={styles.stepperButton}
            activeOpacity={0.7}
            accessibilityLabel="Decrease quantity"
            disabled={submitting}
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.qtyInput}
            value={String(draft.qty)}
            onChangeText={(v) => {
              const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
              onUpdateDraft({ qty: Number.isFinite(num) ? num : 0 });
            }}
            keyboardType="number-pad"
            selectTextOnFocus
            editable={!submitting}
          />
          <TouchableOpacity
            onPress={inc}
            style={styles.stepperButton}
            activeOpacity={0.7}
            accessibilityLabel="Increase quantity"
            disabled={submitting}
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Unit */}
        <Text style={styles.fieldLabel}>
          Unit (e.g. filters, doses, bags)
        </Text>
        <TextInput
          style={styles.textInput}
          value={draft.unit}
          onChangeText={(unit) => onUpdateDraft({ unit })}
          placeholder={supply.unit}
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          editable={!submitting}
        />

        {/* Purchase URL */}
        <Text style={styles.fieldLabel}>
          Online Purchase Link (optional)
        </Text>
        <TextInput
          style={styles.textInput}
          value={draft.amazonUrl}
          onChangeText={(amazonUrl) => onUpdateDraft({ amazonUrl })}
          placeholder="Paste a link e.g. Amazon, Chewy, Walmart"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
        />

        {/* Reorder Alert Section */}
        <Text style={styles.sectionLabel}>Alert me when stock is low</Text>

        {/* Threshold toggle cards */}
        <View style={styles.thresholdCardRow}>
          {/* Card 1: By Quantity */}
          <TouchableOpacity
            style={[
              styles.thresholdCard,
              draft.thresholdType === 'quantity' && styles.thresholdCardActive,
            ]}
            onPress={() => {
              const newValue = draft.thresholdValue === 0 ? 1 : draft.thresholdValue;
              onUpdateDraft({ thresholdType: 'quantity', thresholdValue: newValue });
            }}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <Text style={[
              styles.thresholdCardLabel,
              draft.thresholdType === 'quantity' && styles.thresholdCardLabelActive,
            ]}>
              By Quantity
            </Text>
          </TouchableOpacity>

          {/* Card 2: By Percentage */}
          <TouchableOpacity
            style={[
              styles.thresholdCard,
              draft.thresholdType === 'percentage' && styles.thresholdCardActive,
            ]}
            onPress={() => {
              const newValue = draft.thresholdValue === 0 ? 25 : draft.thresholdValue;
              onUpdateDraft({ thresholdType: 'percentage', thresholdValue: newValue > 100 ? 25 : newValue });
            }}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <Text style={[
              styles.thresholdCardLabel,
              draft.thresholdType === 'percentage' && styles.thresholdCardLabelActive,
            ]}>
              By Percentage
            </Text>
          </TouchableOpacity>
        </View>

        {/* Threshold input based on selected type */}
        {draft.thresholdType === 'quantity' ? (
          <View style={styles.thresholdInputSection}>
            <Text style={styles.thresholdDescription}>When I reach</Text>
            <View style={styles.thresholdInputRow}>
              <TextInput
                style={styles.thresholdInput}
                value={String(draft.thresholdValue)}
                onChangeText={(v) => {
                  const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
                  onUpdateDraft({ thresholdValue: Number.isFinite(num) ? num : 1 });
                }}
                keyboardType="number-pad"
                selectTextOnFocus
                editable={!submitting}
              />
              <Text style={styles.thresholdUnit}>
                {draft.unit.trim() || supply.unit} remaining
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.thresholdInputSection}>
            <Text style={styles.thresholdDescription}>When I'm below</Text>
            <View style={styles.thresholdInputRow}>
              <TextInput
                style={styles.thresholdInput}
                value={String(draft.thresholdValue)}
                onChangeText={(v) => {
                  const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
                  const clamped = Math.min(100, Math.max(0, Number.isFinite(num) ? num : 25));
                  onUpdateDraft({ thresholdValue: clamped });
                }}
                keyboardType="number-pad"
                selectTextOnFocus
                editable={!submitting}
              />
              <Text style={styles.thresholdUnit}>
                % of my supply
              </Text>
            </View>
            {draft.qty > 0 ? (
              <Text style={styles.thresholdHelper}>
                That's about {pctAsQty}{' '}
                {draft.unit.trim() || supply.unit} remaining
              </Text>
            ) : null}
          </View>
        )}

        {/* Depletion Mode Section */}
        <Text style={styles.sectionLabel}>How is this supply used?</Text>
        <TouchableOpacity
          style={[
            styles.modeCard,
            draft.depletionMode === 'task' && styles.modeCardActive,
          ]}
          onPress={() => onUpdateDraft({ depletionMode: 'task' })}
          activeOpacity={0.7}
          disabled={submitting}
        >
          <Text style={styles.modeIcon}>✅</Text>
          <View style={styles.modeContent}>
            <Text style={[
              styles.modeTitle,
              draft.depletionMode === 'task' && styles.modeTitleActive,
            ]}>
              When I complete a task
            </Text>
            <Text style={styles.modeDesc}>
              Supply decreases when you mark a linked task as done
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeCard,
            draft.depletionMode === 'auto' && styles.modeCardActive,
          ]}
          onPress={() => onUpdateDraft({ depletionMode: 'auto' })}
          activeOpacity={0.7}
          disabled={submitting}
        >
          <Text style={styles.modeIcon}>⏱️</Text>
          <View style={styles.modeContent}>
            <Text style={[
              styles.modeTitle,
              draft.depletionMode === 'auto' && styles.modeTitleActive,
            ]}>
              On a schedule
            </Text>
            <Text style={styles.modeDesc}>
              Supply decreases automatically over time
            </Text>
          </View>
        </TouchableOpacity>

        {draft.depletionMode === 'auto' ? (
          <View style={styles.autoRateSection}>
            <Text style={styles.autoRateLabel}>I use</Text>
            <TextInput
              style={styles.autoRateInput}
              value={String(draft.autoDepletionRate)}
              onChangeText={(v) => {
                const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
                onUpdateDraft({ autoDepletionRate: Number.isFinite(num) && num > 0 ? num : 1 });
              }}
              keyboardType="number-pad"
              selectTextOnFocus
              editable={!submitting}
            />
            <Text style={styles.autoRateLabel}>per</Text>
            <View style={styles.autoUnitRow}>
              {(['day', 'week', 'month'] as AutoDepletionUnit[]).map((unit) => {
                const active = draft.autoDepletionUnit === unit;
                return (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.autoUnitChip, active && styles.autoUnitChipOn]}
                    onPress={() => onUpdateDraft({ autoDepletionUnit: unit })}
                    activeOpacity={0.7}
                    disabled={submitting}
                  >
                    <Text
                      style={[
                        styles.autoUnitText,
                        active && styles.autoUnitTextOn,
                      ]}
                    >
                      {unit.charAt(0).toUpperCase() + unit.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {calcDuration() ? (
              <Text style={styles.durationText}>
                ~{calcDuration()} supply
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bottomBar}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.primaryButton, (submitting || !canSubmit) && styles.primaryButtonDisabled]}
          onPress={onSave}
          activeOpacity={0.85}
          disabled={submitting || !canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Add Supply</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipFullRow}
          onPress={onSkip}
          activeOpacity={0.7}
          disabled={submitting}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeTop: {
    backgroundColor: Colors.headerBackground,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  padded: {
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.headerBackground,
  },
  headerSlot: {
    width: 40,
  },
  headerSlotRight: {
    alignItems: 'flex-end',
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  backIcon: {
    fontSize: 28,
    color: Colors.textOnDark,
    fontWeight: '300',
  },
  closeText: {
    fontSize: 20,
    color: Colors.textOnDark,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  bigEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  accordionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  categoryEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  accordionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  selectedBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  selectedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  accordionChevron: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  accordionContent: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  itemRowOn: {
    backgroundColor: Colors.primaryLight,
  },
  itemIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  itemName: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: Colors.cardBackground,
  },
  checkboxOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  skipFullRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 15,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  queueCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  nameCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  supplyHeadingIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  nameInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    padding: 0,
    margin: 0,
  },
  pencilEmoji: {
    fontSize: 16,
    opacity: 0.5,
    paddingLeft: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  qtyInput: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 28,
    marginBottom: 12,
  },
  thresholdCardRow: {
    flexDirection: 'row',
    gap: 10,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  thresholdUnit: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  thresholdHelper: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 6,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  modeIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modeTitleActive: {
    color: Colors.primary,
  },
  modeDesc: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  autoRateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  autoRateLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  autoRateInput: {
    width: 50,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  autoUnitRow: {
    flexDirection: 'row',
    gap: 6,
  },
  autoUnitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  autoUnitChipOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  autoUnitText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  autoUnitTextOn: {
    color: '#FFFFFF',
  },
  durationText: {
    width: '100%',
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 8,
  },
});
