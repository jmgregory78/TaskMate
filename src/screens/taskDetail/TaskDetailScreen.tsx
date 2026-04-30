import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { differenceInCalendarDays, format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import {
  assignTask,
  completeTask,
  deleteTask,
  getActivityLog,
  getTask,
} from '../../services/taskService';
import { getFirstName } from '../../utils/nameUtils';
import { sendAssignmentNotification } from '../../services/notificationService';
import {
  deductProductUsage,
  flagPurchasePending,
  getProducts,
  getProductUsagesForTask,
  removeProductUsageFromTask,
  updateProductUsage,
} from '../../services/productService';
import { recurrenceSummary } from '../../utils/recurrence';
import {
  Product,
  Task,
  TaskActivity,
  TaskProductUsage,
} from '../../types/models';
import InventoryBar from '../../components/InventoryBar';
import CompleteTaskSheet from '../../components/CompleteTaskSheet';
import EditProductUsageSheet from '../../components/EditProductUsageSheet';
import {
  Assignee,
  AssigneePickerSheet,
} from '../../components/AssigneeSelector';
import { Colors } from '../../constants/colors';

type TaskDetailRoute = RouteProp<{ TaskDetail: { taskId: string } }, 'TaskDetail'>;

const URGENCY_COLORS = {
  overdue: Colors.urgencyRed,
  soon: Colors.urgencyOrange,
  mid: Colors.urgencyBlue,
  far: Colors.urgencyGray,
} as const;

const ACTIVITY_ICONS: Record<TaskActivity['type'], string> = {
  completed: '✅',
  created: '➕',
  edited: '📝',
  assigned: '👤',
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[1][0] ?? '')).toUpperCase();
}

function dueInfo(nextDueDate: Date): { label: string; color: string } {
  const days = differenceInCalendarDays(nextDueDate, new Date());
  if (days < 0) {
    const overdueBy = Math.abs(days);
    return {
      label: `Overdue by ${overdueBy} ${overdueBy === 1 ? 'day' : 'days'}`,
      color: URGENCY_COLORS.overdue,
    };
  }
  if (days === 0) return { label: 'Due today', color: URGENCY_COLORS.soon };
  if (days === 1) return { label: 'Due tomorrow', color: URGENCY_COLORS.soon };
  if (days <= 3)
    return { label: `Due in ${days} days`, color: URGENCY_COLORS.soon };
  if (days <= 14)
    return { label: `Due in ${days} days`, color: URGENCY_COLORS.mid };
  return { label: `Due in ${days} days`, color: URGENCY_COLORS.far };
}

