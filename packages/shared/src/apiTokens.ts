/**
 * Personal API token scopes. A token authenticates as its owner but can only
 * reach the mutations its scopes name — the API maps GraphQL mutation fields
 * to these scopes and denies anything unmapped, so admin, moderation, and
 * forum-settings mutations are unreachable by any token regardless of the
 * owner's roles. Scopes are a ceiling, never a grant: the resolvers' own role
 * checks still run, so a token can only ever do a subset of what its owner
 * could do in the app.
 *
 * Reading needs no scope — read queries are already role-filtered, and public
 * forums are readable with no credential at all.
 */
export const API_TOKEN_SCOPES = [
  "hearts:write",
  "comments:write",
  "topics:write",
  "calendar:write",
  "feed:write",
  "profile:write",
] as const;
export type TokenScope = (typeof API_TOKEN_SCOPES)[number];

/** Checkbox labels and help text for the token creation form. */
export const SCOPE_LABELS: Record<
  TokenScope,
  { label: string; description: string }
> = {
  "hearts:write": {
    label: "❤️ topics",
    description: "Add and remove your ❤️ on topics.",
  },
  "comments:write": {
    label: "Write comments",
    description: "Post, edit, and delete your own comments and replies.",
  },
  "topics:write": {
    label: "Write topics",
    description: "Create, edit, submit, and delete your own topics.",
  },
  "calendar:write": {
    label: "Set availability",
    description: "Mark your availability and propose timeslots.",
  },
  "feed:write": {
    label: "Mark things seen",
    description: "Clear your unread counts and topic queue.",
  },
  "profile:write": {
    label: "Edit your profile",
    description: "Change your own profile and notification settings.",
  },
};

export function isTokenScope(value: string): value is TokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value);
}

/** Keep only recognised scopes, deduplicated and in canonical order — so a
 * stored row that predates a renamed scope can't widen anything, and the
 * order a client sent them in never leaks into the UI. */
export function normalizeScopes(raw: readonly string[]): TokenScope[] {
  return API_TOKEN_SCOPES.filter((scope) => raw.includes(scope));
}

/** How long a new token lasts when the creator doesn't choose. Tokens may
 * also be created with no expiry at all. */
export const DEFAULT_TOKEN_EXPIRY_DAYS = 90;

/** Offered in the expiry picker; `null` is "no expiry". */
export const TOKEN_EXPIRY_CHOICES: readonly (number | null)[] = [
  30,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  365,
  null,
];
