export interface User {
  uid: string;
  email: string;
  displayName: string | null;
  householdIds: string[];
}

export interface Household {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
}

export interface HouseholdMember {
  userId: string;
  email: string;
  displayName: string | null;
  role: 'owner' | 'member' | 'viewer';
  joinedAt: Date;
}

export type HouseholdInviteRole = 'member' | 'viewer';

export interface HouseholdInvite {
  id: string;
  householdId: string;
  householdName: string;
  code: string;
  role: HouseholdInviteRole;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  usedBy: string | null;
  usedAt: Date | null;
  revoked: boolean;
}

export type TaskCategory =
  | 'Kitchen'
  | 'Bathroom'
  | 'Bedroom'
  | 'Living Room'
  | 'Laundry'
  | 'Garage'
  | 'Shed'
  | 'Outdoor'
  | 'Vehicles'
  | 'Equipment'
  | 'Other';

export const TASK_CATEGORIES: TaskCategory[] = [
  'Kitchen',
  'Bathroom',
  'Bedroom',
  'Living Room',
  'Laundry',
  'Garage',
  'Shed',
  'Outdoor',
  'Vehicles',
  'Equipment',
  'Other',
];

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type MonthlyWeek = 'first' | 'second' | 'third' | 'fourth' | 'last';

export interface MonthlyWeekday {
  week: MonthlyWeek;
  day: number;
}

export type RecurrenceEndType = 'none' | 'afterOccurrences' | 'byDate';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  monthlyType?: 'dayOfMonth' | 'dayOfWeek';
  monthlyDay?: number;
  monthlyWeekday?: MonthlyWeekday;
  endType?: RecurrenceEndType;
  endAfterOccurrences?: number;
  endByDate?: Date;
}

export interface Task {
  id: string;
  householdId: string;
  name: string;
  category: TaskCategory;
  location?: string;
  description?: string;
  firstDueDate: Date;
  recurrence: RecurrenceRule;
  nextDueDate: Date;
  lastCompletedAt: Date | null;
  lastCompletedBy: string | null;
  lastCompletedByName: string | null;
  hasInventory: boolean;
  instructions: null;
  icon?: string;
  completedToday: boolean;
  completedAt: Date | null;
  createdAt: Date;
  createdBy: string;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedAt: Date | null;
  assignedBy: string | null;
  reminderDaysBefore: number | null;
  reminderHour?: number;
  reminderMinute?: number;
  snoozedUntil: Date | null;
  pendingNotificationId: string | null;
  // Notes fields
  notes?: string;
  nextTimeReminder?: string;
  lastCompletionNote?: string;
  // End condition tracking
  completedOccurrences?: number;
  isEnded?: boolean;
}

export interface TaskCompletion {
  id: string;
  completedAt: Date;
  completedBy: string;
  displayName: string;
  note: string;
  remindNextTime: boolean;
}

export type DepletionMode = 'task' | 'auto';
export type AutoDepletionUnit = 'day' | 'week' | 'month';
export type ThresholdType = 'quantity' | 'percentage';

export interface Product {
  id: string;
  householdId: string;
  name: string;
  amazonUrl: string;
  containerUnit: string;
  currentQuantity: number;
  // Threshold fields (new unified approach)
  thresholdType: ThresholdType;
  thresholdValue: number;
  // Legacy fields (kept for backwards compatibility during migration)
  lowThresholdPercent: number;
  lowThresholdQty: number | null;
  lastPurchasedAt: Date | null;
  lastPurchasePrice: number | null;
  purchasePending: boolean;
  purchasePendingAt: Date | null;
  createdAt: Date;
  createdBy: string;
  // Auto-depletion fields
  depletionMode: DepletionMode;
  autoDepletionRate: number;
  autoDepletionUnit: AutoDepletionUnit;
  lastAutoDepletedAt: Date | null;
  lowStockNotifiedAt: Date | null;
}

export type TaskActivityType =
  | 'completed'
  | 'created'
  | 'edited'
  | 'assigned';

export interface TaskActivity {
  id: string;
  taskId: string;
  householdId: string;
  type: TaskActivityType;
  performedBy: string;
  performedAt: Date;
  note?: string;
}

export interface TaskProductUsage {
  id: string;
  taskId: string;
  productId: string;
  productName: string;
  usageAmount: number;
  usageUnit: string;
}

