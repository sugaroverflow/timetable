"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";

import type {
  CalendarPerms,
  CalendarSlot,
  TopicOption,
} from "@/lib/calendarTypes";
import type { RoleLabels } from "@/lib/timetableSettings";

import { Avatar } from "./Avatar";
import { AvailabilityControl } from "./AvailabilityControl";
import { DiscussionPanel, fetchSlotComments } from "./SlotDiscussion";
import type { SlotComment } from "./SlotDiscussion";
import {
  AdminSlotControls,
  SessionControls,
  SessionLine,
} from "./SlotSessionControls";

/** A slot plus its server-computed pastness (kept out of render for the
 * react purity rule). */
export type CalendarTableRow = { slot: CalendarSlot; past: boolean };

// "Fri 9 Oct" / "14:00" — en-GB pinned for day-before-month and 24h time
// (QA 2026-08-02; the viewer's own locale gave "Fri, Oct 9 02:00 PM").
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** The Monday starting this slot's week (viewer-local) — week-divider key. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toDateString();
}

function pct(n: number, total: number): string {
  return total > 0 ? `${(n / total) * 100}%` : "0%";
}

function countsTitle(c: { green: number; yellow: number; red: number }) {
  return `🟢 ${c.green} · 🟡 ${c.yellow} · 🔴 ${c.red}`;
}

/** Speech-bubble discussion button (QA 2026-08-02): count inside the
 * bubble, empty bubble when there are no messages yet. */
function CommentButton({
  slot,
  open,
  onToggle,
}: {
  slot: CalendarSlot;
  open: boolean;
  onToggle: () => Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`cal-comment-btn${slot.commentCount === 0 ? " cal-comment-empty" : ""}`}
      aria-expanded={open}
      aria-label={
        slot.commentCount > 0
          ? `Discussion (${slot.commentCount} messages)`
          : "Discussion"
      }
      title={open ? "Hide discussion" : "Discussion"}
      onClick={() => void onToggle()}
    >
      <MessageCircle size={22} aria-hidden />
      {slot.commentCount > 0 ? (
        <span className="cal-comment-count">
          {slot.commentCount > 99 ? "99" : slot.commentCount}
        </span>
      ) : null}
    </button>
  );
}

/** Availability meter with the electors' avatars INSIDE their segment
 * (QA 2026-08-02): 🟢 people on the green stretch, and so on. The audience
 * is the same on every row of a view, so the meter always fills its column
 * width; avatars link to the person's page.
 *
 * The avatar meter is workbench apparatus, so it renders only in deciding
 * contexts — a topic lens active, or the row folded open (QA 2026-08-05).
 * Scanning rows get the compact counts-only bar instead. */
