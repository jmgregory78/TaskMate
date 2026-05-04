import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../../stores/appStore';
import { useAuth } from '../../hooks/useAuth';
import { createProduct, getProducts } from '../../services/productService';
import { SUGGESTED_SUPPLIES, SuggestedSupply } from '../../data/suggested';
import ScreenHeader from '../../components/ScreenHeader';
import { Colors } from '../../constants/colors';

export default function SuggestedSuppliesScreen() {
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const { user } = useAuth();
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      getProducts(householdId)
        .then((products) => {
          if (cancelled) return;
          setExistingNames(
            new Set(products.map((p) => p.name.trim().toLowerCase()))
          );
        })
        .catch((e) => {
          console.warn('[SuggestedSuppliesScreen] getProducts failed:', e);
        });
      return () => {
        cancelled = true;
      };
    }, [householdId])
  );

  const handleTap = async (s: SuggestedSupply) => {
    if (!householdId || !user) return;
    if (existingNames.has(s.name.trim().toLowerCase())) return;
    if (addingId) return;

    setAddingId(s.id);
    try {
      await createProduct(
        householdId,
        user.displayName ?? user.email ?? user.uid,
        {
          householdId,
          name: s.name,
          amazonUrl: '',
          containerSize: s.defaultQty,
          containerUnit: s.unit,
          currentQuantity: s.defaultQty,
          lowThresholdPercent: 25,
        }
      );
      setExistingNames((prev) => {
        const next = new Set(prev);
        next.add(s.name.trim().toLowerCase());
        return next;
      });
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Could not add supply', err.message ?? String(e));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Suggested Supplies" leftLabel="Back" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {SUGGESTED_SUPPLIES.map((cat) => (
          <View key={cat.id} style={styles.categoryBlock}>
            <Text style={styles.categoryTitle}>
              {cat.emoji} {cat.name}
            </Text>
            {cat.supplies.map((s) => {
              const added = existingNames.has(s.name.trim().toLowerCase());
              const busy = addingId === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.supplyRow, added && styles.supplyRowAdded]}
                  onPress={() => handleTap(s)}
                  activeOpacity={added ? 1 : 0.7}
                  disabled={added || !!addingId}
                >
                  {s.icon ? (
                    <Text style={styles.supplyIcon}>{s.icon}</Text>
                  ) : null}
                  <View style={styles.supplyTextWrap}>
                    <View style={styles.supplyNameRow}>
                      <Text style={styles.supplyName}>{s.name}</Text>
                      {added ? (
                        <Text style={styles.addedBadge}>✅ Added</Text>
                      ) : null}
                    </View>
                    <Text style={styles.supplyMeta}>
                      Default: {s.defaultQty} {s.unit}
                    </Text>
                    {s.notes ? (
                      <Text style={styles.supplyNotes}>{s.notes}</Text>
                    ) : null}
                  </View>
                  {busy ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.chevron}>{added ? '' : '›'}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  categoryBlock: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  supplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  supplyRowAdded: {
    borderColor: Colors.successBorder,
    backgroundColor: Colors.successBg,
  },
  supplyIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  supplyTextWrap: {
    flex: 1,
  },
  supplyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  supplyName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  addedBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.urgencyGreen,
  },
  supplyMeta: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  supplyNotes: {
    fontSize: 12,
    color: Colors.textLight,
    fontStyle: 'italic',
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: Colors.textMuted,
    marginLeft: 8,
  },
});
