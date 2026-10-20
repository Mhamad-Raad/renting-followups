const MAX_STACK_FRAMES = 12;

/**
 * The stack frames of an error, without its message. Messages can contain
 * names or numbers the owner typed, so they never reach the log.
 */
export function stackFrames(error: Error): string {
  return (error.stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, MAX_STACK_FRAMES)
    .join(' | ');
}
