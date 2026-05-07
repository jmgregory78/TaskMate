import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  AutoDepletionUnit,
  DepletionMode,
  Product,
  PurchaseLog,
  TaskProductUsage,
  ThresholdType,
} from '../types/models';
import { addHistoryRecord } from './supplyHistoryService';

type CreateProductInput = Omit<
  Product,
  | 'id'
  | 'createdAt'
  | 'createdBy'
  | 'purchasePending'
  | 'purchasePendingAt'
  | 'lastPurchasedAt'
  | 'lastPurchasePrice'
  | 'lowThresholdQty'
  | 'lowThresholdPercent'
  | 'thresholdType'
  | 'thresholdValue'
  | 'depletionMode'
  | 'autoDepletionRate'
  | 'autoDepletionUnit'
  | 'lastAutoDepletedAt'
  | 'lowStockNotifiedAt'
> & {
  thresholdType?: ThresholdType;
  thresholdValue?: number;
  // Legacy fields - still accepted for backwards compatibility
  lowThresholdQty?: number | null;
  lowThresholdPercent?: number;
  depletionMode?: DepletionMode;
  autoDepletionRate?: number;
  autoDepletionUnit?: AutoDepletionUnit;
};

// Note: containerSize has been removed from the Product type.
// Progress bars now use max quantity from history records.

function productsCollection(householdId: string) {
  return collection(db, 'households', householdId, 'products');
}

function productDoc(householdId: string, productId: string) {
  return doc(db, 'households', householdId, 'products', productId);
}

function purchasesCollection(householdId: string, productId: string) {
  return collection(
    db,
    'households',
    householdId,
    'products',
    productId,
    'purchases'
  );
}

function stockAuditsCollection(householdId: string, productId: string) {
  return collection(
    db,
    'households',
    householdId,
    'products',
    productId,
    'stockAudits'
  );
}

function productUsagesCollection(householdId: string, taskId: string) {
  return collection(
    db,
    'households',
    householdId,
    'tasks',
    taskId,
    'productUsages'
  );
}

