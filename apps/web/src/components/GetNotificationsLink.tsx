"use client";

import { Popover } from "@base-ui/react/popover";
import { BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { InstallSteps } from "@/components/InstallSteps";
import { refreshPushDevice, usePushDevice } from "@/lib/push";
import { closeSidebar } from "@/lib/sidebarStore";

const LABEL = "Get Notifications";

/**
 * get-notifications-link (Web Push step 6, docs/web-push-plan.md §3.4): the
 * sidebar-foot link that appears only where alerts are possible and not yet
 * on for THIS device.
 *
 * - push-device "off" (push works, no subscription here) → a `next/link` to
 *   the alerts line, `/f/<slug>/notifications#alerts`;
 * - "ios-tab" (iPhone/iPad in a browser tab) → a popover with the shared
 *   install-steps, since Apple allows alerts only in the Home Screen app;
 * - everything else — "unknown" (server render, first client render),
 *   "on", "unsupported", "denied" — renders nothing.
 *
 * The layout passes `pushPublicKey` (null without keys, signed out, under
 * view-as) and whether a view-as preview is running; either way, no key or
 * a preview means nothing renders and no detection runs. The state comes
 * from #381's module-level store, so turning alerts on from the alerts line
 * hides the link without a reload.
 */
export function GetNotificationsLink({
  slug,
  pushPublicKey,
  viewerId,
  preview,
}: {
  slug: string;
  pushPublicKey: string | null;
  viewerId: string | null;
  preview: boolean;
}) {
  if (!pushPublicKey || !viewerId || preview) return null;
  return (
    <DeviceLink slug={slug} viewerId={viewerId} pushPublicKey={pushPublicKey} />
  );
}

function DeviceLink({
  slug,
  viewerId,
  pushPublicKey,
}: {
  slug: string;
  viewerId: string;
  pushPublicKey: string;
}) {
  const state = usePushDevice();

  // After hydration only: the server and the first client render are both
  // "unknown" → nothing. Shared with the alerts line (one detection).
  useEffect(() => {
    void refreshPushDevice(viewerId, pushPublicKey);
  }, [viewerId, pushPublicKey]);

  if (state === "off") {
    return (
      <Link
        className="sidebar-foot-link faint"
        href={`/f/${slug}/notifications#alerts`}
        // Already on the Notifications page the path doesn't change, so the
        // drawer's close-on-navigation wouldn't fire: close it here.
        onClick={closeSidebar}
      >
        <BellRing size={14} aria-hidden /> {LABEL}
      </Link>
    );
  }
  if (state === "ios-tab") {
    return (
      <Popover.Root>
        <Popover.Trigger className="sidebar-foot-link sidebar-foot-button faint">
          <BellRing size={14} aria-hidden /> {LABEL}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="get-notifications-positioner"
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={16}
          >
            <Popover.Popup className="get-notifications-popup">
              <Popover.Title className="get-notifications-title">
                {LABEL}
              </Popover.Title>
              <InstallSteps />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  return null;
}
