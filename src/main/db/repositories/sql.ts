/** A LIKE pattern that finds `text` anywhere, with LIKE's own wildcards escaped (use `ESCAPE '\'`). */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

/** The current UTC time in the format used by created_at and deleted_at. */
export const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
