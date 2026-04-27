import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import {
  createHousehold,
  testFirestoreWrite,
} from '../../services/householdService';

export default function CreateHouseholdScreen() {
  const { user } = useAuth();
  const setCurrentHouseholdId = useAppStore((s) => s.setCurrentHouseholdId);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testFirestoreWrite();
    setTestResult(result);
    setTesting(false);
  };

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

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
        createHousehold(user.uid, trimmed),
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

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Set up your Household</Text>
      <Text style={styles.subtext}>
        Give your household a name. It's your hub for home, vehicles, finances
        — anything that needs to get done.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="The Smith Household"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.testButton, testing && styles.buttonDisabled]}
        onPress={handleTest}
        disabled={testing}
        activeOpacity={0.8}
      >
        {testing ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <Text style={styles.testButtonText}>Test Firestore</Text>
        )}
      </TouchableOpacity>

      {testResult ? (
        <Text
          style={[
            styles.testResult,
            testResult.startsWith('SUCCESS')
              ? styles.testResultOk
              : styles.testResultFail,
          ]}
        >
          {testResult}
        </Text>
      ) : null}

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Get Started</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#111',
  },
  subtext: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#111',
  },
  button: {
    height: 48,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#dc2626',
    marginBottom: 8,
    textAlign: 'center',
    fontSize: 14,
  },
  testButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  testButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  testResult: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  testResultOk: {
    color: '#15803d',
  },
  testResultFail: {
    color: '#dc2626',
  },
});
