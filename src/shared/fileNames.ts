/** A file name Windows accepts: characters it forbids become dashes; never empty. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are forbidden in Windows file names
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
  // Windows also refuses names ending in a dot or a space.
  return cleaned.replace(/[. ]+$/, '') || 'Rent Tracker';
}
