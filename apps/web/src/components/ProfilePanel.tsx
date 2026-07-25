import {
  DigestSettingsForm,
  type DigestSettings,
} from "@/components/DigestSettingsForm";
import { ProfileForm } from "@/components/ProfileForm";
import { ThemeToggle } from "@/components/ThemeToggle";

/** The profile editor stack. Profiles are per-forum (2026-07): inside a
 * forum (/t/[slug]/profile) the name/photo/bio form edits that forum's
 * membership; the standalone /profile page is account-only (email,
 * appearance, digests). */
export function ProfilePanel({
  email,
  digest,
  slug,
  profile,
}: {
  email: string | null;
  digest: DigestSettings;
  /** Forum context; null on the standalone account page. */
  slug: string | null;
  /** The viewer's membership profile in `slug`; null when not a member. */
  profile: {
    name: string | null;
    bio: string | null;
    image: string | null;
  } | null;
}) {
  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">Profile</h2>
        <p>{email}</p>
      </div>
      {slug && profile ? (
        <ProfileForm
          slug={slug}
          name={profile.name}
          bio={profile.bio}
          image={profile.image}
        />
      ) : (
        <div className="card">
          <p className="faint" style={{ margin: 0 }}>
            Your name, photo, and bio are set per forum — open Profile inside
            one of your forums to edit how you appear there.
          </p>
        </div>
      )}
      <div className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <strong style={{ fontSize: 14 }}>Appearance</strong>
          <p className="faint" style={{ margin: "2px 0 0", fontSize: 12 }}>
            Light, dark, or follow your system.
          </p>
        </div>
        <ThemeToggle />
      </div>
      <DigestSettingsForm current={digest} />
    </div>
  );
}
