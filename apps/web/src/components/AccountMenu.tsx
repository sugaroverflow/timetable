"use client";

import { Menu } from "@base-ui/react/menu";
import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { clientGql } from "@/lib/clientGraphql";

const PROFILE_QUERY = `
  query AccountMenu($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerProfile { name image } }
  }
`;

/**
 * The single account control (QA 2026-07-28 — replaced Clerk's UserButton
 * plus the topbar email link, and the sidebar's Profile entry). Trigger is
 * the viewer's per-forum avatar, resolved from the pathname client-side —
 * same pattern as TopbarRoles. The menu keeps Clerk for what only Clerk
 * should own: "Account & security" opens its modal (email, password,
 * sessions), and sign-out goes through its session teardown.
 */
export function AccountMenu({ email }: { email: string | null }) {
  const pathname = usePathname();
  const slug = /^\/f\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;
  const { signOut, openUserProfile } = useClerk();
  const [state, setState] = useState<{
    slug: string;
    name: string | null;
    image: string | null;
  } | null>(null);
  // Bumped by ProfileForm's "profile-updated" event: the app layout (and
  // this menu) survives client navigations, so without it a freshly saved
  // photo wouldn't show until a hard reload (QA 2026-07-28).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("profile-updated", bump);
    return () => window.removeEventListener("profile-updated", bump);
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    clientGql<{
      timetable: {
        viewerProfile: { name: string | null; image: string | null } | null;
      } | null;
    }>(PROFILE_QUERY, { s: slug })
      .then((data) => {
        if (cancelled) return;
        const profile = data.timetable?.viewerProfile;
        setState({
          slug,
          name: profile?.name ?? null,
          image: profile?.image ?? null,
        });
      })
      .catch(() => {
        // Not readable or transient failure — the initial fallback stands.
      });
    return () => {
      cancelled = true;
    };
  }, [slug, version]);

  const inForum = slug != null && state?.slug === slug;
  return (
    <Menu.Root>
      <Menu.Trigger className="account-trigger" aria-label="Account">
        <Avatar
          name={(inForum ? state.name : null) ?? email}
          image={inForum ? state.image : null}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="tt-switcher-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Menu.Popup className="tt-switcher-list account-menu">
            {email ? <div className="account-menu-email">{email}</div> : null}
            <Menu.Item
              className="tt-menu-item"
              render={
                <Link href={inForum ? `/f/${slug}/profile` : "/profile"} />
              }
            >
              Edit Profile
            </Menu.Item>
            <Menu.Item
              className="tt-menu-item"
              onClick={() => openUserProfile()}
            >
              Account &amp; security
            </Menu.Item>
            <Menu.Item
              className="tt-menu-item"
              onClick={() => void signOut({ redirectUrl: "/" })}
            >
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
