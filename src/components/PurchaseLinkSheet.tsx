import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Product } from '../types/models';
import { updateProduct } from '../services/productService';
import { normalizePurchaseUrl, openPurchaseUrl } from '../utils/purchaseLink';
import { Colors } from '../constants/colors';

interface Props {
  // Visible when non-null. The product whose URL is being added.
  product: Product | null;
  householdId: string | null;
  // Called after dismiss (Save→opened, or Not Now). Use to update local
  // state if the URL changed.
  onClose: (savedUrl?: string) => void;
}

export default function PurchaseLinkSheet({
  product,
  householdId,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [urlText, setUrlText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setUrlText(product.amazonUrl ?? '');
      setSaving(false);
      // Slight delay so the modal's slide-in animation finishes before the
      // keyboard pops. Without this, on iOS the focus race can leave the
      // keyboard hidden behind the sheet.
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [product]);

  if (!product) return null;

  const handleSave = async () => {
    const normalized = normalizePurchaseUrl(urlText);
    if (!normalized) {
      // Empty input — treat as "Not Now"
      onClose();
      return;
    }
    if (!householdId) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await updateProduct(householdId, product.id, { amazonUrl: normalized });
    } catch (e) {
      console.warn('[PurchaseLinkSheet] save failed:', e);
    }
    setSaving(false);
    onClose(normalized);
    // Open the URL after the parent has a chance to dismiss the sheet.
    void openPurchaseUrl(normalized);
  };

  const handleNotNow = () => {
    if (saving) return;
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={handleNotNow}
    >
      <Pressable style={styles.overlay} onPress={handleNotNow}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Add a purchase link?</Text>
          <Text style={styles.body}>
            Add a URL so TaskMate can take you straight to this product next
            time.
          </Text>

          <TextInput
            ref={inputRef}
            style={styles.input}
            value={urlText}
            onChangeText={setUrlText}
            placeholder="https://amazon.com/..."
            placeholderTextColor={Colors.textLight}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={handleSave}
            editable={!saving}
          />

          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.primaryDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>Save Link</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleNotNow}
            activeOpacity={0.7}
            disabled={saving}
          >
            <Text style={styles.secondaryText}>Not Now</Text>
          </TouchableOpacity>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
