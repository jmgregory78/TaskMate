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
import { Product, PurchaseLog, TaskProductUsage } from '../types/models';

type CreateProductInput = Omit<
  Product,
  | 'id'
  | 'createdAt'
  | 'createdBy'
  | 'purchasePending'
  | 'purchasePendingAt'
  | 'lastPurchasedAt'
  | 'lastPurchasePrice'
>;

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
  return {
    id,
    householdId,
    name: data.name,
    amazonUrl: data.amazonUrl ?? '',
    containerSize: Number(data.containerSize) || 0,
    containerUnit: data.containerUnit ?? '',
    currentQuantity: Number(data.currentQuantity) || 0,
    lowThresholdPercent: Number(data.lowThresholdPercent ?? 25),
    lastPurchasedAt: toDateOrNull(data.lastPurchasedAt),
    lastPurchasePrice:
      typeof data.lastPurchasePrice === 'number'
        ? data.lastPurchasePrice
        : null,
    purchasePending: !!data.purchasePending,
    purchasePendingAt: toDateOrNull(data.purchasePendingAt),
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy ?? '',
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
  const ref = await addDoc(productsCollection(householdId), {
    householdId,
    name: data.name,
    amazonUrl: data.amazonUrl,
    containerSize: data.containerSize,
    containerUnit: data.containerUnit,
    currentQuantity: data.currentQuantity,
    lowThresholdPercent: data.lowThresholdPercent,
    lastPurchasedAt: null,
    lastPurchasePrice: null,
    purchasePending: false,
    purchasePendingAt: null,
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
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
  await updateDoc(productDoc(householdId, productId), payload);
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
  const containerSize = Number(data.containerSize) || 0;
  const containerUnit = String(data.containerUnit ?? '');
  const totalAdded = quantity * containerSize;

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
    containerSize,
    containerUnit,
    totalAdded,
  });
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
}

export async function deductProductUsage(
  householdId: string,
  productId: string,
  amount: number
): Promise<void> {
  const productRef = productDoc(householdId, productId);
  const snap = await getDoc(productRef);
  if (!snap.exists()) return;
  const current = Number(snap.data().currentQuantity) || 0;
  const next = Math.max(0, current - amount);
  await updateDoc(productRef, { currentQuantity: next });
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
      containerSize: Number(data.containerSize) || 0,
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
