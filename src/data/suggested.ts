import { RecurrenceFrequency, TaskCategory } from '../types/models';

export type WizardCategoryId =
  | 'home-systems'
  | 'vehicles'
  | 'outdoor'
  | 'kitchen'
  | 'health'
  | 'pets'
  | 'inspections'
  | 'finance'
  | 'travel'
  | 'documents'
  | 'pool'
  | 'hot-tub'
  | 'emergency'
  | 'family'
  | 'school';

export interface WizardCategory {
  id: WizardCategoryId;
  emoji: string;
  name: string;
}

export const WIZARD_CATEGORIES: WizardCategory[] = [
  { id: 'home-systems', emoji: '🏠', name: 'Home Maintenance' },
  { id: 'outdoor', emoji: '🌿', name: 'Garden & Outdoor' },
  { id: 'vehicles', emoji: '🚗', name: 'Vehicles' },
  { id: 'health', emoji: '💊', name: 'Health & Wellness' },
  { id: 'finance', emoji: '💰', name: 'Finance & Documents' },
  { id: 'pets', emoji: '🐾', name: 'Pet Care' },
  { id: 'family', emoji: '👨‍👩‍👧', name: 'Family & Personal' },
  { id: 'school', emoji: '🎓', name: 'School & Education' },
  { id: 'pool', emoji: '🏊', name: 'Pool' },
  { id: 'hot-tub', emoji: '♨️', name: 'Hot Tub' },
];

export interface SuggestedTask {
  id: string;
  name: string;
  category: TaskCategory;
  frequency: RecurrenceFrequency;
  interval: number;
  reminderDaysBefore: number;
  icon?: string;
  linkedSupplies?: string[];
}

export interface SuggestedTaskCategory {
  id: WizardCategoryId;
  emoji: string;
  name: string;
  tasks: SuggestedTask[];
}

export interface SuggestedSupply {
  id: string;
  name: string;
  defaultQty: number;
  unit: string;
  notes?: string;
  icon?: string;
}

export interface SuggestedSupplyCategory {
  id: WizardCategoryId;
  emoji: string;
  name: string;
  supplies: SuggestedSupply[];
}

