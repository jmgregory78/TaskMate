import * as Notifications from 'expo-notifications';
import { addDays, startOfWeek } from 'date-fns';
import { AutoDepletionUnit, Product } from '../types/models';
import { getAutoDepletionProducts, updateProduct } from './productService';
import { addHistoryRecord, hasWeeklyDepletionRecord } from './supplyHistoryService';

// Maximum days worth of depletion to apply if app hasn't been opened in a while
const MAX_DEPLETION_DAYS = 30;

// Milliseconds in different time units
const MS_PER_DAY = 86400000;
const MS_PER_WEEK = 604800000;

/**
 * Convert depletion rate to daily rate
 */
export function toDailyRate(rate: number, unit: AutoDepletionUnit): number {
  switch (unit) {
    case 'day':
      return rate;
    case 'week':
      return rate / 7;
    case 'month':
      return rate / 30;
    default:
      return rate;
  }
}

/**
 * Get the threshold quantity value (handles both quantity and percentage thresholds)
 * If using percentage and maxQuantity is provided, uses that as the base.
 * Otherwise falls back to current quantity for percentage calculation.
 */
export function getThresholdQty(product: Product, maxQuantity?: number): number {
  // Use new threshold fields if available
  if (product.thresholdType === 'quantity') {
    return product.thresholdValue;
  }
  if (product.thresholdType === 'percentage') {
    const base = maxQuantity && maxQuantity > 0 ? maxQuantity : product.currentQuantity;
    return (product.thresholdValue / 100) * base;
  }

  // Fallback to legacy fields for backwards compatibility
  if (product.lowThresholdQty !== null && product.lowThresholdQty !== undefined) {
    return product.lowThresholdQty;
  }
  const base = maxQuantity && maxQuantity > 0 ? maxQuantity : product.currentQuantity;
  return (product.lowThresholdPercent / 100) * base;
}

/**
 * Calculate how many whole time units have passed between two dates
 */
function calculateUnitsPassed(
  lastDepleted: Date,
  now: Date,
  unit: AutoDepletionUnit
): number {
  const diffMs = now.getTime() - lastDepleted.getTime();
  if (diffMs <= 0) return 0;

  switch (unit) {
    case 'day':
      return Math.floor(diffMs / MS_PER_DAY);
    case 'week':
      return Math.floor(diffMs / MS_PER_WEEK);
    case 'month': {
      // Calculate difference in calendar months
      const lastYear = lastDepleted.getFullYear();
      const lastMonth = lastDepleted.getMonth();
      const nowYear = now.getFullYear();
      const nowMonth = now.getMonth();
      return (nowYear - lastYear) * 12 + (nowMonth - lastMonth);
    }
  }
}

/**
 * Calculate days remaining for a supply based on depletion rate
 */
export function calculateDaysRemaining(product: Product): number | null {
  if (product.depletionMode !== 'auto') return null;
  if (product.currentQuantity <= 0) return 0;

  const rate = product.autoDepletionRate;
  if (rate <= 0) return null;

  const dailyRate = toDailyRate(rate, product.autoDepletionUnit);
  if (dailyRate <= 0) return null;

  // currentQuantity / dailyRate = days until empty
  return Math.floor(product.currentQuantity / dailyRate);
}

/**
 * Calculate estimated run-out date
 */
export function calculateRunOutDate(product: Product): Date | null {
  const daysRemaining = calculateDaysRemaining(product);
  if (daysRemaining === null) return null;
  return addDays(new Date(), daysRemaining);
}

/**
 * Calculate recommended reorder date based on threshold
 * Formula: daysUntilReorder = (currentQuantity - thresholdValue) / dailyRate
 */
export function calculateReorderDate(product: Product): Date | null {
  if (product.depletionMode !== 'auto') return null;
  if (product.currentQuantity <= 0) return null;

  const rate = product.autoDepletionRate;
  if (rate <= 0) return null;

  const dailyRate = toDailyRate(rate, product.autoDepletionUnit);
  if (dailyRate <= 0) return null;

  const thresholdQty = getThresholdQty(product);

  // If already at or below threshold, reorder date is now (or in the past)
  if (product.currentQuantity <= thresholdQty) {
    return new Date();
  }

  // Days until we reach the threshold
  const daysUntilReorder = Math.floor((product.currentQuantity - thresholdQty) / dailyRate);
  return addDays(new Date(), daysUntilReorder);
}

/**
 * Check if supply is below reorder threshold
 */
function isBelowThreshold(product: Product): boolean {
  return product.currentQuantity <= getThresholdQty(product);
}

/**
 * Send low stock notification for auto-depleting supply
 */
