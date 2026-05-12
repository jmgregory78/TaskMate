import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { auth, db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../stores/appStore';
import { getHouseholdMembers } from '../services/inviteService';
import { getUnreadFeedbackCount } from '../services/feedbackService';
import { Colors } from '../constants/colors';

interface AvatarProps {
  size?: number;
  fontSize?: number;
}

function initialsFor(displayName: string | null): string {
  if (displayName && displayName.trim().length > 0 && !displayName.includes('@')) {
    const parts = displayName.trim().split(/\s+/).slice(0, 2);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return '?';
}

export default function UserAvatar({
  size = 36,
  fontSize = 14,
}: AvatarProps) {
  const { user } = useAuth();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const navigation = useNavigation<any>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showDisplayName, setShowDisplayName] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unreadFeedback, setUnreadFeedback] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Hide the badge until we confirm BOTH ownership and a positive count.
    setUnreadFeedback(0);
    if (!user?.uid || !householdId) return;
    void (async () => {
      try {
        const members = await getHouseholdMembers(householdId);
        if (cancelled) return;
        const me = members.find((m) => m.userId === user.uid);
        if (!me || me.role !== 'owner') return;

        let count = 0;
        try {
          count = await getUnreadFeedbackCount();
        } catch (e) {
          console.warn('[UserAvatar] getUnreadFeedbackCount failed:', e);
          return;
        }
        if (cancelled) return;
        if (typeof count === 'number' && count > 0) {
          setUnreadFeedback(count);
        }
      } catch (e) {
        console.warn('[UserAvatar] feedback badge load failed:', e);
        if (!cancelled) setUnreadFeedback(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, householdId]);

  if (!user) return null;
  const letters = initialsFor(user.displayName);

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
        {unreadFeedback > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadFeedback > 9 ? '9+' : unreadFeedback}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
      <ProfileDropdown
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onShowDisplayName={() => {
          setSheetOpen(false);
          // Delay opening the modal to let dropdown close animation complete
          setTimeout(() => setShowDisplayName(true), 250);
        }}
        onShowPassword={() => {
          setSheetOpen(false);
          // Delay opening the modal to let dropdown close animation complete
          setTimeout(() => setShowPassword(true), 250);
        }}
        onShowNotifPrefs={() => {
          setSheetOpen(false);
          try {
            navigation.navigate('NotificationPreferences');
          } catch (error) {
            console.warn('[UserAvatar] navigation failed:', error);
            Alert.alert(
              'Navigation Error',
              'Something went wrong. Please try again.',
              [{ text: 'OK' }]
            );
          }
        }}
      />
      <ChangeDisplayNameModal
        visible={showDisplayName}
        onClose={() => setShowDisplayName(false)}
      />
      <ChangePasswordModal
        visible={showPassword}
        onClose={() => setShowPassword(false)}
      />
    </>
  );
}

interface DropdownProps {
  visible: boolean;
  onClose: () => void;
  onShowDisplayName: () => void;
  onShowPassword: () => void;
  onShowNotifPrefs: () => void;
}

function ProfileDropdown({
  visible,
  onClose,
  onShowDisplayName,
  onShowPassword,
  onShowNotifPrefs,
}: DropdownProps) {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  const safeNavigate = (screenName: string) => {
    onClose();
    try {
      navigation.navigate(screenName);
    } catch (error) {
      console.warn('[ProfileDropdown] navigation failed:', error);
      Alert.alert(
        'Navigation Error',
        'Something went wrong. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(dropdownAnim, {
        toValue: 1,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(dropdownAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted || !user) return null;

  const handleSignOut = async () => {
    onClose();
    try {
      await signOut();
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Sign out failed', err.message ?? String(e));
    }
  };

  const dropdownTransform = {
    opacity: dropdownAnim,
    transform: [
      {
        translateY: dropdownAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-12, 0],
        }),
      },
    ],
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.fill} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[
          styles.dropdown,
          { top: insets.top + 56 },
          dropdownTransform,
        ]}
      >
        <View style={styles.dropdownHeader}>
          <Text style={styles.dropdownName} numberOfLines={1}>
            {user.displayName && !user.displayName.includes('@')
              ? user.displayName
              : 'User'}
          </Text>
        </View>

        <DropdownItem
          icon="🏠"
          label="Household Settings"
          onPress={() => safeNavigate('HouseholdSettings')}
        />
        <DropdownItem
          icon="👤"
          label="Change Display Name"
          onPress={onShowDisplayName}
        />
        <DropdownItem
          icon="🔒"
          label="Change Password"
          onPress={onShowPassword}
        />
        <DropdownItem
          icon="🔔"
          label="Notification Preferences"
          onPress={onShowNotifPrefs}
        />
        <DropdownItem
          icon="📖"
          label="App Tutorial"
          onPress={() => safeNavigate('AppTutorial')}
        />
        <DropdownItem
          icon="📧"
          label="Send Feedback"
          onPress={() => safeNavigate('Feedback')}
        />

        <View style={styles.menuDivider} />

        <DropdownItem
          icon="🚪"
          label="Sign Out"
          onPress={handleSignOut}
          danger
        />

        <View style={styles.menuDivider} />

        <View style={styles.aboutSection}>
          <Text style={styles.aboutHeader}>About</Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App</Text>
            <Text style={styles.aboutValue}>TaskMate: Home Manager</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>
              1.0.0 ({Constants.expoConfig?.extra?.internalVersion ?? '4.001'})
            </Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

interface DropdownItemProps {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

function DropdownItem({ icon, label, onPress, danger }: DropdownItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={styles.dropdownItem}
    >
      <Text style={styles.dropdownItemIcon}>{icon}</Text>
      <Text
        style={[
          styles.dropdownItemLabel,
          danger ? styles.dropdownItemDanger : null,
        ]}
      >
        {label}
      </Text>
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

  // Get current auth user
  const authUser = auth.currentUser;

  useEffect(() => {
    if (visible) {
      setName(currentUser?.displayName ?? '');
      setError(null);
    }
  }, [visible, currentUser?.displayName]);

  // Guard: if no auth user, show error state
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

    // Validate input
    if (!trimmed) {
      setError('Display name cannot be empty');
      return;
    }

    if (!authUser || submitting) return;

    const uid = authUser.uid;
    if (!uid) {
      setError('No user logged in');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      // Update Firebase Auth profile
      await updateProfile(authUser, { displayName: trimmed });

      // Update Firestore user document (merge to handle missing doc)
      await setDoc(
        doc(db, 'users', uid),
        {
          displayName: trimmed,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Reload to get fresh data
      await authUser.reload();
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          displayName: trimmed,
        });
      }

      Keyboard.dismiss();
      Alert.alert('Success', 'Display name updated!', [
        { text: 'OK', onPress: onClose },
      ]);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to update display name. Please try again.');
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

  useEffect(() => {
    if (visible) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setErrors({});
    }
  }, [visible]);

  const handleSave = async () => {
    if (!auth.currentUser || !auth.currentUser.email || submitting) return;

    const fieldErrors: typeof errors = {};
    if (current.length === 0) fieldErrors.current = 'Current password is required';
    if (next.length === 0) fieldErrors.next = 'New password is required';
    else if (next.length < 6)
      fieldErrors.next = 'Password must be at least 6 characters';
    if (confirm.length === 0)
      fieldErrors.confirm = 'Please confirm your new password';
    else if (next !== confirm)
      fieldErrors.confirm = "Passwords don't match";

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        current
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, next);
      Keyboard.dismiss();
      onClose();
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
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
          {errors.current ? (
            <Text style={styles.fieldError}>{errors.current}</Text>
          ) : null}

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
          {errors.next ? (
            <Text style={styles.fieldError}>{errors.next}</Text>
          ) : null}

          <TextInput
            style={[styles.input, errors.confirm && styles.inputError]}
            value={confirm}
            onChangeText={(t) => {
              setConfirm(t);
              if (errors.confirm)
                setErrors((e) => ({ ...e, confirm: undefined }));
            }}
            placeholder="Confirm new password"
            placeholderTextColor="#a0aec0"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          {errors.confirm ? (
            <Text style={styles.fieldError}>{errors.confirm}</Text>
          ) : null}

          {errors.form ? (
            <Text style={styles.errorText}>{errors.form}</Text>
          ) : null}

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
  avatar: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textOnDark,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.urgencyRed,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  fill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dropdown: {
    position: 'absolute',
    left: 16,
    width: 240,
    backgroundColor: '#2D3748',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
  },
  dropdownHeader: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  dropdownName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dropdownEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownItemIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
  },
  dropdownItemLabel: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  dropdownItemDanger: {
    color: '#FC8181',
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
  aboutSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  aboutHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aboutLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  aboutValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
});
