import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { QrCodeSvg } from 'react-native-qr-svg';
import { Colors } from '../constants/colors';
import { createInvite } from '../services/inviteService';
import { HouseholdInviteRole } from '../types/models';

function copyToClipboard(text: string): boolean {
  try {
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}

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
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevVisibleRef = useRef(false);
  const generatedRef = useRef(false);

  useEffect(() => {
    // Only reset state on the false → true transition. A stable `visible=true`
    // value across re-renders (e.g. because the parent re-rendered after
    // onInviteCreated fired) must NOT wipe out the generated code.
    if (visible && !prevVisibleRef.current) {
      setRole('member');
      setCode(null);
      setError(null);
      setSubmitting(false);
      setCopied(false);
      generatedRef.current = false;
    }
    prevVisibleRef.current = visible;
    return () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
        copiedTimer.current = null;
      }
    };
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
      // Defer onInviteCreated until the user closes the sheet — calling it
      // here can re-render the parent, which sometimes flickers the `visible`
      // prop and wipes the generated code.
      generatedRef.current = true;
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
        message: `Join my household on TaskMate! Download the app and enter this invite code: ${code}`,
        title: 'Join my TaskMate Household',
      });
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? 'Could not open share sheet.');
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    const ok = copyToClipboard(code);
    if (ok) {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1800);
    } else {
      // Clipboard module isn't installed yet — open the Share sheet so the
      // user still has a one-tap way to send the code somewhere.
      void handleShare();
    }
  };

  const handleGenerateNew = () => {
    setCode(null);
    setCopied(false);
  };

  const handleClose = () => {
    // Notify the parent here (instead of immediately after generating) so the
    // resulting re-render can't flicker `visible` and reset our state mid-flow.
    if (generatedRef.current) {
      generatedRef.current = false;
      onInviteCreated?.();
    }
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay} pointerEvents="none" />
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
              <View style={styles.ticketCard}>
                <Text style={styles.ticketLabel}>INVITE CODE</Text>
                <Text style={styles.ticketCode}>{code}</Text>
                <View style={styles.ticketDivider} />
                <View style={styles.qrWrap}>
                  <QrCodeSvg
                    value={`taskmate://join/${code}`}
                    frameSize={140}
                  />
                </View>
              </View>

              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsTitle}>
                  How to invite a family member:
                </Text>
                <InstructionStep n={1} text="Share this code with them" />
                <InstructionStep
                  n={2}
                  text="Ask them to download TaskMate from the App Store"
                />
                <InstructionStep
                  n={3}
                  text="They create an account and enter this code when prompted"
                />
                <InstructionStep
                  n={4}
                  text="They'll be added to your household automatically"
                />
              </View>

              <TouchableOpacity
                style={[styles.copyButton, copied && styles.copyButtonDone]}
                onPress={handleCopy}
                activeOpacity={0.8}
              >
                <Text style={[styles.copyButtonText, copied && styles.copyButtonTextDone]}>
                  {copied ? '✓ Copied!' : 'Copy Code'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>📤 Share</Text>
              </TouchableOpacity>

              <Text style={styles.expiryNotice}>
                This code expires in 7 days
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
            onPress={handleClose}
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

function InstructionStep({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.instructionRow}>
      <View style={styles.instructionNumber}>
        <Text style={styles.instructionNumberText}>{n}</Text>
      </View>
      <Text style={styles.instructionText}>{text}</Text>
    </View>
  );
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
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  ticketLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: Colors.primary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  ticketCode: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 6,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  ticketDivider: {
    alignSelf: 'stretch',
    height: 1,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderStyle: 'dashed',
    marginTop: 18,
    marginBottom: 16,
  },
  qrWrap: {
    alignItems: 'center',
  },
  instructionsCard: {
    backgroundColor: Colors.screenBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  instructionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  instructionNumberText: {
    color: Colors.textOnDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  copyButton: {
    height: 48,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  copyButtonDone: {
    backgroundColor: Colors.primaryLight,
  },
  copyButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  copyButtonTextDone: {
    color: Colors.primary,
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
