import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { updatePassword, updateProfile } from 'firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../stores/appStore';
import { Colors } from '../constants/colors';

interface AvatarProps {
  size?: number;
  fontSize?: number;
}

function initialsFor(displayName: string | null, email: string): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(/\s+/).slice(0, 2);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (email && email.length > 0) return email[0].toUpperCase();
  return '?';
}

export default function UserAvatar({
  size = 36,
  fontSize = 14,
}: AvatarProps) {
  const { user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!user) return null;
  const letters = initialsFor(user.displayName, user.email);

  return (
    <>
      <TouchableOpacity
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.7}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize }]}>{letters}</Text>
      </TouchableOpacity>
      <ProfileSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

interface SheetProps {
  visible: boolean;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

function ProfileSheet({ visible, onClose }: SheetProps) {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [mounted, setMounted] = useState(visible);
  const [showDisplayName, setShowDisplayName] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(translateY, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!visible && finished) setMounted(false);
    });
  }, [visible, translateY]);

  if (!mounted || !user) return null;

  const stub = (label: string) =>
    Alert.alert(label, `${label} isn't available yet.`);

  const handleSignOut = async () => {
    onClose();
    try {
      await signOut();
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Sign out failed', err.message ?? String(e));
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.fill}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          <View style={styles.handle} />
          <Text style={styles.email}>{user.email}</Text>

          <MenuRow
            icon="👤"
            label="Change Display Name"
            onPress={() => setShowDisplayName(true)}
          />
          <MenuRow
            icon="🔒"
            label="Change Password"
            onPress={() => setShowPassword(true)}
          />
          <MenuRow
            icon="🏠"
            label="Household Settings"
            onPress={() => {
              onClose();
              navigation.navigate('HouseholdSettings');
            }}
          />
          <MenuRow
            icon="🔔"
            label="Notification Preferences"
            onPress={() => stub('Notification Preferences')}
          />

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <ChangeDisplayNameModal
        visible={showDisplayName}
        onClose={() => setShowDisplayName(false)}
      />
      <ChangePasswordModal
        visible={showPassword}
        onClose={() => setShowPassword(false)}
      />
    </Modal>
  );
}

interface MenuRowProps {
  icon: string;
  label: string;
  onPress: () => void;
}

function MenuRow({ icon, label, onPress }: MenuRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.menuRow}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuChevron}>▶</Text>
    </TouchableOpacity>
  );
}

interface DisplayNameProps {
  visible: boolean;
  onClose: () => void;
}

function ChangeDisplayNameModal({ visible, onClose }: DisplayNameProps) {
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const currentUser = useAppStore((s) => s.currentUser);
  const [name, setName] = useState(currentUser?.displayName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(currentUser?.displayName ?? '');
      setError(null);
    }
  }, [visible, currentUser?.displayName]);

  const handleSave = async () => {
    if (!auth.currentUser || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const trimmed = name.trim();
      await updateProfile(auth.currentUser, { displayName: trimmed });
      await auth.currentUser.reload();
      const refreshed = auth.currentUser;
      if (refreshed && currentUser) {
        setCurrentUser({
          ...currentUser,
          displayName: refreshed.displayName,
        });
      }
      Keyboard.dismiss();
      onClose();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to update display name');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.centeredOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              style={[
                styles.cardButton,
                styles.cardButtonPrimary,
                submitting && styles.cardButtonDisabled,
              ]}
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
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setNext('');
      setConfirm('');
      setError(null);
    }
  }, [visible]);

  const handleSave = async () => {
    if (!auth.currentUser || submitting) return;
    if (next.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (next !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await updatePassword(auth.currentUser, next);
      Keyboard.dismiss();
      onClose();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const message =
        err.code === 'auth/requires-recent-login'
          ? 'Please sign out and sign back in, then try again.'
          : (err.message ?? 'Failed to update password');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.centeredOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Password</Text>
          <TextInput
            style={styles.input}
            value={next}
            onChangeText={setNext}
            placeholder="New password"
            placeholderTextColor="#a0aec0"
            secureTextEntry
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Confirm password"
            placeholderTextColor="#a0aec0"
            secureTextEntry
            autoCapitalize="none"
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
              style={[
                styles.cardButton,
                styles.cardButtonPrimary,
                submitting && styles.cardButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.cardButtonPrimaryText}>
                  Update Password
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textOnDark,
    fontWeight: '700',
  },
  fill: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 32, 44, 0.7)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    paddingHorizontal: 16,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderDark,
    marginVertical: 8,
  },
  email: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  menuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  menuChevron: {
    color: Colors.textLight,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  signOutButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '700',
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
