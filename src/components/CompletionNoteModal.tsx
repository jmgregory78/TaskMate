import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

interface Props {
  visible: boolean;
  taskName: string;
  taskIcon?: string;
  onSave: (note: string, remindNextTime: boolean) => void;
  onSkip: () => void;
}

export default function CompletionNoteModal({
  visible,
  taskName,
  taskIcon,
  onSave,
  onSkip,
}: Props) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const [remindNextTime, setRemindNextTime] = useState(false);

  const handleSave = () => {
    onSave(note.trim(), remindNextTime);
    // Reset state for next use
    setNote('');
    setRemindNextTime(false);
  };

  const handleSkip = () => {
    onSkip();
    // Reset state for next use
    setNote('');
    setRemindNextTime(false);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleSkip}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleSkip} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <Text style={styles.emoji}>{taskIcon || '🎉'}</Text>
          <Text style={styles.title}>Task Complete!</Text>
          <Text style={styles.taskName} numberOfLines={2}>
            {taskName}
          </Text>

          <TextInput
            style={styles.noteInput}
            placeholder="Add a note about this completion — what was done, cost, anything to remember..."
            placeholderTextColor={Colors.textLight}
            value={note}
            onChangeText={setNote}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setRemindNextTime(!remindNextTime)}
            activeOpacity={0.7}
          >
            <View
              style={[styles.checkbox, remindNextTime && styles.checkboxChecked]}
            >
              {remindNextTime ? (
                <Text style={styles.checkboxMark}>✓</Text>
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>
              Remind me of this next time this task is due
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Text style={styles.saveButtonText}>Save Note & Complete</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  taskName: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  noteInput: {
    minHeight: 100,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.screenBackground,
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipButtonText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
