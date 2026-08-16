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

import { AvailabilityControl } from "./AvailabilityControl";
import { FoldAvatars, tallyStates, TintLayer } from "./CalendarRowWash";
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
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** The Monday starting this slot's week (viewer-local) — week-gap key. */
export function weekKey(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toDateString();
}

// TintLayer / FoldAvatars / tallyStates moved to CalendarRowWash.tsx
// (2026-08-14) so the topic-workbench shares the row-wash look.

/** The fold under the tinted head: discussion, then controls — outside
 * the washes (QA 2026-08-05). */
function SlotDetail({
  slot,
  slug,
  locations,
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
  locations: string[];
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
    <div className="cal-row-detail">
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
        locations={locations}
        perms={perms}
        claimTopics={claimTopics}
        officeHoursLabel={officeHoursLabel}
      />
      {perms.canAdmin ? (
        <AdminSlotControls
          slot={slot}
          locations={locations}
          label={adminLabel}
        />
      ) : null}
    </div>
  );
}

/** True when a click/keypress landed on an interactive element that owns
 * the event — links, the availability toggle, fold controls. */
function onInteractive(e: { target: EventTarget | null }): boolean {
  return Boolean(
    (e.target as HTMLElement | null)?.closest(
      "a,button,input,select,textarea,label",
    ),
  );
}

/** The when-line riding above the tints: datetime | the right cluster
 * (💬 count when non-zero, the elector's own toggle). Bookings render
 * BELOW this line (QA 2026-08-06 — sharing it wrapped ugly). */
function RowLine({
  slot,
  past,
  perms,
  canExpand,
}: {
  slot: CalendarSlot;
  past: boolean;
  perms: CalendarPerms;
  canExpand: boolean;
}) {
  return (
    <div className="cal-row-line">
      <span className="cal-when">
        <strong>{formatDate(slot.startsAt)}</strong> {formatTime(slot.startsAt)}{" "}
        – {formatTime(slot.endsAt)}
      </span>
      {/* Where this time is offered (slot locations, 2026-08-11); each
          booking's own location rides on its session line below. */}
      {slot.locations.map((l) => (
        <span key={l} className="cal-where">
          {l}
        </span>
      ))}
      <span className="cal-row-right">
        {canExpand && slot.commentCount > 0 ? (
          <span
            className="cal-count"
            aria-label={`Discussion (${slot.commentCount} messages)`}
          >
            <MessageCircle size={14} aria-hidden />
            {slot.commentCount > 99 ? "99" : slot.commentCount}
          </span>
        ) : null}
        {perms.canSetAvailability && !past ? (
          <AvailabilityControl
            slotId={slot.id}
            state={slot.viewerState}
            compact
          />
        ) : null}
      </span>
    </div>
  );
}

/** The tinted region: washes cover the when-line, the booking lines, and
 * (open) the avatar row, but never the discussion below (QA 2026-08-05). */
function RowHead({
  slot,
  past,
  slug,
  perms,
  officeHoursLabel,
  canExpand,
  open,
}: {
  slot: CalendarSlot;
  past: boolean;
  slug: string;
  perms: CalendarPerms;
  officeHoursLabel: string;
  canExpand: boolean;
  open: boolean;
}) {
  return (
    <div className="cal-row-head">
      {perms.canSeeHostOnly ? (
        <TintLayer
          counts={slot.counts}
          avatarCounts={open && slot.perUser ? tallyStates(slot.perUser) : null}
        />
      ) : null}
      <RowLine slot={slot} past={past} perms={perms} canExpand={canExpand} />
      {slot.sessions.length > 0 ? (
        <div className="cal-row-sessions">
          {slot.sessions.map((session) => (
            <SessionLine
              key={session.id}
              session={session}
              slug={slug}
              officeHoursLabel={officeHoursLabel}
            />
          ))}
        </div>
      ) : null}
      {open && slot.perUser ? (
        <FoldAvatars perUser={slot.perUser} slug={slug} />
      ) : null}
    </div>
  );
}

