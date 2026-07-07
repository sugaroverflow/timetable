"use client";

import { useState } from "react";

import { clientGql } from "@/lib/clientGraphql";
import {
  parseTimetableSettings,
  type RoleLabels,
} from "@/lib/timetableSettings";

import { Avatar } from "./Avatar";
import { RolePills } from "./RolePills";

const QUERY = `query Person($s: String!, $u: String!) {
  timetable(idOrSlug: $s) { settings }
  person(idOrSlug: $s, userId: $u) {
    userId name image roles bioHtml
  }
}`;

type PersonData = {
  timetable: { settings: string } | null;
  person: {
    userId: string;
    name: string | null;
    image: string | null;
    roles: string[];
    bioHtml: string | null;
  } | null;
};

/** Wraps a user's name/avatar anywhere in the app; clicking opens their
 * bio as a popup modal (QA #42 — one pattern everywhere). */
export function PersonChip({
  slug,
  userId,
  children,
}: {
  slug: string;
  userId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PersonData | null>(null);
  const [loading, setLoading] = useState(false);

  async function show() {
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    try {
      setData(await clientGql<PersonData>(QUERY, { s: slug, u: userId }));
    } catch {
      // Keep the modal open with a fallback message.
      setData({ timetable: null, person: null });
    } finally {
      setLoading(false);
    }
  }

  const person = data?.person ?? null;
  const roleLabels: RoleLabels | undefined = data?.timetable
    ? parseTimetableSettings(data.timetable.settings).roleLabels
    : undefined;

  return (
    <>
      <button type="button" className="person-trigger" onClick={show}>
        {children}
      </button>
      {open ? (
        <div
          className="modal-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="card stack person-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Member bio"
            onClick={(e) => e.stopPropagation()}
          >
            {loading || !data ? (
              <p className="faint" style={{ margin: 0 }}>
                Loading…
              </p>
            ) : person ? (
              <>
                <div className="row" style={{ alignItems: "center" }}>
                  <Avatar name={person.name} />
                  <div>
                    <strong>{person.name ?? "Member"}</strong>
                    <div style={{ marginTop: 4 }}>
                      <RolePills roles={person.roles} labels={roleLabels} />
                    </div>
                  </div>
                </div>
                {person.bioHtml ? (
                  <div
                    className="topic-body"
                    dangerouslySetInnerHTML={{ __html: person.bioHtml }}
                  />
                ) : (
                  <p className="faint" style={{ margin: 0 }}>
                    No bio yet.
                  </p>
                )}
              </>
            ) : (
              <p className="faint" style={{ margin: 0 }}>
                Profile unavailable.
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ alignSelf: "flex-end" }}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
