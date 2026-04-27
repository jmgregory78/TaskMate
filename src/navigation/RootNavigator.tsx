import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../stores/appStore';
import { getUserHousehold } from '../services/householdService';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import CreateHouseholdScreen from '../screens/onboarding/CreateHouseholdScreen';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type OnboardingStackParamList = {
  CreateHousehold: undefined;
};

export type AppStackParamList = {
  Home: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function HomeScreen() {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.center}>
      <Text style={styles.welcomeTitle}>Welcome to TaskMate</Text>
      {user?.email ? (
        <Text style={styles.welcomeEmail}>{user.email}</Text>
      ) : null}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() => {
          void signOut();
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const currentHouseholdId = useAppStore((s) => s.currentHouseholdId);
  const setCurrentHouseholdId = useAppStore((s) => s.setCurrentHouseholdId);
  const [checkedForUid, setCheckedForUid] = useState<string | null>(null);

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

  const householdLoading = !!user && checkedForUid !== user.uid;

  if (authLoading || householdLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      </AuthStack.Navigator>
    );
  }

  if (!currentHouseholdId) {
    return (
      <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
        <OnboardingStack.Screen
          name="CreateHousehold"
          component={CreateHouseholdScreen}
        />
      </OnboardingStack.Navigator>
    );
  }

  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Home" component={HomeScreen} />
    </AppStack.Navigator>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  welcomeEmail: {
    fontSize: 15,
    color: '#555',
    marginBottom: 32,
  },
  signOutButton: {
    height: 48,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  signOutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
});