export const SUGGESTED_TASKS: SuggestedTaskCategory[] = [
  {
    id: 'home-systems',
    emoji: '🏠',
    name: 'Home Maintenance',
    tasks: [
      { id: 'hvac-filter', name: 'HVAC Filter Replacement', category: 'Equipment', frequency: 'monthly', interval: 3, reminderDaysBefore: 7, icon: '🌬️', linkedSupplies: ['hvac-filters'] },
      { id: 'smoke-detectors', name: 'Smoke Detector Test & Battery', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🔋', linkedSupplies: ['smoke-batteries'] },
      { id: 'dryer-vent', name: 'Dryer Vent Cleaning', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🌀' },
      { id: 'water-heater', name: 'Water Heater Flush', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🔥' },
      { id: 'chimney-cleaning', name: 'Chimney Cleaning', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🏠' },
      { id: 'seal-grout', name: 'Seal Grout', category: 'Other', frequency: 'yearly', interval: 2, reminderDaysBefore: 14, icon: '🧱' },
      { id: 'seal-granite', name: 'Seal Granite Counters', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '✨' },
      { id: 'pest-control', name: 'Pest Control', category: 'Other', frequency: 'monthly', interval: 3, reminderDaysBefore: 7, icon: '🐜' },
      { id: 'window-cleaning', name: 'Window Cleaning', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 7, icon: '🪟' },
      { id: 'roof-inspect', name: 'Roof Inspection', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🏠' },
      { id: 'hot-tub-weekly-check', name: 'Hot Tub Weekly Check', category: 'Equipment', frequency: 'weekly', interval: 1, reminderDaysBefore: 1, icon: '🛁', linkedSupplies: ['hot-tub-test-strips', 'ph-up', 'ph-down', 'alkalinity-increaser'] },
      { id: 'hot-tub-monthly-service', name: 'Hot Tub Monthly Service', category: 'Equipment', frequency: 'monthly', interval: 1, reminderDaysBefore: 7, icon: '🛁', linkedSupplies: ['filter-cleaner'] },
      { id: 'hot-tub-quarterly-drain', name: 'Hot Tub Quarterly Drain & Refill', category: 'Equipment', frequency: 'monthly', interval: 3, reminderDaysBefore: 7, icon: '🛁', linkedSupplies: ['hot-tub-clarifier', 'filter-cleaner'] },
      { id: 'septic-tank', name: 'Septic Tank Service', category: 'Other', frequency: 'yearly', interval: 3, reminderDaysBefore: 30, icon: '🔧' },
      { id: 'garage-door', name: 'Garage Door Lubrication & Inspection', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🚪' },
    ],
  },
  {
    id: 'outdoor',
    emoji: '🌿',
    name: 'Garden & Outdoor',
    tasks: [
      { id: 'lawn-mowing', name: 'Lawn Mowing', category: 'Outdoor', frequency: 'weekly', interval: 1, reminderDaysBefore: 1, icon: '🌿' },
      { id: 'gutter-cleaning', name: 'Gutter Cleaning', category: 'Outdoor', frequency: 'monthly', interval: 6, reminderDaysBefore: 7, icon: '🏠' },
      { id: 'sprinkler-winterize', name: 'Sprinkler System Winterization', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '❄️' },
      { id: 'sprinkler-startup', name: 'Sprinkler System Spring Startup', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🌱' },
      { id: 'backflow-test', name: 'Irrigation Backflow Test', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '💧' },
      { id: 'patio-cleaning', name: 'Patio Cleaning', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🧹' },
      { id: 'bug-control', name: 'Bug Control', category: 'Outdoor', frequency: 'monthly', interval: 3, reminderDaysBefore: 7, icon: '🐛' },
      { id: 'weed-control', name: 'Weed Control', category: 'Outdoor', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '🌾' },
      { id: 'pressure-wash-driveway', name: 'Pressure Wash Driveway', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '💦' },
      { id: 'fertilize-lawn', name: 'Fertilize Lawn', category: 'Outdoor', frequency: 'weekly', interval: 6, reminderDaysBefore: 7, icon: '🌱', linkedSupplies: ['lawn-fertilizer'] },
      { id: 'mulch-beds', name: 'Mulch Garden Beds', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🪴' },
      { id: 'tree-trimming', name: 'Tree & Shrub Trimming', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🌳' },
      { id: 'outdoor-furniture-store', name: 'Outdoor Furniture Cover & Store', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🪑' },
    ],
  },
  {
    id: 'vehicles',
    emoji: '🚗',
    name: 'Vehicles',
    tasks: [
      { id: 'general-vehicle-service', name: 'General Vehicle Service', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🔧' },
      { id: 'oil-change', name: 'Oil Change', category: 'Vehicles', frequency: 'monthly', interval: 6, reminderDaysBefore: 7, icon: '🛢️' },
      { id: 'tire-rotation', name: 'Tire Rotation', category: 'Vehicles', frequency: 'monthly', interval: 6, reminderDaysBefore: 7, icon: '🔄' },
      { id: 'car-wash', name: 'Car Wash', category: 'Vehicles', frequency: 'monthly', interval: 1, reminderDaysBefore: 1, icon: '🚿' },
      { id: 'brake-inspection', name: 'Brake Inspection', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🛑' },
      { id: 'air-filter-replacement', name: 'Air Filter Replacement', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 7, icon: '🌬️' },
      { id: 'battery-check', name: 'Battery Check', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🔋' },
      { id: 'wiper-replacement', name: 'Windshield Wiper Replacement', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 7, icon: '🚗', linkedSupplies: ['wipers'] },
    ],
  },
  {
    id: 'health',
    emoji: '💊',
    name: 'Health & Wellness',
    tasks: [
      { id: 'annual-physical', name: 'Annual Physical', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🩺' },
      { id: 'dental-cleaning', name: 'Dental Cleaning', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 14, icon: '🦷' },
      { id: 'eye-exam', name: 'Eye Exam', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '👁️' },
      { id: 'dermatologist', name: 'Dermatologist Visit', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '☀️' },
      { id: 'flu-shot', name: 'Flu Shot', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '💉' },
      { id: 'mammogram', name: 'Mammogram', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🏥' },
      { id: 'colonoscopy', name: 'Colonoscopy', category: 'Other', frequency: 'yearly', interval: 10, reminderDaysBefore: 60, icon: '🏥' },
      { id: 'vitamin-reorder', name: 'Vitamin/Supplement Reorder', category: 'Other', frequency: 'monthly', interval: 1, reminderDaysBefore: 7, icon: '💊', linkedSupplies: ['vitamins'] },
      { id: 'kids-checkup', name: "Kids' Annual Checkup", category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '👶' },
    ],
  },
  {
    id: 'finance',
    emoji: '💰',
    name: 'Finance & Documents',
    tasks: [
      { id: 'tax-return', name: 'Tax Return Filing', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '📝' },
      { id: 'home-insurance', name: 'Home Insurance Review', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🏠' },
      { id: 'life-insurance', name: 'Life Insurance Review', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🛡️' },
      { id: 'vehicle-registration', name: 'Vehicle Registration Renewal', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🚗' },
      { id: 'car-insurance', name: 'Car Insurance Review', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🚗' },
      { id: 'credit-report', name: 'Credit Report Check', category: 'Other', frequency: 'monthly', interval: 4, reminderDaysBefore: 7, icon: '📊' },
      { id: 'review-subscriptions', name: 'Review Subscriptions', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 7, icon: '💳' },
      { id: 'review-investments', name: 'Review Investment Portfolio', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 7, icon: '📈' },
      { id: 'review-estate', name: 'Review Will/Estate Documents', category: 'Other', frequency: 'yearly', interval: 3, reminderDaysBefore: 30, icon: '📋' },
      { id: 'passport-renewal', name: 'Passport Renewal', category: 'Other', frequency: 'yearly', interval: 10, reminderDaysBefore: 90, icon: '🛂' },
      { id: 'drivers-license-renewal', name: "Driver's License Renewal", category: 'Other', frequency: 'yearly', interval: 5, reminderDaysBefore: 60, icon: '🪪' },
      { id: 'green-card-renewal', name: 'Green Card Renewal', category: 'Other', frequency: 'yearly', interval: 10, reminderDaysBefore: 180, icon: '🪪' },
    ],
  },
  {
    id: 'pets',
    emoji: '🐾',
    name: 'Pet Care',
    tasks: [
      { id: 'vet-checkup', name: 'Vet Annual Checkup', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🐾' },
      { id: 'flea-tick', name: 'Flea & Tick Treatment', category: 'Other', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '🐛', linkedSupplies: ['pet-flea-tick'] },
      { id: 'heartworm', name: 'Heartworm Prevention', category: 'Other', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '💊', linkedSupplies: ['pet-heartworm'] },
      { id: 'pet-grooming', name: 'Pet Grooming', category: 'Other', frequency: 'weekly', interval: 6, reminderDaysBefore: 7, icon: '✂️' },
      { id: 'pet-teeth-cleaning', name: 'Teeth Cleaning (Vet)', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🦷' },
      { id: 'pet-vaccination', name: 'Vaccination Booster', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '💉' },
    ],
  },
  {
    id: 'family',
    emoji: '👨‍👩‍👧',
    name: 'Family & Personal',
    tasks: [
      { id: 'birthday-reminder', name: 'Birthday Reminder — Family', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🎂' },
      { id: 'anniversary-reminder', name: 'Anniversary Reminder', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '💍' },
      { id: 'family-photo', name: 'Family Photo Session', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '📸' },
      { id: 'family-checkin', name: 'Call/Check In With Family', category: 'Other', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '📞' },
    ],
  },
  {
    id: 'school',
    emoji: '🎓',
    name: 'School & Education',
    tasks: [
      { id: 'school-registration', name: 'School Registration', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '📝' },
      { id: 'back-to-school', name: 'Back to School Shopping', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🎒' },
      { id: 'sports-signup', name: 'School Sports/Activity Sign-Up', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '⚽' },
      { id: 'school-supply-restock', name: 'School Supply Restock', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 14, icon: '✏️' },
      { id: 'fafsa-filing', name: 'FAFSA Filing', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '📄' },
      { id: 'tuition-payment', name: 'Tuition Payment', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 14, icon: '💰' },
      { id: 'summer-camp-signup', name: 'Summer Camp Sign-Up', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🏕️' },
    ],
  },
];

export const SUGGESTED_SUPPLIES: SuggestedSupplyCategory[] = [
  {
    id: 'health',
    emoji: '💊',
    name: 'Health & Wellness',
    supplies: [
      { id: 'prescription', name: 'Prescription Medication', defaultQty: 60, unit: 'doses', notes: 'Refill when running low', icon: '💊' },
      { id: 'vitamins', name: 'Vitamins / Supplements', defaultQty: 90, unit: 'tablets', icon: '🌱' },
      { id: 'contacts', name: 'Contact Lenses', defaultQty: 90, unit: 'lenses', icon: '👁️' },
      { id: 'first-aid', name: 'First Aid Kit', defaultQty: 1, unit: 'kit', icon: '🩹' },
      { id: 'sunscreen', name: 'Sunscreen', defaultQty: 2, unit: 'bottles', icon: '☀️' },
    ],
  },
  {
    id: 'home-systems',
    emoji: '🏠',
    name: 'Home Systems',
    supplies: [
      { id: 'hvac-filters', name: 'HVAC Filters', defaultQty: 3, unit: 'filters', icon: '🌬️' },
      { id: 'smoke-batteries', name: 'Smoke Detector Batteries (9V)', defaultQty: 8, unit: 'batteries', icon: '🔋' },
      { id: 'fridge-water-filter', name: 'Refrigerator Water Filter', defaultQty: 2, unit: 'filters', icon: '💧' },
      { id: 'pitcher-filters', name: 'Water Pitcher Filters (Brita)', defaultQty: 3, unit: 'filters', icon: '💧' },
      { id: 'range-hood-filter', name: 'Range Hood Grease Filter', defaultQty: 2, unit: 'filters', icon: '🔥' },
    ],
  },
  {
    id: 'vehicles',
    emoji: '🚗',
    name: 'Vehicles',
    supplies: [
      { id: 'wipers', name: 'Windshield Wipers', defaultQty: 1, unit: 'pairs', icon: '🚗' },
      { id: 'cabin-filter', name: 'Car Cabin Air Filter', defaultQty: 1, unit: 'filters', icon: '🌬️' },
      { id: 'small-engine-oil', name: 'Small Engine Oil (Lawnmower/Pressure Washer)', defaultQty: 2, unit: 'quarts', icon: '🛢️' },
      { id: 'spark-plugs', name: 'Spark Plugs (Small Engine)', defaultQty: 4, unit: 'plugs', notes: 'For lawnmower, pressure washer, generator', icon: '🔌' },
      { id: 'pressure-washer-nozzles', name: 'Pressure Washer Nozzle Set', defaultQty: 1, unit: 'set', icon: '💦' },
    ],
  },
  {
    id: 'kitchen',
    emoji: '🍽️',
    name: 'Kitchen & Appliances',
    supplies: [
      { id: 'dishwasher-cleaner', name: 'Dishwasher Cleaner', defaultQty: 3, unit: 'tablets', icon: '🍽️' },
      { id: 'washer-cleaner', name: 'Washing Machine Cleaner', defaultQty: 3, unit: 'tablets', icon: '🧺' },
    ],
  },
  {
    id: 'outdoor',
    emoji: '🌿',
    name: 'Outdoor & Garden',
    supplies: [
      { id: 'lawn-fertilizer', name: 'Lawn Fertilizer', defaultQty: 2, unit: 'bags', icon: '🌱' },
      { id: 'pest-control', name: 'Pest Control Spray/Bait', defaultQty: 2, unit: 'cans', icon: '🐜' },
      { id: 'ice-melt', name: 'Ice Melt / Rock Salt', defaultQty: 1, unit: 'bags', icon: '❄️' },
      { id: 'softener-salt', name: 'Water Softener Salt', defaultQty: 2, unit: 'bags', icon: '🧂' },
    ],
  },
  {
    id: 'pets',
    emoji: '🐾',
    name: 'Pet Care',
    supplies: [
      { id: 'pet-flea-tick', name: 'Flea & Tick Treatment', defaultQty: 6, unit: 'doses', icon: '🐛' },
      { id: 'pet-heartworm', name: 'Heartworm Prevention Pills', defaultQty: 6, unit: 'doses', icon: '💊' },
      { id: 'pet-food', name: 'Pet Food', defaultQty: 1, unit: 'bag', icon: '🐾' },
    ],
  },
  {
    id: 'pool',
    emoji: '🏊',
    name: 'Pool',
    supplies: [
      { id: 'pool-chlorine', name: 'Pool Chlorine Tablets', defaultQty: 50, unit: 'tablets', icon: '🏊' },
      { id: 'pool-shock', name: 'Pool Shock', defaultQty: 4, unit: 'bags', icon: '⚡' },
      { id: 'pool-algaecide', name: 'Algaecide', defaultQty: 1, unit: 'bottle', icon: '🧪' },
      { id: 'pool-stabilizer', name: 'Stabilizer / Cyanuric Acid', defaultQty: 1, unit: 'bag', icon: '🧪' },
      { id: 'pool-muriatic-acid', name: 'Muriatic Acid', defaultQty: 1, unit: 'bottle', icon: '🧪' },
      { id: 'pool-filter-cartridge', name: 'Pool Filter Cartridge', defaultQty: 1, unit: 'cartridge', icon: '🌀' },
      { id: 'pool-test-strips', name: 'Pool Test Strips', defaultQty: 1, unit: 'pack', icon: '🧪' },
    ],
  },
  {
    id: 'hot-tub',
    emoji: '♨️',
    name: 'Hot Tub',
    supplies: [
      { id: 'smartchlor-cartridge', name: 'SmartChlor Cartridge', defaultQty: 3, unit: 'cartridges', icon: '♨️' },
      { id: 'hot-tub-test-strips', name: 'Hot Tub Test Strips', defaultQty: 1, unit: 'pack', icon: '🧪' },
      { id: 'mineral-cartridge', name: 'Mineral Cartridge', defaultQty: 1, unit: 'cartridge', icon: '♨️' },
      { id: 'ph-up', name: 'pH Up', defaultQty: 1, unit: 'bottle', icon: '⬆️' },
      { id: 'ph-down', name: 'pH Down / Muriatic Acid', defaultQty: 1, unit: 'bottle', icon: '⬇️' },
      { id: 'alkalinity-increaser', name: 'Alkalinity Increaser', defaultQty: 1, unit: 'bottle', icon: '🧪' },
      { id: 'hot-tub-clarifier', name: 'Clarifier', defaultQty: 1, unit: 'bottle', icon: '💧' },
      { id: 'filter-cleaner', name: 'Filter Cleaner / Degreaser', defaultQty: 1, unit: 'bottle', icon: '🧼' },
      { id: 'cover-cleaner', name: 'Cover Cleaner & Conditioner', defaultQty: 1, unit: 'bottle', icon: '✨' },
    ],
  },
  {
    id: 'emergency',
    emoji: '⚡',
    name: 'Emergency & Seasonal',
    supplies: [
      { id: 'fuel-stabilizer', name: 'Generator Fuel Stabilizer', defaultQty: 1, unit: 'bottles', icon: '⛽' },
      { id: 'septic-tablets', name: 'Septic Treatment Tablets', defaultQty: 12, unit: 'tablets', icon: '🚽' },
    ],
  },
];

export function getSuggestedTasksFor(
  categoryId: WizardCategoryId
): SuggestedTask[] {
  return SUGGESTED_TASKS.find((c) => c.id === categoryId)?.tasks ?? [];
}

export function getSuggestedSuppliesFor(
  categoryId: WizardCategoryId
): SuggestedSupply[] {
  return SUGGESTED_SUPPLIES.find((c) => c.id === categoryId)?.supplies ?? [];
}

/**
 * Get suggested supply by ID
 */
export function getSuggestedSupplyById(supplyId: string): SuggestedSupply | null {
  for (const cat of SUGGESTED_SUPPLIES) {
    const found = cat.supplies.find((s) => s.id === supplyId);
    if (found) return found;
  }
  return null;
}

/**
 * Get suggested task by ID
 */
export function getSuggestedTaskById(taskId: string): SuggestedTask | null {
  for (const cat of SUGGESTED_TASKS) {
    const found = cat.tasks.find((t) => t.id === taskId);
    if (found) return found;
  }
  return null;
}

/**
 * Get all suggested tasks that link to a given supply ID
 */
export function getTasksForSupply(supplyId: string): SuggestedTask[] {
  const tasks: SuggestedTask[] = [];
  for (const cat of SUGGESTED_TASKS) {
    for (const task of cat.tasks) {
      if (task.linkedSupplies?.includes(supplyId)) {
        tasks.push(task);
      }
    }
  }
  return tasks;
}

/**
 * Get all supplies linked to a set of task IDs
 */
export function getLinkedSuppliesForTasks(taskIds: string[]): SuggestedSupply[] {
  const supplyIds = new Set<string>();
  for (const cat of SUGGESTED_TASKS) {
    for (const task of cat.tasks) {
      if (taskIds.includes(task.id) && task.linkedSupplies) {
        for (const sid of task.linkedSupplies) {
          supplyIds.add(sid);
        }
      }
    }
  }
  const supplies: SuggestedSupply[] = [];
  for (const sid of supplyIds) {
    const supply = getSuggestedSupplyById(sid);
    if (supply) supplies.push(supply);
  }
  return supplies;
}

/**
 * Get supply categories that contain the given supply IDs
 */
export function getSupplyCategoriesForSupplyIds(supplyIds: string[]): WizardCategoryId[] {
  const categoryIds = new Set<WizardCategoryId>();
  for (const cat of SUGGESTED_SUPPLIES) {
    for (const supply of cat.supplies) {
      if (supplyIds.includes(supply.id)) {
        categoryIds.add(cat.id);
        break;
      }
    }
  }
  return Array.from(categoryIds);
}
