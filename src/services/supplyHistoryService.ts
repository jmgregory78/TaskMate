import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { SupplyHistoryEventType, SupplyHistoryRecord } from '../types/models';

function historyCollection(householdId: string, productId: string) {
  return collection(
    db,
    'households',
    householdId,
    'products',
    productId,
    'history'
  );
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function mapHistoryDoc(
  id: string,
  productId: string,
  data: any
): SupplyHistoryRecord {
  return {
    id,
    productId,
    date: toDate(data.date),
    quantity: Number(data.quantity) || 0,
    eventType: data.eventType as SupplyHistoryEventType,
    note: data.note ?? undefined,
  };
}

export interface AddHistoryRecordInput {
  date?: Date;
  quantity: number;
  eventType: SupplyHistoryEventType;
  note?: string;
}

/**
 * Add a history record for a supply
 */
export async function addHistoryRecord(
  householdId: string,
  productId: string,
  record: AddHistoryRecordInput
): Promise<string> {
  const ref = await addDoc(historyCollection(householdId, productId), {
    date: Timestamp.fromDate(record.date ?? new Date()),
    quantity: record.quantity,
    eventType: record.eventType,
    note: record.note ?? null,
  });
  return ref.id;
}

/**
 * Get history records for a supply within a date range
 */
export async function getHistoryRecords(
  householdId: string,
  productId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<SupplyHistoryRecord[]> {
  let q = query(
    historyCollection(householdId, productId),
    orderBy('date', 'asc')
  );

  if (fromDate) {
    q = query(q, where('date', '>=', Timestamp.fromDate(fromDate)));
  }
  if (toDate) {
    q = query(q, where('date', '<=', Timestamp.fromDate(toDate)));
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => mapHistoryDoc(d.id, productId, d.data()));
}

/**
 * Get all history records for a supply (no date filter)
 */
export async function getAllHistoryRecords(
  householdId: string,
  productId: string
): Promise<SupplyHistoryRecord[]> {
  const q = query(
    historyCollection(householdId, productId),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapHistoryDoc(d.id, productId, d.data()));
}

/**
 * Get the most recent history records (for activity log)
 */
export async function getRecentHistoryRecords(
  householdId: string,
  productId: string,
  limit: number = 10
): Promise<SupplyHistoryRecord[]> {
  const q = query(
    historyCollection(householdId, productId),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs
    .slice(0, limit)
    .map((d) => mapHistoryDoc(d.id, productId, d.data()));
}

/**
 * Check if a weekly auto-depletion record already exists for this week
 * Queries by eventType first, then filters by date client-side to avoid composite index
 */
export async function hasWeeklyDepletionRecord(
  householdId: string,
  productId: string,
  weekStartDate: Date
): Promise<boolean> {
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Query only by eventType to avoid needing a composite index
  const q = query(
    historyCollection(householdId, productId),
    where('eventType', '==', 'auto_depletion_weekly')
  );
  const snap = await getDocs(q);

  // Filter by date range client-side
  return snap.docs.some((doc) => {
    const data = doc.data();
    const date = toDate(data.date);
    return date >= weekStartDate && date < weekEnd;
  });
}
