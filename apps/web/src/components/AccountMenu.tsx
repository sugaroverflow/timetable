"use client";

import { Menu } from "@base-ui/react/menu";
import { useClerk } from "@clerk/nextjs";
import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { useViewerProfile } from "@/lib/useViewerProfile";

/**
 * The single account control (QA 2026-07-28 — replaced Clerk's UserButton
 * plus the topbar email link, and the sidebar's Profile entry). Trigger is
 * the viewer's per-forum avatar via useViewerProfile (shared with the
 * comment composers since QA 2026-08-10). The menu keeps Clerk for what
 * only Clerk should own: "Account & security" opens its modal (email,
 * password, sessions), and sign-out goes through its session teardown.
 */
export function AccountMenu({ email }: { email: string | null }) {
  const { signOut, openUserProfile } = useClerk();
  const profile = useViewerProfile();

  return (
    <Menu.Root>
      <Menu.Trigger className="account-trigger" aria-label="Account">
        <Avatar name={profile.name ?? email} image={profile.image} />
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
                <Link
                  href={
                    profile.slug ? `/f/${profile.slug}/profile` : "/profile"
                  }
                />
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
