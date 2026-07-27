import { env } from "@/env";

/** Social-preview (Open Graph) card helpers (QA 2026-07-27). Cards are
 * deliberately simple: text on white with the accent bar, no photos yet.
 * Inside a forum the card carries the FORUM's identity only — no topic.forum
 * branding (per Ed); the app-level card is the one place the brand shows. */

export const OG_SIZE = { width: 1200, height: 630 };

const ACCENT_FALLBACK = "#2f54eb"; // --primary (brand blue)

/** Anonymous GraphQL fetch — social scrapers carry no session, and using
 * an explicitly session-less request guarantees a private forum's card can
 * never leak details, whoever triggers the render. Returns null on any
 * failure so callers fall back to a more generic card. */
export async function anonGql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  const endpoint = process.env.GRAPHQL_ROUTE_URL ?? env.graphqlUrl;
  try {
    // Deliberately NOT the transport wrappers: they attach the viewer's
    // session, and these cards must always render the anonymous view.
    // eslint-disable-next-line no-restricted-globals
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (!res.ok || json.errors?.length) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** The one card layout: optional small grey kicker line (forum name on
 * topic/person cards), a big title, an optional grey footer line, and an
 * accent bar along the bottom (the forum's theme primary when set). */
export function ogCard(args: {
  kicker?: string | null;
  emoji?: string | null;
  title: string;
  footer?: string | null;
  accent?: string | null;
}) {
  const accent =
    args.accent && /^#[0-9a-fA-F]{6}$/.test(args.accent)
      ? args.accent
      : ACCENT_FALLBACK;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "#ffffff",
        color: "#1b2330",
        padding: "72px 80px 96px",
        position: "relative",
      }}
    >
      {args.kicker ? (
        <div style={{ fontSize: 36, color: "#6a7383", marginBottom: 18 }}>
          {args.kicker}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          fontSize: args.title.length > 60 ? 56 : 72,
          fontWeight: 700,
          lineHeight: 1.15,
        }}
      >
        {args.emoji ? <span>{args.emoji}</span> : null}
        <span>{args.title}</span>
      </div>
      {args.footer ? (
        <div style={{ fontSize: 34, color: "#6a7383", marginTop: 22 }}>
          {args.footer}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 18,
          background: accent,
        }}
      />
    </div>
  );
}

export type OgForum = {
  name: string;
  settings: string;
};

/** Parse the bits of forum settings the cards use. */
export function forumCardBits(forum: OgForum): {
  emoji: string | null;
  accent: string | null;
} {
  try {
    const settings = JSON.parse(forum.settings) as {
      iconEmoji?: string;
      theme?: { primary?: string };
    };
    return {
      emoji: settings.iconEmoji ?? null,
      accent: settings.theme?.primary ?? null,
    };
  } catch {
    return { emoji: null, accent: null };
  }
}

export const OG_FORUM_QUERY = `
  query OgForum($s: String!) {
    timetable(idOrSlug: $s) { name settings }
  }
`;
