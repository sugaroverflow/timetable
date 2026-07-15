/**
 * @mention parsing (product feedback round 1). A mention is an `@handle` where
 * the handle is a user's slug (lowercase, digits, hyphens). Handles are matched
 * against timetable members server-side; unknown handles are ignored.
 */

// Preceded by start-of-string or a non-handle character so emails
// (foo@bar) don't register as mentions.
const MENTION_RE = /(?:^|[^A-Za-z0-9_@])@([a-z0-9][a-z0-9-]*)/gi;

/** Unique, lowercased handles referenced by `@handle` tokens in the text. */
export function parseMentionHandles(body: string): string[] {
  const handles = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    if (match[1]) handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}
