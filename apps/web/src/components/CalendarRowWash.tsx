"use client";

import Link from "next/link";

import { Avatar } from "./Avatar";

/** The calendar's row-wash visual language (2026-08-05), extracted so the
 * topic-workbench rows on My Topics can wear the identical look
 * (2026-08-14). The `cal-row*` CSS classes in globals.css are the other
 * half of this contract. */

export type StateCounts = { green: number; yellow: number; red: number };

export type PerUserAvailability = {
  userId: string;
  name: string | null;
  image: string | null;
  state: "green" | "yellow" | "red";
};

const STATES = ["green", "yellow", "red"] as const;

function pct(n: number, total: number): string {
  return total > 0 ? `${(n / total) * 100}%` : "0%";
}

function countsTitle(c: StateCounts) {
  return `🟢 ${c.green} · 🟡 ${c.yellow} · 🔴 ${c.red}`;
}

/** Per-avatar flex basis (px): 17px face + breathing room. The tint and
 * the avatar row use IDENTICAL flex rules over the same container width,
 * so the flex algorithm resolves them to identical segment widths — the
 * colours fit the avatars, not the other way round (QA 2026-08-05). */
function avatarFitStyle(n: number): React.CSSProperties {
  return { flexGrow: n, flexBasis: n * 20 };
}

export function tallyStates(perUser: PerUserAvailability[]): StateCounts {
  const t: StateCounts = { green: 0, yellow: 0, red: 0 };
  for (const u of perUser) t[u.state] += 1;
  return t;
}

/** The row IS the chart (row-wash redesign, 2026-08-05): availability
 * renders as low-alpha washes across the row's own background. Closed,
 * segment widths are the group's proportions (the denominator is constant
 * down a view, so widths compare directly); open, they follow the avatar
 * row's geometry via `avatarCounts`. */
export function TintLayer({
  counts,
  avatarCounts,
}: {
  counts: StateCounts;
  /** Set while the row is open — switch to avatar-fitted segments. */
  avatarCounts: StateCounts | null;
}) {
  const src = avatarCounts ?? counts;
  const total = src.green + src.yellow + src.red;
  if (total === 0) return null;
  return (
    <span className="cal-row-tint" aria-hidden title={countsTitle(counts)}>
      {STATES.map((state) =>
        src[state] === 0 ? null : (
          <span
            key={state}
            className={state[0]}
            style={
              avatarCounts
                ? avatarFitStyle(src[state])
                : { width: pct(src[state], total) }
            }
          />
        ),
      )}
    </span>
  );
}

/** Who exactly — avatars inside their wash segment, shown when the row is
 * folded open. Segment geometry matches the tint layer's (see
 * avatarFitStyle). Avatars link to the person's page. */
export function FoldAvatars({
  perUser,
  slug,
}: {
  perUser: PerUserAvailability[];
  slug: string;
}) {
  if (perUser.length === 0) return null;
  // Faces scale to the space (QA 2026-08-05): each head's share of the
  // row is 100cqw / total (the flex segments distribute exactly evenly
  // per head — grow and basis are both ∝ n), minus breathing room,
  // clamped 15–32px. Inline because the count is per-row data.
  const face = `clamp(15px, calc(100cqw / ${perUser.length} - 5px), 32px)`;
  return (
    <div
      className="cal-fold-avatars"
      style={{ "--face": face } as React.CSSProperties}
    >
      {STATES.map((state) => {
        const people = perUser.filter((u) => u.state === state);
        if (people.length === 0) return null;
        return (
          <span
            key={state}
            className="cal-fold-seg"
            style={avatarFitStyle(people.length)}
          >
            {people.map((u) => (
              <Link
                key={u.userId}
                href={`/f/${slug}/${u.userId}`}
                className="cal-person-link"
                aria-label={u.name ?? "Member"}
              >
                <Avatar name={u.name} image={u.image} small />
              </Link>
            ))}
          </span>
        );
      })}
    </div>
  );
}
