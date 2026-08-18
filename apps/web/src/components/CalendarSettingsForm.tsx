"use client";

import { useState } from "react";

import type { CalendarSettings, ConfirmPolicy } from "@timetable/shared";

import { Switch } from "@/components/Switch";
import { pluralLabel } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const SAVE = `mutation($s: String!, $cal: String!, $direct: Boolean!) {
  updateForumSettings(idOrSlug: $s, calendarJson: $cal, hostsPublishDirectly: $direct) { id }
}`;

/**
 * Forum Settings → Calendar (calendar v2). The confirm-policy dial is two
 * switches (QA 2026-08-03 — no radios): "hosts pencil in" and "hosts
 * confirm"; confirm implies pencil. The topics hosts-publish switch lives
 * here too — together they define the forum's governance style.
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
  const policy: ConfirmPolicy = current.confirmPolicy ?? "hosts_propose";
  const [enabled, setEnabled] = useState(Boolean(current.enabled));
  const [hostsPencil, setHostsPencil] = useState(policy !== "admins");
  const [hostsConfirm, setHostsConfirm] = useState(policy === "hosts_confirm");
  const [locations, setLocations] = useState(
    (current.locations ?? []).join(", "),
  );
  const [ohLabel, setOhLabel] = useState(
    current.officeHoursLabel ?? "Office hours",
  );
  const [direct, setDirect] = useState(hostsPublishDirectly);

  const hosts = pluralLabel(hostLabel);
  const admins = pluralLabel(adminLabel);

  function save() {
    const confirmPolicy: ConfirmPolicy = hostsConfirm
      ? "hosts_confirm"
      : hostsPencil
        ? "hosts_propose"
        : "admins";
    const cal = JSON.stringify({
      enabled,
      confirmPolicy,
      officeHoursLabel: ohLabel.trim().slice(0, 40) || "Office hours",
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
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <h3 className="settings-subtitle">Calendar</h3>
        <p className="hint" style={{ margin: "2px 0 0" }}>
          Collect availability and schedule sessions into timeslots.
        </p>
      </div>

      <Switch
        checked={enabled}
        onChange={setEnabled}
        label="Enable the calendar"
        hint="Adds a Calendar page and nav link. Switching it off hides everything again — nothing is deleted."
      />

      {enabled ? (
        <>
          <Switch
            checked={hostsPencil}
            onChange={(next) => {
              setHostsPencil(next);
              if (!next) setHostsConfirm(false);
            }}
            label={`${hosts} can pencil in sessions`}
            hint={`Pencil their own topics onto open slots and propose new times; otherwise only ${admins.toLowerCase()} schedule.`}
          />
          <Switch
            checked={hostsConfirm}
            onChange={(next) => {
              setHostsConfirm(next);
              if (next) setHostsPencil(true);
            }}
            label={`${hosts} can confirm sessions`}
            hint={`Full self-service (unconference mode) — ${admins.toLowerCase()} keep override.`}
          />
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="cal-oh-label">
              Label for topic-less {hostLabel.toLowerCase()} sessions
            </label>
            <input
              id="cal-oh-label"
              value={ohLabel}
              onChange={(e) => setOhLabel(e.target.value)}
              placeholder="Office hours"
              maxLength={40}
              style={{ maxWidth: 260 }}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
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
        </>
      ) : null}

      <Switch
        checked={direct}
        onChange={setDirect}
        label={`${hosts} can publish topics without ${adminLabel.toLowerCase()} review`}
        hint={`Review becomes after-the-fact oversight — ${admins.toLowerCase()} can still unpublish, and every publish lands in the activity log.`}
      />

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
