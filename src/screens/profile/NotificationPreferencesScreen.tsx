import { useCallback, useEffect, useState } from 'react';
import * as ExpoStatusBar from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useAppStore } from '../../stores/appStore';
import {
  cancelAllReminders,
  getNotificationPrefs,
  NotificationPrefs,
  scheduleAllTaskReminders,
  setNotificationPrefs,
} from '../../services/notificationService';
import { getTasks } from '../../services/taskService';
import ScreenHeader from '../../components/ScreenHeader';
import { Colors } from '../../constants/colors';

interface ExtendedNotificationPrefs extends NotificationPrefs {
  taskDueAlertsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number; // hour 0-23
  quietHoursEnd: number; // hour 0-23
}

const DEFAULT_EXTENDED_PREFS: ExtendedNotificationPrefs = {
  enabled: true,
  timing: 'both',
  snoozeDuration: '1day',
  reminderHour: 9,
  reminderMinute: 0,
  taskDueAlertsEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: 22, // 10 PM
  quietHoursEnd: 8, // 8 AM
};

function formatTime(hour: number, minute: number = 0): string {
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = minute.toString().padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

function formatHour(hour: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:00 ${ampm}`;
}

export default function NotificationPreferencesScreen() {
  const currentUser = useAppStore((s) => s.currentUser);
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const [prefs, setPrefs] = useState<ExtendedNotificationPrefs>(DEFAULT_EXTENDED_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);
  const [showQuietStartPicker, setShowQuietStartPicker] = useState(false);
  const [showQuietEndPicker, setShowQuietEndPicker] = useState(false);

  // Set dark status bar for light background screen
  useFocusEffect(
    useCallback(() => {
      ExpoStatusBar.setStatusBarStyle('dark');
      return () => {
        ExpoStatusBar.setStatusBarStyle('light');
      };
    }, [])
  );

  useEffect(() => {
    if (!currentUser?.uid) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    getNotificationPrefs(currentUser.uid)
      .then((p) => {
        if (cancelled) return;
        // Merge with extended defaults
        setPrefs({
          ...DEFAULT_EXTENDED_PREFS,
          ...p,
        });
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
  }, [currentUser?.uid]);

  const savePrefs = async (next: ExtendedNotificationPrefs) => {
    if (!currentUser?.uid) return;
    setPrefs(next);
    setSaving(true);
    setError(null);

    try {
      await setNotificationPrefs(currentUser.uid, next);

      if (!next.enabled) {
        await cancelAllReminders();
      } else if (householdId) {
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
      setError(err.message ?? 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleReminderTimeChange = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === 'android') setShowReminderTimePicker(false);
    if (event.type === 'set' && selected) {
      void savePrefs({
        ...prefs,
        reminderHour: selected.getHours(),
        reminderMinute: selected.getMinutes(),
      });
    }
  };

  const handleQuietStartChange = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === 'android') setShowQuietStartPicker(false);
    if (event.type === 'set' && selected) {
      void savePrefs({
        ...prefs,
        quietHoursStart: selected.getHours(),
      });
    }
  };

  const handleQuietEndChange = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === 'android') setShowQuietEndPicker(false);
    if (event.type === 'set' && selected) {
      void savePrefs({
        ...prefs,
        quietHoursEnd: selected.getHours(),
      });
    }
  };

  return (
    <>
      <View style={styles.screen}>
        <ScreenHeader title="Notifications" leftLabel="Back" />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Task Alerts Section */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>TASK ALERTS</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleMain}>
                  <Text style={styles.toggleLabel}>Task Due Alerts</Text>
                  <Text style={styles.toggleSubtext}>
                    Show alert modal on home screen for tasks due today
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    savePrefs({
                      ...prefs,
                      taskDueAlertsEnabled: !prefs.taskDueAlertsEnabled,
                    })
                  }
                  disabled={saving}
                  activeOpacity={0.7}
                  style={[
                    styles.switch,
                    prefs.taskDueAlertsEnabled && styles.switchOn,
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      prefs.taskDueAlertsEnabled && styles.switchThumbOn,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Advance Reminders Section */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>ADVANCE REMINDERS</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleMain}>
                  <Text style={styles.toggleLabel}>Enable Advance Reminders</Text>
                  <Text style={styles.toggleSubtext}>
                    Get push notifications before tasks are due
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    savePrefs({
                      ...prefs,
                      enabled: !prefs.enabled,
                    })
                  }
                  disabled={saving}
                  activeOpacity={0.7}
                  style={[
                    styles.switch,
                    prefs.enabled && styles.switchOn,
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      prefs.enabled && styles.switchThumbOn,
                    ]}
                  />
                </TouchableOpacity>
              </View>

              {prefs.enabled ? (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => setShowReminderTimePicker(true)}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.settingLabel}>Default Reminder Time</Text>
                    <Text style={styles.settingValue}>
                      {formatTime(prefs.reminderHour, prefs.reminderMinute)}
                    </Text>
                  </TouchableOpacity>

                  {showReminderTimePicker ? (
                    <DateTimePicker
                      value={(() => {
                        const d = new Date();
                        d.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
                        return d;
                      })()}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleReminderTimeChange}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          </View>

          {/* Quiet Hours Section */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>QUIET HOURS</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleMain}>
                  <Text style={styles.toggleLabel}>Quiet Hours</Text>
                  <Text style={styles.toggleSubtext}>
                    No notifications during these hours
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    savePrefs({
                      ...prefs,
                      quietHoursEnabled: !prefs.quietHoursEnabled,
                    })
                  }
                  disabled={saving}
                  activeOpacity={0.7}
                  style={[
                    styles.switch,
                    prefs.quietHoursEnabled && styles.switchOn,
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      prefs.quietHoursEnabled && styles.switchThumbOn,
                    ]}
                  />
                </TouchableOpacity>
              </View>

              {prefs.quietHoursEnabled ? (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => setShowQuietStartPicker(true)}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.settingLabel}>Start Time</Text>
                    <Text style={styles.settingValue}>
                      {formatHour(prefs.quietHoursStart)}
                    </Text>
                  </TouchableOpacity>

                  {showQuietStartPicker ? (
                    <DateTimePicker
                      value={(() => {
                        const d = new Date();
                        d.setHours(prefs.quietHoursStart, 0, 0, 0);
                        return d;
                      })()}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleQuietStartChange}
                    />
                  ) : null}

                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => setShowQuietEndPicker(true)}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.settingLabel}>End Time</Text>
                    <Text style={styles.settingValue}>
                      {formatHour(prefs.quietHoursEnd)}
                    </Text>
                  </TouchableOpacity>

                  {showQuietEndPicker ? (
                    <DateTimePicker
                      value={(() => {
                        const d = new Date();
                        d.setHours(prefs.quietHoursEnd, 0, 0, 0);
                        return d;
                      })()}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleQuietEndChange}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          </View>

          {/* Per-Task Overrides Section */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>PER-TASK OVERRIDES</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoIcon}>💡</Text>
              <Text style={styles.infoText}>
                Individual task reminders can be adjusted from each task's edit screen
              </Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {saving ? (
            <View style={styles.savingIndicator}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.savingText}>Saving...</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  toggleMain: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  toggleSubtext: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  switch: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.borderDark,
    padding: 2,
    justifyContent: 'center',
  },
  switchOn: {
    backgroundColor: Colors.primary,
  },
  switchThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.cardBackground,
  },
  switchThumbOn: {
    transform: [{ translateX: 20 }],
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  settingValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  infoCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: Colors.needsAttentionBg,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  savingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
});
