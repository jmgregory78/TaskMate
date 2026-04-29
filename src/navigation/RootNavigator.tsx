import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../stores/appStore';
import { getUserHousehold } from '../services/householdService';
import { resetCompletedToday } from '../services/taskService';
import {
  clearPurchasePending,
  getPendingPurchases,
} from '../services/productService';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import CreateHouseholdScreen from '../screens/onboarding/CreateHouseholdScreen';
import TimelineScreen from '../screens/timeline/TimelineScreen';
import AddTaskScreen from '../screens/timeline/AddTaskScreen';
import EditTaskScreen from '../screens/timeline/EditTaskScreen';
import TaskDetailScreen from '../screens/taskDetail/TaskDetailScreen';
import AddProductUsageScreen from '../screens/taskDetail/AddProductUsageScreen';
import LogPurchaseScreen from '../screens/taskDetail/LogPurchaseScreen';
import ProductDetailScreen from '../screens/supplies/ProductDetailScreen';
import SuppliesScreen from '../screens/supplies/SuppliesScreen';
import CreateProductScreen from '../screens/supplies/CreateProductScreen';
import EditProductScreen from '../screens/supplies/EditProductScreen';
import HouseholdSettingsScreen from '../screens/household/HouseholdSettingsScreen';
import PendingPurchasePrompt, {
  PendingItem,
} from '../components/PendingPurchasePrompt';
import SplashScreen from '../screens/SplashScreen';
import { navigationRef } from './navigationRef';
import { Colors } from '../constants/colors';
import type { Product } from '../types/models';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type OnboardingStackParamList = {
  CreateHousehold: undefined;
};

export type MainTabsParamList = {
  Tasks: undefined;
  Supplies: undefined;
};

export type AppStackParamList = {
  Main: undefined;
  AddTask: undefined;
  TaskDetail: { taskId: string };
  EditTask: { taskId: string; householdId: string };
  AddProductUsage: { householdId: string; taskId: string };
  LogPurchase: { householdId: string; productId: string };
  ProductDetail: { householdId: string; productId: string };
  CreateProduct: undefined;
  EditProduct: { product: Product };
  HouseholdSettings: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

const TAB_ICONS: Record<string, string> = {
  Tasks: '📋',
  Supplies: '🛒',
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const icon = TAB_ICONS[route.name] ?? '•';
        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
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
            <Text style={styles.tabIcon}>{icon}</Text>
            <Text
              style={[
                styles.tabLabel,
                isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              {route.name}
            </Text>
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
      <Tabs.Screen name="Tasks" component={TimelineScreen} />
      <Tabs.Screen name="Supplies" component={SuppliesScreen} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const currentHouseholdId = useAppStore((s) => s.currentHouseholdId);
  const setCurrentHouseholdId = useAppStore((s) => s.setCurrentHouseholdId);
  const [checkedForUid, setCheckedForUid] = useState<string | null>(null);

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
        <AppStack.Navigator screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="Main" component={MainTabs} />
          <AppStack.Screen name="AddTask" component={AddTaskScreen} />
          <AppStack.Screen name="TaskDetail" component={TaskDetailScreen} />
          <AppStack.Screen name="EditTask" component={EditTaskScreen} />
          <AppStack.Screen
            name="AddProductUsage"
            component={AddProductUsageScreen}
          />
          <AppStack.Screen name="LogPurchase" component={LogPurchaseScreen} />
          <AppStack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
          />
          <AppStack.Screen
            name="CreateProduct"
            component={CreateProductScreen}
          />
          <AppStack.Screen
            name="EditProduct"
            component={EditProductScreen}
          />
          <AppStack.Screen
            name="HouseholdSettings"
            component={HouseholdSettingsScreen}
          />
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 70,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.tabBarBackground,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
  tabLabelActive: {
    color: Colors.primary,
  },
  tabLabelInactive: {
    color: Colors.textOnDarkMuted,
  },
});
