import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAppStore } from '../../stores/appStore';
import { useAuth } from '../../hooks/useAuth';
import ScreenHeader from '../../components/ScreenHeader';
import { Colors } from '../../constants/colors';
import { StatusBar } from 'expo-status-bar';

export default function AppGuideScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding);

  const handleStartTour = async () => {
    if (!user?.uid) return;
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { onboardingComplete: false },
        { merge: true }
      );
    } catch (e) {
      console.warn('[AppGuide] reset onboarding failed:', e);
    }
    setShowOnboarding(true);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScreenHeader title="App Guide" leftLabel="Back" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.tourEmoji}>🗺️</Text>
          <Text style={styles.tourTitle}>Take the App Tour</Text>
          <Text style={styles.tourBody}>
            A quick walkthrough of what TaskMate can do for your household
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleStartTour}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Start Tour →</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.appInfo}>Version 1.0.0</Text>
        <Text style={styles.appInfo}>Made with ❤️ for busy households</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 64,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tourEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 8,
  },
  tourTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  tourBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  appInfo: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
});
