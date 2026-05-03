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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../stores/appStore';
import { getHouseholdMembers } from '../services/inviteService';
import { getUnreadFeedbackCount } from '../services/feedbackService';
import {
  cancelAllReminders,
  getNotificationPrefs,
  NotificationPrefs,
  ReminderTiming,
  scheduleAllTaskReminders,
  setNotificationPrefs as saveNotificationPrefs,
  SnoozeDuration,
} from '../services/notificationService';
import { getTasks } from '../services/taskService';
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
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showDisplayName, setShowDisplayName] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
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
          setShowDisplayName(true);
        }}
        onShowPassword={() => {
          setSheetOpen(false);
          setShowPassword(true);
        }}
        onShowNotifPrefs={() => {
          setSheetOpen(false);
          setShowNotifPrefs(true);
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
      <NotificationPreferencesModal
        visible={showNotifPrefs}
        onClose={() => setShowNotifPrefs(false)}
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
            {user.displayName ?? user.email ?? 'User'}
          </Text>
          {user.email ? (
            <Text style={styles.dropdownEmail} numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}
        </View>

        <DropdownItem
          icon="🏠"
          label="Household Settings"
          onPress={() => {
            onClose();
            navigation.navigate('HouseholdSettings');
          }}
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
          onPress={() => {
            onClose();
            navigation.navigate('AppTutorial');
          }}
        />
        <DropdownItem
          icon="📧"
          label="Send Feedback"
          onPress={() => {
            onClose();
            navigation.navigate('Feedback');
          }}
        />

        <View style={styles.menuDivider} />

        <DropdownItem
          icon="🚪"
          label="Sign Out"
          onPress={handleSignOut}
          danger
        />
      </Animated.View>
    </Modal>
  );
}

interface NotifPrefsProps {
  visible: boolean;
  onClose: () => void;
}

function formatTime(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = minute.toString().padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

function NotificationPreferencesModal({ visible, onClose }: NotifPrefsProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    enabled: true,
    timing: 'both',
    snoozeDuration: '1day',
    reminderHour: 9,
    reminderMinute: 0,
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  useEffect(() => {
    if (!visible || !currentUser?.uid) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getNotificationPrefs(currentUser.uid)
      .then((p) => {
        if (cancelled) return;
        setPrefs(p);
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e as { message?: string };
        setError(err.message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, currentUser?.uid]);

  const applyAndSave = async (next: NotificationPrefs) => {
    if (!currentUser?.uid) return;
    setPrefs(next);
    setSubmitting(true);
    setError(null);
    try {
      await saveNotificationPrefs(currentUser.uid, next);
      if (!next.enabled) {
        await cancelAllReminders();
      } else if (householdId) {
        // Re-pull current tasks so timing change takes effect immediately.
        const tasks = await getTasks(householdId);
        await scheduleAllTaskReminders(
          tasks,
          householdId,
          next.timing,
          next.reminderHour,
          next.reminderMinute
        );
      }
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to update preferences');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = () => {
    void applyAndSave({ ...prefs, enabled: !prefs.enabled });
  };

  const setTiming = (timing: ReminderTiming) => {
    if (prefs.timing === timing) return;
    void applyAndSave({ ...prefs, timing });
  };

  const setSnooze = (snoozeDuration: SnoozeDuration) => {
    if (prefs.snoozeDuration === snoozeDuration) return;
    void applyAndSave({ ...prefs, snoozeDuration });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.centeredOverlay}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notification Preferences</Text>

          {loading ? (
            <ActivityIndicator
              color={Colors.primary}
              style={notifStyles.loading}
            />
          ) : (
            <>
              <View style={notifStyles.toggleRow}>
                <View style={notifStyles.toggleMain}>
                  <Text style={notifStyles.toggleLabel}>
                    🔔 Task Reminders
                  </Text>
                  <Text style={notifStyles.toggleSub}>
                    Schedule local reminders for upcoming tasks
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={toggleEnabled}
                  disabled={submitting}
                  activeOpacity={0.7}
                  style={[
                    notifStyles.switchTrack,
                    prefs.enabled && notifStyles.switchTrackOn,
                  ]}
                >
                  <View
                    style={[
                      notifStyles.switchThumb,
                      prefs.enabled && notifStyles.switchThumbOn,
                    ]}
                  />
                </TouchableOpacity>
              </View>

              <Text style={notifStyles.sectionLabel}>📅 Remind me</Text>
              <View
                style={[
                  notifStyles.optionGroup,
                  !prefs.enabled && notifStyles.optionGroupDisabled,
                ]}
              >
                <TimingOption
                  label="1 day before"
                  active={prefs.timing === 'dayBefore'}
                  disabled={!prefs.enabled || submitting}
                  onPress={() => setTiming('dayBefore')}
                />
                <TimingOption
                  label="Same day"
                  active={prefs.timing === 'sameDay'}
                  disabled={!prefs.enabled || submitting}
                  onPress={() => setTiming('sameDay')}
                />
                <TimingOption
                  label="Both"
                  active={prefs.timing === 'both'}
                  disabled={!prefs.enabled || submitting}
                  onPress={() => setTiming('both')}
                />
              </View>

              <Text style={notifStyles.sectionLabel}>😴 Snooze duration</Text>
              <View
                style={[
                  notifStyles.optionGroup,
                  !prefs.enabled && notifStyles.optionGroupDisabled,
                ]}
              >
                <TimingOption
                  label="1 hour"
                  active={prefs.snoozeDuration === '1hour'}
                  disabled={!prefs.enabled || submitting}
                  onPress={() => setSnooze('1hour')}
                />
                <TimingOption
                  label="3 hours"
                  active={prefs.snoozeDuration === '3hours'}
                  disabled={!prefs.enabled || submitting}
                  onPress={() => setSnooze('3hours')}
                />
                <TimingOption
                  label="1 day"
                  active={prefs.snoozeDuration === '1day'}
                  disabled={!prefs.enabled || submitting}
                  onPress={() => setSnooze('1day')}
                />
                <TimingOption
                  label="3 days"
                  active={prefs.snoozeDuration === '3days'}
                  disabled={!prefs.enabled || submitting}
                  onPress={() => setSnooze('3days')}
                />
              </View>

              <Text style={notifStyles.sectionLabel}>⏰ Reminder time</Text>
              <TouchableOpacity
                style={[
                  notifStyles.timeRow,
                  !prefs.enabled && notifStyles.optionGroupDisabled,
                ]}
                onPress={() => setTimePickerOpen(true)}
                disabled={!prefs.enabled || submitting}
                activeOpacity={0.7}
              >
                <Text style={notifStyles.timeRowLabel}>Remind me at</Text>
                <Text style={notifStyles.timeRowValue}>
                  {formatTime(prefs.reminderHour, prefs.reminderMinute)}
                </Text>
              </TouchableOpacity>

              {timePickerOpen ? (
                <DateTimePicker
                  value={(() => {
                    const d = new Date();
                    d.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
                    return d;
                  })()}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selected) => {
                    if (Platform.OS === 'android') setTimePickerOpen(false);
                    if (event.type === 'set' && selected) {
                      void applyAndSave({
                        ...prefs,
                        reminderHour: selected.getHours(),
                        reminderMinute: selected.getMinutes(),
                      });
                    }
                  }}
                />
              ) : null}

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}
            </>
          )}

          <View style={styles.cardButtonRow}>
            <TouchableOpacity
              style={[styles.cardButton, styles.cardButtonPrimary]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.cardButtonPrimaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface TimingOptionProps {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}

function TimingOption({ label, active, disabled, onPress }: TimingOptionProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        notifStyles.optionRow,
        active && notifStyles.optionRowActive,
      ]}
    >
      <Text
        style={[
          notifStyles.optionLabel,
          active && notifStyles.optionLabelActive,
        ]}
      >
        {label}
      </Text>
      {active ? <Text style={notifStyles.optionCheck}>✓</Text> : null}
    </TouchableOpacity>
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
});

const notifStyles = StyleSheet.create({
  loading: {
    paddingVertical: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  toggleMain: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  toggleSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.borderDark,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: Colors.primary,
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.cardBackground,
  },
  switchThumbOn: {
    transform: [{ translateX: 20 }],
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  optionGroup: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    overflow: 'hidden',
  },
  optionGroupDisabled: {
    opacity: 0.4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionRowActive: {
    backgroundColor: Colors.primaryLight,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  optionLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  optionCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
  },
  timeRowLabel: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  timeRowValue: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
  },
});
