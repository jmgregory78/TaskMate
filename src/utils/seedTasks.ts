import { addDays } from 'date-fns';
import { createTask } from '../services/taskService';
import {
  addProductUsageToTask,
  createProduct,
} from '../services/productService';
import { RecurrenceFrequency, TaskCategory } from '../types/models';

interface SeedTask {
  name: string;
  category: TaskCategory;
  frequency: RecurrenceFrequency;
  interval: number;
  dueOffsetDays: number;
}

interface SeedSharedProduct {
  name: string;
  containerUnit: string;
  currentQuantity: number;
  amazonUrl: string;
}

interface SeedUsage {
  taskName: string;
  productName: string;
  usageAmount: number;
}

const SEED_TASKS: SeedTask[] = [
  // Vehicles
  { name: 'Oil Change – Honda CR-V', category: 'Vehicles', frequency: 'monthly', interval: 3, dueOffsetDays: 2 },
  { name: 'Rotate Tires – Honda CR-V', category: 'Vehicles', frequency: 'monthly', interval: 6, dueOffsetDays: 18 },
  { name: 'Car Wash & Detail', category: 'Vehicles', frequency: 'monthly', interval: 1, dueOffsetDays: 0 },
  { name: 'Check Tire Pressure', category: 'Vehicles', frequency: 'monthly', interval: 1, dueOffsetDays: -5 },
  { name: 'Replace Windshield Wipers', category: 'Vehicles', frequency: 'yearly', interval: 1, dueOffsetDays: 45 },

  // Kitchen
  { name: 'Replace Refrigerator Water Filter', category: 'Kitchen', frequency: 'monthly', interval: 6, dueOffsetDays: 45 },
  { name: 'Clean Dishwasher', category: 'Kitchen', frequency: 'monthly', interval: 1, dueOffsetDays: 10 },
  { name: 'Sharpen Kitchen Knives', category: 'Kitchen', frequency: 'monthly', interval: 3, dueOffsetDays: -12 },
  { name: 'Deep Clean Oven', category: 'Kitchen', frequency: 'monthly', interval: 3, dueOffsetDays: 22 },

  // Outdoor & Lawn
  { name: 'Fertilize Lawn', category: 'Outdoor', frequency: 'monthly', interval: 2, dueOffsetDays: 5 },
  { name: 'Clean Gutters', category: 'Outdoor', frequency: 'monthly', interval: 6, dueOffsetDays: 60 },
  { name: 'Service Lawnmower', category: 'Equipment', frequency: 'yearly', interval: 1, dueOffsetDays: 90 },
  { name: 'Inspect Sprinkler System', category: 'Outdoor', frequency: 'yearly', interval: 1, dueOffsetDays: 30 },

  // Home Systems
  { name: 'Replace HVAC Filter', category: 'Other', frequency: 'monthly', interval: 3, dueOffsetDays: 7 },
  { name: 'Test Smoke Detectors', category: 'Other', frequency: 'monthly', interval: 6, dueOffsetDays: -3 },
  { name: 'Flush Water Heater', category: 'Other', frequency: 'yearly', interval: 1, dueOffsetDays: 120 },
  { name: 'Clean Dryer Vent', category: 'Laundry', frequency: 'yearly', interval: 1, dueOffsetDays: 75 },

  // Finances
  { name: 'Pay Property Taxes', category: 'Other', frequency: 'monthly', interval: 6, dueOffsetDays: 45 },
  { name: 'File Federal Tax Return', category: 'Other', frequency: 'yearly', interval: 1, dueOffsetDays: 180 },
  { name: 'Review Home Insurance Policy', category: 'Other', frequency: 'yearly', interval: 1, dueOffsetDays: 200 },

  // Hot Tub
  { name: 'Test & Balance Hot Tub Chemicals', category: 'Equipment', frequency: 'weekly', interval: 1, dueOffsetDays: 2 },
  { name: 'Clean Hot Tub Filter', category: 'Equipment', frequency: 'monthly', interval: 1, dueOffsetDays: 14 },
  { name: 'Drain & Refill Hot Tub', category: 'Equipment', frequency: 'monthly', interval: 3, dueOffsetDays: 40 },

  // Bathroom
  { name: 'Clean Showerhead', category: 'Bathroom', frequency: 'monthly', interval: 3, dueOffsetDays: 25 },
  { name: 'Seal Grout', category: 'Bathroom', frequency: 'yearly', interval: 1, dueOffsetDays: 200 },
];

const SEED_SHARED_PRODUCTS: SeedSharedProduct[] = [
  { name: 'Leisure Time Shock', containerUnit: 'oz', currentQuantity: 19.2, amazonUrl: 'https://amazon.com/dp/B000HHL2DQ' },
  { name: 'HTH pH Up', containerUnit: 'oz', currentQuantity: 48, amazonUrl: 'https://amazon.com/dp/B003DZF5KG' },
  { name: 'HTH pH Down', containerUnit: 'oz', currentQuantity: 32, amazonUrl: 'https://amazon.com/dp/B00936OAPI' },
  { name: 'Leisure Time Spa Bromine Tabs', containerUnit: 'oz', currentQuantity: 60, amazonUrl: 'https://amazon.com/dp/B000255QXG' },
  { name: 'Pleatco Hot Tub Filter', containerUnit: 'filters', currentQuantity: 1, amazonUrl: 'https://amazon.com/dp/B000BKQFQO' },
  { name: 'Nordic Pure 16x25x1 HVAC Filter', containerUnit: 'filters', currentQuantity: 2, amazonUrl: 'https://amazon.com/dp/B00936OAPI' },
  { name: 'EveryDrop Refrigerator Filter', containerUnit: 'filters', currentQuantity: 0, amazonUrl: 'https://amazon.com/dp/B00APWJHOI' },
  { name: 'Mobil 1 Synthetic 0W-20', containerUnit: 'qt', currentQuantity: 0, amazonUrl: 'https://amazon.com/dp/B01M73RA2G' },
  { name: 'Fram Ultra Oil Filter', containerUnit: 'filters', currentQuantity: 1, amazonUrl: 'https://amazon.com/dp/B077KG8TQT' },
];

