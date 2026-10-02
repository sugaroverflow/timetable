import { Lock } from "lucide-react";

import { isProfilePublic, type Privacy, type Role } from "@timetable/shared";

/** A person's Contact Details (2026-09-30) as a reader sees them, above
 * their profile. The API sends the HTML to forum members only, so this
 * renders nothing for anyone else. The "Members only" note marks the
 * section as private where the profile around it is public — on a
 * members-only forum everything is, and the note would add nothing. */
export function ContactDetails({
  html,
  privacy,
  roles,
}: {
  html: string | null | undefined;
  /** The forum's privacy; omitted, no note. */
  privacy: Privacy | undefined;
  /** The PERSON's roles (hosts-only forums publish hosts, not electors). */
  roles: string[];
}) {
  if (!html) return null;
  const membersOnlyNote =
    privacy != null && isProfilePublic(privacy, roles as Role[]);
  return (
    <section className="contact-details" aria-label="Contact Details">
      <div className="contact-details-head">
        <strong>Contact Details</strong>
        {membersOnlyNote ? (
          <span className="hint">
            <Lock size={12} aria-hidden /> Members only
          </span>
        ) : null}
      </div>
      <div className="topic-body" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
