import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  format,
} from 'date-fns';
import { MonthlyWeek, RecurrenceRule } from '../types/models';

const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function computeNextDueDate(
  lastCompletedAt: Date,
  recurrence: RecurrenceRule
): Date {
  const interval = Math.max(1, recurrence.interval);
  switch (recurrence.frequency) {
    case 'daily':
      return addDays(lastCompletedAt, interval);

    case 'weekly': {
      const days = recurrence.daysOfWeek;
      if (!days || days.length === 0) {
        return addWeeks(lastCompletedAt, interval);
      }
      const sorted = [...days].sort((a, b) => a - b);
      let candidate = addDays(lastCompletedAt, 1);
      for (let i = 0; i < 7 * (interval + 1); i++) {
        if (sorted.includes(candidate.getDay())) {
          return candidate;
        }
        candidate = addDays(candidate, 1);
      }
      return addWeeks(lastCompletedAt, interval);
    }

    case 'monthly': {
      if (
        recurrence.monthlyType === 'dayOfWeek' &&
        recurrence.monthlyWeekday
      ) {
        const target = addMonths(lastCompletedAt, interval);
        return findNthWeekdayOfMonth(
          target.getFullYear(),
          target.getMonth(),
          recurrence.monthlyWeekday.week,
          recurrence.monthlyWeekday.day
        );
      }
      const day = recurrence.monthlyDay ?? lastCompletedAt.getDate();
      const target = addMonths(lastCompletedAt, interval);
      const lastDay = endOfMonth(target).getDate();
      return new Date(
        target.getFullYear(),
        target.getMonth(),
        Math.min(day, lastDay)
      );
    }

    case 'yearly':
      return addYears(lastCompletedAt, interval);
  }
}

export function findNthWeekdayOfMonth(
  year: number,
  month: number,
  week: MonthlyWeek,
  day: number
): Date {
  if (week === 'last') {
    let candidate = endOfMonth(new Date(year, month, 1));
    while (candidate.getDay() !== day) {
      candidate = addDays(candidate, -1);
    }
    return candidate;
  }
  const weekIndex = { first: 0, second: 1, third: 2, fourth: 3 }[week];
  let candidate = new Date(year, month, 1);
  while (candidate.getDay() !== day) {
    candidate = addDays(candidate, 1);
  }
  return addDays(candidate, weekIndex * 7);
}

export function weekOfMonthFor(date: Date): MonthlyWeek {
  const w = Math.ceil(date.getDate() / 7);
  if (w >= 5) return 'last';
  return (['first', 'second', 'third', 'fourth'] as const)[w - 1];
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function recurrenceSummary(r: RecurrenceRule, anchor?: Date): string {
  const i = r.interval;
  switch (r.frequency) {
    case 'daily':
      return i === 1 ? 'Every day' : `Every ${i} days`;

    case 'weekly': {
      const prefix = i === 1 ? 'Every week' : `Every ${i} weeks`;
      if (r.daysOfWeek && r.daysOfWeek.length > 0) {
        const names = [...r.daysOfWeek]
          .sort((a, b) => a - b)
          .map((d) => WEEKDAY_LONG[d]);
        return `${prefix} on ${joinList(names)}`;
      }
      return prefix;
    }

    case 'monthly': {
      const prefix = i === 1 ? 'Every month' : `Every ${i} months`;
      if (r.monthlyType === 'dayOfWeek' && r.monthlyWeekday) {
        return `${prefix} on the ${r.monthlyWeekday.week} ${WEEKDAY_LONG[r.monthlyWeekday.day]}`;
      }
      const day = r.monthlyDay ?? anchor?.getDate() ?? 1;
      return `${prefix} on the ${ordinal(day)}`;
    }

    case 'yearly': {
      const prefix = i === 1 ? 'Every year' : `Every ${i} years`;
      if (anchor) {
        return `${prefix} on ${format(anchor, 'MMMM d')}`;
      }
      return prefix;
    }
  }
}

/**
 * Generate the next N future due dates for a task based on its recurrence.
 * @param nextDueDate - The task's current nextDueDate
 * @param recurrence - The task's recurrence rule
 * @param fromDate - Today's date (for reference)
 * @param count - Number of occurrences to generate
 * @returns Array of future dates
 */
export function calculateNextOccurrences(
  nextDueDate: Date,
  recurrence: RecurrenceRule,
  fromDate: Date,
  count: number
): Date[] {
  const results: Date[] = [];
  let current = new Date(nextDueDate);

  // Determine how many occurrences to generate based on frequency
  const maxCount = getMaxOccurrenceCount(recurrence, count);

  for (let i = 0; i < maxCount && results.length < count; i++) {
    if (i === 0) {
      // First occurrence is the nextDueDate itself
      results.push(new Date(current));
    } else {
      // Calculate subsequent occurrences
      current = computeNextDueDate(current, recurrence);
      results.push(new Date(current));
    }

    // Check end conditions
    if (recurrence.endType === 'afterOccurrences' && recurrence.endAfterOccurrences) {
      if (results.length >= recurrence.endAfterOccurrences) break;
    }
    if (recurrence.endType === 'byDate' && recurrence.endByDate) {
      if (current > recurrence.endByDate) {
        results.pop(); // Remove the one that exceeded
        break;
      }
    }
  }

  return results;
}

/**
 * Get the recommended number of occurrences to generate based on frequency.
 */
function getMaxOccurrenceCount(recurrence: RecurrenceRule, baseCount: number): number {
  const interval = Math.max(1, recurrence.interval);
  switch (recurrence.frequency) {
    case 'daily':
      return Math.min(baseCount, 90); // 3 months of daily
    case 'weekly':
      return Math.min(baseCount, 26 * interval); // 6 months of weekly
    case 'monthly':
      return Math.min(baseCount, 12 * interval); // 12 months
    case 'yearly':
      return Math.min(baseCount, 5 * interval); // 5 years
    default:
      return baseCount;
  }
}

/**
 * Get a short recurrence label for display.
 */
export function recurrenceShortLabel(r: RecurrenceRule): string {
  const i = r.interval;
  switch (r.frequency) {
    case 'daily':
      return i === 1 ? 'Repeats daily' : `Repeats every ${i} days`;
    case 'weekly':
      return i === 1 ? 'Repeats weekly' : `Repeats every ${i} weeks`;
    case 'monthly':
      return i === 1 ? 'Repeats monthly' : `Repeats every ${i} months`;
    case 'yearly':
      return i === 1 ? 'Repeats yearly' : `Repeats every ${i} years`;
  }
}