const SEED_USAGES: SeedUsage[] = [
  // Test & Balance Hot Tub Chemicals
  { taskName: 'Test & Balance Hot Tub Chemicals', productName: 'Leisure Time Shock', usageAmount: 2 },
  { taskName: 'Test & Balance Hot Tub Chemicals', productName: 'HTH pH Up', usageAmount: 1 },
  { taskName: 'Test & Balance Hot Tub Chemicals', productName: 'HTH pH Down', usageAmount: 1 },
  { taskName: 'Test & Balance Hot Tub Chemicals', productName: 'Leisure Time Spa Bromine Tabs', usageAmount: 3 },

  // Clean Hot Tub Filter
  { taskName: 'Clean Hot Tub Filter', productName: 'Pleatco Hot Tub Filter', usageAmount: 1 },

  // Drain & Refill Hot Tub
  { taskName: 'Drain & Refill Hot Tub', productName: 'Leisure Time Shock', usageAmount: 8 },
  { taskName: 'Drain & Refill Hot Tub', productName: 'HTH pH Up', usageAmount: 4 },
  { taskName: 'Drain & Refill Hot Tub', productName: 'HTH pH Down', usageAmount: 4 },
  { taskName: 'Drain & Refill Hot Tub', productName: 'Leisure Time Spa Bromine Tabs', usageAmount: 12 },
  { taskName: 'Drain & Refill Hot Tub', productName: 'Pleatco Hot Tub Filter', usageAmount: 1 },

  // Replace HVAC Filter
  { taskName: 'Replace HVAC Filter', productName: 'Nordic Pure 16x25x1 HVAC Filter', usageAmount: 1 },

  // Replace Refrigerator Water Filter
  { taskName: 'Replace Refrigerator Water Filter', productName: 'EveryDrop Refrigerator Filter', usageAmount: 1 },

  // Oil Change – Honda CR-V
  { taskName: 'Oil Change – Honda CR-V', productName: 'Mobil 1 Synthetic 0W-20', usageAmount: 4.5 },
  { taskName: 'Oil Change – Honda CR-V', productName: 'Fram Ultra Oil Filter', usageAmount: 1 },
];

const SEED_ASSIGNED_TO_USER = new Set([
  'Test & Balance Hot Tub Chemicals',
  'Replace HVAC Filter',
  'Oil Change – Honda CR-V',
]);

const SEED_REMINDER_OVERRIDES: Record<string, number> = {
  'Oil Change – Honda CR-V': 30,
  'Rotate Tires – Honda CR-V': 14,
  'Replace HVAC Filter': 7,
  'Clean Gutters': 14,
  'Flush Water Heater': 7,
  'Pay Property Taxes': 30,
  'File Federal Tax Return': 30,
  'Review Home Insurance Policy': 30,
  'Service Lawnmower': 14,
  'Drain & Refill Hot Tub': 14,
};

export async function seedDummyTasks(
  householdId: string,
  userId: string,
  assigneeUserId?: string,
  assigneeName?: string
): Promise<void> {
  const today = new Date();
  const taskIdsByName: Record<string, string> = {};
  const productIdsByName: Record<string, { id: string; unit: string }> = {};

  for (const t of SEED_TASKS) {
    const firstDueDate = addDays(today, t.dueOffsetDays);
    const shouldAssign =
      !!assigneeUserId && SEED_ASSIGNED_TO_USER.has(t.name);
    const id = await createTask(householdId, userId, {
      householdId,
      name: t.name,
      category: t.category,
      firstDueDate,
      recurrence: { frequency: t.frequency, interval: t.interval },
      hasInventory: false,
      instructions: null,
      assignedTo: shouldAssign ? assigneeUserId : null,
      assignedToName: shouldAssign
        ? (assigneeName ?? assigneeUserId ?? null)
        : null,
      reminderDaysBefore: SEED_REMINDER_OVERRIDES[t.name] ?? 1,
    });
    taskIdsByName[t.name] = id;
  }

  for (const p of SEED_SHARED_PRODUCTS) {
    const id = await createProduct(householdId, userId, {
      householdId,
      name: p.name,
      amazonUrl: p.amazonUrl,
      containerUnit: p.containerUnit,
      currentQuantity: p.currentQuantity,
      lowThresholdPercent: 25,
    });
    productIdsByName[p.name] = { id, unit: p.containerUnit };
  }

  for (const u of SEED_USAGES) {
    const taskId = taskIdsByName[u.taskName];
    const product = productIdsByName[u.productName];
    if (!taskId || !product) continue;
    await addProductUsageToTask(
      householdId,
      taskId,
      product.id,
      u.productName,
      u.usageAmount,
      product.unit
    );
  }
}