function productUsageDoc(
  householdId: string,
  taskId: string,
  usageId: string
) {
  return doc(
    db,
    'households',
    householdId,
    'tasks',
    taskId,
    'productUsages',
    usageId
  );
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function toDateOrNull(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function mapProductDoc(
  id: string,
  householdId: string,
  data: any
): Product {
  // Handle threshold migration: prefer new fields, fallback to legacy
  let thresholdType: ThresholdType = 'quantity';
  let thresholdValue = 1;

  if (data.thresholdType && typeof data.thresholdValue === 'number') {
    // New format
    thresholdType = data.thresholdType as ThresholdType;
    thresholdValue = data.thresholdValue;
  } else if (typeof data.lowThresholdQty === 'number' && data.lowThresholdQty !== null) {
    // Legacy quantity threshold
    thresholdType = 'quantity';
    thresholdValue = data.lowThresholdQty;
  } else if (typeof data.lowThresholdPercent === 'number') {
    // Legacy percentage threshold
    thresholdType = 'percentage';
    thresholdValue = data.lowThresholdPercent;
  }

  return {
    id,
    householdId,
    name: data.name,
    amazonUrl: data.amazonUrl ?? '',
    containerUnit: data.containerUnit ?? '',
    currentQuantity: Number(data.currentQuantity) || 0,
    // New threshold fields
    thresholdType,
    thresholdValue,
    // Legacy fields (maintained for backwards compatibility)
    lowThresholdPercent: Number(data.lowThresholdPercent ?? 25),
    lowThresholdQty:
      typeof data.lowThresholdQty === 'number' ? data.lowThresholdQty : null,
    lastPurchasedAt: toDateOrNull(data.lastPurchasedAt),
    lastPurchasePrice:
      typeof data.lastPurchasePrice === 'number'
        ? data.lastPurchasePrice
        : null,
    purchasePending: !!data.purchasePending,
    purchasePendingAt: toDateOrNull(data.purchasePendingAt),
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy ?? '',
    // Auto-depletion fields
    depletionMode: (data.depletionMode as DepletionMode) ?? 'task',
    autoDepletionRate: Number(data.autoDepletionRate) || 1,
    autoDepletionUnit: (data.autoDepletionUnit as AutoDepletionUnit) ?? 'day',
    lastAutoDepletedAt: toDateOrNull(data.lastAutoDepletedAt),
    lowStockNotifiedAt: toDateOrNull(data.lowStockNotifiedAt),
  };
}

function mapUsageDoc(id: string, taskId: string, data: any): TaskProductUsage {
  return {
    id,
    taskId,
    productId: data.productId,
    productName: data.productName ?? '',
    usageAmount: Number(data.usageAmount) || 0,
    usageUnit: data.usageUnit ?? '',
  };
}

export async function createProduct(
  householdId: string,
  userId: string,
  data: CreateProductInput
): Promise<string> {
  // Determine threshold values - prefer new fields, fallback to legacy
  let thresholdType: ThresholdType = data.thresholdType ?? 'quantity';
  let thresholdValue = data.thresholdValue ?? 1;

  // If using legacy fields, convert to new format
  if (!data.thresholdType && !data.thresholdValue) {
    if (typeof data.lowThresholdQty === 'number' && data.lowThresholdQty !== null) {
      thresholdType = 'quantity';
      thresholdValue = data.lowThresholdQty;
    } else if (typeof data.lowThresholdPercent === 'number') {
      thresholdType = 'percentage';
      thresholdValue = data.lowThresholdPercent;
    }
  }

  const ref = await addDoc(productsCollection(householdId), {
    householdId,
    name: data.name,
    amazonUrl: data.amazonUrl,
    containerUnit: data.containerUnit,
    currentQuantity: data.currentQuantity,
    // New threshold fields
    thresholdType,
    thresholdValue,
    // Legacy fields (maintained for compatibility)
    lowThresholdPercent: thresholdType === 'percentage' ? thresholdValue : 25,
    lowThresholdQty: thresholdType === 'quantity' ? thresholdValue : null,
    lastPurchasedAt: null,
    lastPurchasePrice: null,
    purchasePending: false,
    purchasePendingAt: null,
    createdAt: serverTimestamp(),
    createdBy: userId,
    // Auto-depletion fields
    depletionMode: data.depletionMode ?? 'task',
    autoDepletionRate: data.autoDepletionRate ?? 1,
    autoDepletionUnit: data.autoDepletionUnit ?? 'day',
    lastAutoDepletedAt: null,
    lowStockNotifiedAt: null,
  });

  // Add initial history record
  try {
    await addHistoryRecord(householdId, ref.id, {
      quantity: data.currentQuantity,
      eventType: 'manual_update',
      note: 'Initial stock recorded',
    });
  } catch (e) {
    console.warn('[productService] Failed to add initial history record:', e);
  }

  return ref.id;
}

export async function getProducts(householdId: string): Promise<Product[]> {
  const q = query(productsCollection(householdId), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapProductDoc(d.id, householdId, d.data()));
}

export async function getProduct(
  householdId: string,
  productId: string
): Promise<Product | null> {
  const snap = await getDoc(productDoc(householdId, productId));
  if (!snap.exists()) return null;
  return mapProductDoc(snap.id, householdId, snap.data());
}

export async function searchProducts(
  householdId: string,
  queryString: string
): Promise<Product[]> {
  const all = await getProducts(householdId);
  const q = queryString.trim().toLowerCase();
  if (!q) return all;
  return all.filter((p) => p.name.toLowerCase().includes(q));
}

export async function updateProduct(
  householdId: string,
  productId: string,
  data: Partial<Product>
): Promise<void> {
  const payload: Record<string, unknown> = { ...data };
  delete payload.id;
  delete payload.householdId;
  if (data.lastPurchasedAt instanceof Date) {
    payload.lastPurchasedAt = Timestamp.fromDate(data.lastPurchasedAt);
  }
  if (data.purchasePendingAt instanceof Date) {
    payload.purchasePendingAt = Timestamp.fromDate(data.purchasePendingAt);
  }
  if (data.lastAutoDepletedAt instanceof Date) {
    payload.lastAutoDepletedAt = Timestamp.fromDate(data.lastAutoDepletedAt);
  }
  if (data.lowStockNotifiedAt instanceof Date) {
    payload.lowStockNotifiedAt = Timestamp.fromDate(data.lowStockNotifiedAt);
  }
  await updateDoc(productDoc(householdId, productId), payload);
}

export async function getAutoDepletionProducts(
  householdId: string
): Promise<Product[]> {
  const q = query(
    productsCollection(householdId),
    where('depletionMode', '==', 'auto')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapProductDoc(d.id, householdId, d.data()));
}

export async function deleteProduct(
  householdId: string,
  productId: string
): Promise<void> {
  // 1. Find every task in this household and delete any productUsage doc
  //    that references this product.
  const tasksSnap = await getDocs(
    collection(db, 'households', householdId, 'tasks')
  );
  await Promise.all(
    tasksSnap.docs.map(async (taskDoc) => {
      const usagesSnap = await getDocs(
        query(
          productUsagesCollection(householdId, taskDoc.id),
          where('productId', '==', productId)
        )
      );
      await Promise.all(usagesSnap.docs.map((u) => deleteDoc(u.ref)));
    })
  );

  // 2. Delete every entry in the product's purchases subcollection.
  const purchasesSnap = await getDocs(
    purchasesCollection(householdId, productId)
  );
  await Promise.all(purchasesSnap.docs.map((p) => deleteDoc(p.ref)));

  // 3. Delete the product doc itself.
  await deleteDoc(productDoc(householdId, productId));
}

export async function addProductUsageToTask(
  householdId: string,
  taskId: string,
  productId: string,
  productName: string,
  usageAmount: number,
  usageUnit: string
): Promise<string> {
  const ref = await addDoc(productUsagesCollection(householdId, taskId), {
    productId,
    productName,
    usageAmount,
    usageUnit,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getProductUsagesForTask(
  householdId: string,
  taskId: string
): Promise<TaskProductUsage[]> {
  const snap = await getDocs(productUsagesCollection(householdId, taskId));
  return snap.docs.map((d) => mapUsageDoc(d.id, taskId, d.data()));
}

export async function removeProductUsageFromTask(
  householdId: string,
  taskId: string,
  usageId: string
): Promise<void> {
  await deleteDoc(productUsageDoc(householdId, taskId, usageId));
}

export async function updateProductUsage(
  householdId: string,
  taskId: string,
  usageId: string,
  usageAmount: number
): Promise<void> {
  await updateDoc(productUsageDoc(householdId, taskId, usageId), {
    usageAmount,
  });
}

export async function flagPurchasePending(
  householdId: string,
  productId: string
): Promise<void> {
  await updateDoc(productDoc(householdId, productId), {
    purchasePending: true,
    purchasePendingAt: Timestamp.fromDate(new Date()),
  });
}

export async function clearPurchasePending(
  householdId: string,
  productId: string
): Promise<void> {
  await updateDoc(productDoc(householdId, productId), {
    purchasePending: false,
    purchasePendingAt: null,
  });
}

export async function confirmPurchase(
  householdId: string,
  productId: string,
  price: number,
  quantity: number,
  userId: string,
  purchasedAt: Date = new Date()
): Promise<void> {
  const productRef = productDoc(householdId, productId);
  const snap = await getDoc(productRef);
  if (!snap.exists()) throw new Error('Product not found');
  const data = snap.data();
  const containerUnit = String(data.containerUnit ?? '');
  const currentQty = Number(data.currentQuantity) || 0;
  // quantity is the number of units purchased, add it directly
  const totalAdded = quantity;
  const newQuantity = currentQty + totalAdded;

  await updateDoc(productRef, {
    currentQuantity: increment(totalAdded),
    lastPurchasedAt: Timestamp.fromDate(purchasedAt),
    lastPurchasePrice: price,
    purchasePending: false,
    purchasePendingAt: null,
  });

  await addDoc(purchasesCollection(householdId, productId), {
    productId,
    householdId,
    purchasedAt: Timestamp.fromDate(purchasedAt),
    purchasedBy: userId,
    price,
    quantity,
    containerUnit,
    totalAdded,
  });

  // Add history record for purchase
  try {
    await addHistoryRecord(householdId, productId, {
      date: purchasedAt,
      quantity: newQuantity,
      eventType: 'purchase',
      note: `Restocked +${totalAdded} ${containerUnit}`,
    });
  } catch (e) {
    console.warn('[productService] Failed to add purchase history record:', e);
  }
}

export async function updateStock(
  householdId: string,
  productId: string,
  newQuantity: number,
  note: string,
  userId: string
): Promise<void> {
  const productRef = productDoc(householdId, productId);
  const snap = await getDoc(productRef);
  if (!snap.exists()) throw new Error('Product not found');
  const data = snap.data();
  const previousQuantity = Number(data.currentQuantity) || 0;
  const containerUnit = String(data.containerUnit ?? '');
  const difference = newQuantity - previousQuantity;

  await updateDoc(productRef, { currentQuantity: newQuantity });

  await addDoc(stockAuditsCollection(householdId, productId), {
    previousQuantity,
    newQuantity,
    difference,
    note,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
    containerUnit,
  });

  // Add history record for manual update
  try {
    await addHistoryRecord(householdId, productId, {
      quantity: newQuantity,
      eventType: 'manual_update',
      note: note || `Adjusted from ${previousQuantity} to ${newQuantity}`,
    });
  } catch (e) {
    console.warn('[productService] Failed to add stock update history record:', e);
  }
}

export async function deductProductUsage(
  householdId: string,
  productId: string,
  amount: number,
  taskName?: string
): Promise<void> {
  const productRef = productDoc(householdId, productId);
  const snap = await getDoc(productRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const current = Number(data.currentQuantity) || 0;
  const containerUnit = String(data.containerUnit ?? '');
  const next = Math.max(0, current - amount);
  await updateDoc(productRef, { currentQuantity: next });

  // Add history record for task completion
  try {
    await addHistoryRecord(householdId, productId, {
      quantity: next,
      eventType: 'task_completion',
      note: taskName ? `${taskName} completed` : `Used ${amount} ${containerUnit}`,
    });
  } catch (e) {
    console.warn('[productService] Failed to add task completion history record:', e);
  }
}

export async function getPurchaseLogs(
  householdId: string,
  productId: string,
  limit: number = 5
): Promise<PurchaseLog[]> {
  const q = query(
    purchasesCollection(householdId, productId),
    orderBy('purchasedAt', 'desc'),
    fbLimit(limit)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      productId: data.productId ?? productId,
      householdId: data.householdId ?? householdId,
      purchasedAt: toDate(data.purchasedAt),
      purchasedBy: data.purchasedBy ?? '',
      price: Number(data.price) || 0,
      quantity: Number(data.quantity) || 0,
      containerUnit: data.containerUnit ?? '',
      totalAdded: Number(data.totalAdded) || 0,
    };
  });
}

export async function getPendingPurchases(
  householdId: string
): Promise<Array<{ product: Product }>> {
  const q = query(
    productsCollection(householdId),
    where('purchasePending', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    product: mapProductDoc(d.id, householdId, d.data()),
  }));
}
