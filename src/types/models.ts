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

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

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
  reminderDaysBefore: number;
  snoozedUntil: Date | null;
}

export interface Product {
  id: string;
  householdId: string;
  name: string;
  amazonUrl: string;
  containerSize: number;
  containerUnit: string;
  currentQuantity: number;
  lowThresholdPercent: number;
  lastPurchasedAt: Date | null;
  lastPurchasePrice: number | null;
  purchasePending: boolean;
  purchasePendingAt: Date | null;
  createdAt: Date;
  createdBy: string;
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
  containerSize: number;
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

export function stockPercent(product: Product): number {
  if (!product.containerSize || product.containerSize <= 0) return 0;
  return Math.min(
    100,
    Math.round((product.currentQuantity / product.containerSize) * 100)
  );
}
