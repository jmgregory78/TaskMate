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
import {
  RecurrenceFrequency,
  TaskCategory,
} from '../../types/models';
import ScreenHeader from '../../components/ScreenHeader';
import { Colors } from '../../constants/colors';

interface SuggestedTask {
  id: string;
  name: string;
  category: TaskCategory;
  frequency: RecurrenceFrequency;
  interval: number;
  reminderDaysBefore: number;
}

interface SuggestedCategory {
  id: string;
  emoji: string;
  name: string;
  tasks: SuggestedTask[];
}

const SUGGESTED: SuggestedCategory[] = [
  {
    id: 'vehicles',
    emoji: '🚗',
    name: 'Vehicles',
    tasks: [
      { id: 'oil-change', name: 'Oil Change', category: 'Vehicles', frequency: 'monthly', interval: 3, reminderDaysBefore: 7 },
      { id: 'rotate-tires', name: 'Rotate Tires', category: 'Vehicles', frequency: 'monthly', interval: 6, reminderDaysBefore: 7 },
      { id: 'tire-pressure', name: 'Check Tire Pressure', category: 'Vehicles', frequency: 'monthly', interval: 1, reminderDaysBefore: 1 },
      { id: 'wipers', name: 'Replace Windshield Wipers', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 7 },
      { id: 'car-wash', name: 'Car Wash & Detail', category: 'Vehicles', frequency: 'monthly', interval: 1, reminderDaysBefore: 1 },
      { id: 'car-registration', name: 'Car Registration Renewal', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 30 },
    ],
  },
  {
    id: 'home-systems',
    emoji: '🏠',
    name: 'Home Systems',
    tasks: [
      { id: 'hvac-filter', name: 'Replace HVAC Filter', category: 'Equipment', frequency: 'monthly', interval: 3, reminderDaysBefore: 3 },
      { id: 'hvac-service', name: 'Service HVAC Equipment', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'smoke-detectors', name: 'Test Smoke Detectors', category: 'Equipment', frequency: 'monthly', interval: 6, reminderDaysBefore: 3 },
      { id: 'water-heater', name: 'Flush Water Heater', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 7 },
      { id: 'gutters', name: 'Clean Gutters', category: 'Outdoor', frequency: 'monthly', interval: 6, reminderDaysBefore: 7 },
      { id: 'roof-inspect', name: 'Inspect Roof', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
    ],
  },
  {
    id: 'outdoor',
    emoji: '🌿',
    name: 'Outdoor',
    tasks: [
      { id: 'lawnmower', name: 'Service Lawnmower', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'sprinkler', name: 'Inspect Sprinkler System', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'mulch', name: 'Mulch Garden', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'window-cleaning', name: 'Window Cleaning', category: 'Outdoor', frequency: 'monthly', interval: 6, reminderDaysBefore: 3 },
    ],
  },
  {
    id: 'bath-kitchen',
    emoji: '🛁',
    name: 'Bathroom & Kitchen',
    tasks: [
      { id: 'seal-grout', name: 'Seal Grout', category: 'Bathroom', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'fridge-filter', name: 'Replace Refrigerator Filter', category: 'Kitchen', frequency: 'monthly', interval: 6, reminderDaysBefore: 3 },
      { id: 'dishwasher', name: 'Clean Dishwasher', category: 'Kitchen', frequency: 'monthly', interval: 1, reminderDaysBefore: 1 },
    ],
  },
  {
    id: 'finance',
    emoji: '💰',
    name: 'Finance & Admin',
    tasks: [
      { id: 'property-taxes', name: 'Pay Property Taxes', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 14 },
      { id: 'tax-return', name: 'File Tax Return', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30 },
      { id: 'home-insurance', name: 'Review Home Insurance', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30 },
      { id: 'hoa-fees', name: 'Pay HOA Fees', category: 'Other', frequency: 'monthly', interval: 1, reminderDaysBefore: 7 },
      { id: 'passport', name: 'Renew Passport', category: 'Other', frequency: 'yearly', interval: 10, reminderDaysBefore: 90 },
      { id: 'drivers-license', name: "Renew Driver's License", category: 'Other', frequency: 'yearly', interval: 4, reminderDaysBefore: 30 },
    ],
  },
];

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
        {SUGGESTED.map((cat) => (
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
