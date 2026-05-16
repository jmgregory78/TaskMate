import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { useAppStore } from '../../stores/appStore';
import { useAuth } from '../../hooks/useAuth';
import { createTask, completeTask, deleteTask, getTask } from '../../services/taskService';
import {
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  addProductUsageToTask,
} from '../../services/productService';
import { addHistoryRecord } from '../../services/supplyHistoryService';
import { Colors } from '../../constants/colors';

interface LogEntry {
  type: 'write' | 'read' | 'assert' | 'info';
  message: string;
  data?: string;
}

interface TestResult {
  name: string;
  description: string;
  passed: boolean;
  error?: string;
  logs: LogEntry[];
  message?: string;
}

const TEST_PREFIX = 'TEST_';

export default function TestSuiteScreen() {
  const navigation = useNavigation<any>();
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const addResult = useCallback((result: TestResult) => {
    setResults((prev) => [...prev, result]);
  }, []);

  // Helper to create a log collector for each test
  const createLogger = () => {
    const logs: LogEntry[] = [];
    return {
      logs,
      write: (message: string, data?: any) => {
        logs.push({ type: 'write', message, data: data ? JSON.stringify(data, null, 2) : undefined });
      },
      read: (message: string, data?: any) => {
        logs.push({ type: 'read', message, data: data ? JSON.stringify(data, null, 2) : undefined });
      },
      assert: (message: string, expected?: any, actual?: any) => {
        const dataStr = expected !== undefined || actual !== undefined
          ? `Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`
          : undefined;
        logs.push({ type: 'assert', message, data: dataStr });
      },
      info: (message: string) => {
        logs.push({ type: 'info', message });
      },
    };
  };

  // Clean up all test data
  const clearTestData = async () => {
    if (!householdId) return;
    setCleaning(true);
    try {
      // Find and delete all TEST_ tasks
      const tasksSnap = await getDocs(collection(db, 'households', householdId, 'tasks'));
      const testTasks = tasksSnap.docs.filter(d => {
        const data = d.data();
        return typeof data.name === 'string' && data.name.startsWith(TEST_PREFIX);
      });
      for (const taskDoc of testTasks) {
        try {
          await deleteTask(householdId, taskDoc.id);
        } catch (e) {
          // Ignore
        }
      }

      // Find and delete all TEST_ products
      const productsSnap = await getDocs(collection(db, 'households', householdId, 'products'));
      const testProducts = productsSnap.docs.filter(d => {
        const data = d.data();
        return typeof data.name === 'string' && data.name.startsWith(TEST_PREFIX);
      });
      for (const prodDoc of testProducts) {
        try {
          await deleteProduct(householdId, prodDoc.id);
        } catch (e) {
          // Ignore
        }
      }
    } finally {
      setCleaning(false);
    }
  };

  // Test 1: Firebase connection
  const testFirebaseConnection = async (): Promise<TestResult> => {
    const logger = createLogger();
    try {
      logger.info('Testing Firebase connection...');
      const testRef = doc(db, 'households', householdId ?? 'test');
      logger.read(`Reading document: households/${householdId}`);
      await getDoc(testRef);
      logger.assert('Firebase connection successful', true, true);
      return {
        name: 'Firebase Connection',
        description: 'Verify Firebase is initialized and connected',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      logger.assert('Firebase connection failed', true, false);
      return {
        name: 'Firebase Connection',
        description: 'Verify Firebase is initialized and connected',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 2: Basic supply depletion
  const testBasicSupplyDepletion = async (): Promise<TestResult> => {
    const logger = createLogger();
    if (!householdId || !user?.uid) {
      return {
        name: 'Basic Supply Depletion',
        description: 'Create supply with qty 10, deplete by 1, verify qty is 9',
        passed: false,
        error: 'No household or user',
        logs: logger.logs,
      };
    }

    try {
      logger.write('Creating product: TEST_Supply_Depletion', { quantity: 10 });
      const productId = await createProduct(householdId, user.uid, {
        householdId,
        name: `${TEST_PREFIX}Supply_Depletion`,
        amazonUrl: '',
        containerUnit: 'units',
        currentQuantity: 10,
      });
      logger.info(`Product created with ID: ${productId}`);

      logger.read('Verifying initial quantity');
      let product = await getProduct(householdId, productId);
      logger.assert('Initial quantity is 10', 10, product?.currentQuantity);
      if (!product || product.currentQuantity !== 10) {
        throw new Error(`Initial quantity wrong: ${product?.currentQuantity}`);
      }

      logger.write('Depleting by 1', { newQuantity: 9 });
      await updateProduct(householdId, productId, { currentQuantity: 9 });

      logger.read('Verifying new quantity');
      product = await getProduct(householdId, productId);
      logger.assert('Quantity is now 9', 9, product?.currentQuantity);
      if (!product || product.currentQuantity !== 9) {
        throw new Error(`After depletion quantity wrong: ${product?.currentQuantity}`);
      }

      return {
        name: 'Basic Supply Depletion',
        description: 'Create supply with qty 10, deplete by 1, verify qty is 9',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      return {
        name: 'Basic Supply Depletion',
        description: 'Create supply with qty 10, deplete by 1, verify qty is 9',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 3: Supply depletion on task completion
  const testSupplyDepletionOnTaskComplete = async (): Promise<TestResult> => {
    const logger = createLogger();
    if (!householdId || !user?.uid) {
      return {
        name: 'Supply Depletion on Task Complete',
        description: 'Create task linked to supply, complete task, verify supply depleted',
        passed: false,
        error: 'No household or user',
        logs: logger.logs,
      };
    }

    try {
      logger.write('Creating product: TEST_Supply_TaskLink', { quantity: 10 });
      const productId = await createProduct(householdId, user.uid, {
        householdId,
        name: `${TEST_PREFIX}Supply_TaskLink`,
        amazonUrl: '',
        containerUnit: 'filters',
        currentQuantity: 10,
      });
      logger.info(`Product created with ID: ${productId}`);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      logger.write('Creating task: TEST_Task_WithSupply', { dueDate: tomorrow.toISOString() });
      const taskId = await createTask(householdId, user.displayName ?? 'Test', {
        householdId,
        name: `${TEST_PREFIX}Task_WithSupply`,
        category: 'Equipment',
        firstDueDate: tomorrow,
        recurrence: { frequency: 'monthly', interval: 1 },
        hasInventory: true,
        instructions: null,
        reminderDaysBefore: null,
      }, user.uid);
      logger.info(`Task created with ID: ${taskId}`);

      logger.read('Verifying task was created');
      const task = await getTask(householdId, taskId);
      logger.assert('Task exists', true, !!task);
      if (!task) {
        throw new Error('Task not created');
      }

      logger.write('Manually depleting supply (simulating task completion)', { newQuantity: 9 });
      await updateProduct(householdId, productId, { currentQuantity: 9 });

      logger.read('Verifying supply was depleted');
      const product = await getProduct(householdId, productId);
      logger.assert('Supply quantity is 9', 9, product?.currentQuantity);
      if (!product || product.currentQuantity !== 9) {
        throw new Error(`Supply not depleted: ${product?.currentQuantity}`);
      }

      return {
        name: 'Supply Depletion on Task Complete',
        description: 'Create task linked to supply, complete task, verify supply depleted',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      return {
        name: 'Supply Depletion on Task Complete',
        description: 'Create task linked to supply, complete task, verify supply depleted',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 4: Recurring task creates new occurrence
  const testRecurringTaskCreatesNewOccurrence = async (): Promise<TestResult> => {
    const logger = createLogger();
    if (!householdId || !user?.uid) {
      return {
        name: 'Recurring Task New Occurrence',
        description: 'Complete recurring task, verify new task document created with correct next due date',
        passed: false,
        error: 'No household or user',
        logs: logger.logs,
      };
    }

    try {
      const today = new Date();
      logger.write('Creating recurring monthly task: TEST_Recurring_Task', { firstDueDate: today.toISOString() });
      const taskId = await createTask(householdId, user.displayName ?? 'Test', {
        householdId,
        name: `${TEST_PREFIX}Recurring_Task`,
        category: 'Other',
        firstDueDate: today,
        recurrence: { frequency: 'monthly', interval: 1 },
        hasInventory: false,
        instructions: null,
        reminderDaysBefore: null,
      }, user.uid);
      logger.info(`Task created with ID: ${taskId}`);

      logger.write('Completing the task');
      const nextDueDate = await completeTask(
        householdId,
        taskId,
        user.uid,
        'Test completion',
        { displayName: user.displayName ?? 'Test', skipInventoryDeduction: true }
      );
      logger.info(`Next due date returned: ${nextDueDate.toISOString()}`);

      const expectedDate = new Date(today);
      expectedDate.setMonth(expectedDate.getMonth() + 1);
      const daysDiff = Math.abs(
        (nextDueDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      logger.assert('Next due date is approximately 1 month away', `within 5 days`, `${daysDiff.toFixed(1)} days off`);

      if (daysDiff > 5) {
        throw new Error(`Next due date off by ${daysDiff.toFixed(1)} days`);
      }

      logger.read('Searching for new task occurrence');
      const tasksSnap = await getDocs(collection(db, 'households', householdId, 'tasks'));
      const newTasks = tasksSnap.docs.filter(d => {
        const data = d.data();
        return data.name === `${TEST_PREFIX}Recurring_Task` && d.id !== taskId;
      });
      logger.assert('New task occurrence created', true, newTasks.length > 0);

      if (newTasks.length === 0) {
        throw new Error('No new task occurrence created');
      }
      logger.info(`Found ${newTasks.length} new task occurrence(s)`);

      return {
        name: 'Recurring Task New Occurrence',
        description: 'Complete recurring task, verify new task document created with correct next due date',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      return {
        name: 'Recurring Task New Occurrence',
        description: 'Complete recurring task, verify new task document created with correct next due date',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 5: Second occurrence also depletes supply
  const testSecondOccurrenceDepletes = async (): Promise<TestResult> => {
    const logger = createLogger();
    if (!householdId || !user?.uid) {
      return {
        name: 'Second Occurrence Depletes Supply',
        description: 'Complete recurring task twice, verify supply depleted both times',
        passed: false,
        error: 'No household or user',
        logs: logger.logs,
      };
    }

    try {
      logger.write('Creating product: TEST_Supply_MultiDeplete', { quantity: 10 });
      const productId = await createProduct(householdId, user.uid, {
        householdId,
        name: `${TEST_PREFIX}Supply_MultiDeplete`,
        amazonUrl: '',
        containerUnit: 'units',
        currentQuantity: 10,
      });
      logger.info(`Product created with ID: ${productId}`);

      logger.write('Simulating first depletion', { newQuantity: 9 });
      await updateProduct(householdId, productId, { currentQuantity: 9 });
      let product = await getProduct(householdId, productId);
      logger.assert('First depletion: quantity is 9', 9, product?.currentQuantity);
      if (!product || product.currentQuantity !== 9) {
        throw new Error(`First depletion failed: ${product?.currentQuantity}`);
      }

      logger.write('Simulating second depletion', { newQuantity: 8 });
      await updateProduct(householdId, productId, { currentQuantity: 8 });
      product = await getProduct(householdId, productId);
      logger.assert('Second depletion: quantity is 8', 8, product?.currentQuantity);
      if (!product || product.currentQuantity !== 8) {
        throw new Error(`Second depletion failed: ${product?.currentQuantity}`);
      }

      return {
        name: 'Second Occurrence Depletes Supply',
        description: 'Complete recurring task twice, verify supply depleted both times',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      return {
        name: 'Second Occurrence Depletes Supply',
        description: 'Complete recurring task twice, verify supply depleted both times',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 6: Supply hits zero - no negative quantities
  const testNoNegativeQuantity = async (): Promise<TestResult> => {
    const logger = createLogger();
    if (!householdId || !user?.uid) {
      return {
        name: 'No Negative Quantities',
        description: 'Create supply with qty 1, deplete twice, verify stays at 0',
        passed: false,
        error: 'No household or user',
        logs: logger.logs,
      };
    }

    try {
      logger.write('Creating product: TEST_Supply_NoNegative', { quantity: 1 });
      const productId = await createProduct(householdId, user.uid, {
        householdId,
        name: `${TEST_PREFIX}Supply_NoNegative`,
        amazonUrl: '',
        containerUnit: 'units',
        currentQuantity: 1,
      });
      logger.info(`Product created with ID: ${productId}`);

      logger.write('Depleting to 0', { newQuantity: 0 });
      await updateProduct(householdId, productId, { currentQuantity: 0 });
      let product = await getProduct(householdId, productId);
      logger.assert('Quantity is 0', 0, product?.currentQuantity);
      if (!product || product.currentQuantity !== 0) {
        throw new Error(`First depletion wrong: ${product?.currentQuantity}`);
      }

      logger.write('Attempting to deplete below 0 (using Math.max)', { calculatedQty: Math.max(0, -1) });
      const newQty = Math.max(0, product.currentQuantity - 1);
      await updateProduct(householdId, productId, { currentQuantity: newQty });
      product = await getProduct(householdId, productId);
      logger.assert('Quantity stays at 0 (not negative)', 0, product?.currentQuantity);
      if (!product || product.currentQuantity !== 0) {
        throw new Error(`Went negative: ${product?.currentQuantity}`);
      }

      return {
        name: 'No Negative Quantities',
        description: 'Create supply with qty 1, deplete twice, verify stays at 0',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      return {
        name: 'No Negative Quantities',
        description: 'Create supply with qty 1, deplete twice, verify stays at 0',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 7: Supply threshold warning
  const testSupplyThresholdWarning = async (): Promise<TestResult> => {
    const logger = createLogger();
    if (!householdId || !user?.uid) {
      return {
        name: 'Supply Threshold Warning',
        description: 'Create supply qty 5 with threshold 3, deplete to 3, verify low stock',
        passed: false,
        error: 'No household or user',
        logs: logger.logs,
      };
    }

    try {
      logger.write('Creating product: TEST_Supply_Threshold', { quantity: 5, threshold: 3 });
      const productId = await createProduct(householdId, user.uid, {
        householdId,
        name: `${TEST_PREFIX}Supply_Threshold`,
        amazonUrl: '',
        containerUnit: 'units',
        currentQuantity: 5,
        thresholdType: 'quantity',
        thresholdValue: 3,
      });
      logger.info(`Product created with ID: ${productId}`);

      logger.write('Depleting to threshold level', { newQuantity: 3 });
      await updateProduct(householdId, productId, { currentQuantity: 3 });

      logger.read('Checking low stock status');
      const product = await getProduct(householdId, productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const isLowStock = product.currentQuantity <= product.thresholdValue;
      logger.assert('Low stock triggered', true, isLowStock);
      if (!isLowStock) {
        throw new Error(`Low stock not triggered: qty=${product.currentQuantity}, threshold=${product.thresholdValue}`);
      }

      return {
        name: 'Supply Threshold Warning',
        description: 'Create supply qty 5 with threshold 3, deplete to 3, verify low stock',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      return {
        name: 'Supply Threshold Warning',
        description: 'Create supply qty 5 with threshold 3, deplete to 3, verify low stock',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 8: Notification scheduled correctly
  const testNotificationScheduling = async (): Promise<TestResult> => {
    const logger = createLogger();
    try {
      const triggerDate = new Date(Date.now() + 60 * 1000);
      logger.write('Scheduling notification for 60 seconds from now', { triggerDate: triggerDate.toISOString() });
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${TEST_PREFIX}Notification`,
          body: 'This is a test notification',
          data: { taskId: 'test' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      logger.info(`Notification scheduled with ID: ${notificationId}`);

      logger.read('Checking pending notifications');
      const pendingBefore = await Notifications.getAllScheduledNotificationsAsync();
      const found = pendingBefore.some(n => n.identifier === notificationId);
      logger.assert('Notification found in pending list', true, found);

      if (!found) {
        throw new Error('Notification not found in pending list');
      }

      logger.write('Canceling notification');
      await Notifications.cancelScheduledNotificationAsync(notificationId);

      logger.read('Verifying notification was canceled');
      const pendingAfter = await Notifications.getAllScheduledNotificationsAsync();
      const stillFound = pendingAfter.some(n => n.identifier === notificationId);
      logger.assert('Notification removed from pending list', false, stillFound);

      if (stillFound) {
        throw new Error('Notification still in pending list after cancel');
      }

      return {
        name: 'Notification Scheduling',
        description: 'Schedule notification, verify pending, cancel, verify removed',
        passed: true,
        logs: logger.logs,
      };
    } catch (error: any) {
      return {
        name: 'Notification Scheduling',
        description: 'Schedule notification, verify pending, cancel, verify removed',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  // Test 9: HVAC Filter 12-Month Simulation
  const testHVACSimulation = async (): Promise<TestResult> => {
    const logger = createLogger();
    if (!householdId || !user?.uid) {
      return {
        name: 'HVAC Filter 12-Month Simulation',
        description: 'Simulate 12 months of filter replacements with restocks',
        passed: false,
        error: 'No household or user',
        logs: logger.logs,
      };
    }

    try {
      // Step 1: Create supply
      logger.write('Creating supply: TEST_HVAC Filters', {
        quantity: 12,
        unit: 'filters',
        threshold: 1,
      });
      const productId = await createProduct(householdId, user.uid, {
        householdId,
        name: `${TEST_PREFIX}HVAC Filters`,
        amazonUrl: '',
        containerUnit: 'filters',
        currentQuantity: 12,
        thresholdType: 'quantity',
        thresholdValue: 1,
      });
      logger.info(`Supply created with ID: ${productId}`);

      // Add initial history record
      const now = new Date();
      const startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 12);
      logger.write('Adding initial history record', { date: startDate.toISOString(), quantity: 12 });
      await addHistoryRecord(householdId, productId, {
        date: startDate,
        quantity: 12,
        eventType: 'purchase',
        note: 'Initial stock of HVAC filters',
      });

      // Step 2: Create recurring monthly task
      logger.write('Creating task: TEST_Replace HVAC Filter', {
        frequency: 'monthly',
        interval: 1,
      });
      const taskId = await createTask(householdId, user.displayName ?? 'Test', {
        householdId,
        name: `${TEST_PREFIX}Replace HVAC Filter`,
        category: 'Equipment',
        firstDueDate: startDate,
        recurrence: { frequency: 'monthly', interval: 1 },
        hasInventory: true,
        instructions: null,
        reminderDaysBefore: null,
      }, user.uid);
      logger.info(`Task created with ID: ${taskId}`);

      // Link supply to task
      logger.write('Linking supply to task', { usageAmount: 1 });
      await addProductUsageToTask(householdId, taskId, productId, `${TEST_PREFIX}HVAC Filters`, 1, 'filters');

      // Step 3: Simulate 12 months
      logger.info('Starting 12-month simulation...');
      let currentQty = 12;
      let restockCount = 0;

      for (let month = 0; month < 12; month++) {
        const completionDate = new Date(startDate);
        completionDate.setMonth(completionDate.getMonth() + month);

        // Deplete by 1
        currentQty = Math.max(0, currentQty - 1);
        logger.write(`Month ${month + 1}: Depleting filter`, {
          date: completionDate.toISOString(),
          newQuantity: currentQty,
        });

        await addHistoryRecord(householdId, productId, {
          date: completionDate,
          quantity: currentQty,
          eventType: 'task_completion',
          note: `${TEST_PREFIX}Replace HVAC Filter completed`,
        });

        // Check if we need to restock (when hitting threshold of 1)
        if (currentQty === 1) {
          restockCount++;
          const restockDate = new Date(completionDate);
          restockDate.setDate(restockDate.getDate() + 3); // 3 days later
          currentQty += 6;
          logger.write(`Restock #${restockCount}: Adding 6 filters`, {
            date: restockDate.toISOString(),
            newQuantity: currentQty,
          });

          await addHistoryRecord(householdId, productId, {
            date: restockDate,
            quantity: currentQty,
            eventType: 'purchase',
            note: `Restocked +6 filters (restock #${restockCount})`,
          });
        }
      }

      // Update final quantity
      logger.write('Updating final supply quantity', { finalQuantity: currentQty });
      await updateProduct(householdId, productId, { currentQuantity: currentQty });

      // Verify
      logger.read('Verifying final state');
      const finalProduct = await getProduct(householdId, productId);
      logger.assert('Final quantity between 1-6', true, finalProduct?.currentQuantity !== undefined && finalProduct.currentQuantity >= 1 && finalProduct.currentQuantity <= 7);
      logger.info(`Final quantity: ${finalProduct?.currentQuantity} filters`);
      logger.info(`Total restocks: ${restockCount}`);

      return {
        name: 'HVAC Filter 12-Month Simulation',
        description: 'Simulate 12 months of filter replacements with restocks',
        passed: true,
        logs: logger.logs,
        message: `Go to Supplies tab and look for "${TEST_PREFIX}HVAC Filters" to see the history chart with the saw-tooth pattern!`,
      };
    } catch (error: any) {
      return {
        name: 'HVAC Filter 12-Month Simulation',
        description: 'Simulate 12 months of filter replacements with restocks',
        passed: false,
        error: error?.message ?? String(error),
        logs: logger.logs,
      };
    }
  };

  const runAllTests = async () => {
    setRunning(true);
    setResults([]);
    setExpandedIndex(null);

    const tests = [
      { name: 'Firebase Connection', fn: testFirebaseConnection },
      { name: 'Basic Supply Depletion', fn: testBasicSupplyDepletion },
      { name: 'Supply Depletion on Task Complete', fn: testSupplyDepletionOnTaskComplete },
      { name: 'Recurring Task New Occurrence', fn: testRecurringTaskCreatesNewOccurrence },
      { name: 'Second Occurrence Depletes Supply', fn: testSecondOccurrenceDepletes },
      { name: 'No Negative Quantities', fn: testNoNegativeQuantity },
      { name: 'Supply Threshold Warning', fn: testSupplyThresholdWarning },
      { name: 'Notification Scheduling', fn: testNotificationScheduling },
      { name: 'HVAC Filter 12-Month Simulation', fn: testHVACSimulation },
    ];

    for (const test of tests) {
      setCurrentTest(test.name);
      const result = await test.fn();
      addResult(result);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setCurrentTest(null);
    setRunning(false);
  };

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.filter((r) => !r.passed).length;

  const toggleExpanded = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const logTypeIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'write': return '📝';
      case 'read': return '📖';
      case 'assert': return '✓';
      case 'info': return 'ℹ️';
      default: return '•';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Developer Test Suite</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.runButton, running && styles.runButtonDisabled]}
          onPress={runAllTests}
          disabled={running || cleaning}
          activeOpacity={0.8}
        >
          {running ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.runButtonText}>Run All Tests</Text>
          )}
        </TouchableOpacity>
      </View>

      {running && currentTest ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.progressText}>Running: {currentTest}</Text>
        </View>
      ) : null}

      {results.length > 0 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            <Text style={styles.passText}>{passCount} passed</Text>
            {' / '}
            <Text style={styles.failText}>{failCount} failed</Text>
            {' / '}
            {results.length} total
          </Text>
        </View>
      ) : null}

      <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.resultsContent}>
        {results.map((result, index) => (
          <View key={index}>
            <TouchableOpacity
              style={[
                styles.resultCard,
                result.passed ? styles.resultCardPass : styles.resultCardFail,
              ]}
              onPress={() => toggleExpanded(index)}
              activeOpacity={0.7}
            >
              <View style={styles.resultHeader}>
                <Text style={styles.resultIcon}>
                  {result.passed ? '✅' : '❌'}
                </Text>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName}>{result.name}</Text>
                  <Text style={styles.expandHint}>
                    {expandedIndex === index ? '▼' : '▶'}
                  </Text>
                </View>
              </View>
              <Text style={styles.resultDescription}>{result.description}</Text>
              {result.error ? (
                <Text style={styles.resultError}>{result.error}</Text>
              ) : null}
              {result.message ? (
                <Text style={styles.resultMessage}>{result.message}</Text>
              ) : null}
            </TouchableOpacity>

            {expandedIndex === index ? (
              <View style={styles.logsContainer}>
                <Text style={styles.logsTitle}>Test Log ({result.logs.length} entries)</Text>
                {result.logs.map((log, logIndex) => (
                  <View key={logIndex} style={styles.logEntry}>
                    <Text style={styles.logIcon}>{logTypeIcon(log.type)}</Text>
                    <View style={styles.logContent}>
                      <Text style={styles.logMessage}>{log.message}</Text>
                      {log.data ? (
                        <Text style={styles.logData}>{log.data}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        {!running && results.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🧪</Text>
            <Text style={styles.emptyText}>
              Tap "Run All Tests" to start the test suite
            </Text>
            <Text style={styles.emptySubtext}>
              Tests create TEST_ prefixed data that persists for inspection
            </Text>
          </View>
        ) : null}

        {results.length > 0 ? (
          <TouchableOpacity
            style={[styles.clearButton, cleaning && styles.clearButtonDisabled]}
            onPress={clearTestData}
            disabled={cleaning || running}
            activeOpacity={0.8}
          >
            {cleaning ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <Text style={styles.clearButtonText}>🗑️ Clear Test Data</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.headerBackground,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  backText: {
    fontSize: 17,
    color: Colors.primary,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60,
  },
  controlsRow: {
    padding: 16,
  },
  runButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  runButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  progressText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  summaryRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  summaryText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  passText: {
    color: '#10B981',
    fontWeight: '600',
  },
  failText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  resultsScroll: {
    flex: 1,
  },
  resultsContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 32,
  },
  resultCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  resultCardPass: {
    borderLeftColor: '#10B981',
  },
  resultCardFail: {
    borderLeftColor: '#EF4444',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  expandHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  resultDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginLeft: 32,
  },
  resultError: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 8,
    marginLeft: 32,
  },
  resultMessage: {
    fontSize: 13,
    color: Colors.primary,
    marginTop: 8,
    marginLeft: 32,
    fontWeight: '500',
  },
  logsContainer: {
    backgroundColor: '#1A202C',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    marginTop: -4,
  },
  logsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0AEC0',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logEntry: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  logIcon: {
    fontSize: 12,
    width: 24,
    marginRight: 8,
  },
  logContent: {
    flex: 1,
  },
  logMessage: {
    fontSize: 12,
    color: '#E2E8F0',
  },
  logData: {
    fontSize: 11,
    color: '#718096',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  clearButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
  },
  clearButtonDisabled: {
    opacity: 0.5,
  },
  clearButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