export default function TaskDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<TaskDetailRoute>();
  const { taskId } = route.params;
  const { user } = useAuth();
  const householdId = useAppStore((s) => s.currentHouseholdId);

  const [task, setTask] = useState<Task | null>(null);
  const [productUsages, setProductUsages] = useState<TaskProductUsage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [assigneeSheetVisible, setAssigneeSheetVisible] = useState(false);
  const [editUsageId, setEditUsageId] = useState<string | null>(null);

  const currentAssignee = useMemo<Assignee | null>(() => {
    if (!task?.assignedTo) return null;
    return {
      userId: task.assignedTo,
      name: task.assignedToName ?? task.assignedTo,
    };
  }, [task?.assignedTo, task?.assignedToName]);

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      setLoading(true);
      setError(null);
      Promise.all([
        getTask(householdId, taskId),
        getProductUsagesForTask(householdId, taskId),
        getProducts(householdId),
        getActivityLog(householdId, taskId),
      ])
        .then(([t, usages, allProducts, activityLog]) => {
          if (cancelled) return;
          setTask(t);
          setProductUsages(usages);
          setProducts(allProducts);
          setActivity(activityLog);
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

  const handleBuyOnAmazon = async (product: Product) => {
    if (!householdId) return;
    try {
      await flagPurchasePending(householdId, product.id);
    } catch (e) {
      console.warn('[TaskDetail] flagPurchasePending failed:', e);
    }
    try {
      const supported = await Linking.canOpenURL(product.amazonUrl);
      if (supported) await Linking.openURL(product.amazonUrl);
      else Alert.alert('Cannot open URL', product.amazonUrl);
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Could not open link', err.message ?? String(e));
    }
  };

  const handleOpenComplete = () => {
    if (!task || actionPending || task.completedToday) return;
    setSheetVisible(true);
  };

  const refreshTask = async () => {
    if (!householdId) return;
    const [refreshed, refreshedUsages, refreshedProducts, refreshedActivity] =
      await Promise.all([
        getTask(householdId, taskId),
        getProductUsagesForTask(householdId, taskId),
        getProducts(householdId),
        getActivityLog(householdId, taskId),
      ]);
    if (refreshed) setTask(refreshed);
    setProductUsages(refreshedUsages);
    setProducts(refreshedProducts);
    setActivity(refreshedActivity);
    return refreshed;
  };

  const runComplete = async (deductInventory: boolean) => {
    if (!task || !user || !householdId || actionPending) return;
    setActionPending(true);
    try {
      if (deductInventory) {
        await Promise.all(
          productUsages.map((usage) =>
            deductProductUsage(householdId, usage.productId, usage.usageAmount)
          )
        );
      }
      const note =
        deductInventory && productUsages.length > 0
          ? `Used ${productUsages
              .map(
                (u) =>
                  `${u.usageAmount} ${u.usageUnit} ${u.productName}`.trim()
              )
              .join(', ')}`
          : undefined;
      await completeTask(
        householdId,
        taskId,
        user.displayName ?? user.email ?? user.uid,
        note
      );
      setSheetVisible(false);
      const refreshed = await refreshTask();
      if (refreshed) {
        setSuccessBanner(
          `✅ Task completed! Next due: ${format(refreshed.nextDueDate, 'MMM d, yyyy')}`
        );
      }
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Error', err.message ?? 'Failed to complete task');
    } finally {
      setActionPending(false);
    }
  };

  const handleConfirmComplete = () => {
    void runComplete(true);
  };

  const handleConfirmWithoutLogging = () => {
    void runComplete(false);
  };

  const handleCancelComplete = () => {
    setSheetVisible(false);
  };

  const handleSaveUsage = async (newAmount: number) => {
    if (!householdId || !editUsageId) return;
    await updateProductUsage(householdId, taskId, editUsageId, newAmount);
    setEditUsageId(null);
    await refreshTask();
  };

  const handleRemoveUsage = (usage: TaskProductUsage) => {
    if (!householdId) return;
    const productName = usage.productName;
    Alert.alert(
      'Remove supply',
      `Remove ${productName} from this task? The supply will remain in your household library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeProductUsageFromTask(householdId, taskId, usage.id);
              await refreshTask();
            } catch (e) {
              const err = e as { message?: string };
              Alert.alert('Error', err.message ?? 'Failed to remove supply');
            }
          },
        },
      ]
    );
  };

  const handleAssigneeSelected = async (next: Assignee | null) => {
    if (!task || !user || !householdId) return;
    if ((next?.userId ?? null) === (task.assignedTo ?? null)) return;
    try {
      await assignTask(
        householdId,
        taskId,
        next?.userId ?? null,
        next?.name ?? null,
        user.uid,
        user.displayName ?? user.email ?? user.uid
      );
      if (next && next.userId !== user.uid) {
        void sendAssignmentNotification(
          next.userId,
          task.name,
          task.icon ?? '📋',
          getFirstName(user.displayName ?? user.email ?? user.uid),
          householdId,
          taskId
        );
      }
      await refreshTask();
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert('Error', err.message ?? 'Failed to update assignee');
    }
  };

  const handleDelete = () => {
    if (!task || !householdId || actionPending) return;
    Alert.alert(
      `Delete ${task.name}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionPending(true);
            try {
              await deleteTask(householdId, taskId);
              navigation.goBack();
            } catch (e) {
              const err = e as { message?: string };
              Alert.alert('Error', err.message ?? 'Failed to delete task');
              setActionPending(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Task not found'}</Text>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.linkButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const due = dueInfo(task.nextDueDate);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.cancel}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
      </View>

      {successBanner ? (
        <View style={styles.completedBanner}>
          <Text style={styles.completedBannerText}>{successBanner}</Text>
        </View>
      ) : task.completedToday ? (
        <View style={styles.completedBanner}>
          <Text style={styles.completedBannerText}>
            ✅ Completed today! Next due:{' '}
            {format(task.nextDueDate, 'MMM d, yyyy')}
          </Text>
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <Text style={styles.icon}>{task.icon ?? '📋'}</Text>
        <Text style={styles.taskName}>{task.name}</Text>
        <Text style={[styles.due, { color: due.color }]}>{due.label}</Text>
        <Text style={styles.recurrence}>
          {recurrenceSummary(task.recurrence, task.firstDueDate)}
        </Text>
      </View>

      {task.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Description</Text>
          <Text style={styles.bodyText}>{task.description}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Schedule</Text>
        <Text style={styles.bodyText}>
          Next due: {format(task.nextDueDate, 'EEEE, MMMM d, yyyy')}
        </Text>
        {task.lastCompletedAt ? (
          <Text style={styles.bodyText}>
            Last completed: {format(task.lastCompletedAt, 'MMM d, yyyy')}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Inventory & Supplies</Text>
        {productUsages.length === 0 ? (
          <Text style={[styles.placeholderText, styles.suppliesEmpty]}>
            No supplies linked yet.
          </Text>
        ) : (
          productUsages.map((usage) => {
            const product = products.find((p) => p.id === usage.productId);
            const displayName = product?.name ?? usage.productName;
            return (
              <View key={usage.id} style={styles.productCard}>
                <View style={styles.productHeaderRow}>
                  <Text style={styles.productName}>{displayName}</Text>
                  {product ? (
                    <TouchableOpacity
                      style={styles.buyPill}
                      onPress={() => handleBuyOnAmazon(product)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.buyPillText}>Buy</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.productMeta}>
                    Uses {usage.usageAmount} {usage.usageUnit} per completion
                  </Text>
                  <View style={styles.usageActions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => setEditUsageId(usage.id)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.iconButtonText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRemoveUsage(usage)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {product ? (
                  <>
                    <View style={styles.productBar}>
                      <InventoryBar product={product} />
                    </View>
                    <Text style={styles.productMeta}>
                      Shared supply · {product.currentQuantity}{' '}
                      {product.containerUnit} on hand total
                    </Text>
                    {product.lastPurchasedAt ? (
                      <Text style={styles.productMeta}>
                        Last bought: {format(product.lastPurchasedAt, 'MMM d')}
                        {product.lastPurchasePrice != null
                          ? ` · $${product.lastPurchasePrice.toFixed(2)}`
                          : ''}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.logButton}
                      onPress={() =>
                        (navigation as any).navigate('LogPurchase', {
                          householdId,
                          productId: product.id,
                        })
                      }
                      activeOpacity={0.8}
                    >
                      <Text style={styles.logButtonText}>Log Purchase</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.productMeta}>
                    ⚠️ Linked supply not found
                  </Text>
                )}
              </View>
            );
          })
        )}
        <TouchableOpacity
          style={styles.addSupplyButton}
          onPress={() =>
            (navigation as any).navigate('AddProductUsage', {
              householdId,
              taskId,
            })
          }
          activeOpacity={0.8}
        >
          <Text style={styles.addSupplyButtonText}>➕ Add Supply</Text>
        </TouchableOpacity>
      </View>

      {task.completedToday ? (
        <View style={[styles.completeButton, styles.completeButtonDone]}>
          <Text style={styles.completeButtonText}>Completed ✓</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.completeButton, actionPending && styles.disabled]}
          onPress={handleOpenComplete}
          disabled={actionPending}
          activeOpacity={0.8}
        >
          <Text style={styles.completeButtonText}>Mark as Complete</Text>
        </TouchableOpacity>
      )}

      <View style={styles.assignmentRow}>
        {currentAssignee ? (
          <>
            <View style={styles.assignmentAvatar}>
              <Text style={styles.assignmentAvatarText}>
                {initialsFor(currentAssignee.name)}
              </Text>
            </View>
            <Text style={styles.assignmentText}>
              👤 Assigned to{' '}
              {currentAssignee.userId === user?.uid
                ? 'you'
                : getFirstName(currentAssignee.name)}
            </Text>
          </>
        ) : (
          <Text style={styles.assignmentTextMuted}>👤 Unassigned</Text>
        )}
        <TouchableOpacity
          style={styles.reassignButton}
          onPress={() => setAssigneeSheetVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.reassignButtonText}>Reassign</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => {
          if (!householdId) return;
          (navigation as any).navigate('EditTask', {
            taskId,
            householdId,
          });
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.editButtonText}>Edit Task</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Activity</Text>
        {activity.length === 0 ? (
          <Text style={[styles.placeholderText, styles.activityEmpty]}>
            No activity yet
          </Text>
        ) : (
          activity.map((a, idx) => (
            <View
              key={a.id}
              style={[
                styles.activityRow,
                idx < activity.length - 1 && styles.activityRowDivider,
              ]}
            >
              <Text style={styles.activityIcon}>{ACTIVITY_ICONS[a.type]}</Text>
              <View style={styles.activityBody}>
                <Text style={styles.activityTitle}>
                  {a.type === 'assigned' && a.note
                    ? a.note
                    : `${getFirstName(a.performedBy)} ${a.type} this task`}
                </Text>
                <Text style={styles.activityDate}>
                  {format(a.performedAt, 'MMM d, yyyy · h:mm a')}
                </Text>
                {a.type !== 'assigned' && a.note ? (
                  <Text style={styles.activityNote}>{a.note}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity
        style={styles.deleteLink}
        onPress={handleDelete}
        disabled={actionPending}
        activeOpacity={0.7}
      >
        <Text style={styles.deleteLinkText}>🗑️ Delete Task</Text>
      </TouchableOpacity>
      </ScrollView>
      <CompleteTaskSheet
        visible={sheetVisible}
        task={task}
        productUsages={productUsages}
        products={products}
        onConfirm={handleConfirmComplete}
        onConfirmWithoutLogging={handleConfirmWithoutLogging}
        onCancel={handleCancelComplete}
      />
      {householdId ? (
        <AssigneePickerSheet
          visible={assigneeSheetVisible}
          householdId={householdId}
          currentAssignee={currentAssignee}
          onSelect={(next) => {
            void handleAssigneeSelected(next);
          }}
          onClose={() => setAssigneeSheetVisible(false)}
        />
      ) : null}
      <EditProductUsageSheet
        visible={editUsageId !== null}
        usage={
          editUsageId
            ? (productUsages.find((u) => u.id === editUsageId) ?? null)
            : null
        }
        product={(() => {
          const u = editUsageId
            ? productUsages.find((x) => x.id === editUsageId)
            : null;
          return u ? (products.find((p) => p.id === u.productId) ?? null) : null;
        })()}
        onSave={handleSaveUsage}
        onCancel={() => setEditUsageId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  content: {
    paddingBottom: 64,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: Colors.headerBackground,
  },
  headerSpacer: {
    width: 56,
  },
  cancel: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '600',
  },
  titleBlock: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 28,
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
    marginBottom: 8,
  },
  due: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  recurrence: {
    fontSize: 14,
    color: Colors.textOnDarkMuted,
  },
  section: {
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
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  activityEmpty: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  activityRow: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  activityRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activityIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  activityBody: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  activityDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  activityNote: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  productCard: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  productBar: {
    marginBottom: 8,
  },
  productMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  productHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  usageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  iconButtonText: {
    fontSize: 16,
  },
  removeText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  suppliesEmpty: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  buyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  buyPillText: {
    color: Colors.textOnDark,
    fontSize: 13,
    fontWeight: '600',
  },
  logButton: {
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    marginTop: 8,
  },
  logButtonText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  addSupplyButton: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  addSupplyButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  completeButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginHorizontal: 16,
  },
  completeButtonDone: {
    backgroundColor: '#86EFAC',
  },
  completeButtonText: {
    color: Colors.textOnDark,
    fontSize: 17,
    fontWeight: '700',
  },
  completedBanner: {
    backgroundColor: Colors.successBg,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  completedBannerText: {
    color: Colors.successText,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  editButton: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: Colors.cardBackground,
  },
  editButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  assignmentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentAvatarText: {
    color: Colors.textOnDark,
    fontWeight: '700',
    fontSize: 12,
  },
  assignmentText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  assignmentTextMuted: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  reassignButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    backgroundColor: Colors.cardBackground,
  },
  reassignButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  deleteLink: {
    alignItems: 'center',
    marginTop: 32,
    paddingVertical: 8,
  },
  deleteLinkText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  linkButton: {
    paddingVertical: 8,
  },
  linkButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
