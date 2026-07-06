"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const SINGLE = `mutation($s: String!, $a: String!, $b: String!, $loc: String) {
  createTimeslot(idOrSlug: $s, startsAt: $a, endsAt: $b, location: $loc) { id }
}`;
const WEEKLY = `mutation($s: String!, $a: String!, $b: String!, $loc: String, $c: Int!) {
  createWeeklyTimeslots(idOrSlug: $s, startsAt: $a, endsAt: $b, location: $loc, count: $c) { id }
}`;

export function SlotAdminForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [weeks, setWeeks] = useState(1);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) return;
    const a = new Date(start).toISOString();
    const b = new Date(end).toISOString();
    try {
      if (weeks > 1) {
        await clientGql(WEEKLY, { s: slug, a, b, loc: location, c: weeks });
      } else {
        await clientGql(SINGLE, { s: slug, a, b, loc: location });
      }
      setStart("");
      setEnd("");
      setLocation("");
      setWeeks(1);
      toast(weeks > 1 ? `${weeks} weekly slots created` : "Slot created");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not create slot");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Add timeslot</h3>
      <div className="field">
        <label htmlFor="slot-start">Start</label>
        <input
          id="slot-start"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="slot-end">End</label>
        <input
          id="slot-end"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="slot-loc">Location</label>
        <input
          id="slot-loc"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Classroom"
        />
      </div>
      <div className="field">
        <label htmlFor="slot-weeks">Repeat weekly (count)</label>
        <input
          id="slot-weeks"
          type="number"
          min={1}
          max={52}
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value) || 1)}
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {weeks > 1 ? `Create ${weeks} slots` : "Create slot"}
      </button>
    </form>
  );
}
