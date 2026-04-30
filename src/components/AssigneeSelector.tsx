import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { getHouseholdMembers } from '../services/inviteService';
import { HouseholdMember } from '../types/models';
import { getFirstName } from '../utils/nameUtils';
import { Colors } from '../constants/colors';

export interface Assignee {
  userId: string;
  name: string;
}

interface Props {
  householdId: string;
  currentAssignee: Assignee | null;
  onSelect: (member: Assignee | null) => void;
}

interface SheetProps {
  visible: boolean;
  householdId: string;
  currentAssignee: Assignee | null;
  onSelect: (member: Assignee | null) => void;
  onClose: () => void;
}

function initialsFor(displayName: string | null, email: string): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(/\s+/).slice(0, 2);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (email && email.length > 0) return email[0].toUpperCase();
  return '?';
}

function memberName(m: HouseholdMember): string {
  return m.displayName && m.displayName.trim().length > 0
    ? m.displayName
    : m.email || m.userId;
}

function roleLabel(role: HouseholdMember['role']): string {
  return role === 'owner' ? 'Owner' : role === 'member' ? 'Member' : 'Viewer';
}

export function AssigneePickerSheet({
  visible,
  householdId,
  currentAssignee,
  onSelect,
  onClose,
}: SheetProps) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHouseholdMembers(householdId)
      .then((m) => {
        if (cancelled) return;
        setMembers(m);
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e as { message?: string };
        setError(err.message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, householdId]);

  const handlePick = (m: HouseholdMember) => {
    onSelect({ userId: m.userId, name: memberName(m) });
    onClose();
  };

  const handleUnassign = () => {
    onSelect(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Assign to</Text>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : members.length === 0 ? (
            <Text style={styles.emptyText}>No members in this household</Text>
          ) : (
            members.map((m) => {
              const selected = currentAssignee?.userId === m.userId;
              return (
                <TouchableOpacity
                  key={m.userId}
                  style={styles.memberRow}
                  onPress={() => handlePick(m)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initialsFor(m.displayName, m.email)}
                    </Text>
                  </View>
                  <View style={styles.memberMain}>
                    <Text style={styles.memberName}>
                      {getFirstName(memberName(m))}
                    </Text>
                    <Text style={styles.memberRole}>{roleLabel(m.role)}</Text>
                  </View>
                  {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity
            style={styles.unassignRow}
            onPress={handleUnassign}
            activeOpacity={0.7}
          >
            <Text style={styles.unassignText}>Unassign</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AssigneeSelector({
  householdId,
  currentAssignee,
  onSelect,
}: Props) {
  const [sheetVisible, setSheetVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setSheetVisible(true)}
        activeOpacity={0.7}
      >
        {currentAssignee ? (
          <>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {initialsFor(currentAssignee.name, currentAssignee.name)}
              </Text>
            </View>
            <Text style={styles.assigneeName}>
              {getFirstName(currentAssignee.name)}
            </Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
            >
              <Text style={styles.clear}>✕</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.placeholder}>👤 Assign to someone</Text>
        )}
      </TouchableOpacity>

      <AssigneePickerSheet
        visible={sheetVisible}
        householdId={householdId}
        currentAssignee={currentAssignee}
        onSelect={onSelect}
        onClose={() => setSheetVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.cardBackground,
    gap: 12,
  },
  placeholder: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textOnDark,
    fontWeight: '700',
    fontSize: 12,
  },
  assigneeName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  clear: {
    fontSize: 16,
    color: Colors.textMuted,
    paddingHorizontal: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 32, 44, 0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
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
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  center: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  memberMain: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  memberRole: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  unassignRow: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  unassignText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
