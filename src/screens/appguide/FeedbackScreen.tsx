import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { submitFeedback } from '../../services/feedbackService';
import ScreenHeader from '../../components/ScreenHeader';
import { Colors } from '../../constants/colors';

const MAX_MESSAGE = 200;
const NEAR_LIMIT = 180;

export default function FeedbackScreen() {
  const { user } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  const canSubmit =
    trimmedSubject.length > 0 && trimmedMessage.length > 0 && !submitting;

  const handleMessageChange = (text: string) => {
    if (text.length > MAX_MESSAGE) {
      setMessage(text.slice(0, MAX_MESSAGE));
    } else {
      setMessage(text);
    }
  };

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback(
        user.uid,
        user.email ?? '',
        trimmedSubject,
        trimmedMessage
      );
      setSubject('');
      setMessage('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.warn('[Feedback] submitFeedback failed:', e);
      setError('Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = message.length;
  const counterStyle =
    charCount >= NEAR_LIMIT ? styles.counterRed : styles.counterMuted;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Send Feedback" leftLabel="Back" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <Text style={styles.intro}>
                Got an idea, bug, or wish? Let us know — we read every note.
              </Text>

              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="What's on your mind?"
                placeholderTextColor={Colors.textLight}
                returnKeyType="next"
              />

              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={message}
                onChangeText={handleMessageChange}
                placeholder="Tell us more..."
                placeholderTextColor={Colors.textLight}
                multiline
                maxLength={MAX_MESSAGE}
              />
              <Text style={[styles.counter, counterStyle]}>
                {charCount}/{MAX_MESSAGE}
              </Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {success ? (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>
                    ✅ Thanks for your feedback!
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  !canSubmit && styles.primaryButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Feedback</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.screenBackground,
  },
  flex: {
    flex: 1,
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
  intro: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  inputMultiline: {
    minHeight: 120,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
  },
  counterMuted: {
    color: Colors.textMuted,
  },
  counterRed: {
    color: Colors.error,
    fontWeight: '700',
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  successBanner: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.successBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  successText: {
    color: Colors.successText,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
