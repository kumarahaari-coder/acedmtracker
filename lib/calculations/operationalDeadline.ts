import { sql, SQL } from "drizzle-orm";

/**
 * Authoritative Canonical Active Assignment Statuses.
 * Newly assigned work does not require acceptance to be considered active.
 */
export const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "accepted", "in_progress"] as const;
export type ActiveAssignmentStatus = typeof ACTIVE_ASSIGNMENT_STATUSES[number];

export const ACTIVE_ASSIGNMENT_STATUS_SET = new Set<string>(ACTIVE_ASSIGNMENT_STATUSES);

export function isAssignmentStatusActive(status?: string | null): boolean {
  if (!status) return false;
  return ACTIVE_ASSIGNMENT_STATUS_SET.has(status);
}

/**
 * Canonical Operational Deadline Resolver:
 * COALESCE(final_internal_deadline, calculated_internal_deadline, submission_deadline)
 *
 * Invariant: scheduled_publication_date MUST NEVER be used as the employee operational due date.
 * If final_internal_deadline exists, it wins.
 */
export function getEffectiveOperationalDeadline(item: {
  finalInternalDeadline?: string | Date | null;
  calculatedInternalDeadline?: string | Date | null;
  submissionDeadline?: string | Date | null;
  deadlines?: {
    submissionDeadline?: string | Date | null;
  };
}): Date | null {
  const raw =
    item.finalInternalDeadline ??
    item.calculatedInternalDeadline ??
    item.submissionDeadline ??
    item.deadlines?.submissionDeadline;

  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format string representation of operational deadline
 */
export function getEffectiveOperationalDeadlineISO(item: {
  finalInternalDeadline?: string | Date | null;
  calculatedInternalDeadline?: string | Date | null;
  submissionDeadline?: string | Date | null;
  deadlines?: {
    submissionDeadline?: string | Date | null;
  };
}): string | null {
  const d = getEffectiveOperationalDeadline(item);
  return d ? d.toISOString() : null;
}

/**
 * SQL Expression for Canonical Operational Deadline
 * Generates:
 * COALESCE(<alias>.final_internal_deadline, <alias>.calculated_internal_deadline, <alias>.submission_deadline)
 */
export function sqlCanonicalOperationalDeadline(ciAlias: string = "ci"): SQL {
  return sql`COALESCE(${sql.raw(ciAlias)}.final_internal_deadline, ${sql.raw(ciAlias)}.calculated_internal_deadline, ${sql.raw(ciAlias)}.submission_deadline)`;
}

/**
 * Computes the IST start-of-day boundaries for a given date.
 */
export function getISTDateBoundaries(referenceDate: Date = new Date()) {
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayISTStr = istFormatter.format(referenceDate); // "YYYY-MM-DD"
  const startOfToday = new Date(`${todayISTStr}T00:00:00+05:30`);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfTomorrow = new Date(startOfTomorrow.getTime() + 24 * 60 * 60 * 1000);

  return {
    todayISTStr,
    startOfToday,
    startOfTomorrow,
    endOfTomorrow,
  };
}

export type OperationalTimingCategory = "overdue" | "today" | "tomorrow" | "upcoming" | "unscheduled";

/**
 * Categorizes an item deadline relative to Asia/Kolkata boundaries.
 */
export function categorizeOperationalTiming(
  deadline: Date | string | null | undefined,
  referenceDate: Date = new Date()
): OperationalTimingCategory {
  if (!deadline) return "unscheduled";
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  if (isNaN(d.getTime())) return "unscheduled";

  const { startOfToday, startOfTomorrow, endOfTomorrow } = getISTDateBoundaries(referenceDate);

  if (d < startOfToday) {
    return "overdue";
  }
  if (d >= startOfToday && d < startOfTomorrow) {
    return "today";
  }
  if (d >= startOfTomorrow && d < endOfTomorrow) {
    return "tomorrow";
  }
  return "upcoming";
}
