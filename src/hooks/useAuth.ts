import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAppStore } from '../stores/appStore';
import { User } from '../types/models';

export function useAuth() {
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const setCurrentHouseholdId = useAppStore((s) => s.setCurrentHouseholdId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const user: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName,
          householdIds: [],
        };
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        setCurrentHouseholdId(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [setCurrentUser, setCurrentHouseholdId]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return { user: currentUser, loading, signIn, signUp, signOut };
}