export interface StockAudit {
  id: string;
  previousQuantity: number;
  newQuantity: number;
  difference: number;
  note: string;
  updatedBy: string;
  updatedAt: Date;
  containerUnit: string;
}

export interface PurchaseLog {
  id: string;
  productId: string;
  householdId: string;
  purchasedAt: Date;
  purchasedBy: string;
  price: number;
  quantity: number;
  containerUnit: string;
  totalAdded: number;
}

export interface FeedbackItem {
  id: string;
  userId: string;
  userEmail: string;
  subject: string;
  message: string;
  submittedAt: Date;
  read: boolean;
}

// stockPercent calculates percentage based on maxQuantity
// When maxQuantity is not provided, falls back to using currentQuantity (shows 100%)
// For accurate progress bars, pass maxQuantity from history records
export function stockPercent(product: Product, maxQuantity?: number): number {
  const max = maxQuantity && maxQuantity > 0 ? maxQuantity : product.currentQuantity;
  if (!max || max <= 0) return 100;
  return Math.min(
    100,
    Math.round((product.currentQuantity / max) * 100)
  );
}

export type SupplyHistoryEventType =
  | 'purchase'
  | 'task_completion'
  | 'manual_update'
  | 'auto_depletion_weekly';

export interface SupplyHistoryRecord {
  id: string;
  productId: string;
  date: Date;
  quantity: number;
  eventType: SupplyHistoryEventType;
  note?: string;
}

/**
 * Serialized version of RecurrenceRule for navigation params.
 * Date fields are converted to ISO strings.
 */
export interface SerializedRecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  monthlyType?: 'dayOfMonth' | 'dayOfWeek';
  monthlyDay?: number;
  monthlyWeekday?: MonthlyWeekday;
  endType?: RecurrenceEndType;
  endAfterOccurrences?: number;
  endByDate?: string;
}

/**
 * Serialized version of Task for navigation params.
 * All Date fields are converted to ISO strings to avoid
 * React Navigation's "Non-serializable values" warning.
 */
export interface SerializedTask {
  id: string;
  householdId: string;
  name: string;
  category: TaskCategory;
  location?: string;
  description?: string;
  firstDueDate: string;
  recurrence: SerializedRecurrenceRule;
  nextDueDate: string;
  lastCompletedAt: string | null;
  lastCompletedBy: string | null;
  lastCompletedByName: string | null;
  hasInventory: boolean;
  instructions: null;
  icon?: string;
  completedToday: boolean;
  completedAt: string | null;
  createdAt: string;
  createdBy: string;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  reminderDaysBefore: number | null;
  reminderHour?: number;
  reminderMinute?: number;
  snoozedUntil: string | null;
  pendingNotificationId: string | null;
  notes?: string;
  nextTimeReminder?: string;
  lastCompletionNote?: string;
  completedOccurrences?: number;
  isEnded?: boolean;
}

/**
 * Serialize a Task for navigation params.
 */
export function serializeTask(task: Task): SerializedTask {
  return {
    ...task,
    firstDueDate: task.firstDueDate.toISOString(),
    nextDueDate: task.nextDueDate.toISOString(),
    lastCompletedAt: task.lastCompletedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    assignedAt: task.assignedAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    recurrence: {
      ...task.recurrence,
      endByDate: task.recurrence.endByDate?.toISOString(),
    },
  };
}

/**
 * Deserialize a Task from navigation params.
 */
export function deserializeTask(serialized: SerializedTask): Task {
  return {
    ...serialized,
    firstDueDate: new Date(serialized.firstDueDate),
    nextDueDate: new Date(serialized.nextDueDate),
    lastCompletedAt: serialized.lastCompletedAt ? new Date(serialized.lastCompletedAt) : null,
    completedAt: serialized.completedAt ? new Date(serialized.completedAt) : null,
    createdAt: new Date(serialized.createdAt),
    assignedAt: serialized.assignedAt ? new Date(serialized.assignedAt) : null,
    snoozedUntil: serialized.snoozedUntil ? new Date(serialized.snoozedUntil) : null,
    recurrence: {
      ...serialized.recurrence,
      endByDate: serialized.recurrence.endByDate ? new Date(serialized.recurrence.endByDate) : undefined,
    },
  };
}
