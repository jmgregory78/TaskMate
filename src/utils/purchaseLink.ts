import { Linking } from 'react-native';

/**
 * Normalize a user-entered URL: trim whitespace and prepend `https://` when
 * the user typed e.g. `amazon.com/dp/...` without a scheme. Returns null if
 * the input is empty after trimming.
 */
export function normalizePurchaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Open a purchase URL in the device browser. Safe to call with any string —
 * empty/whitespace input is a no-op (returns false). Returns true if the URL
 * was successfully handed off to Linking.openURL.
 */
export async function openPurchaseUrl(raw: string): Promise<boolean> {
  const url = normalizePurchaseUrl(raw);
  if (!url) return false;
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) return false;
    await Linking.openURL(url);
    return true;
  } catch (e) {
    console.warn('[purchaseLink] openURL failed:', e);
    return false;
  }
}
