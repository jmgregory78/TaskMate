import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebase';
import { useAppStore } from '../../stores/appStore';
import { Colors } from '../../constants/colors';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const [showDisplayName, setShowDisplayName] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const safeNavigate = (screenName: string) => {
    try {
      navigation.navigate(screenName);
    } catch (error) {
      console.warn('[SettingsScreen] navigation failed:', error);
      Alert.alert(
        'Navigation Error',
        'Something went wrong. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.safeTop, { height: insets.top }]} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionHeader}>HOUSEHOLD</Text>
        <SettingsItem
          icon="🏠"
          label="Household Settings"
          onPress={() => safeNavigate('HouseholdSettings')}
        />

        <Text style={styles.sectionHeader}>ACCOUNT</Text>
        <SettingsItem
          icon="👤"
          label="Change Display Name"
          onPress={() => setShowDisplayName(true)}
        />
        <SettingsItem
          icon="🔒"
          label="Change Password"
          onPress={() => setShowPassword(true)}
        />

        <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
        <SettingsItem
          icon="🔔"
          label="Notification Preferences"
          onPress={() => safeNavigate('NotificationPreferences')}
        />
      </ScrollView>

      <ChangeDisplayNameModal
        visible={showDisplayName}
        onClose={() => setShowDisplayName(false)}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
      />
      <ChangePasswordModal
        visible={showPassword}
        onClose={() => setShowPassword(false)}
      />
    </View>
  );
}

interface SettingsItemProps {
  icon: string;
  label: string;
  onPress: () => void;
}

function SettingsItem({ icon, label, onPress }: SettingsItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.settingsItem}
    >
      <Text style={styles.settingsItemIcon}>{icon}</Text>
      <Text style={styles.settingsItemLabel}>{label}</Text>
      <Text style={styles.settingsItemArrow}>›</Text>
    </TouchableOpacity>
  );
}

interface DisplayNameProps {
  visible: boolean;
  onClose: () => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
}

function ChangeDisplayNameModal({ visible, onClose, currentUser, setCurrentUser }: DisplayNameProps) {
  const [name, setName] = useState(currentUser?.displayName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authUser = auth.currentUser;

  if (visible && !authUser) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.centeredOverlay}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Session Error</Text>
            <Text style={styles.errorText}>
              Please log in again to change your display name.
            </Text>
            <TouchableOpacity
              style={[styles.cardButton, styles.cardButtonPrimary]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.cardButtonPrimaryText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Display name cannot be empty');
      return;
    }
    if (!authUser || submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      await updateProfile(authUser, { displayName: trimmed });
      await setDoc(
        doc(db, 'users', authUser.uid),
        { displayName: trimmed, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await authUser.reload();
      if (currentUser) {
        setCurrentUser({ ...currentUser, displayName: trimmed });
      }
      Keyboard.dismiss();
      Alert.alert('Success', 'Display name updated!', [{ text: 'OK', onPress: onClose }]);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to update display name. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.centeredOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Display Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#a0aec0"
            autoCapitalize="words"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.cardButtonRow}>
            <TouchableOpacity
              style={[styles.cardButton, styles.cardButtonGhost]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cardButtonGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardButton, styles.cardButtonPrimary, submitting && styles.cardButtonDisabled]}
              onPress={handleSave}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.cardButtonPrimaryText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface PasswordProps {
  visible: boolean;
  onClose: () => void;
}

function ChangePasswordModal({ visible, onClose }: PasswordProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!auth.currentUser || !auth.currentUser.email || submitting) return;

    const fieldErrors: typeof errors = {};
    if (current.length === 0) fieldErrors.current = 'Current password is required';
    if (next.length === 0) fieldErrors.next = 'New password is required';
    else if (next.length < 6) fieldErrors.next = 'Password must be at least 6 characters';
    if (confirm.length === 0) fieldErrors.confirm = 'Please confirm your new password';
    else if (next !== confirm) fieldErrors.confirm = "Passwords don't match";

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, current);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, next);
      Keyboard.dismiss();
      Alert.alert('Success', 'Password updated!', [{ text: 'OK', onPress: onClose }]);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials'
      ) {
        setErrors({ current: 'Incorrect current password' });
      } else if (err.code === 'auth/weak-password') {
        setErrors({ next: 'Password must be at least 6 characters' });
      } else {
        setErrors({ form: 'Something went wrong. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.centeredOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Password</Text>
          <TextInput
            style={[styles.input, errors.current && styles.inputError]}
            value={current}
            onChangeText={(t) => {
              setCurrent(t);
              if (errors.current) setErrors((e) => ({ ...e, current: undefined }));
            }}
            placeholder="Current password"
            placeholderTextColor="#a0aec0"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
          />
          {errors.current ? <Text style={styles.fieldError}>{errors.current}</Text> : null}
          <TextInput
            style={[styles.input, errors.next && styles.inputError]}
            value={next}
            onChangeText={(t) => {
              setNext(t);
              if (errors.next) setErrors((e) => ({ ...e, next: undefined }));
            }}
            placeholder="New password"
            placeholderTextColor="#a0aec0"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          {errors.next ? <Text style={styles.fieldError}>{errors.next}</Text> : null}
          <TextInput
            style={[styles.input, errors.confirm && styles.inputError]}
            value={confirm}
            onChangeText={(t) => {
              setConfirm(t);
              if (errors.confirm) setErrors((e) => ({ ...e, confirm: undefined }));
            }}
            placeholder="Confirm new password"
            placeholderTextColor="#a0aec0"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          {errors.confirm ? <Text style={styles.fieldError}>{errors.confirm}</Text> : null}
          {errors.form ? <Text style={styles.errorText}>{errors.form}</Text> : null}
          <View style={styles.cardButtonRow}>
            <TouchableOpacity
              style={[styles.cardButton, styles.cardButtonGhost]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cardButtonGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardButton, styles.cardButtonPrimary, submitting && styles.cardButtonDisabled]}
              onPress={handleSave}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.cardButtonPrimaryText}>Update</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  safeTop: {
    backgroundColor: Colors.headerBackground,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: Colors.headerBackground,
  },
  backButton: {
    width: 70,
  },
  backText: {
    color: Colors.textOnDark,
    fontSize: 16,
  },
  title: {
    flex: 1,
    color: Colors.textOnDark,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 70,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingsItemIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
  },
  settingsItemLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  settingsItemArrow: {
    fontSize: 20,
    color: Colors.textMuted,
  },
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 32, 44, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
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
    marginBottom: 12,
  },
  inputError: {
    borderColor: Colors.error,
  },
  fieldError: {
    color: Colors.error,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 10,
    marginLeft: 2,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    marginBottom: 8,
  },
  cardButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  cardButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtonGhost: {
    backgroundColor: Colors.screenBackground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardButtonGhostText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  cardButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  cardButtonPrimaryText: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '700',
  },
  cardButtonDisabled: {
    opacity: 0.6,
  },
});
