import {
  DigestSettingsForm,
  type DigestSettings,
} from "@/components/DigestSettingsForm";
import { ProfileForm } from "@/components/ProfileForm";
import { ThemeToggle } from "@/components/ThemeToggle";

/** The profile editor stack (picture, name, bio, appearance, digests) —
 * rendered inside the timetable shell at /t/[slug]/profile and standalone
 * at /profile (QA #59 round 3). */
export function ProfilePanel({
  me,
  digest,
}: {
  me: {
    name: string | null;
    bio: string | null;
    email: string | null;
    image: string | null;
  };
  digest: DigestSettings;
}) {
  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">Profile</h2>
        <p>{me.email}</p>
      </div>
      <ProfileForm name={me.name} bio={me.bio} image={me.image} />
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
