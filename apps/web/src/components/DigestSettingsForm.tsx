"use client";

import { useState } from "react";

import {
  DIGEST_KIND_AUDIENCE,
  DIGEST_KINDS,
  digestKindApplies,
  effectiveDigestSettings,
  isDigestKindEnabled,
  type DigestKind,
  type DigestKinds,
  type MembershipDigestSettings,
} from "@timetable/shared";

import { Switch } from "@/components/Switch";
import {
  pluralLabel,
  roleLabel,
  type DigestSettings,
  type RoleLabels,
} from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";
import { useSavedSnapshot } from "@/lib/useSavedSnapshot";

// Fully per-forum (2026-08-11): on/off, cadence, and the kind switches
// all live on this forum's membership.
const MUTATION = `mutation($s: String!, $e: Boolean, $f: String, $w: Int, $k: String!) {
  updateMyForumDigestSettings(
    idOrSlug: $s, enabled: $e, frequency: $f, weekday: $w, kindsJson: $k
  )
}`;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Per-kind switch labels (round 2, 2026-08-11). Each takes the forum's
 * plural host label so role words follow the forum's own naming. */
const KIND_LABELS: Record<DigestKind, (hosts: string) => string> = {
  comments: () => "Comments on your topics",
  commentsHearted: () => "Comments on topics you ❤️'d",
  commentsHostHearted: () => "Comments on topics you 💙'd",
  replies: () => "New comments in threads you're part of",
  mentions: () => "Comments that @mention you",
  hearts: () => "❤️s on your topics",
  hostHearts: (hosts) => `💙s from fellow ${hosts} on your topics`,
  sessions: () => "Upcoming sessions for topics you ❤️'d",
  sessionsHostHearted: () => "Upcoming sessions for topics you 💙'd",
  availabilityAsks: () => "“Can you make it?” availability asks",
  newTopics: () => "Newly published topics",
  newTopicsHost: (hosts) => `Newly published topics by fellow ${hosts}`,
  pendingReview: () => "New topics ready to review",
  slotReleases: () => "New dates released on the calendar",
  drafts: () => "Reminders about your unpublished drafts",
  newMembers: () => "New members joining",
};

/** The "(… only)" audience scaffold beside a restricted switch, in the
 * forum's own role labels; null for universal kinds. ADMIN VIEWS ONLY
 * (Ed, 2026-08-11 — members don't need the audience config, they just
 * get switches that apply to them). Temporary until the set is final. */
function audienceTag(kind: DigestKind, labels?: RoleLabels): string | null {
  const audience = DIGEST_KIND_AUDIENCE[kind];
  if (audience === "all") return null;
  if (audience === "hostNonElector") {
    const host = roleLabel(labels, "host");
    const elector = roleLabel(labels, "elector");
    return `${host} without the ${elector} role`;
  }
  return `${roleLabel(labels, audience)} only`;
}

/** A switch's plain display label in the forum's own role words. */
function kindLabel(kind: DigestKind, labels?: RoleLabels): string {
  return KIND_LABELS[kind](pluralLabel(roleLabel(labels, "host")));
}

/** The admin view's label: the forum-labelled base plus the audience
 * scaffold. Shared with the Forum Settings defaults card (admin-only). */
export function taggedKindLabel(kind: DigestKind, labels?: RoleLabels): string {
  const tag = audienceTag(kind, labels);
  const base = kindLabel(kind, labels);
  return tag ? `${base} (${tag})` : base;
}

type Cadence = "never" | "daily" | "weekly";

export function DigestSettingsForm({
  slug,
  current,
  currentForum,
  forumDefaults,
  roles,
  roleLabels,
}: {
  slug: string;
  /** The user's stored global settings — the fallback layer. */
  current: DigestSettings;
  /** This forum's stored membership settings. */
  currentForum: MembershipDigestSettings;
  /** The forum's configured per-kind defaults (Forum Settings). */
  forumDefaults: DigestKinds;
  /** The viewer's roles in THIS forum — drives switch visibility. */
  roles: string[];
  /** The forum's custom role labels — role words in switch labels/tags. */
  roleLabels?: RoleLabels;
}) {
  const { run, busy } = useGqlAction();
  const admin = roles.includes("admin") || roles.includes("owner");
  // Admins see every switch (greyed when inapplicable — useful to know
  // what the other roles have); members see only what can fire for them.
  const visibleKinds = admin
    ? [...DIGEST_KINDS]
    : DIGEST_KINDS.filter((kind) => digestKindApplies(kind, roles));
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
          isDigestKindEnabled(effective.kinds, kind, forumDefaults),
        ]),
      ) as Record<DigestKind, boolean>,
  );
  const { saved, markSaved } = useSavedSnapshot([cadence, weekday, kinds]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const enabled = cadence !== "never";
    // Only the switches the viewer can actually use are saved — greyed
    // (admin-view) and hidden ones keep falling through to the defaults.
    const usable = Object.fromEntries(
      visibleKinds
        .filter((kind) => digestKindApplies(kind, roles))
        .map((kind) => [kind, kinds[kind]]),
    );
    void run(
      MUTATION,
      // Leave the stored frequency untouched when Never is picked (the
      // mutation ignores an absent frequency) so re-enabling remembers it.
      {
        s: slug,
        e: enabled,
        f: enabled ? cadence : undefined,
        w: weekday,
        k: JSON.stringify(usable),
      },
      {
        success: "Digest settings saved",
        errorFallback: "Could not save settings",
        onSuccess: markSaved,
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
          <strong className="field-heading">What to include</strong>
          {visibleKinds.map((kind) => {
            const applies = digestKindApplies(kind, roles);
            return (
              <span key={kind} style={applies ? undefined : { opacity: 0.45 }}>
                <Switch
                  checked={kinds[kind]}
                  onChange={(next) => setKinds({ ...kinds, [kind]: next })}
                  label={
                    admin
                      ? taggedKindLabel(kind, roleLabels)
                      : kindLabel(kind, roleLabels)
                  }
                  disabled={!applies}
                />
              </span>
            );
          })}
        </div>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save preferences"}
      </button>
    </form>
  );
}
