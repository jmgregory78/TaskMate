import { createNavigationContainerRef } from '@react-navigation/native';
import type { AppStackParamList } from './RootNavigator';

export const navigationRef =
  createNavigationContainerRef<AppStackParamList>();
