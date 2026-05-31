/** Tiny classnames joiner — keeps conditional Tailwind strings readable. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
