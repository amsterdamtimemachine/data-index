/**
 * Format a date range for an entity's dateCreated field.
 * Both ends are inclusive: "1948-09-01/1948-09-30" means Sep 1 through Sep 30.
 * Returns "start/end" for ranges, "start" for single dates, undefined if no dates.
 */
export function formatDateRange(startDate: string | null, endDate: string | null): string | undefined {
  if (startDate && endDate && startDate !== endDate) {
    return `${startDate}/${endDate}`;
  }
  if (startDate) {
    return startDate;
  }
  return undefined;
}
