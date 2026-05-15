/**
 * Format the number of days until a due date into a human-readable string.
 *
 * Rules:
 * - Negative days: formatted as overdue (weeks/months/years for large values)
 * - 0: "Today"
 * - 1-6: "in X days"
 * - 7-29: "in X weeks" (rounded down)
 * - 30-364: "in X months" (rounded down)
 * - 365+: "in X years" (rounded down)
 */
export function formatDaysUntilDue(days: number): string {
  if (days < 0) {
    const overdue = Math.abs(days);
    if (overdue === 1) return '1 day overdue';
    if (overdue < 7) return `${overdue} days overdue`;
    if (overdue < 30) {
      const weeks = Math.floor(overdue / 7);
      return weeks === 1 ? '1 week overdue' : `${weeks} weeks overdue`;
    }
    if (overdue < 365) {
      const months = Math.floor(overdue / 30);
      return months === 1 ? '1 month overdue' : `${months} months overdue`;
    }
    const years = Math.floor(overdue / 365);
    return years === 1 ? '1 year overdue' : `${years} years overdue`;
  }

  if (days === 0) return 'Today';
  if (days === 1) return 'in 1 day';
  if (days <= 6) return `in ${days} days`;

  // 7-29 days: show in weeks (rounded down)
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    if (weeks === 1) return 'in 1 week';
    return `in ${weeks} weeks`;
  }

  // 30+ days: calculate months first
  const months = Math.floor(days / 30);

  // 1-11 months: show in months
  if (months >= 1 && months <= 11) {
    if (months === 1) return 'in 1 month';
    return `in ${months} months`;
  }

  // 12+ months: show in years (rounded down)
  const years = Math.floor(days / 365);
  if (years < 1) return 'in 1 year'; // Edge case: 360-364 days = 12 months but < 1 year
  if (years === 1) return 'in 1 year';
  return `in ${years} years`;
}

/**
 * Format due date for display on task cards (shorter format)
 */
export function formatDueDateShort(days: number): string {
  if (days < 0) {
    const overdue = Math.abs(days);
    if (overdue < 7) return `${overdue}d overdue`;
    if (overdue < 30) {
      const weeks = Math.floor(overdue / 7);
      return `${weeks}w overdue`;
    }
    if (overdue < 365) {
      const months = Math.floor(overdue / 30);
      return `${months}mo overdue`;
    }
    const years = Math.floor(overdue / 365);
    return `${years}y overdue`;
  }

  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  if (days <= 6) return `in ${days}d`;

  // 7-29 days: show in weeks (rounded down)
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `in ${weeks}w`;
  }

  // 30-364 days: show in months (rounded down)
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `in ${months}mo`;
  }

  // 365+ days: show in years (rounded down)
  const years = Math.floor(days / 365);
  return `in ${years}y`;
}
