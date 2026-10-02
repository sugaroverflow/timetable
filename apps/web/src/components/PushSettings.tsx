"use client";

import { useEffect, useState } from "react";
import { clientGql } from "@/lib/clientGraphql";
import { clientApi } from "@/lib/clientApi";
import { applicationServerKey, pushSupport } from "@/lib/push";

async function manage(
  slug: string,
  endpoint: string,
  action: "enable" | "disable",
) {
  const response = await clientApi(
    `/api/forums/${encodeURIComponent(slug)}/push-subscriptions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, action }),
    },
  );
  if (response.status === 409)
    throw new Error(
      "This browser is subscribed with another account. Use that account to turn off its forum subscriptions first, or use a separate browser profile.",
    );
  if (!response.ok)
    throw new Error("Could not update push settings. Please try again.");
  return response.json() as Promise<{ enabled: boolean }>;
}

type State = {
  key: string | null;
  enabled: boolean;
  message: string;
  ready: boolean;
};

async function loadPushSettings(slug: string): Promise<State> {
  const unsupported = pushSupport();
  if (unsupported)
    return { key: null, enabled: false, message: unsupported, ready: true };
  const { pushPublicKey: publicKey } = await clientGql<{
    pushPublicKey: string | null;
  }>(`query { pushPublicKey }`);
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  const subscription = await registration.pushManager.getSubscription();
  const enabled = subscription
    ? (
        await clientGql<{ myPushEnabled: boolean }>(
          `query($slug: String!, $endpoint: String!) { myPushEnabled(idOrSlug: $slug, endpoint: $endpoint) }`,
          { slug, endpoint: subscription.endpoint },
        )
      ).myPushEnabled
    : false;
  const message =
    Notification.permission === "denied"
      ? "Notifications are blocked. Change this site's notification permission in your browser or device settings to enable them."
      : publicKey
        ? ""
        : "Push notifications have not been configured on this site yet.";
  return { key: publicKey, enabled, message, ready: true };
}

export function PushSettings({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({
    key: null,
    enabled: false,
    message: "Checking push support…",
    ready: false,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadPushSettings(slug)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((error: Error) => {
        if (!cancelled)
          setState({
            key: null,
            enabled: false,
            message: error.message,
            ready: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function enable() {
    if (!state.key) return;
    setBusy(true);
    let created: PushSubscription | null = null;
    try {
      // First async operation is directly inside the user gesture (required by iOS).
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Permission was not granted. You can enable notifications later in your browser or device settings.",
        );
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(state.key),
        });
        created = subscription;
      }
      await manage(slug, subscription.endpoint, "enable");
      setState((previous) => ({
        ...previous,
        enabled: true,
        message: "Push is on for this forum on this device.",
      }));
    } catch (error) {
      if (created) await created.unsubscribe().catch(() => false);
      setState((previous) => ({
        ...previous,
        message:
          error instanceof Error ? error.message : "Could not enable push.",
      }));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await manage(slug, subscription.endpoint, "disable");
      // Other forums may use this browser subscription: only remove this opt-in.
      setState((previous) => ({
        ...previous,
        enabled: false,
        message: "Push is off for this forum on this device.",
      }));
    } catch {
      setState((previous) => ({
        ...previous,
        message: "Could not turn off push. Please try again.",
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-label="Push notifications">
      <h3 className="section-title">Push notifications</h3>
      <p>
        Get a quiet alert for new public-thread comments and session activity in
        this forum, even when Topic is closed. Opt in separately on each device
        and in each forum. Alerts contain no names or message text.
      </p>
      <p className="faint" role="status">
        {state.message}
      </p>
      {state.enabled ? (
        <button type="button" className="btn" disabled={busy} onClick={disable}>
          Turn off push for this forum
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          disabled={
            busy ||
            !state.ready ||
            !state.key ||
            (typeof Notification !== "undefined" &&
              Notification.permission === "denied")
          }
          onClick={enable}
        >
          Enable push on this device
        </button>
      )}
    </section>
  );
}
