// TODO: Replace hardcoded strings in existing screens with these constants for i18n support.
// When adding i18n, replace this file with i18next or expo-localization.

export const strings = {
  // Navigation
  tabs: {
    home: 'Home',
    tasks: 'Tasks',
    supplies: 'Supplies',
  },

  // Home screen
  home: {
    needsAttention: 'Needs Attention',
    allCaughtUp: "You're all caught up! 🎉",
    completedToday: 'Completed Today',
  },

  // Tasks
  tasks: {
    addTask: 'Add a Task',
    suggestedTasks: 'Browse Suggested Tasks',
    markComplete: 'Mark Complete',
    dueToday: 'Due Today',
    overdue: 'overdue',
    repeatsMonthly: 'Repeats monthly',
    repeatsYearly: 'Repeats yearly',
    noTasksYet: 'No tasks yet',
    getStarted: 'Get Started',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    advanceReminder: 'Advance Reminder',
    noAdvanceReminder: 'No Advance Reminder',
    noAdvanceReminderSubtext: "You'll still get a task alert on the due date",
    whenFirstDue: 'When is this first due?',
    howOftenRepeat: 'How often does it repeat?',
    addTaskButton: 'Add Task',
    skipButton: 'Skip',
    deleteTask: 'Delete Task',
    deleteTaskConfirm: 'Delete Task?',
    deleteTaskMessage: 'This will permanently delete this task and cannot be undone.',
  },

  // Supplies
  supplies: {
    addCustomSupply: 'Add a Custom Supply',
    browseSuggested: 'Browse Suggested Supplies',
    updateStock: 'Update Stock',
    logPurchase: 'Log Purchase',
    deleteSupply: 'Delete from Supply List',
    usedBy: 'Used By',
    purchaseHistory: 'Purchase History',
    activity: 'Activity',
    onlinePurchaseLink: 'Online Purchase Link (optional)',
    onlinePurchasePlaceholder: 'Paste a link e.g. Amazon, Chewy, Walmart',
    notLinkedToTask: 'Not yet linked to any task',
    linkTaskToTrack: 'Link a task to track usage',
    autoTrackingDaily: 'Auto-tracking daily',
    autoTrackingWeekly: 'Auto-tracking weekly',
    autoTrackingMonthly: 'Auto-tracking monthly',
    hasRunOut: 'Has run out',
    reorderNow: 'Reorder now — running low!',
    stockLabel: 'Stock',
    reorderBy: 'Reorder by',
    estimatedRunOut: 'Estimated run out',
  },

  // Wizard
  wizard: {
    setupTitle: "Let's set up your household",
    setupSubtitle: 'Choose the tasks you want to track',
    addTasksButton: 'Add {count} Tasks →',
    addSuppliesButton: 'Add {count} Supplies →',
    allSet: "You're all set! 🎉",
    allSetSubtitle: "You've added all our suggestions.",
  },

  // Profile
  profile: {
    changeDisplayName: 'Change Display Name',
    changePassword: 'Change Password',
    notificationPreferences: 'Notification Preferences',
    displayNameUpdated: 'Display name updated!',
    displayNameEmpty: 'Display name cannot be empty',
  },

  // Notifications
  notifications: {
    taskReminder: 'Task Reminder',
    runningLow: 'Running low on {supplyName}',
    snoozedUntilTomorrow: 'Snoozed until tomorrow',
    daysRemaining: '{days} days remaining',
  },

  // General
  general: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    done: 'Done',
    skip: 'Skip',
    next: 'Next →',
    back: 'Back',
    ok: 'OK',
    yes: 'Yes',
    no: 'No',
    comingSoon: 'Coming Soon',
    comingSoonMessage: 'This feature is coming in a future update.',
    error: 'Error',
    success: 'Success',
    loading: 'Loading...',
    optional: '(optional)',
  },

  // Errors
  errors: {
    generic: 'Something went wrong. Please try again.',
    noInternet: 'No internet connection. Please try again.',
    sessionExpired: 'Session expired. Please log in again.',
  },
};

/**
 * Format a string template with dynamic values.
 *
 * @example
 * format(strings.notifications.runningLow, { supplyName: 'HVAC Filters' })
 * // Returns: "Running low on HVAC Filters"
 *
 * @example
 * format(strings.wizard.addTasksButton, { count: 5 })
 * // Returns: "Add 5 Tasks →"
 */
export const format = (
  template: string,
  params: Record<string, string | number>
): string => {
  return Object.entries(params).reduce(
    (str, [key, value]) => str.replace(`{${key}}`, String(value)),
    template
  );
};
