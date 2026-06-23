"use client";

import { useActionState } from "react";

import {
  createTimetableAction,
  type CreateTimetableState,
} from "@/app/(app)/timetables/actions";

const initialState: CreateTimetableState = {};

export function CreateTimetableForm() {
  const [state, action, pending] = useActionState(
    createTimetableAction,
    initialState,
  );

  return (
    <form action={action} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Create a timetable</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        You&rsquo;ll be the owner and admin.
      </p>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required placeholder="Newspeak House 2026" />
      </div>

      <div className="field">
        <label htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          name="description"
          placeholder="What is this timetable for?"
        />
      </div>

      <div className="field">
        <label htmlFor="privacy">Visibility</label>
        <select id="privacy" name="privacy" defaultValue="private">
          <option value="private">Private — members only</option>
          <option value="public">Public — anyone can read</option>
          <option value="deactivated">Deactivated — admins only</option>
        </select>
      </div>

      {state.error ? (
        <p style={{ color: "var(--red)", fontSize: 13 }}>{state.error}</p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create timetable"}
      </button>
    </form>
  );
}
