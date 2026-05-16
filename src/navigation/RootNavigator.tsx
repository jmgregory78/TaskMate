import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Modal,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../stores/appStore';
import {
  getUserHousehold,
  hasCompletedOnboarding,
  hasCompletedSetupWizard,
  markOnboardingComplete,
} from '../services/householdService';
import { getFirstName } from '../utils/nameUtils';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import { resetCompletedToday } from '../services/taskService';
import {
  clearPurchasePending,
  getPendingPurchases,
} from '../services/productService';
import { registerForPushNotifications } from '../services/notificationService';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import CreateHouseholdScreen from '../screens/onboarding/CreateHouseholdScreen';
import HomeScreen from '../screens/home/HomeScreen';
import TimelineScreen from '../screens/timeline/TimelineScreen';
import AddTaskScreen from '../screens/timeline/AddTaskScreen';
import EditTaskScreen from '../screens/timeline/EditTaskScreen';
import SuggestedTasksScreen from '../screens/timeline/SuggestedTasksScreen';
import TaskDetailScreen from '../screens/taskDetail/TaskDetailScreen';
import CompletedTaskDetailScreen from '../screens/timeline/CompletedTaskDetailScreen';
import AddProductUsageScreen from '../screens/taskDetail/AddProductUsageScreen';
import LogPurchaseScreen from '../screens/taskDetail/LogPurchaseScreen';
import ProductDetailScreen from '../screens/supplies/ProductDetailScreen';
import SuppliesScreen from '../screens/supplies/SuppliesScreen';
import CreateProductScreen from '../screens/supplies/CreateProductScreen';
import EditProductScreen from '../screens/supplies/EditProductScreen';
import SuggestedSuppliesScreen from '../screens/supplies/SuggestedSuppliesScreen';
import SetupWizardScreen, {
  SetupWizardMode,
} from '../screens/setup/SetupWizardScreen';
import HouseholdSettingsScreen from '../screens/household/HouseholdSettingsScreen';
import AppTutorialScreen from '../screens/appguide/AppTutorialScreen';
import FeedbackScreen from '../screens/appguide/FeedbackScreen';
import NotificationPreferencesScreen from '../screens/profile/NotificationPreferencesScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import TestSuiteScreen from '../screens/dev/TestSuiteScreen';
import PendingPurchasePrompt, {
  PendingItem,
} from '../components/PendingPurchasePrompt';
import DisplayNameRequiredModal from '../components/DisplayNameRequiredModal';
import SplashScreen from '../screens/SplashScreen';

function needsDisplayName(displayName: string | null | undefined): boolean {
  // No name set
  if (!displayName || displayName.trim() === '') return true;
  // Name looks like an email
  if (displayName.includes('@')) return true;
  // Name too short
  if (displayName.trim().length < 2) return true;
  return false;
}
import { navigationRef } from './navigationRef';
import { Colors } from '../constants/colors';
import type {
  Product,
  RecurrenceFrequency,
  SerializedTask,
  Task,
  TaskCategory,
} from '../types/models';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type OnboardingStackParamList = {
  CreateHousehold: undefined;
};

export type MainTabsParamList = {
  Home: undefined;
  Tasks: undefined;
  Supplies: undefined;
};

