import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import { createHousehold } from '../../services/householdService';
import { joinHousehold } from '../../services/inviteService';
import { Colors } from '../../constants/colors';

export default function CreateHouseholdScreen() {
  const { user } = useAuth();
  const setCurrentHouseholdId = useAppStore((s) => s.setCurrentHouseholdId);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !submitting;
  const trimmedCode = code.trim().toUpperCase();
  const canJoin = trimmedCode.length >= 4 && !joining;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setError(null);
    setSubmitting(true);

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('__createHousehold_timeout__'));
      }, 10000);
    });

    try {
      const id = await Promise.race([
        createHousehold(
          user.uid,
          trimmed,
          user.email ?? '',
          user.displayName ?? null
        ),
        timeoutPromise,
      ]);
      setCurrentHouseholdId(id);
    } catch (e) {
      console.log('[CreateHouseholdScreen] error:', e);
      if (e instanceof Error && e.message === '__createHousehold_timeout__') {
        setError('Request timed out. Check your connection and try again.');
      } else {
        const err = e as { code?: string; message?: string };
        const message = err.code
          ? `${err.code}: ${err.message ?? ''}`
          : (err.message ?? String(e));
        setError(message);
      }
      setSubmitting(false);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  };

  const handleJoin = async () => {
    if (!user || !canJoin) return;
    setJoinError(null);
    setJoining(true);
    try {
      const result = await joinHousehold(
        trimmedCode,
        user.uid,
        user.email ?? '',
        user.displayName ?? null
      );
      if (!result.success) {
        setJoinError(result.error);
        setJoining(false);
        return;
      }
      setCurrentHouseholdId(result.householdId);
    } catch (e) {
      const err = e as { message?: string };
      setJoinError(err.message ?? 'Failed to join household');
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.flex}>
          <View style={styles.topBand}>
            <Text style={styles.brand}>TaskMate</Text>
            <Text style={styles.brandTagline}>Set up your household</Text>
          </View>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.bottom}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <Text style={styles.subtext}>
                Give your household a name. It's your hub for home, vehicles,
                finances — anything that needs to get done.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="The Smith Household"
                placeholderTextColor={Colors.textLight}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.textOnDark} />
                ) : (
                  <Text style={styles.buttonText}>Get Started</Text>
                )}
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <Text style={styles.joinHeading}>I have an invite code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="GRE482"
                placeholderTextColor={Colors.textLight}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleJoin}
                maxLength={8}
              />

              {joinError ? (
                <Text style={styles.error}>{joinError}</Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.joinButton,
                  !canJoin && styles.buttonDisabled,
                ]}
                onPress={handleJoin}
                disabled={!canJoin}
                activeOpacity={0.8}
              >
                {joining ? (
                  <ActivityIndicator color={Colors.textOnDark} />
                ) : (
                  <Text style={styles.buttonText}>Join Household</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
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
  subtext: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
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
  codeInput: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    fontSize: 20,
  },
  button: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  joinButton: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  joinHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
});
