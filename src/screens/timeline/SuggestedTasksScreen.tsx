import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useAppStore } from '../../stores/appStore';
import { getTasks } from '../../services/taskService';
import { RecurrenceFrequency } from '../../types/models';
import { SUGGESTED_TASKS, SuggestedTask } from '../../data/suggested';
import ScreenHeader from '../../components/ScreenHeader';
import { Colors } from '../../constants/colors';

function recurrenceLabel(frequency: RecurrenceFrequency, interval: number): string {
  const unit =
    frequency === 'daily'
      ? 'day'
      : frequency === 'weekly'
        ? 'week'
        : frequency === 'monthly'
          ? 'month'
          : 'year';
  return `Every ${interval} ${unit}${interval > 1 ? 's' : ''}`;
}

type SuggestedRoute = RouteProp<
  { SuggestedTasks: { preSelected?: string } | undefined },
  'SuggestedTasks'
>;

export default function SuggestedTasksScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<SuggestedRoute>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const preSelected = route.params?.preSelected ?? null;
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      getTasks(householdId)
        .then((tasks) => {
          if (cancelled) return;
          setExistingNames(
            new Set(tasks.map((t) => t.name.trim().toLowerCase()))
          );
        })
        .catch((e) => {
          console.warn('[SuggestedTasksScreen] getTasks failed:', e);
        });
      return () => {
        cancelled = true;
      };
    }, [householdId])
  );

  const handleTap = (t: SuggestedTask) => {
    navigation.navigate('AddTask', {
      prefill: {
        name: t.name,
        category: t.category,
        frequency: t.frequency,
        interval: t.interval,
        reminderDaysBefore: t.reminderDaysBefore,
      },
    });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Suggested Tasks" leftLabel="Back" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {SUGGESTED_TASKS.map((cat) => (
          <View key={cat.id} style={styles.categoryBlock}>
            <Text style={styles.categoryTitle}>
              {cat.emoji} {cat.name}
            </Text>
            {cat.tasks.map((t) => {
              const added = existingNames.has(t.name.trim().toLowerCase());
              const highlighted = preSelected === t.name;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.taskRow,
                    highlighted && styles.taskRowHighlighted,
                  ]}
                  onPress={() => handleTap(t)}
                  activeOpacity={0.7}
                >
                  {t.icon ? (
                    <Text style={styles.taskIcon}>{t.icon}</Text>
                  ) : null}
                  <View style={styles.taskTextWrap}>
                    <View style={styles.taskNameRow}>
                      <Text style={styles.taskName}>{t.name}</Text>
                      {added ? (
                        <Text style={styles.addedBadge}>✅ Added</Text>
                      ) : null}
                    </View>
                    <Text style={styles.taskRecurrence}>
                      {recurrenceLabel(t.frequency, t.interval)}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
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
  taskRow: {
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
  taskRowHighlighted: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  taskIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  taskTextWrap: {
    flex: 1,
  },
  taskNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  taskName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  addedBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.urgencyGreen,
  },
  taskRecurrence: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: Colors.textMuted,
    marginLeft: 8,
  },
});
