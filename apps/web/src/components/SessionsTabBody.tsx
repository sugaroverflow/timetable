"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { clientGql } from "@/lib/clientGraphql";

import { AvailabilityControl } from "./AvailabilityControl";
import { formatTime } from "./CalendarTable";

const QUERY = `query TopicSessions($s: String!, $t: String!) {
  topicSessions(idOrSlug: $s, topicId: $t) {
    slotId startsAt endsAt status location viewerState
  }
}`;

type SessionRow = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  status: "proposed" | "confirmed";
  location: string;
  viewerState: string | null;
};

/** A flat list can mix months (and, terms apart, years), so every date
 * carries its year — the topic-workbench's availability-view rule; en-GB
 * pinned for day-before-month (QA 2026-08-02). */
function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** sessions-tab (2026-08-14): the elector side of demand-first scheduling
 * — the Sessions tab of topic-tabs on feed/permalink/queue cards (NOT My
 * Topics, whose host has the Scheduling tab). Every future slot where
 * this topic is pencilled/confirmed, fetched lazily on first mount (the
 * inactive tab panel is unmounted, so mounting = tab opened), each row
 * carrying the SessionLine status idiom and — electors only — the
 * viewer's own inline 🟢🟡🔴 toggle: the existing per-slot calendar
 * write, re-homed. No group washes/counts/avatars here by design
 * (deferred privacy question). */
export function SessionsTabBody({
  slug,
  topicId,
  canSetAvailability,
}: {
  slug: string;
  topicId: string;
  /** Electors only — everyone else reads the schedule without a toggle. */
  canSetAvailability: boolean;
}) {
  const [rows, setRows] = useState<SessionRow[] | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientGql<{ topicSessions: SessionRow[] | null }>(QUERY, {
      s: slug,
      t: topicId,
    })
      .then((res) => {
        if (!cancelled) setRows(res.topicSessions);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, topicId]);

  if (failed) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Couldn&rsquo;t load the sessions.
      </div>
    );
  }
  if (rows === undefined) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Loading…
      </div>
    );
  }
  if (rows === null || rows.length === 0) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        No upcoming sessions.
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((row) => (
        <div
          key={row.slotId}
          className="row wrap"
          style={{ gap: 8, alignItems: "center" }}
        >
          <span className="cal-when">
            <strong>{formatSessionDate(row.startsAt)}</strong>{" "}
            {formatTime(row.startsAt)} – {formatTime(row.endsAt)}
          </span>
          {/* SessionLine's status idiom; a pencil is location-less, so the
              location renders only once confirmed. */}
          {row.status === "confirmed" && row.location ? (
            <span className="cal-where">{row.location}</span>
          ) : null}
          {row.status === "confirmed" ? (
            <span className="pill pill-host">confirmed</span>
          ) : (
            <span className="pill" title="Pencilled in — under discussion">
              ✎ pencilled
            </span>
          )}
          {canSetAvailability ? (
            <span className="cal-row-right">
              <AvailabilityControl
                slotId={row.slotId}
                state={row.viewerState}
                compact
                onSet={(state) =>
                  setRows((prev) =>
                    Array.isArray(prev)
                      ? prev.map((r) =>
                          r.slotId === row.slotId
                            ? { ...r, viewerState: state }
                            : r,
                        )
                      : prev,
                  )
                }
              />
            </span>
          ) : null}
        </div>
      ))}
      <Link
        href={`/f/${slug}/calendar`}
        className="faint"
        style={{ fontSize: 12 }}
      >
        Open the calendar
      </Link>
    </div>
  );
}
