"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import {
  SessionChoiceOptions,
  sessionChoiceVars,
} from "@/components/SlotSessionControls";
import type { CalendarPerms, TopicOption } from "@/lib/calendarTypes";
import { useGqlAction } from "@/lib/useGqlAction";

const PROPOSE = `mutation($s: String!, $a: String!, $b: String!, $loc: String, $t: String, $sh: String) {
  proposeSlot(idOrSlug: $s, startsAt: $a, endsAt: $b, location: $loc, topicId: $t, sessionHostId: $sh) { id }
}`;

/**
 * Off-piste proposal (calendar v2): "why not breakfast? why not in the
 * park?" — a host (policy-gated) or admin proposes a session at a time
 * outside the grid. The slot is born `proposed` with the topic attached
 * and starts collecting availability immediately.
 */
export function ProposeSlotForm({
  slug,
  topics,
  locations,
  perms,
  officeHoursLabel = "Office hours",
}: {
  slug: string;
  topics: TopicOption[];
  locations: string[];
  /** Admins pick any topic (grouped by author) or any host's office
   * hours; hosts get only their own — QA 2026-08-03. */
  perms: CalendarPerms;
  officeHoursLabel?: string;
}) {
  const { run, busy } = useGqlAction();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(
    topics.length === 1 ? topics[0]!.id : "",
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  // Slot locations (2026-08-11): forums with configured locations require
  // one on every new slot — the proposal creates the slot, so it chooses.
  const needsLocation = locations.length > 0 && !location.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end || !choice || needsLocation) return;
    void run(
      PROPOSE,
      {
        s: slug,
        a: new Date(start).toISOString(),
        b: new Date(end).toISOString(),
        loc: location,
        ...sessionChoiceVars(choice),
      },
      {
        success: "Session time proposed",
        errorFallback: "Could not propose",
        onSuccess: () => {
          setStart("");
          setEnd("");
          setLocation("");
          setOpen(false);
        },
      },
    );
  }

  // Hidden behind a plain left-aligned button (QA 2026-08-02 round 4),
  // same reveal-in-place rule as "Create New Topic".
  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        style={{ alignSelf: "flex-start" }}
        onClick={() => setOpen(true)}
      >
        <Plus size={16} aria-hidden /> Propose a different time
      </button>
    );
  }

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <form onSubmit={submit} className="stack" style={{ gap: 8 }}>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Off the usual grid — breakfast, a full day, the park. It appears as a
          pencilled slot and starts collecting availability right away.
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          <select
            aria-label="Session"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="">Session…</option>
            <SessionChoiceOptions
              claimTopics={topics}
              admin={perms.canAdmin}
              viewerId={perms.viewerId}
              officeHoursLabel={officeHoursLabel}
            />
          </select>
          <input
            type="datetime-local"
            aria-label="Start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ width: "auto" }}
          />
          <input
            type="datetime-local"
            aria-label="End"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ width: "auto" }}
          />
          <input
            aria-label="Location"
            placeholder={
              locations.length > 0 ? "Location (required)" : "Location"
            }
            list="cal-locations"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ width: 160 }}
          />
          {locations.length > 0 ? (
            <datalist id="cal-locations">
              {locations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          ) : null}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !start || !end || !choice || needsLocation}
          >
            Propose
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
