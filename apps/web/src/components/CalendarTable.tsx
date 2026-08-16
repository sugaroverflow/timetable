"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, MessageCircle } from "lucide-react";

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
// An UNGROUPED list has no month heading to carry the year, so it shows
// one (the rule Ed kept, 2026-08-16).
function formatDate(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
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
        slotId={slot.id}
        counts={slot.counts}
        slug={slug}
        viewerId={perms.viewerId}
        canModerate={perms.canAdmin}
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
  showYear,
  action,
}: {
  slot: CalendarSlot;
  past: boolean;
  perms: CalendarPerms;
  canExpand: boolean;
  showYear: boolean;
  /** The caller's own per-row control — the workbench's one-click Pencil
   * in / Unpencil for the topic whose panel this is (2026-08-16). */
  action: React.ReactNode;
}) {
  return (
    <div className="cal-row-line">
      <span className="cal-when">
        <strong>{formatDate(slot.startsAt, showYear)}</strong>{" "}
        {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
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
        {action}
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
  showYear,
  action,
}: {
  slot: CalendarSlot;
  past: boolean;
  slug: string;
  perms: CalendarPerms;
  officeHoursLabel: string;
  canExpand: boolean;
  open: boolean;
  showYear: boolean;
  action: React.ReactNode;
}) {
  return (
    <div className="cal-row-head">
      {/* The wash needs the counts, which the API serves to hosts and
          admins only (2026-08-16) — belt and braces, since the gate that
          nulls them is the same one this checks. */}
      {perms.canSeeHostOnly && slot.counts ? (
        <TintLayer
          counts={slot.counts}
          avatarCounts={open && slot.perUser ? tallyStates(slot.perUser) : null}
        />
      ) : null}
      <RowLine
        slot={slot}
        past={past}
        perms={perms}
        canExpand={canExpand}
        showYear={showYear}
        action={action}
      />
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
  showYear,
  action,
}: {
  slot: CalendarSlot;
  past: boolean;
  /** True when this slot starts a new (Mon-first) week — bigger gap. */
  weekStart: boolean;
  /** Ungrouped lists carry the year (no month heading to hold it). */
  showYear: boolean;
  action: React.ReactNode;
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
        showYear={showYear}
        action={action}
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

/** The list's heading: card lists get the serif section title, bare
 * lists the quiet sans subhead; a collapsible list's title is the fold
 * toggle. The past toggle rides here when there is no month heading to
 * carry it (ungrouped lists). */
function TableHeading({
  title,
  card,
  grouped,
  collapsible,
  open,
  onToggle,
  pastToggle,
}: {
  title: string;
  card: boolean;
  grouped: boolean;
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  pastToggle: React.ReactNode;
}) {
  return (
    <h3
      className={card ? "section-title" : "cal-subhead"}
      style={{ marginBottom: 8 }}
    >
      {collapsible ? (
        <button
          type="button"
          className="cal-section-toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
          {title}
        </button>
      ) : (
        title
      )}
      {/* Ungrouped lists have no month heading to carry it. */}
      {!grouped ? pastToggle : null}
    </h3>
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
  title = "Calendar",
  card = true,
  grouped = true,
  collapsible = false,
  // No defaults (each one is a complexity point) — undefined renders as
  // nothing, same as null.
  pastToggle,
  controls,
  rowAction,
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
  /** "Your sessions", "Calendar", … — the heading. Null for a list that
   * needs none (the sessions tab IS its own heading, 2026-08-16). */
  title?: string | null;
  /** False renders the bare list — for lists already inside something
   * (a topic card's tab panel), where a card-in-card reads as clutter
   * (Ed, QA 2026-08-16). The heading also drops to the small variant. */
  card?: boolean;
  /** Month headings and week gaps (the chronology). False for a list in
   * some other order — availability-ranked, say — whose rows then carry
   * the year instead (2026-08-16). */
  grouped?: boolean;
  /** Fold the whole card away by its heading (Ed, QA 2026-08-16: the
   * workbench's two sections each fold). */
  collapsible?: boolean;
  /** Show past / Hide past, when this list offers the past at all. The
   * caller owns it: a page link on the calendar, a state toggle in the
   * workbench. */
  pastToggle?: React.ReactNode;
  /** A controls row UNDER the heading, folding with the rows — the
   * workbench's sort toggle (left) + Show past (right); space-between
   * comes from .cal-table-controls (Ed, QA 2026-08-16 round 3). */
  controls?: React.ReactNode;
  /** A per-row control in the right cluster — the workbench's one-click
   * pencil. */
  rowAction?: (slot: CalendarSlot) => React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const showRows = !collapsible || open;

  return (
    <div className={card ? "card" : undefined}>
      {title != null ? (
        <TableHeading
          title={title}
          card={card}
          grouped={grouped}
          collapsible={collapsible}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          pastToggle={pastToggle}
        />
      ) : null}
      {/* Conditional render, not `hidden` — .cal-list's own display rule
          out-specifies the attribute (the fold bug, QA 2026-08-16). */}
      {showRows ? (
        <>
          {/* Unconditional div + :empty rule, not a ternary — CalendarTable
              sits at the complexity limit. */}
          <div className="cal-table-controls">{controls}</div>
          <div className="cal-list">
            {rows.map(({ slot, past }, i) => {
              const month = monthLabel(slot.startsAt);
              const divider =
                grouped &&
                (i === 0 || month !== monthLabel(rows[i - 1]!.slot.startsAt));
              // Bigger gap between Sunday and Monday — skipped when a month
              // heading already breaks the run.
              const weekStart =
                grouped &&
                !divider &&
                i > 0 &&
                weekKey(slot.startsAt) !== weekKey(rows[i - 1]!.slot.startsAt);
              return (
                <Fragment key={slot.id}>
                  {divider ? (
                    <MonthRow
                      month={month}
                      toggle={i === 0 ? pastToggle : null}
                    />
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
                    showYear={!grouped}
                    action={rowAction?.(slot) ?? null}
                  />
                </Fragment>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** A month heading between row groups; the past toggle rides in the
 * FIRST month break (QA 2026-08-03). */
function MonthRow({
  month,
  toggle,
}: {
  month: string;
  toggle: React.ReactNode;
}) {
  return (
    <div className="cal-month-row">
      <span className="cal-month-inner">
        {month}
        {toggle}
      </span>
    </div>
  );
}
