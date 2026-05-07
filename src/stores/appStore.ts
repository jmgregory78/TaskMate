import { create } from 'zustand';
import { User } from '../types/models';

interface AppState {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  currentHouseholdId: string | null;
  setCurrentHouseholdId: (id: string | null) => void;
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  // Task IDs that should trigger TaskAlertModal (from notifications or expired snoozes)
  pendingAlertTaskIds: string[];
  setPendingAlertTaskIds: (ids: string[]) => void;
  clearPendingAlertTaskIds: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  currentHouseholdId: null,
  setCurrentHouseholdId: (id) => set({ currentHouseholdId: id }),
  showOnboarding: false,
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  pendingAlertTaskIds: [],
  setPendingAlertTaskIds: (ids) => set({ pendingAlertTaskIds: ids }),
  clearPendingAlertTaskIds: () => set({ pendingAlertTaskIds: [] }),
}));
