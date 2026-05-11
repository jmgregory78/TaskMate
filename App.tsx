import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { useAppStore } from './src/stores/appStore';
import { runAutoDepletion } from './src/services/autoDepletionService';
import { getExpiredSnoozedTasks } from './src/services/taskService';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function AutoDepletionHandler() {
  const householdId = useAppStore((s) => s.currentHouseholdId);
  const setPendingAlertTaskIds = useAppStore((s) => s.setPendingAlertTaskIds);
  const appState = useRef(AppState.currentState);
  const notificationResponseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Run auto-depletion on initial mount if we have a household
    if (householdId) {
      runAutoDepletion(householdId).catch((e) => {
        console.warn('[App] initial auto-depletion failed:', e);
      });

      // Check for expired snoozed tasks on initial mount
      getExpiredSnoozedTasks(householdId)
        .then((expiredTasks) => {
          if (expiredTasks.length > 0) {
            setPendingAlertTaskIds(expiredTasks.map((t) => t.id));
          }
        })
        .catch((e) => {
          console.warn('[App] initial expired snooze check failed:', e);
        });
    }

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        // When app comes to foreground from background/inactive
        if (
          appState.current.match(/inactive|background/) &&
          nextState === 'active' &&
          householdId
        ) {
          runAutoDepletion(householdId).catch((e) => {
            console.warn('[App] auto-depletion on resume failed:', e);
          });

          // Check for expired snoozed tasks when app becomes active (FIX 5)
          getExpiredSnoozedTasks(householdId)
            .then((expiredTasks) => {
              if (expiredTasks.length > 0) {
                setPendingAlertTaskIds(expiredTasks.map((t) => t.id));
              }
            })
            .catch((e) => {
              console.warn('[App] expired snooze check on resume failed:', e);
            });
        }
        appState.current = nextState;
      }
    );

    // Handle notification tap (FIX 3)
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const taskId = response.notification.request.content.data?.taskId as
          | string
          | undefined;
        if (taskId) {
          // Set the task ID to trigger TaskAlertModal in HomeScreen
          setPendingAlertTaskIds([taskId]);
          // Navigate to home screen to show the alert (Main contains the tabs, Home is default)
          if (navigationRef.isReady()) {
            navigationRef.navigate('Main' as never);
          }
        }
      });

    return () => {
      subscription.remove();
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
    };
  }, [householdId, setPendingAlertTaskIds]);

  return null;
}

console.log('[App] Module loading...');

export default function App() {
  console.log('[App] App component rendering...');

  // Global error handlers for debugging
  React.useEffect(() => {
    console.log('[App] Setting up global error handlers...');
    const handler = (error: Error, isFatal?: boolean) => {
      console.log('GLOBAL ERROR:', isFatal ? 'FATAL' : 'non-fatal', error?.message, error?.stack);
    };
    // @ts-ignore - ErrorUtils is a React Native global
    ErrorUtils.setGlobalHandler(handler);

    const rejectionHandler = (event: any) => {
      console.log('UNHANDLED PROMISE REJECTION:', event?.reason);
    };
    // @ts-ignore
    global.HermesInternal?.hasPromise?.() && Promise._captureStackTrace && null;
    console.log('[App] Global error handlers set up complete');
  }, []);

  console.log('[App] About to render SafeAreaProvider...');
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer ref={navigationRef}>
          <AutoDepletionHandler />
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
