"use client";

import { useState } from "react";

import {
  DIGEST_KIND_DEFAULTS,
  DIGEST_KINDS,
  effectiveDigestSettings,
  isDigestKindEnabled,
  type DigestKind,
  type MembershipDigestSettings,
} from "@timetable/shared";

import { Switch } from "@/components/Switch";
import type { DigestSettings } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

// Fully per-forum (2026-08-11): on/off, cadence, and the kind switches
// all live on this forum's membership.
const MUTATION = `mutation($s: String!, $e: Boolean, $f: String, $w: Int, $k: String!) {
  updateMyForumDigestSettings(
    idOrSlug: $s, enabled: $e, frequency: $f, weekday: $w, kindsJson: $k
  )
}`;

export type { DigestSettings };

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Per-kind switch labels (2026-08-11). The "(on/off by default)" suffixes
 * are scaffolding while the option set is being pruned — remove once the
 * final set is configured. */
const KIND_LABELS: Record<DigestKind, string> = {
  comments: "Comments on your topics",
  replies: "Replies to your comments",
  hearts: "❤️s on your topics",
  hostHearts: "💙s from fellow hosts on your topics",
  sessions: "Upcoming sessions for topics you ❤️'d",
  availabilityAsks: "“Can you make it?” availability asks",
  newTopics: "Newly published topics",
  assignments: "Topics assigned to you",
  drafts: "Reminders about your unpublished drafts",
};

function kindLabel(kind: DigestKind): string {
  const suffix = DIGEST_KIND_DEFAULTS[kind]
    ? " (on by default)"
    : " (off by default)";
  return KIND_LABELS[kind] + suffix;
}

type Cadence = "never" | "daily" | "weekly";

export function DigestSettingsForm({
  slug,
  current,
  currentForum,
}: {
  slug: string;
  /** The user's stored global settings — the fallback layer. */
  current: DigestSettings;
  /** This forum's stored membership settings. */
  currentForum: MembershipDigestSettings;
}) {
  const { run, busy } = useGqlAction();
  const effective = effectiveDigestSettings(currentForum, current);
  // "Never" folds the enabled flag into the same dropdown as the cadence
  // (2026-07-30) — one control instead of a checkbox + frequency select.
  const [cadence, setCadence] = useState<Cadence>(
    effective.enabled ? effective.frequency : "never",
  );
  const [weekday, setWeekday] = useState(effective.weekday);
  const [kinds, setKinds] = useState<Record<DigestKind, boolean>>(
    () =>
      Object.fromEntries(
        DIGEST_KINDS.map((kind) => [
          kind,
          isDigestKindEnabled(effective.kinds, kind),
        ]),
      ) as Record<DigestKind, boolean>,
  );
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const enabled = cadence !== "never";
    void run(
      MUTATION,
      // Leave the stored frequency untouched when Never is picked (the
      // mutation ignores an absent frequency) so re-enabling remembers it.
      {
        s: slug,
        e: enabled,
        f: enabled ? cadence : undefined,
        w: weekday,
        k: JSON.stringify(kinds),
      },
      {
        success: "Digest settings saved",
        errorFallback: "Could not save settings",
        onSuccess: () => setSaved(true),
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 className="section-title" style={{ marginBottom: 10 }}>
        Email digests
      </h2>
      <p className="faint" style={{ marginTop: 0, fontSize: "var(--text-xs)" }}>
        One email with what you haven&rsquo;t seen in this forum — comments on
        your topics, replies, and new topics. All of it is your choice per
        forum.
      </p>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="digest-frequency">How often</label>
          <select
            id="digest-frequency"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
            style={{ width: "auto" }}
          >
            <option value="never">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        {cadence === "weekly" ? (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="digest-weekday">On</label>
            <select
              id="digest-weekday"
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              style={{ width: "auto" }}
            >
              {WEEKDAYS.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {cadence !== "never" ? (
        <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: 13 }}>What to include</strong>
          {DIGEST_KINDS.map((kind) => (
            <Switch
              key={kind}
              checked={kinds[kind]}
              onChange={(next) => setKinds({ ...kinds, [kind]: next })}
              label={kindLabel(kind)}
            />
          ))}
        </div>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save preferences"}
      </button>
    </form>
  );
}
