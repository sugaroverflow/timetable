"use client";

import { useEffect, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";

import { clientGql } from "@/lib/clientGraphql";
import { useGqlAction } from "@/lib/useGqlAction";
import { useTableSort } from "@/lib/useTableSort";

import { formatTime } from "./CalendarTable";
import { SortHeader } from "./SortHeader";

/** Unlike the calendar page (which groups rows under month-year headings),
 * this table mixes terms years apart once sorted by counts — every date
 * carries its year (QA 2026-08-14: "Mon 28 Jun" was 2027 and read as past). */
function formatFitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const QUERY = `query TopicSchedule($s: String!, $t: String!) {
  topicSlotFit(idOrSlug: $s, topicId: $t) {
    hearterCount
    slots {
      slotId startsAt endsAt locations freeLocations full topicStatus
      counts { green yellow red }
    }
  }
}`;

const ADD_SESSION = `mutation($slot: String!, $loc: String, $topic: String) {
  addSlotSession(slotId: $slot, location: $loc, topicId: $topic)
}`;

type FitRow = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  locations: string[];
  freeLocations: string[];
  full: boolean;
  topicStatus: "proposed" | "confirmed" | null;
  counts: { green: number; yellow: number; red: number };
};

type TopicSchedule = { hearterCount: number; slots: FitRow[] };

type SortKey = "date" | "where" | "green" | "yellow" | "red";

function compareRows(a: FitRow, b: FitRow, key: SortKey) {
  switch (key) {
    case "date":
      return Date.parse(a.startsAt) - Date.parse(b.startsAt);
    case "where":
      return a.freeLocations
        .join(", ")
        .localeCompare(b.freeLocations.join(", "));
    case "green":
      return a.counts.green - b.counts.green;
    case "yellow":
      return a.counts.yellow - b.counts.yellow;
    case "red":
      return a.counts.red - b.counts.red;
  }
}

/** topic-workbench (2026-08-14, demand-first scheduling): the per-topic
 * scheduling panel on My Topics. Future slots scored by THIS topic's
 * hearters' availability, sortable, with inline pencil-in. Collapsed by
 * default; the body mounts (and fetches) only when opened. */
export function TopicSchedulePanel({
  slug,
  topicId,
  canPencil,
  calendarEnabled,
  topicStatus,
}: {
  slug: string;
  topicId: string;
  /** False under confirmPolicy "admins" (hosts can't pencil): the demand
   * table still shows, the action column hides. */
  canPencil: boolean;
  /** The panel self-gates (keeps TopicManager's complexity budget flat):
   * calendar on + published topics only. */
  calendarEnabled: boolean;
  topicStatus: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!calendarEnabled || topicStatus !== "published") return null;
  return (
    <Collapsible.Root
      className="host-panel"
      open={expanded}
      onOpenChange={setExpanded}
    >
      <Collapsible.Trigger className="host-panel-toggle">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
        <CalendarDays size={14} aria-hidden /> Scheduling
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {expanded && (
          <TopicScheduleBody
            slug={slug}
            topicId={topicId}
            canPencil={canPencil}
          />
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function TopicScheduleBody({
  slug,
  topicId,
  canPencil,
}: {
  slug: string;
  topicId: string;
  canPencil: boolean;
}) {
  const [data, setData] = useState<TopicSchedule | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { sortRows, headerProps } = useTableSort<SortKey, FitRow>({
    initial: "date",
    ascendingKeys: ["date", "where"],
    compare: compareRows,
  });

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

  const sorted = sortRows(data.slots);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="faint" style={{ fontSize: 12 }}>
        {data.hearterCount === 0
          ? "No ❤️s yet — the counts below will fill in as people ❤️ this topic."
          : `Availability of the ${data.hearterCount} ❤️ on this topic across upcoming slots.`}
      </div>
      {sorted.length === 0 ? (
        <div className="faint" style={{ fontSize: 12 }}>
          No upcoming slots on the calendar.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table sortable-table">
            <thead>
              <tr>
                <SortHeader label="Date" {...headerProps("date")} />
                <th>Time</th>
                <SortHeader label="Where" {...headerProps("where")} />
                <SortHeader label="🟢" {...headerProps("green")} />
                <SortHeader label="🟡" {...headerProps("yellow")} />
                <SortHeader label="🔴" {...headerProps("red")} />
                {canPencil ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.slotId} className={row.full ? "faint" : undefined}>
                  <td>{formatFitDate(row.startsAt)}</td>
                  <td className="mono">
                    {formatTime(row.startsAt)}–{formatTime(row.endsAt)}
                  </td>
                  <td>
                    {row.freeLocations.length > 0
                      ? row.freeLocations.join(", ")
                      : row.locations.length > 0
                        ? row.locations.join(", ")
                        : "—"}
                  </td>
                  <td className="mono">{row.counts.green}</td>
                  <td className="mono">{row.counts.yellow}</td>
                  <td className="mono">{row.counts.red}</td>
                  {canPencil ? (
                    <td>
                      {row.topicStatus ? (
                        row.topicStatus === "confirmed" ? (
                          <span className="pill pill-host">confirmed</span>
                        ) : (
                          <span
                            className="pill"
                            title="Pencilled in — under discussion"
                          >
                            ✎ pencilled
                          </span>
                        )
                      ) : row.full ? (
                        "full"
                      ) : (
                        <RowPencil
                          slotId={row.slotId}
                          topicId={topicId}
                          freeLocations={row.freeLocations}
                          onReload={() => setReloadKey((k) => k + 1)}
                        />
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Inline pencil-in for one slot row: the location is preselected when the
 * slot offers exactly one (or none — location-free forums); a small select
 * appears when there's a real choice. Races on a just-taken location
 * surface as the server's toast, like PencilInControl. */
function RowPencil({
  slotId,
  topicId,
  freeLocations,
  onReload,
}: {
  slotId: string;
  topicId: string;
  freeLocations: string[];
  onReload: () => void;
}) {
  const { run, busy } = useGqlAction();
  const [location, setLocation] = useState(
    freeLocations.length === 1 ? freeLocations[0]! : "",
  );
  const needsLocation = freeLocations.length > 0 && !location;

  return (
    <span className="row" style={{ gap: 6, alignItems: "center" }}>
      {freeLocations.length > 1 ? (
        <select
          aria-label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Location…</option>
          {freeLocations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="btn"
        disabled={busy || needsLocation}
        onClick={() =>
          void run(
            ADD_SESSION,
            { slot: slotId, loc: location.trim() || null, topic: topicId },
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
    </span>
  );
}
