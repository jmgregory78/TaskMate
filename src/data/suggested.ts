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
  | 'emergency';

export interface WizardCategory {
  id: WizardCategoryId;
  emoji: string;
  name: string;
}

export const WIZARD_CATEGORIES: WizardCategory[] = [
  { id: 'home-systems', emoji: '🏠', name: 'Home Systems' },
  { id: 'vehicles', emoji: '🚗', name: 'Vehicles' },
  { id: 'outdoor', emoji: '🌿', name: 'Outdoor & Garden' },
  { id: 'kitchen', emoji: '🍽️', name: 'Kitchen & Appliances' },
  { id: 'health', emoji: '🏥', name: 'Health & Wellness' },
  { id: 'pets', emoji: '🐾', name: 'Pet Care' },
  { id: 'inspections', emoji: '🔍', name: 'Inspections & Services' },
  { id: 'finance', emoji: '💰', name: 'Finance & Admin' },
  { id: 'travel', emoji: '✈️', name: 'Travel & Rewards' },
  { id: 'documents', emoji: '📋', name: 'Documents & Renewals' },
  { id: 'pool', emoji: '🏊', name: 'Pool' },
  { id: 'hot-tub', emoji: '♨️', name: 'Hot Tub' },
  { id: 'emergency', emoji: '⚡', name: 'Emergency & Seasonal' },
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
    name: 'Home Systems',
    tasks: [
      { id: 'hvac-filter', name: 'Replace HVAC Filter', category: 'Equipment', frequency: 'monthly', interval: 3, reminderDaysBefore: 3, linkedSupplies: ['hvac-filters'] },
      { id: 'hvac-service', name: 'Service HVAC Equipment', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'smoke-detectors', name: 'Test Smoke Detectors', category: 'Equipment', frequency: 'monthly', interval: 6, reminderDaysBefore: 3, linkedSupplies: ['smoke-batteries'] },
      { id: 'water-heater', name: 'Flush Water Heater', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 7 },
      { id: 'gutters', name: 'Clean Gutters', category: 'Outdoor', frequency: 'monthly', interval: 6, reminderDaysBefore: 7 },
      { id: 'roof-inspect', name: 'Inspect Roof', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'washer-clean', name: 'Service Washing Machine', category: 'Equipment', frequency: 'monthly', interval: 1, reminderDaysBefore: 1, linkedSupplies: ['washer-cleaner'] },
      { id: 'water-softener', name: 'Refill Water Softener', category: 'Equipment', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, linkedSupplies: ['softener-salt'] },
    ],
  },
  {
    id: 'vehicles',
    emoji: '🚗',
    name: 'Vehicles',
    tasks: [
      { id: 'oil-change', name: 'Oil Change', category: 'Vehicles', frequency: 'monthly', interval: 3, reminderDaysBefore: 7 },
      { id: 'rotate-tires', name: 'Rotate Tires', category: 'Vehicles', frequency: 'monthly', interval: 6, reminderDaysBefore: 7 },
      { id: 'tire-pressure', name: 'Check Tire Pressure', category: 'Vehicles', frequency: 'monthly', interval: 1, reminderDaysBefore: 1 },
      { id: 'wipers', name: 'Replace Windshield Wipers', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 7, linkedSupplies: ['wipers'] },
      { id: 'cabin-air-filter', name: 'Replace Cabin Air Filter', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 7, linkedSupplies: ['cabin-filter'] },
      { id: 'car-wash', name: 'Car Wash & Detail', category: 'Vehicles', frequency: 'monthly', interval: 1, reminderDaysBefore: 1 },
      { id: 'car-registration', name: 'Car Registration Renewal', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 30 },
    ],
  },
  {
    id: 'outdoor',
    emoji: '🌿',
    name: 'Outdoor & Garden',
    tasks: [
      { id: 'lawnmower', name: 'Service Lawnmower', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, linkedSupplies: ['small-engine-oil', 'spark-plugs'] },
      { id: 'sprinkler', name: 'Inspect Sprinkler System', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'fertilize-lawn', name: 'Fertilize Lawn', category: 'Outdoor', frequency: 'monthly', interval: 2, reminderDaysBefore: 7, linkedSupplies: ['lawn-fertilizer'] },
      { id: 'pest-control', name: 'Pest Control Treatment', category: 'Outdoor', frequency: 'monthly', interval: 3, reminderDaysBefore: 7, linkedSupplies: ['pest-control'] },
      { id: 'mulch', name: 'Mulch Garden', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'window-cleaning', name: 'Window Cleaning', category: 'Outdoor', frequency: 'monthly', interval: 6, reminderDaysBefore: 3 },
      { id: 'pressure-wash', name: 'Pressure Wash Patio & Driveway', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '💦', linkedSupplies: ['pressure-washer-nozzles'] },
      { id: 'backflow-preventer', name: 'Backflow Preventer Testing', category: 'Outdoor', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '💧' },
    ],
  },
  {
    id: 'kitchen',
    emoji: '🍽️',
    name: 'Kitchen & Appliances',
    tasks: [
      { id: 'seal-grout', name: 'Seal Grout', category: 'Bathroom', frequency: 'yearly', interval: 1, reminderDaysBefore: 14 },
      { id: 'fridge-filter', name: 'Replace Refrigerator Filter', category: 'Kitchen', frequency: 'monthly', interval: 6, reminderDaysBefore: 3, linkedSupplies: ['fridge-water-filter'] },
      { id: 'dishwasher', name: 'Clean Dishwasher', category: 'Kitchen', frequency: 'monthly', interval: 1, reminderDaysBefore: 1, linkedSupplies: ['dishwasher-cleaner'] },
    ],
  },
  {
    id: 'health',
    emoji: '🏥',
    name: 'Health & Wellness',
    tasks: [
      { id: 'prescription-refill', name: 'Prescription Refill', category: 'Other', frequency: 'monthly', interval: 2, reminderDaysBefore: 7, icon: '💊', linkedSupplies: ['prescription'] },
      { id: 'annual-physical', name: 'Annual Physical', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🩺' },
      { id: 'dental-checkup', name: 'Dental Checkup', category: 'Other', frequency: 'monthly', interval: 6, reminderDaysBefore: 14, icon: '🦷' },
      { id: 'eye-exam', name: 'Eye Exam', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '👁️', linkedSupplies: ['contacts'] },
      { id: 'flu-shot', name: 'Flu Shot', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '💉' },
      { id: 'skin-screening', name: 'Skin Cancer Screening', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '☀️' },
      { id: 'blood-donation', name: 'Blood Donation', category: 'Other', frequency: 'weekly', interval: 8, reminderDaysBefore: 7, icon: '🩸' },
    ],
  },
  {
    id: 'pets',
    emoji: '🐾',
    name: 'Pet Care',
    tasks: [
      { id: 'vet-visit', name: 'Annual Vet Visit', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🐾' },
      { id: 'flea-tick', name: 'Flea & Tick Treatment', category: 'Other', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '🐛', linkedSupplies: ['pet-flea-tick'] },
      { id: 'heartworm', name: 'Heartworm Prevention', category: 'Other', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '💊', linkedSupplies: ['pet-heartworm'] },
      { id: 'pet-grooming', name: 'Pet Grooming', category: 'Other', frequency: 'weekly', interval: 6, reminderDaysBefore: 7, icon: '✂️' },
      { id: 'pet-dental', name: 'Pet Dental Cleaning', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🦷' },
    ],
  },
  {
    id: 'inspections',
    emoji: '🔍',
    name: 'Inspections & Services',
    tasks: [
      { id: 'chimney-sweep', name: 'Chimney Sweep & Inspection', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🏠' },
      { id: 'dryer-vent', name: 'Dryer Vent Cleaning', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '🌀' },
      { id: 'septic-pumping', name: 'Septic Tank Pumping', category: 'Other', frequency: 'yearly', interval: 3, reminderDaysBefore: 30, icon: '🔧' },
      { id: 'termite-inspection', name: 'Termite & Pest Inspection', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🐛' },
      { id: 'radon-testing', name: 'Radon Testing', category: 'Other', frequency: 'yearly', interval: 2, reminderDaysBefore: 30, icon: '☢️' },
      { id: 'well-water-testing', name: 'Well Water Testing', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '💧' },
      { id: 'electrical-panel', name: 'Electrical Panel Inspection', category: 'Other', frequency: 'yearly', interval: 5, reminderDaysBefore: 60, icon: '⚡' },
      { id: 'garage-door-spring', name: 'Garage Door Spring Service', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🚗' },
      { id: 'tree-trimming', name: 'Tree Trimming / Arborist', category: 'Other', frequency: 'yearly', interval: 2, reminderDaysBefore: 30, icon: '🌳' },
      { id: 'car-emissions', name: 'Car Emissions Test', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🚗' },
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
  {
    id: 'travel',
    emoji: '✈️',
    name: 'Travel & Rewards',
    tasks: [
      { id: 'free-night-award', name: 'Redeem Free Night Award', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 60, icon: '🏨' },
      { id: 'airline-miles-expiry', name: 'Use Airline Miles Before Expiry', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 60, icon: '✈️' },
      { id: 'cc-annual-fee', name: 'Credit Card Annual Fee Review', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '💳' },
      { id: 'tsa-precheck', name: 'TSA PreCheck Renewal', category: 'Other', frequency: 'yearly', interval: 5, reminderDaysBefore: 60, icon: '🛂' },
      { id: 'global-entry', name: 'Global Entry Renewal', category: 'Other', frequency: 'yearly', interval: 5, reminderDaysBefore: 60, icon: '🛂' },
      { id: 'travel-insurance', name: 'Travel Insurance Review', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🛡️' },
    ],
  },
  {
    id: 'documents',
    emoji: '📋',
    name: 'Documents & Renewals',
    tasks: [
      { id: 'drivers-license-renewal', name: "Driver's License Renewal", category: 'Other', frequency: 'yearly', interval: 4, reminderDaysBefore: 60, icon: '🪪' },
      { id: 'vehicle-registration', name: 'Vehicle Registration Renewal', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🚗' },
      { id: 'green-card-renewal', name: 'Green Card Renewal', category: 'Other', frequency: 'yearly', interval: 10, reminderDaysBefore: 180, icon: '🪪' },
      { id: 'homeowners-insurance', name: "Homeowner's Insurance Review", category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🏠' },
      { id: 'auto-insurance', name: 'Auto Insurance Review', category: 'Vehicles', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🚗' },
      { id: 'health-insurance-enrollment', name: 'Health Insurance Open Enrollment', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🏥' },
      { id: 'pet-license', name: 'Pet License Renewal', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 30, icon: '🐾' },
      { id: 'nexus-card', name: 'NEXUS Card Renewal', category: 'Other', frequency: 'yearly', interval: 5, reminderDaysBefore: 60, icon: '🛂' },
      { id: 'work-visa', name: 'Work Visa Renewal', category: 'Other', frequency: 'yearly', interval: 1, reminderDaysBefore: 90, icon: '📄' },
    ],
  },
  {
    id: 'pool',
    emoji: '🏊',
    name: 'Pool',
    tasks: [
      { id: 'pool-test-water', name: 'Test Pool Water Chemistry', category: 'Equipment', frequency: 'weekly', interval: 1, reminderDaysBefore: 1, icon: '🧪', linkedSupplies: ['pool-test-strips', 'pool-chlorine', 'pool-shock', 'pool-algaecide', 'pool-muriatic-acid', 'pool-stabilizer'] },
      { id: 'pool-add-chemicals', name: 'Add Pool Chemicals', category: 'Equipment', frequency: 'weekly', interval: 1, reminderDaysBefore: 1, icon: '⚗️', linkedSupplies: ['pool-chlorine', 'pool-shock', 'pool-algaecide', 'pool-muriatic-acid'] },
      { id: 'pool-clean-filter', name: 'Clean Pool Filter', category: 'Equipment', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '🔧', linkedSupplies: ['pool-filter-cartridge'] },
      { id: 'pool-shock', name: 'Shock the Pool', category: 'Equipment', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '⚡', linkedSupplies: ['pool-shock'] },
      { id: 'pool-winterize', name: 'Winterize Pool', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '❄️' },
      { id: 'pool-open', name: 'Open Pool for Season', category: 'Equipment', frequency: 'yearly', interval: 1, reminderDaysBefore: 14, icon: '☀️' },
      { id: 'pool-deck-clean', name: 'Clean Pool Deck', category: 'Outdoor', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '🧹' },
    ],
  },
  {
    id: 'hot-tub',
    emoji: '♨️',
    name: 'Hot Tub',
    tasks: [
      { id: 'hot-tub-test-water', name: 'Test Hot Tub Water', category: 'Equipment', frequency: 'weekly', interval: 1, reminderDaysBefore: 1, icon: '🧪', linkedSupplies: ['hot-tub-test-strips', 'ph-up', 'ph-down', 'alkalinity-increaser'] },
      { id: 'hot-tub-smartchlor', name: 'Change SmartChlor Cartridge', category: 'Equipment', frequency: 'monthly', interval: 3, reminderDaysBefore: 7, icon: '🔄', linkedSupplies: ['smartchlor-cartridge'] },
      { id: 'hot-tub-mineral', name: 'Change Mineral Cartridge', category: 'Equipment', frequency: 'monthly', interval: 4, reminderDaysBefore: 7, icon: '💎', linkedSupplies: ['mineral-cartridge'] },
      { id: 'hot-tub-filter-clean', name: 'Clean Hot Tub Filter', category: 'Equipment', frequency: 'monthly', interval: 3, reminderDaysBefore: 7, icon: '🔧', linkedSupplies: ['filter-cleaner'] },
      { id: 'hot-tub-drain-refill', name: 'Drain & Refill Hot Tub', category: 'Equipment', frequency: 'monthly', interval: 4, reminderDaysBefore: 7, icon: '💧', linkedSupplies: ['hot-tub-clarifier'] },
      { id: 'hot-tub-cover-clean', name: 'Clean Hot Tub Cover', category: 'Equipment', frequency: 'monthly', interval: 1, reminderDaysBefore: 3, icon: '🧹', linkedSupplies: ['cover-cleaner'] },
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
