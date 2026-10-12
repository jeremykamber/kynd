/**
 * Counts that read as words. `1 persona`, `3 personas`, `2 analyses`.
 *
 * One helper instead of a ternary per count: the batch list, the batch header
 * and the completion copy all shipped `1 personas` because each site spelled
 * the plural out by hand.
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
