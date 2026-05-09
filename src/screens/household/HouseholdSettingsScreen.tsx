import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';
import {
  removeMember,
  revokeInvite,
  updateMemberRole,
} from '../../services/inviteService';
import {
  Household,
  HouseholdInvite,
  HouseholdMember,
} from '../../types/models';
import InviteSheet from '../../components/InviteSheet';
import ScreenHeader from '../../components/ScreenHeader';
import { getFirstName } from '../../utils/nameUtils';
import { Colors } from '../../constants/colors';

function initialsFor(displayName: string | null): string {
  if (displayName && displayName.trim().length > 0 && !displayName.includes('@')) {
    const parts = displayName.trim().split(/\s+/).slice(0, 2);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return '?';
}

function roleLabel(role: HouseholdMember['role']): string {
  return role === 'owner' ? 'Owner' : role === 'member' ? 'Member' : 'Viewer';
}

export default function HouseholdSettingsScreen() {
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuth();
  const zustandHouseholdId = useAppStore((s) => s.currentHouseholdId);
  const setCurrentHouseholdId = useAppStore((s) => s.setCurrentHouseholdId);

  const [household, setHousehold] = useState<Household | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);

  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);

  const saveInProgress = useRef(false);

  console.log('[HouseholdSettings] render', {
    zustandHouseholdId,
    householdId,
    userUid: currentUser?.uid,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Get householdId from multiple sources
      let hhId: string | null = zustandHouseholdId ?? null;

      if (!hhId && currentUser?.uid) {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const ids = userSnap.data()?.householdIds;
        hhId = Array.isArray(ids) && ids.length > 0 ? (ids[0] as string) : null;
      }

      console.log('[HouseholdSettings] resolved hhId:', hhId);

      if (!hhId) {
        setLoading(false);
        return;
      }

      // Step 2: Fetch household doc directly
      const hhSnap = await getDoc(doc(db, 'households', hhId));
      console.log('[HouseholdSettings] household exists:', hhSnap.exists());

      if (!hhSnap.exists()) {
        setLoading(false);
        return;
      }

      // Step 3: Set household state
      const hhData = hhSnap.data();
      const createdAt =
        hhData.createdAt instanceof Timestamp
          ? hhData.createdAt.toDate()
          : new Date();

      setHouseholdId(hhId);
      setCurrentHouseholdId(hhId);
      setHousehold({
        id: hhId,
        name: hhData.name ?? '',
        createdBy: hhData.createdBy ?? '',
        createdAt,
      });
      setDraftName(hhData.name ?? '');

      // Step 4: Fetch members
      const membersSnap = await getDocs(
        collection(db, 'households', hhId, 'members')
      );
      const membersList: HouseholdMember[] = membersSnap.docs.map((d) => {
        const md = d.data();
        const joinedAt =
          md.joinedAt instanceof Timestamp ? md.joinedAt.toDate() : new Date();
        return {
          userId: d.id,
          email: md.email ?? '',
          displayName: md.displayName ?? null,
          role: md.role,
          joinedAt,
        };
      });
      setMembers(membersList);

      // Step 5: Fetch active invites
      const invitesSnap = await getDocs(
        query(
          collection(db, 'invites'),
          where('householdId', '==', hhId),
          where('revoked', '==', false)
        )
      );
      const now = new Date();
      const invitesList: HouseholdInvite[] = invitesSnap.docs
        .map((d) => {
          const ad = d.data();
          const expiresAt =
            ad.expiresAt instanceof Timestamp
              ? ad.expiresAt.toDate()
              : new Date(0);
          const createdAtInv =
            ad.createdAt instanceof Timestamp
              ? ad.createdAt.toDate()
              : new Date();
          const usedAt =
            ad.usedAt instanceof Timestamp ? ad.usedAt.toDate() : null;
          return {
            id: d.id,
            code: ad.code ?? d.id,
            householdId: ad.householdId,
            householdName: ad.householdName ?? '',
            role: ad.role,
            createdBy: ad.createdBy ?? '',
            createdAt: createdAtInv,
            expiresAt,
            usedBy: ad.usedBy ?? null,
            usedAt,
            revoked: !!ad.revoked,
          };
        })
        .filter((i) => !i.usedBy && i.expiresAt > now);
      setInvites(invitesList);
    } catch (e) {
      console.error('[HouseholdSettings] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid, zustandHouseholdId, setCurrentHouseholdId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentUserMember = members.find(
    (m) => m.userId === currentUser?.uid
  );
  const isOwner = currentUserMember?.role === 'owner';

  if (!loading) {
    console.log('[HouseholdSettings] permission check', {
      userUid: currentUser?.uid,
      currentUserMemberFound: !!currentUserMember,
      currentUserRole: currentUserMember?.role ?? null,
      isOwner,
    });
  }

  const handleSaveName = async () => {
    const newName = draftName.trim();
    console.log(
      '[Save tapped] householdId:',
      householdId,
      'newName:',
      newName
    );
    if (saveInProgress.current) {
      console.log('[HouseholdSettings] save already in progress, ignoring');
      return;
    }
    if (newName.length === 0) {
      setNameStatus({ type: 'error', message: 'Name cannot be empty.' });
      return;
    }
    if (household && newName === household.name) {
      setEditingName(false);
      return;
    }
    if (!householdId) {
      setNameStatus({
        type: 'error',
        message: 'No household loaded — try again in a moment.',
      });
      return;
    }
    saveInProgress.current = true;
    setSavingName(true);
    setNameStatus(null);
    try {
      await updateDoc(doc(db, 'households', householdId), {
        name: newName,
      });
      Keyboard.dismiss();
      setHousehold((prev) =>
        prev
          ? { ...prev, name: newName }
          : {
              id: householdId,
              name: newName,
              createdBy: '',
              createdAt: new Date(),
            }
      );
      setEditingName(false);
      setNameStatus({ type: 'success', message: '✅ Saved' });
      setTimeout(() => {
        setNameStatus((s) => (s?.type === 'success' ? null : s));
      }, 2000);
    } catch (e) {
      console.warn('[HouseholdSettings] rename failed:', e);
      const err = e as { message?: string };
      setNameStatus({
        type: 'error',
        message: err.message ?? 'Failed to rename household',
      });
    } finally {
      setSavingName(false);
      saveInProgress.current = false;
    }
  };

  const trimmedDraftName = draftName.trim();
  const saveDisabled =
    savingName ||
    trimmedDraftName.length === 0 ||
    trimmedDraftName === (household?.name ?? '');

  const handleMemberAction = (member: HouseholdMember) => {
    if (!householdId || !isOwner || member.userId === currentUser?.uid) return;
    Alert.alert(
      member.displayName && !member.displayName.includes('@') ? member.displayName : 'A member',
      `Manage ${roleLabel(member.role)}`,
      [
        {
          text: 'Make Member',
          onPress: () =>
            void updateMemberRole(householdId, member.userId, 'member')
              .then(load)
              .catch((e) =>
                Alert.alert('Error', (e as Error).message ?? 'Failed')
              ),
        },
        {
          text: 'Make Viewer',
          onPress: () =>
            void updateMemberRole(householdId, member.userId, 'viewer')
              .then(load)
              .catch((e) =>
                Alert.alert('Error', (e as Error).message ?? 'Failed')
              ),
        },
        {
          text: 'Remove from Household',
          style: 'destructive',
          onPress: () =>
            void removeMember(householdId, member.userId)
              .then(load)
              .catch((e) =>
                Alert.alert('Error', (e as Error).message ?? 'Failed')
              ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleRevokeInvite = (code: string) => {
    Alert.alert('Revoke invite?', `Code ${code} will no longer work.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () =>
          void revokeInvite(code)
            .then(load)
            .catch((e) =>
              Alert.alert('Error', (e as Error).message ?? 'Failed')
            ),
      },
    ]);
  };

  // Don't render the screen content until load() has completed AND
  // householdId is non-null. The user can't enter edit mode until the id
  // they'll write against is captured.
  if (loading || !householdId) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="" leftLabel="Back" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="" leftLabel="Back" />

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Household Name */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Household Name</Text>
            {editingName ? (
              <View style={styles.row}>
                <TextInput
                  style={styles.nameInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                  onBlur={() => {
                    if (saveInProgress.current) return;
                  }}
                  blurOnSubmit
                />
                <TouchableOpacity
                  onPress={handleSaveName}
                  activeOpacity={0.7}
                  disabled={saveDisabled}
                  style={[
                    styles.saveSmall,
                    saveDisabled && styles.saveSmallDisabled,
                  ]}
                >
                  {savingName ? (
                    <ActivityIndicator color={Colors.textOnDark} />
                  ) : (
                    <Text style={styles.saveSmallText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  if (!isOwner) return;
                  setDraftName(household?.name ?? '');
                  setEditingName(true);
                }}
                activeOpacity={isOwner ? 0.7 : 1}
              >
                <Text style={styles.nameValue}>{household?.name ?? '—'}</Text>
                {isOwner ? (
                  <Text style={styles.editHint}>Tap to edit</Text>
                ) : null}
              </TouchableOpacity>
            )}
            {nameStatus ? (
              <Text
                style={[
                  styles.nameStatus,
                  nameStatus.type === 'success'
                    ? styles.nameStatusSuccess
                    : styles.nameStatusError,
                ]}
              >
                {nameStatus.message}
              </Text>
            ) : null}
          </View>

          {/* Members */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Members ({members.length})</Text>
            {members.map((m) => {
              const tappable = isOwner && m.userId !== currentUser?.uid;
              return (
                <TouchableOpacity
                  key={m.userId}
                  style={styles.memberRow}
                  onPress={() => tappable && handleMemberAction(m)}
                  activeOpacity={tappable ? 0.7 : 1}
                  disabled={!tappable}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initialsFor(m.displayName)}
                    </Text>
                  </View>
                  <View style={styles.memberMain}>
                    <Text style={styles.memberEmail}>
                      {m.displayName && !m.displayName.includes('@') ? getFirstName(m.displayName) : 'A member'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.rolePill,
                      m.role === 'owner' && styles.rolePillOwner,
                      m.role === 'member' && styles.rolePillMember,
                      m.role === 'viewer' && styles.rolePillViewer,
                    ]}
                  >
                    <Text style={styles.rolePillText}>{roleLabel(m.role)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Pending Invites */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Pending Invites</Text>
            {invites.length === 0 ? (
              <Text style={styles.emptyText}>No active invites</Text>
            ) : (
              invites.map((inv) => (
                <View key={inv.code} style={styles.inviteRow}>
                  <View style={styles.inviteMain}>
                    <Text style={styles.inviteCode}>{inv.code}</Text>
                    <View
                      style={[
                        styles.rolePill,
                        inv.role === 'member' && styles.rolePillMember,
                        inv.role === 'viewer' && styles.rolePillViewer,
                      ]}
                    >
                      <Text style={styles.rolePillText}>
                        {roleLabel(inv.role)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.inviteExpiry}>
                    Expires {format(inv.expiresAt, 'MMM d, yyyy')}
                  </Text>
                  {isOwner ? (
                    <TouchableOpacity
                      onPress={() => handleRevokeInvite(inv.code)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.revokeText}>Revoke</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}
          </View>

          {isOwner ? (
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() => {
                console.log('[HouseholdSettings] Invite button tapped', {
                  hasHousehold: !!household,
                  hasUser: !!currentUser,
                  householdId,
                  zustandHouseholdId,
                });
                setInviteSheetVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.inviteButtonText}>
                ➕ Invite a Family Member
              </Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      {currentUser && householdId ? (
        <InviteSheet
          visible={inviteSheetVisible}
          householdId={householdId}
          householdName={household?.name ?? ''}
          createdBy={currentUser.displayName && !currentUser.displayName.includes('@') ? currentUser.displayName : 'You'}
          onCancel={() => setInviteSheetVisible(false)}
          onInviteCreated={load}
        />
      ) : null}
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
  safeTop: {
    backgroundColor: Colors.headerBackground,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: Colors.headerBackground,
  },
  headerSide: {
    width: 70,
  },
  backLink: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nameValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  editHint: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  nameInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: Colors.screenBackground,
    color: Colors.textPrimary,
  },
  saveSmall: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveSmallDisabled: {
    opacity: 0.4,
  },
  saveSmallText: {
    color: Colors.textOnDark,
    fontSize: 14,
    fontWeight: '700',
  },
  nameStatus: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  nameStatusSuccess: {
    color: Colors.successText,
  },
  nameStatusError: {
    color: Colors.error,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textOnDark,
    fontWeight: '700',
    fontSize: 14,
  },
  memberMain: {
    flex: 1,
  },
  memberEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  memberName: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  rolePillOwner: {
    backgroundColor: Colors.headerBackground,
  },
  rolePillMember: {
    backgroundColor: Colors.primary,
  },
  rolePillViewer: {
    backgroundColor: Colors.textMuted,
  },
  rolePillText: {
    color: Colors.textOnDark,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  inviteRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  inviteMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  inviteCode: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  inviteExpiry: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  revokeText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '700',
  },
  inviteButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  inviteButtonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
});
