import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { QrCodeSvg } from 'react-native-qr-svg';
import { Colors } from '../constants/colors';
import { createInvite } from '../services/inviteService';
import { HouseholdInviteRole } from '../types/models';

interface Props {
  visible: boolean;
  householdId: string;
  householdName: string;
  createdBy: string;
  onCancel: () => void;
  onInviteCreated?: () => void;
}

export default function InviteSheet({
  visible,
  householdId,
  householdName,
  createdBy,
  onCancel,
  onInviteCreated,
}: Props) {
  const [role, setRole] = useState<HouseholdInviteRole>('member');
  const [code, setCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[InviteSheet] visible changed:', visible);
    if (visible) {
      setRole('member');
      setCode(null);
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const handleGenerate = async () => {
    if (submitting) return;
    console.log('[InviteSheet] Generate Invite tapped', {
      role,
      householdId,
      createdBy,
    });
    setError(null);
    setSubmitting(true);
    try {
      const newCode = await createInvite(
        householdId,
        householdName,
        role,
        createdBy
      );
      console.log('[InviteSheet] invite created:', newCode);
      setCode(newCode);
      onInviteCreated?.();
    } catch (e) {
      console.warn('[InviteSheet] createInvite failed:', e);
      const err = e as { message?: string };
      setError(err.message ?? 'Could not generate invite code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join my household on TaskMate!\n\nUse invite code: ${code}\n\nDownload TaskMate and enter this code when signing up.`,
        title: 'Join my TaskMate Household',
      });
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Could not open share sheet.');
    }
  };

  const handleGenerateNew = () => {
    setCode(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            Invite to {householdName || 'Household'}
          </Text>

          {!code ? (
            <>
              <Text style={styles.subtitle}>What role should they have?</Text>

              <RoleCard
                title="Member"
                description="Can see and complete all tasks, add tasks, log purchases"
                selected={role === 'member'}
                onPress={() => setRole('member')}
              />
              <RoleCard
                title="Viewer"
                description="Can only complete tasks assigned to them"
                selected={role === 'viewer'}
                onPress={() => setRole('viewer')}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  submitting && styles.buttonDisabled,
                ]}
                onPress={handleGenerate}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.textOnDark} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Generate Invite
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.codePill}>
                <Text style={styles.codeText}>{code.split('').join(' ')}</Text>
              </View>

              <View style={styles.qrWrap}>
                <QrCodeSvg
                  value={`taskmate://join/${code}`}
                  frameSize={200}
                />
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>📤 Share Invite</Text>
              </TouchableOpacity>

              <Text style={styles.expiryNotice}>
                This invite expires in 7 days
              </Text>

              <TouchableOpacity
                onPress={handleGenerateNew}
                activeOpacity={0.7}
                style={styles.regenerateLink}
              >
                <Text style={styles.regenerateText}>Generate New Code</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            onPress={onCancel}
            style={styles.cancelButton}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>{code ? 'Done' : 'Cancel'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

interface RoleCardProps {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}

function RoleCard({ title, description, selected, onPress }: RoleCardProps) {
  return (
    <TouchableOpacity
      style={[styles.roleCard, selected && styles.roleCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.roleTitle, selected && styles.roleTitleSelected]}>
        {title}
      </Text>
      <Text style={styles.roleDescription}>{description}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 32, 44, 0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '92%',
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderDark,
    marginVertical: 8,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 16,
  },
  roleCard: {
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.screenBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  roleCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  roleTitleSelected: {
    color: Colors.primary,
  },
  roleDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  primaryButton: {
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  error: {
    color: Colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  codePill: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 8,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  qrWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  expiryNotice: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  regenerateLink: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  regenerateText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
