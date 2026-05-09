import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import { Colors } from '../../constants/colors';

type SignUpNavProp = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Please enter your name';
  if (trimmed.includes('@')) return 'Please use your name, not your email address';
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 30) return 'Name must be 30 characters or less';
  return null;
}

export default function SignUpScreen() {
  const navigation = useNavigation<SignUpNavProp>();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignUp = async () => {
    setError(null);

    // Validate display name
    const nameError = validateDisplayName(displayName);
    if (nameError) {
      setError(nameError);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      // Create the account
      await signUp(email.trim(), password);

      // Get the newly created user
      const user = auth.currentUser;
      if (user) {
        const trimmedName = displayName.trim();

        // Update Firebase Auth profile with display name
        await updateProfile(user, { displayName: trimmedName });

        // Save to Firestore user document
        await setDoc(
          doc(db, 'users', user.uid),
          {
            displayName: trimmedName,
            email: user.email,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create account';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.flex}>
          <View style={styles.topBand}>
            <Text style={styles.brand}>TaskMate</Text>
            <Text style={styles.brandTagline}>Create your account</Text>
          </View>
          <View style={styles.bottom}>
            <View style={styles.card}>
              <Text style={styles.label}>What should we call you?</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your first name"
                placeholderTextColor={Colors.textLight}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
                maxLength={30}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={Colors.textLight}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
              />
              <TextInput
                style={styles.input}
                placeholder="Password (min 6 characters)"
                placeholderTextColor={Colors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor={Colors.textLight}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, submitting && styles.buttonDisabled]}
                onPress={handleSignUp}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.textOnDark} />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkContainer}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.linkText}>
                  Already have an account?{' '}
                  <Text style={styles.linkTextBold}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  topBand: {
    height: '35%',
    backgroundColor: Colors.headerBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brand: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.textOnDark,
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: 15,
    color: Colors.textOnDarkMuted,
    marginTop: 8,
  },
  bottom: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginTop: -36,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
  },
  button: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: Colors.error,
    marginBottom: 8,
    textAlign: 'center',
    fontSize: 14,
  },
  linkContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  linkTextBold: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
