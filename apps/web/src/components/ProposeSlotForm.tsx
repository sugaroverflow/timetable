"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import type { TopicOption } from "@/lib/calendarTypes";
import { useGqlAction } from "@/lib/useGqlAction";

const PROPOSE = `mutation($s: String!, $a: String!, $b: String!, $loc: String, $t: String!) {
  proposeSlot(idOrSlug: $s, startsAt: $a, endsAt: $b, location: $loc, topicId: $t) { id }
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
}: {
  slug: string;
  topics: TopicOption[];
  locations: string[];
}) {
  const { run, busy } = useGqlAction();
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState(
    topics.length === 1 ? topics[0]!.id : "",
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end || !topicId) return;
    void run(
      PROPOSE,
      {
        s: slug,
        a: new Date(start).toISOString(),
        b: new Date(end).toISOString(),
        loc: location,
        t: topicId,
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

  // Hidden behind one big button, same reveal-in-place rule as
  // "Create New Topic" (QA 2026-08-02).
  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-create"
        onClick={() => setOpen(true)}
      >
        <Plus size={20} aria-hidden /> Propose a different time
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
            aria-label="Topic"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="">Topic…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
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
            placeholder="Location"
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
            disabled={busy || !start || !end || !topicId}
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