export type AppStackParamList = {
  Main: undefined;
  AddTask:
    | {
        prefill?: {
          name?: string;
          category?: TaskCategory;
          frequency?: RecurrenceFrequency;
          interval?: number;
          reminderDaysBefore?: number;
        };
      }
    | undefined;
  SuggestedTasks: { preSelected?: string } | undefined;
  TaskDetail: { taskId: string };
  CompletedTaskDetail: { taskId: string; task: SerializedTask };
  EditTask: { taskId: string; householdId: string };
  AddProductUsage: { householdId: string; taskId: string };
  LogPurchase: { householdId: string; productId: string };
  ProductDetail: { householdId: string; productId: string };
  CreateProduct: undefined;
  EditProduct: { product: Product };
  SuggestedSupplies: {
    filterSupplyIds?: string[];
    expandCategoryIds?: string[];
    preCheckSupplyIds?: string[];
    fromTaskCategory?: string;
  } | undefined;
  SetupWizard: { mode: SetupWizardMode };
  HouseholdSettings: undefined;
  AppTutorial: undefined;
  Feedback: undefined;
  NotificationPreferences: undefined;
  Settings: undefined;
  TestSuite: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

const TAB_ICON_SIZE = 32;
const TAB_STROKE = 2;
const tabIconStyle = { marginBottom: 8 } as const;

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg
      width={TAB_ICON_SIZE}
      height={TAB_ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      style={tabIconStyle}
    >
      <Path
        d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 21V12h6v9"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TasksIcon({ color }: { color: string }) {
  return (
    <Svg
      width={TAB_ICON_SIZE}
      height={TAB_ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      style={tabIconStyle}
    >
      <Path
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 12l2 2 4-4"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 17h6"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SuppliesIcon({ color }: { color: string }) {
  return (
    <Svg
      width={TAB_ICON_SIZE}
      height={TAB_ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      style={tabIconStyle}
    >
      <Path
        d="M6 2H3"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M3 2l2.5 11.5a2 2 0 002 1.5h9a2 2 0 001.96-1.608L20 6H6"
        stroke={color}
        strokeWidth={TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="9" cy="20" r="1.5" stroke={color} strokeWidth={TAB_STROKE} />
      <Circle cx="17" cy="20" r="1.5" stroke={color} strokeWidth={TAB_STROKE} />
    </Svg>
  );
}

function tabIconFor(routeName: string, color: string): React.ReactNode {
  if (routeName === 'Home') return <HomeIcon color={color} />;
  if (routeName === 'Tasks') return <TasksIcon color={color} />;
  if (routeName === 'Supplies') return <SuppliesIcon color={color} />;
  return null;
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const color = isFocused ? Colors.primary : '#FFFFFF';
        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={route.name}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={styles.tabItem}
            activeOpacity={0.7}
          >
            {tabIconFor(route.name, color)}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Tasks" component={TimelineScreen} />
      <Tabs.Screen name="Supplies" component={SuppliesScreen} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const currentHouseholdId = useAppStore((s) => s.currentHouseholdId);
  const setCurrentHouseholdId = useAppStore((s) => s.setCurrentHouseholdId);
  const showOnboarding = useAppStore((s) => s.showOnboarding);
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding);
  const [checkedForUid, setCheckedForUid] = useState<string | null>(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [setupWizardChecked, setSetupWizardChecked] = useState(false);
  const [showDisplayNameModal, setShowDisplayNameModal] = useState(false);
  const [displayNameChecked, setDisplayNameChecked] = useState(false);

  // Check if user needs to set display name
  useEffect(() => {
    if (!user?.uid || !currentHouseholdId) {
      setDisplayNameChecked(false);
      setShowDisplayNameModal(false);
      return;
    }
    if (displayNameChecked) return;

    // Check if display name is needed
    if (needsDisplayName(user.displayName)) {
      setShowDisplayNameModal(true);
    }
    setDisplayNameChecked(true);
  }, [user?.uid, user?.displayName, currentHouseholdId, displayNameChecked]);

  useEffect(() => {
    if (!user?.uid || !currentHouseholdId) {
      setOnboardingChecked(false);
      setSetupWizardChecked(false);
      return;
    }
    if (onboardingChecked) return;
    let cancelled = false;
    hasCompletedOnboarding(user.uid)
      .then((done) => {
        if (cancelled) return;
        if (!done) setShowOnboarding(true);
      })
      .catch((e) => {
        console.warn('[RootNavigator] onboarding check failed:', e);
      })
      .finally(() => {
        if (!cancelled) setOnboardingChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    user?.uid,
    currentHouseholdId,
    onboardingChecked,
    setShowOnboarding,
  ]);

  // Launch the setup wizard once after onboarding completes (or on app start
  // if a previous attempt was interrupted before setupWizardComplete was set).
  useEffect(() => {
    if (!user?.uid || !currentHouseholdId) return;
    if (showOnboarding) return; // Wait until onboarding modal is gone
    if (!onboardingChecked) return; // Wait until we know onboarding state
    if (setupWizardChecked) return;
    let cancelled = false;
    hasCompletedSetupWizard(user.uid)
      .then((done) => {
        if (cancelled) return;
        if (!done) {
          // Slight defer so the navigator has settled before pushing.
          setTimeout(() => {
            navigationRef.current?.navigate('SetupWizard', {
              mode: 'firstTime',
            });
          }, 0);
        }
      })
      .catch((e) => {
        console.warn('[RootNavigator] setup wizard check failed:', e);
      })
      .finally(() => {
        if (!cancelled) setSetupWizardChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    user?.uid,
    currentHouseholdId,
    showOnboarding,
    onboardingChecked,
    setupWizardChecked,
  ]);

  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pendingIndex, setPendingIndex] = useState(0);
  const [pendingFetchedFor, setPendingFetchedFor] = useState<string | null>(
    null
  );
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastFetchAtRef = useRef<number>(0);

  useEffect(() => {
    if (!user) {
      if (checkedForUid !== null) setCheckedForUid(null);
      return;
    }
    if (checkedForUid === user.uid) return;

    let cancelled = false;
    getUserHousehold(user.uid)
      .then((id) => {
        if (cancelled) return;
        setCurrentHouseholdId(id);
        setCheckedForUid(user.uid);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentHouseholdId(null);
        setCheckedForUid(user.uid);
      });
    return () => {
      cancelled = true;
    };
  }, [user, checkedForUid, setCurrentHouseholdId]);

  const fetchPending = (householdId: string) => {
    lastFetchAtRef.current = Date.now();
    resetCompletedToday(householdId).catch((e) => {
      console.warn('[RootNavigator] resetCompletedToday failed:', e);
    });
    getPendingPurchases(householdId)
      .then((items) => {
        setPendingItems(items);
        setPendingIndex(0);
      })
      .catch((e) => {
        console.warn('[RootNavigator] getPendingPurchases failed:', e);
      });
  };

  useEffect(() => {
    if (!currentHouseholdId) {
      setPendingFetchedFor(null);
      setPendingItems([]);
      return;
    }
    if (pendingFetchedFor === currentHouseholdId) return;
    setPendingFetchedFor(currentHouseholdId);
    fetchPending(currentHouseholdId);
  }, [currentHouseholdId, pendingFetchedFor]);

  // Register for push notifications + handle taps to open the task detail.
  useEffect(() => {
    if (!user?.uid || !currentHouseholdId) return;
    void registerForPushNotifications(user.uid);

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data ?? {};
        const taskId = typeof data.taskId === 'string' ? data.taskId : null;
        if (!taskId || taskId === 'test') return;
        if (navigationRef.current) {
          navigationRef.current.navigate('TaskDetail', { taskId });
        }
      }
    );

    return () => {
      sub.remove();
    };
  }, [user?.uid, currentHouseholdId]);

  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (
        prev !== 'active' &&
        next === 'active' &&
        currentHouseholdId &&
        Date.now() - lastFetchAtRef.current > 5_000
      ) {
        fetchPending(currentHouseholdId);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [currentHouseholdId]);

  const handlePendingYes = (item: PendingItem) => {
    setPendingItems([]);
    setPendingIndex(0);
    navigationRef.current?.navigate('LogPurchase', {
      householdId: item.product.householdId,
      productId: item.product.id,
    });
  };

  const handlePendingNo = (item: PendingItem) => {
    clearPurchasePending(item.product.householdId, item.product.id).catch(
      (e) => {
        console.warn('[RootNavigator] clearPurchasePending failed:', e);
      }
    );
    if (pendingIndex + 1 >= pendingItems.length) {
      setPendingItems([]);
      setPendingIndex(0);
    } else {
      setPendingIndex((i) => i + 1);
    }
  };

  const handleDismissAll = () => {
    const remaining = pendingItems.slice(pendingIndex);
    Promise.all(
      remaining.map((item) =>
        clearPurchasePending(item.product.householdId, item.product.id)
      )
    ).catch((e) => {
      console.warn('[RootNavigator] dismiss-all clear failed:', e);
    });
    setPendingItems([]);
    setPendingIndex(0);
  };

  const householdLoading = !!user && checkedForUid !== user.uid;
  const splashVisible = authLoading || householdLoading;

  let navigator: React.ReactNode = null;
  if (!splashVisible) {
    if (!user) {
      navigator = (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="SignUp" component={SignUpScreen} />
        </AuthStack.Navigator>
      );
    } else if (!currentHouseholdId) {
      navigator = (
        <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
          <OnboardingStack.Screen
            name="CreateHousehold"
            component={CreateHouseholdScreen}
          />
        </OnboardingStack.Navigator>
      );
    } else {
      navigator = (
        <AppStack.Navigator
          screenOptions={{
            headerShown: false,
            headerTintColor: '#FFFFFF',
            headerStyle: { backgroundColor: '#1F2937' },
            headerTitleStyle: { color: '#FFFFFF', fontWeight: 'bold' },
          }}
        >
          <AppStack.Screen name="Main" component={MainTabs} />
          <AppStack.Screen name="AddTask" component={AddTaskScreen} />
          <AppStack.Screen
            name="SuggestedTasks"
            component={SuggestedTasksScreen}
            options={{
              headerTintColor: '#FFFFFF',
              headerStyle: { backgroundColor: '#1F2937' },
              headerTitleStyle: { color: '#FFFFFF', fontWeight: 'bold' },
            }}
          />
          <AppStack.Screen name="TaskDetail" component={TaskDetailScreen} />
          <AppStack.Screen
            name="CompletedTaskDetail"
            component={CompletedTaskDetailScreen}
          />
          <AppStack.Screen
            name="EditTask"
            component={EditTaskScreen}
            options={{
              headerTintColor: '#FFFFFF',
              headerStyle: { backgroundColor: '#1F2937' },
              headerTitleStyle: { color: '#FFFFFF', fontWeight: 'bold' },
            }}
          />
          <AppStack.Screen
            name="AddProductUsage"
            component={AddProductUsageScreen}
          />
          <AppStack.Screen name="LogPurchase" component={LogPurchaseScreen} />
          <AppStack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{
              headerTintColor: '#FFFFFF',
              headerStyle: { backgroundColor: '#1F2937' },
              headerTitleStyle: { color: '#FFFFFF', fontWeight: 'bold' },
            }}
          />
          <AppStack.Screen
            name="CreateProduct"
            component={CreateProductScreen}
            options={{
              headerTintColor: '#FFFFFF',
              headerStyle: { backgroundColor: '#1F2937' },
              headerTitleStyle: { color: '#FFFFFF', fontWeight: 'bold' },
            }}
          />
          <AppStack.Screen
            name="EditProduct"
            component={EditProductScreen}
          />
          <AppStack.Screen
            name="SuggestedSupplies"
            component={SuggestedSuppliesScreen}
            options={{
              headerTintColor: '#FFFFFF',
              headerStyle: { backgroundColor: '#1F2937' },
              headerTitleStyle: { color: '#FFFFFF', fontWeight: 'bold' },
            }}
          />
          <AppStack.Screen
            name="SetupWizard"
            component={SetupWizardScreen}
            options={{ gestureEnabled: false }}
          />
          <AppStack.Screen
            name="HouseholdSettings"
            component={HouseholdSettingsScreen}
          />
          <AppStack.Screen name="AppTutorial" component={AppTutorialScreen} />
          <AppStack.Screen name="Feedback" component={FeedbackScreen} />
          <AppStack.Screen
            name="NotificationPreferences"
            component={NotificationPreferencesScreen}
            options={{
              headerTintColor: '#FFFFFF',
              headerStyle: { backgroundColor: '#1F2937' },
              headerTitleStyle: { color: '#FFFFFF', fontWeight: 'bold' },
            }}
          />
          <AppStack.Screen name="Settings" component={SettingsScreen} />
          <AppStack.Screen name="TestSuite" component={TestSuiteScreen} />
        </AppStack.Navigator>
      );
    }
  }

  return (
    <View style={styles.flex}>
      {navigator}
      {!!user && currentHouseholdId ? (
        <PendingPurchasePrompt
          visible={pendingItems.length > 0}
          items={pendingItems}
          index={pendingIndex}
          onYes={handlePendingYes}
          onNo={handlePendingNo}
          onDismissAll={handleDismissAll}
        />
      ) : null}
      <SplashScreen visible={splashVisible} />
      <DisplayNameRequiredModal
        visible={
          !!user &&
          !!currentHouseholdId &&
          showDisplayNameModal &&
          !splashVisible &&
          !showOnboarding
        }
        onComplete={() => {
          setShowDisplayNameModal(false);
        }}
      />
      <Modal
        visible={
          !!user &&
          !!currentHouseholdId &&
          showOnboarding &&
          !splashVisible &&
          !showDisplayNameModal
        }
        animationType="slide"
        transparent={false}
      >
        {user && currentHouseholdId ? (
          <OnboardingScreen
            firstName={getFirstName(user.displayName ?? 'there')}
            onComplete={() => {
              void markOnboardingComplete(user.uid).catch((e) => {
                console.warn(
                  '[RootNavigator] markOnboardingComplete failed:',
                  e
                );
              });
              setShowOnboarding(false);
            }}
          />
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 77,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: Colors.headerBackground,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
