import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { format } from 'date-fns';
import { SupplyHistoryRecord } from '../types/models';
import { Colors } from '../constants/colors';

interface Props {
  history: SupplyHistoryRecord[];
  containerUnit: string;
}

function getEventIcon(eventType: string): string {
  switch (eventType) {
    case 'purchase':
      return '🛒';
    case 'task_completion':
      return '✅';
    case 'manual_update':
      return '📝';
    case 'auto_depletion_weekly':
      return '⏱️';
    default:
      return '📊';
  }
}

function getEventDescription(record: SupplyHistoryRecord, containerUnit: string): string {
  switch (record.eventType) {
    case 'purchase':
      return `Restocked to ${record.quantity} ${containerUnit}`;
    case 'task_completion':
      return record.note || `Task completed · ${record.quantity} ${containerUnit} remaining`;
    case 'manual_update':
      return record.note || `Stock updated to ${record.quantity} ${containerUnit}`;
    case 'auto_depletion_weekly':
      return `Auto-tracked · ${record.quantity} ${containerUnit} remaining`;
    default:
      return `${record.quantity} ${containerUnit}`;
  }
}

export default function SupplyActivityLog({ history, containerUnit }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) {
    return null;
  }

  // Sort by date descending (most recent first)
  const sortedHistory = [...history].sort((a, b) => b.date.getTime() - a.date.getTime());
  const displayedHistory = expanded ? sortedHistory : sortedHistory.slice(0, 5);
  const hasMore = sortedHistory.length > 5;

  return (
    <View style={styles.container}>
      {displayedHistory.map((record, index) => (
        <View key={record.id} style={[styles.row, index === displayedHistory.length - 1 && styles.lastRow]}>
          <Text style={styles.icon}>{getEventIcon(record.eventType)}</Text>
          <View style={styles.content}>
            <Text style={styles.description} numberOfLines={2}>
              {getEventDescription(record, containerUnit)}
            </Text>
            <Text style={styles.date}>
              {format(record.date, 'MMM d, yyyy')}
            </Text>
          </View>
        </View>
      ))}

      {hasMore && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandText}>
            {expanded ? 'Show less' : `View all activity (${sortedHistory.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  icon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  description: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  date: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  expandButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  expandText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
});
