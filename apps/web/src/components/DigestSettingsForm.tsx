"use client";

import { useState } from "react";

import {
  DIGEST_KIND_AUDIENCE,
  DIGEST_KINDS,
  digestKindApplies,
  effectiveDigestSettings,
  isDigestKindEnabled,
  isPushEventlessKind,
  isPushKindEnabled,
  type DigestKind,
  type DigestKinds,
  type MembershipDigestSettings,
  type PushKinds,
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

/** The same save plus the Push column (Web Push step 5, #368). Used ONLY
 * while push is available, so a forum without keys sends exactly the
 * mutation above. `pushKindsJson` REPLACES the stored push set (#379). */
const MUTATION_WITH_PUSH = `mutation(
  $s: String!, $e: Boolean, $f: String, $w: Int, $k: String!, $p: String
) {
  updateMyForumDigestSettings(
    idOrSlug: $s, enabled: $e, frequency: $f, weekday: $w, kindsJson: $k,
    pushKindsJson: $p
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
  lounge: () => "Lounge: new conversations, and replies and @mentions for you",
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

/** Parse `Forum.viewerPushKinds` (#379): the viewer's EFFECTIVE Push
 * switches as JSON {kind: boolean}, `drafts` left out. Unreadable JSON
 * reads as {} — every switch then shows its default. */
export function parseViewerPushKinds(
  raw: string | null | undefined,
): PushKinds {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as PushKinds)
      : {};
  } catch {
    return {};
  }
}

/** One switch per digest kind, from a predicate. */
function switchMap(
  enabled: (kind: DigestKind) => boolean,
): Record<DigestKind, boolean> {
  return Object.fromEntries(
    DIGEST_KINDS.map((kind) => [kind, enabled(kind)]),
  ) as Record<DigestKind, boolean>;
}

/** The Push switches a save sends (#368 step 5): every one the viewer can
 * use, as on the email side. `pushKindsJson` replaces the stored set, so
 * the rest fall back to the defaults; `drafts` is never sent — it has no
 * push event and the API refuses it (#379). */
function usablePushKinds(
  visibleKinds: DigestKind[],
  roles: string[],
  push: Record<DigestKind, boolean>,
): Record<string, boolean> {
  return Object.fromEntries(
    visibleKinds
      .filter(
        (kind) => digestKindApplies(kind, roles) && !isPushEventlessKind(kind),
      )
      .map((kind) => [kind, push[kind]]),
  );
}

/** "What to include" before push (and still, wherever push isn't
 * available): one labelled email switch per kind. Unchanged markup — with
 * no keys the form must look exactly as it did. */
function EmailKindList({
  visibleKinds,
  roles,
  labelFor,
  kinds,
  setKinds,
}: {
  visibleKinds: DigestKind[];
  roles: string[];
  labelFor: (kind: DigestKind) => string;
  kinds: Record<DigestKind, boolean>;
  setKinds: (next: Record<DigestKind, boolean>) => void;
}) {
  return (
    <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
      <strong className="field-heading">What to include</strong>
      {visibleKinds.map((kind) => {
        const applies = digestKindApplies(kind, roles);
        return (
          <span key={kind} style={applies ? undefined : { opacity: 0.45 }}>
            <Switch
              checked={kinds[kind]}
              onChange={(next) => setKinds({ ...kinds, [kind]: next })}
              label={labelFor(kind)}
              disabled={!applies}
            />
          </span>
        );
      })}
    </div>
  );
}

/** push-column (Web Push step 5, #368; Ed, 2026-10-03: "table of settings
 * with two columns, email and push"): "What to include" as a table, one
 * row per kind, an Email and a Push switch in each. `drafts` has no event
 * to alert on, so its Push cell is a dash. With email at Never the Email
 * column greys out and Push stays usable. */
function KindTable({
  visibleKinds,
  roles,
  labelFor,
  emailKinds,
  setEmailKinds,
  pushKinds,
  setPushKinds,
  emailOff,
}: {
  visibleKinds: DigestKind[];
  roles: string[];
  labelFor: (kind: DigestKind) => string;
  emailKinds: Record<DigestKind, boolean>;
  setEmailKinds: (next: Record<DigestKind, boolean>) => void;
  pushKinds: Record<DigestKind, boolean>;
  setPushKinds: (next: Record<DigestKind, boolean>) => void;
  emailOff: boolean;
}) {
  return (
    <table className="kind-table">
      <thead>
        <tr>
          <th scope="col" className="kind-table-what">
            <strong className="field-heading">What to include</strong>
          </th>
          <th
            scope="col"
            className={`kind-table-col${emailOff ? " kind-table-col-off" : ""}`}
          >
            Email
          </th>
          <th scope="col" className="kind-table-col">
            Push
          </th>
        </tr>
      </thead>
      <tbody>
        {visibleKinds.map((kind) => {
          const applies = digestKindApplies(kind, roles);
          const label = labelFor(kind);
          return (
            <tr key={kind} className={applies ? undefined : "kind-table-na"}>
              <th scope="row" className="kind-table-label">
                {label}
              </th>
              <td className="kind-table-cell">
                <Switch
                  checked={emailKinds[kind]}
                  onChange={(next) =>
                    setEmailKinds({ ...emailKinds, [kind]: next })
                  }
                  ariaLabel={`${label}: Email`}
                  disabled={!applies || emailOff}
                />
              </td>
              <td className="kind-table-cell">
                {isPushEventlessKind(kind) ? (
                  <span
                    className="kind-table-dash"
                    title="No push alerts: this is a digest reminder"
                  >
                    <span aria-hidden>—</span>
                    <span className="kind-table-sr">No push alerts</span>
                  </span>
                ) : (
                  <Switch
                    checked={pushKinds[kind]}
                    onChange={(next) =>
                      setPushKinds({ ...pushKinds, [kind]: next })
                    }
                    ariaLabel={`${label}: Push`}
                    disabled={!applies}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DigestSettingsForm({
  slug,
  current,
  currentForum,
  forumDefaults,
  roles,
  roleLabels,
  alerts,
  pushKinds,
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
  /** alerts-line (Web Push, #368): this device's alerts on/off, shown
   * above "What to include" whatever the email cadence. The page passes
   * it only when push is configured and not in a view-as preview. */
  alerts?: React.ReactNode;
  /** push-column (Web Push step 5, #368): the viewer's effective Push
   * switches (`Forum.viewerPushKinds`). Passed ONLY when push is available
   * (`pushPublicKey` non-null, not a view-as preview); absent, the form is
   * exactly the email-only form it was before push. */
  pushKinds?: PushKinds | null;
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
  const [kinds, setKinds] = useState(() =>
    switchMap((kind) =>
      isDigestKindEnabled(effective.kinds, kind, forumDefaults),
    ),
  );
  const pushAvailable = pushKinds != null;
  const [push, setPush] = useState(() =>
    switchMap((kind) => isPushKindEnabled(pushKinds, kind)),
  );
  // `push` never changes while the column is hidden, so it is inert there.
  const { saved, markSaved } = useSavedSnapshot([
    cadence,
    weekday,
    kinds,
    push,
  ]);
  const labelFor = (kind: DigestKind) =>
    admin ? taggedKindLabel(kind, roleLabels) : kindLabel(kind, roleLabels);

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
    // Leave the stored frequency untouched when Never is picked (the
    // mutation ignores an absent frequency) so re-enabling remembers it.
    const variables: Record<string, unknown> = {
      s: slug,
      e: enabled,
      f: enabled ? cadence : undefined,
      w: weekday,
      k: JSON.stringify(usable),
    };
    if (pushAvailable) {
      variables.p = JSON.stringify(usablePushKinds(visibleKinds, roles, push));
    }
    void run(pushAvailable ? MUTATION_WITH_PUSH : MUTATION, variables, {
      success: pushAvailable
        ? "Notification settings saved"
        : "Digest settings saved",
      errorFallback: "Could not save settings",
      onSuccess: markSaved,
    });
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
      {alerts}
      {pushAvailable ? (
        <KindTable
          visibleKinds={visibleKinds}
          roles={roles}
          labelFor={labelFor}
          emailKinds={kinds}
          setEmailKinds={setKinds}
          pushKinds={push}
          setPushKinds={setPush}
          emailOff={cadence === "never"}
        />
      ) : cadence !== "never" ? (
        <EmailKindList
          visibleKinds={visibleKinds}
          roles={roles}
          labelFor={labelFor}
          kinds={kinds}
          setKinds={setKinds}
        />
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save preferences"}
      </button>
    </form>
  );
}
