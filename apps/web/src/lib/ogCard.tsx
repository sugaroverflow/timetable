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

/** Image types satori (the OG renderer) can decode — uploads may also be
 * AVIF, which it can't; those degrade to the text card. */
const RENDERABLE_IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)/;

/** Fetch an image and inline it as a data URI so the renderer never does
 * its own (failable) fetch. Returns null on any failure — missing URL,
 * non-image, oversized (> 4 MB), undecodable type, slow (> 3 s) — so the
 * card degrades to its text-only form instead of erroring. */
export async function fetchImageData(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  try {
    // Deliberately raw fetch: this hits the image CDN, not our API.
    // eslint-disable-next-line no-restricted-globals
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !RENDERABLE_IMAGE_TYPES.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 4_000_000) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

/** The one card layout: optional small grey kicker line (forum name on
 * topic/person cards), an optional round photo (person cards — cover-crop
 * makes any aspect ratio a clean circle), a big title, an optional grey
 * footer line, and an accent bar along the bottom (the forum's theme
 * primary when set). */
export function ogCard(args: {
  kicker?: string | null;
  emoji?: string | null;
  photo?: string | null;
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
      {args.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori JSX
        <img
          src={args.photo}
          alt=""
          style={{
            width: 200,
            height: 200,
            borderRadius: 9999,
            objectFit: "cover",
            marginBottom: 36,
          }}
        />
      ) : null}
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

/** Full-bleed variant for topic cards with a cover photo: the image
 * cover-crops to fill the whole card (any aspect ratio or size renders
 * clean — tall/wide images just crop), with a bottom scrim so the white
 * text stays readable on any picture. */
export function ogCoverCard(args: {
  image: string;
  kicker?: string | null;
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
        position: "relative",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- satori JSX */}
      <img
        src={args.image}
        alt=""
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(to top, rgba(10,12,18,0.85) 0%, rgba(10,12,18,0.35) 55%, rgba(10,12,18,0.05) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 18,
          display: "flex",
          flexDirection: "column",
          padding: "0 80px 72px",
          color: "#ffffff",
        }}
      >
        {args.kicker ? (
          <div
            style={{
              fontSize: 36,
              color: "rgba(255,255,255,0.82)",
              marginBottom: 18,
            }}
          >
            {args.kicker}
          </div>
        ) : null}
        <div
          style={{
            fontSize: args.title.length > 60 ? 56 : 72,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {args.title}
        </div>
        {args.footer ? (
          <div
            style={{
              fontSize: 34,
              color: "rgba(255,255,255,0.82)",
              marginTop: 22,
            }}
          >
            {args.footer}
          </div>
        ) : null}
      </div>
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
    timetable: forum(idOrSlug: $s) { name settings }
  }
`;