async function sendLowStockNotification(product: Product): Promise<void> {
  const daysRemaining = calculateDaysRemaining(product);
  const daysText =
    daysRemaining !== null
      ? `about ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
      : 'time to reorder';

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Running low on ${product.name}`,
        body: `You have ${product.currentQuantity} ${product.containerUnit} left - ${daysText}. Time to reorder!`,
        data: { productId: product.id, householdId: product.householdId },
        sound: true,
      },
      trigger: null, // Immediate
    });
  } catch (e) {
    console.warn('[autoDepletion] sendLowStockNotification failed:', e);
  }
}

/**
 * Run auto-depletion for all auto-tracking supplies in a household
 */
export async function runAutoDepletion(householdId: string): Promise<void> {
  if (!householdId) return;

  try {
    const supplies = await getAutoDepletionProducts(householdId);
    const now = new Date();

    for (const supply of supplies) {
      // Determine when depletion was last calculated
      const lastDepleted = supply.lastAutoDepletedAt ?? supply.createdAt;
      if (!lastDepleted) continue;

      // Calculate how many units should have been consumed
      let unitsPassed = calculateUnitsPassed(
        lastDepleted,
        now,
        supply.autoDepletionUnit
      );

      // Cap depletion if app hasn't been opened in a long time
      // Convert MAX_DEPLETION_DAYS to the supply's unit for capping
      let maxUnits: number;
      switch (supply.autoDepletionUnit) {
        case 'day':
          maxUnits = MAX_DEPLETION_DAYS;
          break;
        case 'week':
          maxUnits = Math.floor(MAX_DEPLETION_DAYS / 7);
          break;
        case 'month':
          maxUnits = 1; // Cap at 1 month's worth if unit is monthly
          break;
      }
      unitsPassed = Math.min(unitsPassed, maxUnits);

      const unitsConsumed = unitsPassed * supply.autoDepletionRate;

      // Only update if at least 1 unit was consumed
      if (unitsConsumed < 1) continue;

      const newQty = Math.max(0, supply.currentQuantity - Math.floor(unitsConsumed));
      const wasBelowThreshold = isBelowThreshold(supply);

      // Update the supply
      await updateProduct(householdId, supply.id, {
        currentQuantity: newQty,
        lastAutoDepletedAt: now,
      });

      // Write weekly history record (only once per week to keep data manageable)
      try {
        const weekStart = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
        const alreadyRecorded = await hasWeeklyDepletionRecord(
          householdId,
          supply.id,
          weekStart
        );
        if (!alreadyRecorded) {
          await addHistoryRecord(householdId, supply.id, {
            quantity: newQty,
            eventType: 'auto_depletion_weekly',
            note: `Auto-depleted ${Math.floor(unitsConsumed)} ${supply.containerUnit}`,
          });
        }
      } catch (e) {
        console.warn('[autoDepletion] Failed to write weekly history:', e);
      }

      // Check if we need to send a low stock notification
      const updatedSupply = { ...supply, currentQuantity: newQty };
      const nowBelowThreshold = isBelowThreshold(updatedSupply);

      // Only notify if we crossed the threshold (not already notified)
      // and haven't notified recently
      if (
        nowBelowThreshold &&
        (!supply.lowStockNotifiedAt ||
          // Reset notification flag if stock went back up
          !wasBelowThreshold)
      ) {
        await sendLowStockNotification(updatedSupply);
        await updateProduct(householdId, supply.id, {
          lowStockNotifiedAt: now,
        });
      }
    }
  } catch (e) {
    console.warn('[autoDepletion] runAutoDepletion failed:', e);
  }
}

/**
 * Reset low stock notification flag when stock goes above threshold
 * maxQuantity should be calculated from history records (max of all historical quantities)
 */
export async function clearLowStockNotification(
  householdId: string,
  product: Product,
  maxQuantity?: number
): Promise<void> {
  const thresholdQty = getThresholdQty(product, maxQuantity);

  // If stock is now above threshold, clear the notification flag
  if (product.currentQuantity > thresholdQty) {
    await updateProduct(householdId, product.id, {
      lowStockNotifiedAt: null,
    });
  }
}

/**
 * Check if the threshold is minimal (1 unit with 1/day rate)
 * Used to show warning about considering a higher threshold
 */
export function isMinimalThreshold(product: Product): boolean {
  const thresholdQty = getThresholdQty(product);
  const dailyRate = toDailyRate(product.autoDepletionRate, product.autoDepletionUnit);
  // Minimal if threshold is 1 and daily rate is 1
  return thresholdQty === 1 && dailyRate === 1;
}
