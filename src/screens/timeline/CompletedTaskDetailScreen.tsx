import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { format } from 'date-fns';
import { useAppStore } from '../../stores/appStore';
import {
  getCompletions,
  getTask,
} from '../../services/taskService';
import {
  getProducts,
  getProductUsagesForTask,
} from '../../services/productService';
import { recurrenceSummary } from '../../utils/recurrence';
import { getFirstName } from '../../utils/nameUtils';
import {
  Product,
  Task,
  TaskCompletion,
  TaskProductUsage,
} from '../../types/models';
import InventoryBar from '../../components/InventoryBar';
import ScreenHeader from '../../components/ScreenHeader';
import { Colors } from '../../constants/colors';

type CompletedTaskDetailRoute = RouteProp<
  { CompletedTaskDetail: { taskId: string; task: Task } },
  'CompletedTaskDetail'
>;

export default function CompletedTaskDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<CompletedTaskDetailRoute>();
  const { taskId, task: initialTask } = route.params;
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const [task, setTask] = useState<Task>(initialTask);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [productUsages, setProductUsages] = useState<TaskProductUsage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      setLoading(true);
      setError(null);

      Promise.all([
        getTask(householdId, taskId),
        getCompletions(householdId, taskId),
        getProductUsagesForTask(householdId, taskId),
        getProducts(householdId),
      ])
        .then(([refreshedTask, completionHistory, usages, allProducts]) => {
          if (cancelled) return;
          if (refreshedTask) setTask(refreshedTask);
          setCompletions(completionHistory);
          setProductUsages(usages);
          setProducts(allProducts);
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          const err = e as { message?: string };
          setError(err.message ?? String(e));
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [householdId, taskId])
  );

  // Get the most recent completion (today's completion)
  const todayCompletion = completions.length > 0 ? completions[0] : null;

  if (loading) {
    return (
      <>
        <ScreenHeader title="" leftLabel="Back" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <ScreenHeader title="" leftLabel="Back" />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="" leftLabel="Back" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={styles.icon}>{task.icon ?? '📋'}</Text>
          <Text style={styles.taskName}>{task.name}</Text>
        </View>

        {/* Card 1: Completion status */}
        <View style={styles.card}>
          <View style={styles.completionStatusRow}>
            <Text style={styles.completionCheckmark}>✅</Text>
            <View style={styles.completionStatusContent}>
              <Text style={styles.completionStatusText}>
                Completed today at{' '}
                {task.completedAt
                  ? format(task.completedAt, 'h:mm a')
                  : 'earlier'}
              </Text>
              {todayCompletion ? (
                <Text style={styles.completedByText}>
                  Completed by: {getFirstName(todayCompletion.displayName)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Card 2: Completion note */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>📝 Your note:</Text>
          {todayCompletion?.note ? (
            <Text style={styles.noteText}>"{todayCompletion.note}"</Text>
          ) : task.lastCompletionNote ? (
            <Text style={styles.noteText}>"{task.lastCompletionNote}"</Text>
          ) : (
            <Text style={styles.noNoteText}>No note added</Text>
          )}
        </View>

        {/* Card 3: Next occurrence */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>📅 Next due:</Text>
          <Text style={styles.nextDueText}>
            {format(task.nextDueDate, 'EEEE, MMMM d, yyyy')}
          </Text>
          <Text style={styles.recurrenceText}>
            Repeats {recurrenceSummary(task.recurrence, task.firstDueDate).toLowerCase()}
          </Text>
        </View>

        {/* Card 4: Linked supplies */}
        {productUsages.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardHeader}>📦 Linked Supplies</Text>
            {productUsages.map((usage) => {
              const product = products.find((p) => p.id === usage.productId);
              return (
                <View key={usage.id} style={styles.supplyRow}>
                  <Text style={styles.supplyName}>
                    {product?.name ?? usage.productName}
                  </Text>
                  {product ? (
                    <>
                      <View style={styles.supplyBarWrap}>
                        <InventoryBar product={product} compact />
                      </View>
                      <Text style={styles.supplyRemaining}>
                        {product.currentQuantity} {product.containerUnit} remaining after this use
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.supplyNotFound}>
                      Supply not found
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Card 5: Task details */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>ℹ️ Task Details</Text>
          <Text style={styles.detailText}>
            Created {format(task.createdAt, 'MMMM d, yyyy')}
          </Text>
          <Text style={styles.detailText}>
            {recurrenceSummary(task.recurrence, task.firstDueDate)}
          </Text>
          {task.notes ? (
            <>
              <Text style={styles.notesLabel}>Notes:</Text>
              <Text style={styles.persistentNotes}>{task.notes}</Text>
            </>
          ) : null}
        </View>

        {/* Footer message */}
        <Text style={styles.footerText}>
          To edit this task, find it in your upcoming tasks
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  content: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  titleBlock: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
    backgroundColor: Colors.headerBackground,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  taskName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  completionStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  completionCheckmark: {
    fontSize: 24,
    marginRight: 12,
  },
  completionStatusContent: {
    flex: 1,
  },
  completionStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.successText,
    marginBottom: 4,
  },
  completedByText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  noteText: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  noNoteText: {
    fontSize: 14,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  nextDueText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  recurrenceText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  supplyRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  supplyName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  supplyBarWrap: {
    marginBottom: 6,
  },
  supplyRemaining: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  supplyNotFound: {
    fontSize: 13,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  detailText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 12,
    marginBottom: 4,
  },
  persistentNotes: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 24,
    marginHorizontal: 32,
    lineHeight: 18,
  },
});
