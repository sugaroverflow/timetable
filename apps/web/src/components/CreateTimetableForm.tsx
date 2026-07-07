"use client";

import { useActionState, useState } from "react";

import { slugify } from "@timetable/shared";

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
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : name ? slugify(name) : "";

  return (
    <form action={action} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Create a timetable</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        You&rsquo;ll be the owner and admin.
      </p>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          required
          placeholder="Newspeak House 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="slug">URL</label>
        <input
          id="slug"
          name="slug"
          placeholder={name ? slugify(name) : "auto-generated from the name"}
          value={slugTouched ? slug : effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            // Allow trailing hyphens while typing; full slugify happens server-side.
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
          }}
        />
        <p className="faint" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {effectiveSlug
            ? `Your timetable will live at /t/${effectiveSlug}`
            : "Lowercase letters, numbers, and hyphens. Set once — it can't be changed later."}
        </p>
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
          <option value="public">
            Public — all topics, comments, and bios
          </option>
          <option value="hosts_only">
            Hosts only — topics and host bios public, no comments
          </option>
          <option value="no_comments">
            No comments — topics and all bios public, no comments
          </option>
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