function SlotRow({
  slot,
  past,
  weekStart,
  slug,
  locations,
  perms,
  claimTopics,
  lensTopic,
  adminLabel,
  officeHoursLabel,
  roleLabels,
}: {
  slot: CalendarSlot;
  past: boolean;
  /** True when this slot starts a new (Mon-first) week — bigger gap. */
  weekStart: boolean;
  slug: string;
  locations: string[];
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  adminLabel: string;
  officeHoursLabel: string;
  roleLabels?: RoleLabels;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<SlotComment[] | null>(null);
  const canExpand = perms.canDiscuss;

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
    "cal-row",
    past ? "cal-past" : null,
    weekStart ? "cal-week-start" : null,
    canExpand ? "cal-row-expandable" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rowClasses}
      role={canExpand ? "button" : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? open : undefined}
      onClick={(e) => {
        if (canExpand && !onInteractive(e)) void toggle();
      }}
      onKeyDown={(e) => {
        if (!canExpand || (e.key !== "Enter" && e.key !== " ")) return;
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        void toggle();
      }}
    >
      <RowHead
        slot={slot}
        past={past}
        slug={slug}
        perms={perms}
        officeHoursLabel={officeHoursLabel}
        canExpand={canExpand}
        open={open}
      />
      {open ? (
        <SlotDetail
          slot={slot}
          slug={slug}
          locations={locations}
          perms={perms}
          claimTopics={claimTopics}
          lensTopic={lensTopic}
          adminLabel={adminLabel}
          officeHoursLabel={officeHoursLabel}
          roleLabels={roleLabels}
          comments={comments}
          onReload={loadComments}
        />
      ) : null}
    </div>
  );
}

/**
 * The calendar as a list of row washes (2026-08-05 — replaced the table
 * with its meters, hairlines, and week rules): each slot is one rounded
 * block whose background tints ARE the availability chart, rows separated
 * by gaps (bigger between weeks), month headings between groups. The whole
 * row toggles its fold for any member (discussion for everyone since
 * 2026-08-14; avatars and controls remain host/admin).
 */
export function CalendarTable({
  rows,
  slug,
  locations = [],
  perms,
  claimTopics,
  lensTopic,
  adminLabel = "Admin",
  officeHoursLabel = "Office hours",
  roleLabels,
  showingPast,
  base,
  title = "Calendar",
  showPastToggle = true,
}: {
  rows: CalendarTableRow[];
  slug: string;
  /** The forum's configured locations (pencil-in suggestions). */
  locations?: string[];
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  adminLabel?: string;
  officeHoursLabel?: string;
  /** Forum role labels for the discussion authors' role pills. */
  roleLabels?: RoleLabels;
  showingPast: boolean;
  base: string;
  /** "Your sessions" for the host's own pinned copy above the chronology
   * (Ed, QA 2026-08-16); the full calendar keeps the default. */
  title?: string;
  /** Only the full chronology offers the past — a pinned group of your
   * own upcoming sessions has no history to show. */
  showPastToggle?: boolean;
}) {
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
        {title}
      </h3>
      <div className="cal-list">
        {rows.map(({ slot, past }, i) => {
          const month = monthLabel(slot.startsAt);
          const divider =
            i === 0 || month !== monthLabel(rows[i - 1]!.slot.startsAt);
          // Bigger gap between Sunday and Monday — skipped when a month
          // heading already breaks the run.
          const weekStart =
            !divider &&
            i > 0 &&
            weekKey(slot.startsAt) !== weekKey(rows[i - 1]!.slot.startsAt);
          return (
            <Fragment key={slot.id}>
              {divider ? (
                <div className="cal-month-row">
                  <span className="cal-month-inner">
                    {month}
                    {/* The past toggle rides in the FIRST month break
                        (QA 2026-08-03). */}
                    {i === 0 && showPastToggle ? pastToggle : null}
                  </span>
                </div>
              ) : null}
              <SlotRow
                slot={slot}
                past={past}
                weekStart={weekStart}
                slug={slug}
                locations={locations}
                perms={perms}
                claimTopics={claimTopics}
                lensTopic={lensTopic}
                adminLabel={adminLabel}
                officeHoursLabel={officeHoursLabel}
                roleLabels={roleLabels}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
