import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
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
  const [sheetOpen, setSheetOpen] = useState(false);
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
      />
    </>
  );
}

interface DropdownProps {
  visible: boolean;
  onClose: () => void;
}

function ProfileDropdown({
  visible,
  onClose,
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
          icon="⚙️"
          label="Settings"
          onPress={() => safeNavigate('Settings')}
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

        <View style={styles.aboutSection}>
          <Text style={styles.aboutHeader}>About</Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App</Text>
            <Text style={styles.aboutValue}>TaskMate: Home Manager</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>
              {Constants.expoConfig?.extra?.internalVersion ?? '4.010'}
            </Text>
          </View>
        </View>

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