function AvailabilityMeter({
  perUser,
  counts,
  slug,
  detailed,
}: {
  perUser: NonNullable<CalendarSlot["perUser"]>;
  counts: { green: number; yellow: number; red: number };
  slug: string;
  detailed: boolean;
}) {
  const states = ["green", "yellow", "red"] as const;

  if (!detailed) {
    const total = counts.green + counts.yellow + counts.red;
    if (total === 0) return null;
    return (
      <span
        className="avail-bar avail-meter avail-meter-compact"
        title={countsTitle(counts)}
      >
        {states.map((state) =>
          counts[state] === 0 ? null : (
            <span
              key={state}
              className={state[0]}
              style={{ width: pct(counts[state], total) }}
            />
          ),
        )}
      </span>
    );
  }

  const total = perUser.length;
  if (total === 0) return null;
  return (
    <span className="avail-bar avail-meter" title={countsTitle(counts)}>
      {states.map((state) => {
        const people = perUser.filter((u) => u.state === state);
        if (people.length === 0) return null;
        return (
          <span
            key={state}
            className={`avail-meter-seg ${state[0]}`}
            style={{ width: pct(people.length, total) }}
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
    </span>
  );
}

/** The fold under a slot row: discussion, then session/admin controls. */
function SlotDetail({
  slot,
  slug,
  perms,
  claimTopics,
  lensTopic,
  adminLabel,
  officeHoursLabel,
  roleLabels,
  comments,
  onReload,
}: {
  slot: CalendarSlot;
  slug: string;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  adminLabel: string;
  officeHoursLabel: string;
  roleLabels?: RoleLabels;
  comments: SlotComment[] | null;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <DiscussionPanel
        slot={slot}
        slug={slug}
        perms={perms}
        lensTopic={lensTopic}
        comments={comments}
        roleLabels={roleLabels}
        onReload={onReload}
      />
      <SessionControls
        slot={slot}
        perms={perms}
        claimTopics={claimTopics}
        officeHoursLabel={officeHoursLabel}
      />
      {perms.canAdmin ? (
        <AdminSlotControls slot={slot} label={adminLabel} />
      ) : null}
    </div>
  );
}

/** "**Fri 9 Oct** Terrace" over "14:00 – 16:00" (QA 2026-08-02). */
function WhenCell({ slot }: { slot: CalendarSlot }) {
  return (
    <td className="cal-when-cell">
      <div>
        <strong>{formatDate(slot.startsAt)}</strong>
        {slot.location ? <> {slot.location}</> : null}
      </div>
      <div className="faint" style={{ fontSize: 12 }}>
        {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
      </div>
    </td>
  );
}

/** The role-gated right-hand cells: group meter (host/admin), own
 * availability toggle (elector). */
function MeterAndYouCells({
  slot,
  past,
  perms,
  slug,
  detailed,
}: {
  slot: CalendarSlot;
  past: boolean;
  perms: CalendarPerms;
  slug: string;
  detailed: boolean;
}) {
  return (
    <>
      {perms.canSeeHostOnly ? (
        <td className="cal-avail-cell">
          {slot.perUser ? (
            <AvailabilityMeter
              perUser={slot.perUser}
              counts={slot.counts}
              slug={slug}
              detailed={detailed}
            />
          ) : null}
        </td>
      ) : null}
      {perms.canSetAvailability ? (
        <td className="cal-you-cell">
          {past ? null : (
            <AvailabilityControl
              slotId={slot.id}
              state={slot.viewerState}
              compact
            />
          )}
        </td>
      ) : null}
    </>
  );
}

function SlotTableRow({
  slot,
  past,
  weekStart,
  slug,
  perms,
  claimTopics,
  lensTopic,
  lensActive,
  adminLabel,
  officeHoursLabel,
  roleLabels,
  columns,
}: {
  slot: CalendarSlot;
  past: boolean;
  /** True when this slot starts a new (Mon-first) week — thicker rule. */
  weekStart: boolean;
  slug: string;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  lensActive: boolean;
  adminLabel: string;
  officeHoursLabel: string;
  roleLabels?: RoleLabels;
  columns: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<SlotComment[] | null>(null);
  const canExpand = perms.canSeeHostOnly || perms.canAdmin;

  async function loadComments() {
    try {
      setComments(await fetchSlotComments(slot.id));
    } catch {
      setComments([]);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) await loadComments();
  }

  const rowClasses = [
    past ? "cal-past" : null,
    weekStart ? "cal-week-start" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Fragment>
      <tr className={rowClasses || undefined}>
        <td className="cal-caret-cell">
          {canExpand ? (
            <CommentButton slot={slot} open={open} onToggle={toggle} />
          ) : null}
        </td>
        <WhenCell slot={slot} />
        <MeterAndYouCells
          slot={slot}
          past={past}
          perms={perms}
          slug={slug}
          detailed={lensActive || open}
        />
      </tr>
      {/* "Author: Topic" / "Host — office hours" + status pill on its own
          line under the row — visually part of the same slot block. */}
      {slot.topic || slot.sessionHost ? (
        <tr className={`cal-session-row${past ? " cal-past" : ""}`}>
          <td />
          <td colSpan={columns - 1}>
            <SessionLine
              slot={slot}
              slug={slug}
              officeHoursLabel={officeHoursLabel}
            />
          </td>
        </tr>
      ) : null}
      {/* Fold indented to the when-column with a hierarchy line on the
          left (QA 2026-08-03). */}
      {open ? (
        <tr className="cal-detail-row">
          <td />
          <td colSpan={columns - 1}>
            <div className="cal-fold">
              <SlotDetail
                slot={slot}
                slug={slug}
                perms={perms}
                claimTopics={claimTopics}
                lensTopic={lensTopic}
                adminLabel={adminLabel}
                officeHoursLabel={officeHoursLabel}
                roleLabels={roleLabels}
                comments={comments}
                onReload={loadComments}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/**
 * The calendar as a compact table (QA 2026-07-31 — replaced one card per
 * slot): the 💬 bubble folds a row open into discussion/controls, the
 * full-width availability meter carries avatars inside their 🟢🟡🔴
 * segment, and month headings ride as divider rows.
 */
export function CalendarTable({
  rows,
  slug,
  perms,
  claimTopics,
  lensTopic,
  lensActive = false,
  adminLabel = "Admin",
  officeHoursLabel = "Office hours",
  roleLabels,
  showingPast,
  base,
}: {
  rows: CalendarTableRow[];
  slug: string;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  /** Any lens (a topic or "anyone who ❤️'d mine") — full avatar meters. */
  lensActive?: boolean;
  adminLabel?: string;
  officeHoursLabel?: string;
  /** Forum role labels for the discussion authors' role pills. */
  roleLabels?: RoleLabels;
  showingPast: boolean;
  base: string;
}) {
  const columns =
    2 + (perms.canSeeHostOnly ? 1 : 0) + (perms.canSetAvailability ? 1 : 0);

  const pastToggle = (
    <Link
      className="topic-body-toggle"
      href={showingPast ? `${base}/calendar` : `${base}/calendar?past=1`}
    >
      {showingPast ? (
        <>
          <ChevronUp size={14} aria-hidden /> Hide past
        </>
      ) : (
        <>
          <ChevronDown size={14} aria-hidden /> Show past
        </>
      )}
    </Link>
  );

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginBottom: 8 }}>
        Calendar
      </h3>
      <div className="table-wrap">
        {/* No header row (QA 2026-08-03) — the columns explain themselves. */}
        <table className="data-table cal-table">
          <tbody>
            {rows.map(({ slot, past }, i) => {
              const month = monthLabel(slot.startsAt);
              const divider =
                i === 0 || month !== monthLabel(rows[i - 1]!.slot.startsAt);
              // Thicker rule between Sunday and Monday (QA 2026-08-02) —
              // skipped when a month heading already breaks the run.
              const weekStart =
                !divider &&
                i > 0 &&
                weekKey(slot.startsAt) !== weekKey(rows[i - 1]!.slot.startsAt);
              return (
                <Fragment key={slot.id}>
                  {divider ? (
                    <tr className="cal-month-row">
                      <td colSpan={columns}>
                        <span className="cal-month-inner">
                          {month}
                          {/* The past toggle rides in the FIRST month
                              break (QA 2026-08-03). */}
                          {i === 0 ? pastToggle : null}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                  <SlotTableRow
                    slot={slot}
                    past={past}
                    weekStart={weekStart}
                    slug={slug}
                    perms={perms}
                    claimTopics={claimTopics}
                    lensTopic={lensTopic}
                    lensActive={lensActive}
                    adminLabel={adminLabel}
                    officeHoursLabel={officeHoursLabel}
                    roleLabels={roleLabels}
                    columns={columns}
                  />
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
