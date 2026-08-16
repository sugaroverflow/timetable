"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

import { clientGql } from "@/lib/clientGraphql";
import type { RoleLabels } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

import {
  FoldAvatars,
  tallyStates,
  TintLayer,
  type PerUserAvailability,
} from "./CalendarRowWash";
import { formatTime, monthLabel, weekKey } from "./CalendarTable";
import {
  DiscussionPanel,
  fetchSlotComments,
  type SlotComment,
} from "./SlotDiscussion";

const QUERY = `query TopicSchedule($s: String!, $t: String!) {
  topicSlotFit(idOrSlug: $s, topicId: $t) {
    hearterCount
    slots {
      slotId startsAt endsAt sessionId topicStatus commentCount
      counts { green yellow red }
      perUser { userId name image state }
      others { id label status }
    }
  }
}`;

const ADD_SESSION = `mutation($slot: String!, $topic: String!) {
  addSlotSession(slotId: $slot, topicId: $topic)
}`;
const CLEAR_SESSION = `mutation($session: String!) {
  clearSlotSession(sessionId: $session)
}`;

type FitRow = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  sessionId: string | null;
  topicStatus: "proposed" | "confirmed" | null;
  counts: { green: number; yellow: number; red: number };
  perUser: PerUserAvailability[];
  others: { id: string; label: string; status: string }[];
  commentCount: number;
};

type TopicSchedule = { hearterCount: number; slots: FitRow[] };

type SortMode = "date" | "availability";

/** Unlike the calendar page (which groups rows under month-year headings),
 * the availability view mixes terms years apart — every date carries its
 * year (QA 2026-08-14). */
function formatFitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Availability order (Ed, 2026-08-14): 🟢 dominates 🟡 dominates 🔴 —
 * and since every hearter is exactly one of the three, (green, yellow)
 * lexicographic IS the complete ordering; date breaks exact ties. */
function compareRows(a: FitRow, b: FitRow, mode: SortMode): number {
  if (mode === "availability") {
    if (b.counts.green !== a.counts.green)
      return b.counts.green - a.counts.green;
    if (b.counts.yellow !== a.counts.yellow) {
      return b.counts.yellow - a.counts.yellow;
    }
  }
  return Date.parse(a.startsAt) - Date.parse(b.startsAt);
}

/** True when a click landed on an interactive element that owns the event
 * (the pencil/unpencil buttons, the chat) — same guard as calendar rows. */
function onInteractive(e: { target: EventTarget | null }): boolean {
  return Boolean(
    (e.target as HTMLElement | null)?.closest(
      "a,button,input,select,textarea,label",
    ),
  );
}

/** "Fri 9 Oct" — the by-date view's month headings carry the year. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** What makes a row an accordion. Pinned rows get none of it: they are
 * already open and have nothing to toggle. */
function foldHandlers(open: boolean, toggle: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-expanded": open,
    onClick: (e: React.MouseEvent) => {
      if (!onInteractive(e)) toggle();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      toggle();
    },
  };
}

/** Who else is here (QA 2026-08-15): pencils never contend, so this is
 * company, not conflict — but a confirmed session here means the room
 * race has started. */
function OthersLine({ others }: { others: FitRow["others"] }) {
  if (others.length === 0) return null;
  return (
    <div className="cal-row-others">
      {others.map((o) => (
        <span key={o.id}>
          <span aria-hidden>{o.status === "confirmed" ? "✓" : "✎"}</span>{" "}
          {o.label}
        </span>
      ))}
    </div>
  );
}

/** The 💬 count a row carries before you unfold it — the calendar page's
 * own affordance, so a slot announces its chat in both places. */
function ChatCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="cal-count" aria-label={`Discussion (${count} messages)`}>
      <MessageCircle size={14} aria-hidden />
      {count > 99 ? "99" : count}
    </span>
  );
}

/** topic-workbench (2026-08-14, demand-first scheduling): the per-topic
 * scheduling pane on My Topics — a mini-calendar of washed datetime rows
 * over THIS topic's hearters (pencils are location-less time-intents; a
 * pencil is the host saying "I am available at this time"), expandable to
 * the hearter avatar fold, with a Date/Availability sort toggle. By date,
 * rows group under month headings with week gaps, exactly like the
 * calendar page (past slots are excluded server-side); by availability
 * the list is flat and ranked. Unfolding a row opens the hearter avatars
 * AND the slot's own chat (QA 2026-08-16) — the same thread the calendar
 * page shows. Rendered inside the topic-tabs Scheduling tab. */
