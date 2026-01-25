/**
 * Capacity Store
 *
 * Manages editor capacity settings and workload calculations.
 * Helps admins avoid overloading editors when assigning work.
 *
 * Data stored in: server/data/capacity.json
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CAPACITY_FILE = path.join(DATA_DIR, 'capacity.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default capacity settings
const DEFAULT_CAPACITY = {
  weeklyChapters: 2,        // Default: 2 chapters per week
  maxConcurrent: 3,         // Maximum concurrent assignments
  availableHoursPerWeek: 10 // Hours available for translation work
};

// Estimated hours per stage
const STAGE_HOURS = {
  'enMarkdown': 1,
  'mtOutput': 0.5,
  'linguisticReview': 4,
  'editorialPass1': 4,
  'tmCreated': 1,
  'editorialPass2': 3,
  'publication': 1
};

/**
 * Load capacity settings from file
 */
function loadCapacitySettings() {
  try {
    if (fs.existsSync(CAPACITY_FILE)) {
      return JSON.parse(fs.readFileSync(CAPACITY_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load capacity settings:', err);
  }
  return { users: {}, defaults: DEFAULT_CAPACITY };
}

/**
 * Save capacity settings to file
 */
function saveCapacitySettings(settings) {
  fs.writeFileSync(CAPACITY_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Get capacity settings for a user
 * @param {string} username
 * @returns {object} User's capacity settings (or defaults)
 */
function getUserCapacity(username) {
  const settings = loadCapacitySettings();
  const userSettings = settings.users[username] || {};

  return {
    username,
    weeklyChapters: userSettings.weeklyChapters ?? settings.defaults.weeklyChapters,
    maxConcurrent: userSettings.maxConcurrent ?? settings.defaults.maxConcurrent,
    availableHoursPerWeek: userSettings.availableHoursPerWeek ?? settings.defaults.availableHoursPerWeek,
    isCustom: !!settings.users[username],
    notes: userSettings.notes || null
  };
}

/**
 * Set capacity settings for a user
 * @param {string} username
 * @param {object} capacity
 */
function setUserCapacity(username, capacity) {
  const settings = loadCapacitySettings();

  settings.users[username] = {
    weeklyChapters: capacity.weeklyChapters ?? DEFAULT_CAPACITY.weeklyChapters,
    maxConcurrent: capacity.maxConcurrent ?? DEFAULT_CAPACITY.maxConcurrent,
    availableHoursPerWeek: capacity.availableHoursPerWeek ?? DEFAULT_CAPACITY.availableHoursPerWeek,
    notes: capacity.notes || null,
    updatedAt: new Date().toISOString()
  };

  saveCapacitySettings(settings);
  return getUserCapacity(username);
}

/**
 * Get default capacity settings
 */
function getDefaults() {
  const settings = loadCapacitySettings();
  return settings.defaults;
}

/**
 * Update default capacity settings
 */
function setDefaults(defaults) {
  const settings = loadCapacitySettings();
  settings.defaults = {
    ...settings.defaults,
    ...defaults
  };
  saveCapacitySettings(settings);
  return settings.defaults;
}

/**
 * Calculate current workload for a user
 * @param {string} username
 * @param {array} assignments - All pending assignments
 * @returns {object} Workload analysis
 */
function calculateWorkload(username, assignments) {
  const capacity = getUserCapacity(username);
  const userAssignments = assignments.filter(a =>
    a.assignedTo === username && a.status === 'pending'
  );

  // Calculate current load
  const currentAssignments = userAssignments.length;
  const estimatedHours = userAssignments.reduce((total, a) => {
    return total + (STAGE_HOURS[a.stage] || 2);
  }, 0);

  // Calculate this week's assignments
  const weekStart = getWeekStart();
  const thisWeekAssignments = userAssignments.filter(a => {
    const assignedDate = new Date(a.assignedAt);
    return assignedDate >= weekStart;
  });

  // Calculate due this week
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const dueThisWeek = userAssignments.filter(a => {
    if (!a.dueDate) return false;
    const dueDate = new Date(a.dueDate);
    return dueDate >= weekStart && dueDate < weekEnd;
  });

  // Count overdue
  const now = new Date();
  const overdue = userAssignments.filter(a => {
    if (!a.dueDate) return false;
    return new Date(a.dueDate) < now;
  });

  // Calculate capacity percentages
  const concurrentPercent = Math.round((currentAssignments / capacity.maxConcurrent) * 100);
  const weeklyPercent = Math.round((thisWeekAssignments.length / capacity.weeklyChapters) * 100);
  const hoursPercent = Math.round((estimatedHours / capacity.availableHoursPerWeek) * 100);

  // Determine status
  let status = 'available';
  let statusMessage = 'Laus fyrir verkefni';

  if (currentAssignments >= capacity.maxConcurrent) {
    status = 'at-capacity';
    statusMessage = 'Hámarki náð';
  } else if (concurrentPercent >= 80 || weeklyPercent >= 80 || hoursPercent >= 80) {
    status = 'nearly-full';
    statusMessage = 'Næstum fullur/full';
  } else if (overdue.length > 0) {
    status = 'has-overdue';
    statusMessage = `${overdue.length} verkefni tímafrest`;
  }

  return {
    username,
    capacity,
    current: {
      assignments: currentAssignments,
      estimatedHours,
      thisWeekAssigned: thisWeekAssignments.length,
      dueThisWeek: dueThisWeek.length,
      overdue: overdue.length
    },
    percentages: {
      concurrent: concurrentPercent,
      weekly: weeklyPercent,
      hours: hoursPercent
    },
    status,
    statusMessage,
    canTakeMore: currentAssignments < capacity.maxConcurrent,
    remainingCapacity: {
      assignments: Math.max(0, capacity.maxConcurrent - currentAssignments),
      weeklySlots: Math.max(0, capacity.weeklyChapters - thisWeekAssignments.length),
      hours: Math.max(0, capacity.availableHoursPerWeek - estimatedHours)
    }
  };
}

/**
 * Get workload summary for all active editors
 * @param {array} assignments - All assignments
 * @returns {array} Workload summaries sorted by availability
 */
function getTeamWorkload(assignments) {
  // Get unique assignees from pending assignments
  const assignees = new Set();
  for (const a of assignments) {
    if (a.assignedTo && a.status === 'pending') {
      assignees.add(a.assignedTo);
    }
    if (a.assignedBy) {
      assignees.add(a.assignedBy);
    }
  }

  // Calculate workload for each
  const workloads = [];
  for (const username of assignees) {
    workloads.push(calculateWorkload(username, assignments));
  }

  // Sort by availability (available first, then by remaining capacity)
  workloads.sort((a, b) => {
    const statusOrder = { 'available': 0, 'nearly-full': 1, 'has-overdue': 2, 'at-capacity': 3 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return b.remainingCapacity.assignments - a.remainingCapacity.assignments;
  });

  return workloads;
}

/**
 * Check if assigning work would exceed capacity
 * @param {string} username
 * @param {array} assignments - All pending assignments
 * @param {string} stage - Stage being assigned
 * @returns {object} Warning info if over capacity
 */
function checkCapacityWarning(username, assignments, stage) {
  const workload = calculateWorkload(username, assignments);
  const stageHours = STAGE_HOURS[stage] || 2;

  const warnings = [];

  // Check concurrent assignments
  if (workload.current.assignments >= workload.capacity.maxConcurrent) {
    warnings.push({
      type: 'at-capacity',
      severity: 'error',
      message: `${username} er með ${workload.current.assignments} verkefni (hámark: ${workload.capacity.maxConcurrent})`
    });
  } else if (workload.current.assignments >= workload.capacity.maxConcurrent - 1) {
    warnings.push({
      type: 'nearly-full',
      severity: 'warning',
      message: `${username} verður með ${workload.current.assignments + 1}/${workload.capacity.maxConcurrent} verkefni`
    });
  }

  // Check weekly assignments
  if (workload.current.thisWeekAssigned >= workload.capacity.weeklyChapters) {
    warnings.push({
      type: 'weekly-exceeded',
      severity: 'warning',
      message: `${username} hefur þegar fengið ${workload.current.thisWeekAssigned} verkefni þessa viku (ráðlagt: ${workload.capacity.weeklyChapters})`
    });
  }

  // Check hours
  const newHours = workload.current.estimatedHours + stageHours;
  if (newHours > workload.capacity.availableHoursPerWeek) {
    warnings.push({
      type: 'hours-exceeded',
      severity: 'warning',
      message: `Áætlaður tími: ${newHours} klst. (tiltækt: ${workload.capacity.availableHoursPerWeek} klst.)`
    });
  }

  // Check overdue
  if (workload.current.overdue > 0) {
    warnings.push({
      type: 'has-overdue',
      severity: 'notice',
      message: `${username} er með ${workload.current.overdue} verkefni sem eru tímafrest`
    });
  }

  return {
    hasWarnings: warnings.length > 0,
    hasErrors: warnings.some(w => w.severity === 'error'),
    warnings,
    workload,
    suggestedAssignees: warnings.some(w => w.severity === 'error')
      ? getSuggestedAssignees(username, assignments, stage)
      : []
  };
}

/**
 * Get suggested alternative assignees
 */
function getSuggestedAssignees(excludeUsername, assignments, stage) {
  const workloads = getTeamWorkload(assignments);

  return workloads
    .filter(w => w.username !== excludeUsername && w.canTakeMore)
    .slice(0, 3)
    .map(w => ({
      username: w.username,
      status: w.status,
      statusMessage: w.statusMessage,
      remainingSlots: w.remainingCapacity.assignments
    }));
}

/**
 * Get start of current week (Monday)
 */
function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

/**
 * Get estimated hours for a stage
 */
function getStageHours(stage) {
  return STAGE_HOURS[stage] || 2;
}

module.exports = {
  getUserCapacity,
  setUserCapacity,
  getDefaults,
  setDefaults,
  calculateWorkload,
  getTeamWorkload,
  checkCapacityWarning,
  getStageHours,
  STAGE_HOURS,
  DEFAULT_CAPACITY
};
