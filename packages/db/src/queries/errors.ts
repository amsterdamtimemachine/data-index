/**
 * A timeSlice key that doesn't match any computed slice. Slice keys are derived from
 * the bin configuration, so shared URLs go stale when it changes; the HTTP layer maps
 * this to a 400 rather than silently dropping the time filter (which would return a
 * superset of what was asked).
 */
export class UnknownTimeSliceError extends Error {
  constructor(key: string) {
    super(`Unknown time slice: ${key}`);
    this.name = 'UnknownTimeSliceError';
  }
}