export function TopicScheduleBody({
  slug,
  topicId,
  canPencil,
  viewerId = null,
  canModerate = false,
  roleLabels,
}: {
  slug: string;
  topicId: string;
  /** False under confirmPolicy "admins" (hosts can't pencil): rows stay
   * informative, the pencil buttons hide. */
  canPencil: boolean;
  /** For the per-slot chat a row unfolds — whose comments are editable,
   * and who may hide (QA 2026-08-16). */
  viewerId?: string | null;
  canModerate?: boolean;
  roleLabels?: RoleLabels;
}) {
  const [data, setData] = useState<TopicSchedule | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useState<SortMode>("date");

  useEffect(() => {
    let cancelled = false;
    clientGql<{ topicSlotFit: TopicSchedule | null }>(QUERY, {
      s: slug,
      t: topicId,
    })
      .then((res) => {
        if (!cancelled) setData(res.topicSlotFit);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, topicId, reloadKey]);

  if (failed) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Couldn&rsquo;t load the schedule.
      </div>
    );
  }
  if (data === undefined) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Loading…
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Scheduling isn&rsquo;t available for this topic.
      </div>
    );
  }

  const sorted = [...data.slots].sort((a, b) => compareRows(a, b, mode));
  const grouped = mode === "date";
  // Your own slots ride at the top as well as staying in place below (Ed,
  // QA 2026-08-15) — the summary of what you've said you're free for,
  // without punching a hole in the date-ordered list underneath.
  const pinned = data.slots
    .filter((r) => r.topicStatus !== null)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const shared: SharedRowProps = {
    slug,
    topicId,
    canPencil,
    viewerId,
    canModerate,
    roleLabels,
    onReload: () => setReloadKey((k) => k + 1),
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className="row wrap"
        style={{
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="faint" style={{ fontSize: 12 }}>
          {data.hearterCount === 0
            ? "No ❤️s yet — the washes fill in as people ❤️ this topic."
            : `Availability of the ${data.hearterCount} ❤️ on this topic. Pencil in every time you could run it.`}
        </span>
        <div className="avseg" role="group" aria-label="Sort slots">
          {(["date", "availability"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? "on" : ""}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m === "date" ? "By date" : "By availability"}
            </button>
          ))}
        </div>
      </div>
      <PinnedSessions rows={pinned} shared={shared} />
      {sorted.length === 0 ? (
        <div className="faint" style={{ fontSize: 12 }}>
          No upcoming slots on the calendar.
        </div>
      ) : (
        <SlotList rows={sorted} grouped={grouped} shared={shared} />
      )}
    </div>
  );
}

/** Everything a row needs that doesn't come from the row itself. */
type SharedRowProps = {
  slug: string;
  topicId: string;
  canPencil: boolean;
  viewerId: string | null;
  canModerate: boolean;
  roleLabels?: RoleLabels;
  onReload: () => void;
};

/** The "Your sessions" group: this topic's own pencils and confirmations,
 * pinned above the list and repeated in it (Ed, QA 2026-08-15). */
function PinnedSessions({
  rows,
  shared,
}: {
  rows: FitRow[];
  shared: SharedRowProps;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="cal-list">
      <div className="cal-month-row">
        <span className="cal-month-inner">Your sessions</span>
      </div>
      {rows.map((row) => (
        <WorkbenchRow
          key={`pinned-${row.slotId}`}
          row={row}
          weekStart={false}
          showYear
          pinned
          {...shared}
        />
      ))}
    </div>
  );
}

/** The full list: month headings and week gaps by date (the calendar
 * idiom), flat and ranked by availability. */
