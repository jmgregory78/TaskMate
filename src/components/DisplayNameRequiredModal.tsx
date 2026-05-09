import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { updateProfile } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { useAppStore } from '../stores/appStore';
import { Colors } from '../constants/colors';

interface Props {
  visible: boolean;
  onComplete: () => void;
}

function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Please enter your name';
  if (trimmed.includes('@')) return 'Please use your name, not your email address';
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 30) return 'Name must be 30 characters or less';
  return null;
}

async function updateHistoricalCompletions(
  householdId: string,
  userId: string,
  newDisplayName: string,
  oldIdentifier: string
): Promise<void> {
  try {
    const tasksRef = collection(db, 'households', householdId, 'tasks');
    const tasksSnapshot = await getDocs(tasksRef);

    for (const taskDoc of tasksSnapshot.docs) {
      const completionsRef = collection(
        db,
        'households',
        householdId,
        'tasks',
        taskDoc.id,
        'completions'
      );
      const completionsSnapshot = await getDocs(completionsRef);

      for (const completionDoc of completionsSnapshot.docs) {
        const data = completionDoc.data();
        // Update if completedBy matches userId or displayName matches old identifier (email)
        if (
          data.completedBy === userId ||
          data.completedBy === oldIdentifier ||
          data.displayName === oldIdentifier
        ) {
          await updateDoc(completionDoc.ref, {
            displayName: newDisplayName,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[updateHistoricalCompletions] failed:', e);
  }
}

export default function DisplayNameRequiredModal({ visible, onComplete }: Props) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const currentUser = useAppStore((s) => s.currentUser);

  useEffect(() => {
    if (visible) {
      setName('');
      setError(null);
    }
  }, [visible]);

  const handleSave = async () => {
    const validationError = validateDisplayName(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    const user = auth.currentUser;
    if (!user || submitting) return;

    const trimmedName = name.trim();
    const oldEmail = user.email ?? '';

    setError(null);
    setSubmitting(true);

    try {
      // Update Firebase Auth profile
      await updateProfile(user, { displayName: trimmedName });

      // Update Firestore user document
      await setDoc(
        doc(db, 'users', user.uid),
        {
          displayName: trimmedName,
          email: user.email,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Update historical completions if we have a household
      if (householdId && oldEmail) {
        await updateHistoricalCompletions(
          householdId,
          user.uid,
          trimmedName,
          oldEmail
        );
      }

      // Update local state
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          displayName: trimmedName,
        });
      }

      Keyboard.dismiss();
      onComplete();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to save. Please try again.');
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>One quick thing!</Text>
          <Text style={styles.subtitle}>
            What should we call you in TaskMate?
          </Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your first name"
            placeholderTextColor={Colors.textLight}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            maxLength={30}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.textOnDark} />
            ) : (
              <Text style={styles.buttonText}>Let's Go!</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 32, 44, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  error: {
    color: Colors.error,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.textOnDark,
    fontSize: 17,
    fontWeight: '700',
  },
});
