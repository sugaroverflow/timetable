"use client";

import { useState } from "react";

import type { CalendarSettings, ConfirmPolicy } from "@timetable/shared";

import { useGqlAction } from "@/lib/useGqlAction";

const SAVE = `mutation($s: String!, $cal: String!, $direct: Boolean!) {
  updateForumSettings(idOrSlug: $s, calendarJson: $cal, hostsPublishDirectly: $direct) { id }
}`;

function policyOptions(
  hostLabel: string,
  adminLabel: string,
): { value: ConfirmPolicy; label: string; hint: string }[] {
  const hosts = `${hostLabel}s`;
  const admins = `${adminLabel}s`;
  const adminsLower = admins.toLowerCase();
  return [
    {
      value: "admins",
      label: `${admins} schedule everything`,
      hint: `${hosts} discuss and post claims; only ${adminsLower} pencil in and confirm.`,
    },
    {
      value: "hosts_propose",
      label: `${hosts} propose, ${adminsLower} confirm`,
      hint: `${hosts} pencil their own topics onto open slots and propose new times; confirming needs an ${adminLabel.toLowerCase()}.`,
    },
    {
      value: "hosts_confirm",
      label: `${hosts} confirm themselves`,
      hint: `Full self-service (unconference mode) — ${hosts.toLowerCase()} confirm their own sessions; ${adminsLower} keep override.`,
    },
  ];
}

/**
 * Forum Settings → Calendar (calendar v2). Everything the feature does sits
 * behind the enable switch; the confirm-policy dial and the hosts-publish
 * topics setting live here because together they define the forum's
 * governance style.
 */
export function CalendarSettingsForm({
  slug,
  current,
  hostsPublishDirectly,
  hostLabel = "Host",
  adminLabel = "Admin",
}: {
  slug: string;
  current: CalendarSettings;
  hostsPublishDirectly: boolean;
  hostLabel?: string;
  adminLabel?: string;
}) {
  const { run, busy } = useGqlAction();
  const [enabled, setEnabled] = useState(Boolean(current.enabled));
  const [policy, setPolicy] = useState<ConfirmPolicy>(
    current.confirmPolicy ?? "hosts_propose",
  );
  const [locations, setLocations] = useState(
    (current.locations ?? []).join(", "),
  );
  const [direct, setDirect] = useState(hostsPublishDirectly);

  function save() {
    const cal = JSON.stringify({
      enabled,
      confirmPolicy: policy,
      locations: locations
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    });
    void run(
      SAVE,
      { s: slug, cal, direct },
      { success: "Settings saved", errorFallback: "Could not save settings" },
    );
  }

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2 className="page-title">Calendar</h2>
        <p>
          Collect availability from electors and schedule sessions into
          timeslots.
        </p>
      </div>

      <label className="row" style={{ gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          Enable the calendar
          <span className="faint" style={{ display: "block", fontSize: 12 }}>
            Adds a Calendar page and nav link. Switching it off hides everything
            again — nothing is deleted.
          </span>
        </span>
      </label>

      {enabled ? (
        <fieldset
          className="stack"
          style={{ gap: 8, border: 0, padding: 0, margin: 0 }}
        >
          <legend style={{ fontSize: 13, fontWeight: 600, padding: 0 }}>
            Who can put sessions into timeslots?
          </legend>
          {policyOptions(hostLabel, adminLabel).map((p) => (
            <label
              key={p.value}
              className="row"
              style={{ gap: 8, alignItems: "flex-start", cursor: "pointer" }}
            >
              <input
                type="radio"
                name="confirm-policy"
                checked={policy === p.value}
                onChange={() => setPolicy(p.value)}
                style={{ marginTop: 3 }}
              />
              <span>
                {p.label}
                <span
                  className="faint"
                  style={{ display: "block", fontSize: 12 }}
                >
                  {p.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {enabled ? (
        <div className="field">
          <label htmlFor="cal-locations-input">
            Locations (comma-separated, offered when creating slots)
          </label>
          <input
            id="cal-locations-input"
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder="Classroom, Hall, The Park"
          />
        </div>
      ) : null}

      <label
        className="row divider-top"
        style={{ gap: 8, cursor: "pointer", paddingTop: 12 }}
      >
        <input
          type="checkbox"
          checked={direct}
          onChange={(e) => setDirect(e.target.checked)}
        />
        <span>
          {hostLabel}s can publish topics without {adminLabel.toLowerCase()}{" "}
          review
          <span className="faint" style={{ display: "block", fontSize: 12 }}>
            Review becomes after-the-fact oversight — {adminLabel.toLowerCase()}
            s can still unpublish, and every publish lands in the activity log.
          </span>
        </span>
      </label>

      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={save}
        >
          Save
        </button>
      </div>
    </div>
  );
}