function SlotList({
  rows,
  grouped,
  shared,
}: {
  rows: FitRow[];
  grouped: boolean;
  shared: SharedRowProps;
}) {
  return (
    <div className="cal-list">
      {rows.map((row, i) => {
        const previous = rows[i - 1];
        const divider =
          grouped &&
          (i === 0 ||
            monthLabel(row.startsAt) !== monthLabel(previous!.startsAt));
        const weekStart =
          grouped &&
          !divider &&
          i > 0 &&
          weekKey(row.startsAt) !== weekKey(previous!.startsAt);
        return (
          <Fragment key={row.slotId}>
            {divider ? (
              <div className="cal-month-row">
                <span className="cal-month-inner">
                  {monthLabel(row.startsAt)}
                </span>
              </div>
            ) : null}
            <WorkbenchRow
              row={row}
              weekStart={weekStart}
              showYear={!grouped}
              pinned={false}
              {...shared}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

/** One washed datetime row, calendar-style: the tint IS the availability
 * chart; clicking the row folds open the hearter avatars (the accordion);
 * the right cluster is the pencil state/action. Pinned copies (the "Your
 * sessions" group) are the same row with the avatar fold locked open —
 * they don't collapse, so there is nothing to click. */
/** The row's right cluster: this topic's own state here, and the one
 * action that changes it. A confirmed session is the admins' to undo. */
function PencilControls({
  row,
  topicId,
  canPencil,
  onReload,
}: {
  row: FitRow;
  topicId: string;
  canPencil: boolean;
  onReload: () => void;
}) {
  const { run, busy } = useGqlAction();
  if (row.topicStatus === "confirmed") {
    return <span className="pill pill-host">confirmed</span>;
  }
  if (row.topicStatus === "proposed") {
    return (
      <>
        <span className="pill" title="Pencilled in — under discussion">
          ✎ pencilled
        </span>
        {canPencil && row.sessionId ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(
                CLEAR_SESSION,
                { session: row.sessionId },
                {
                  success: "Unpencilled",
                  errorFallback: "Could not unpencil",
                  onSuccess: onReload,
                },
              )
            }
          >
            Unpencil
          </button>
        ) : null}
      </>
    );
  }
  if (!canPencil) return null;
  return (
    <button
      type="button"
      className="btn"
      disabled={busy}
      onClick={() =>
        void run(
          ADD_SESSION,
          { slot: row.slotId, topic: topicId },
          {
            success: "Pencilled in",
            errorFallback: "Could not pencil in",
            onSuccess: onReload,
          },
        )
      }
    >
      Pencil in
    </button>
  );
}

function WorkbenchRow({
  row,
  slug,
  topicId,
  canPencil,
  weekStart,
  showYear,
  pinned,
  viewerId,
  canModerate,
  roleLabels,
  onReload,
}: SharedRowProps & {
  row: FitRow;
  weekStart: boolean;
  /** The availability view has no month headings to carry the year. */
  showYear: boolean;
  /** The copy at the top of the list: avatars always showing, no fold —
   * and no chat, since a locked-open thread per pinned row would bury the
   * summary. Unfold the same slot below for that. */
  pinned: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expanded = pinned || open;
  // The slot's chat, fetched the first time the row unfolds — the same
  // lazy load the calendar page's rows do (QA 2026-08-16).
  const [comments, setComments] = useState<SlotComment[] | null>(null);
  const loadComments = useCallback(async () => {
    try {
      setComments(await fetchSlotComments(row.slotId));
    } catch {
      setComments([]);
    }
  }, [row.slotId]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) void loadComments();
  };
  const when = showYear ? formatFitDate(row.startsAt) : shortDate(row.startsAt);

  return (
    <div
      className={`cal-row${pinned ? "" : " cal-row-expandable"}${weekStart ? " cal-week-start" : ""}`}
      {...(pinned ? {} : foldHandlers(open, toggle))}
    >
      <div className="cal-row-head">
        <TintLayer
          counts={row.counts}
          avatarCounts={expanded ? tallyStates(row.perUser) : null}
        />
        <div className="cal-row-line">
          <span className="cal-when">
            <strong>{when}</strong> {formatTime(row.startsAt)} –{" "}
            {formatTime(row.endsAt)}
          </span>
          <span className="cal-row-right">
            {pinned ? null : <ChatCount count={row.commentCount} />}
            <PencilControls
              row={row}
              topicId={topicId}
              canPencil={canPencil}
              onReload={onReload}
            />
          </span>
        </div>
        <OthersLine others={row.others} />
        {expanded ? <FoldAvatars perUser={row.perUser} slug={slug} /> : null}
      </div>
      {/* The slot's own chat — the same thread the calendar page shows, so
          a timeslot has ONE conversation wherever you meet it (Ed, QA
          2026-08-16). Plain comments, not claims: the claim chip belongs
          to the calendar's audience lens. */}
      {open ? (
        <div className="cal-row-detail">
          <DiscussionPanel
            slotId={row.slotId}
            counts={row.counts}
            slug={slug}
            viewerId={viewerId}
            canModerate={canModerate}
            lensTopic={null}
            comments={comments}
            roleLabels={roleLabels}
            onReload={loadComments}
          />
        </div>
      ) : null}
    </div>
  );
}
