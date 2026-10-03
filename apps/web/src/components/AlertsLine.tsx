"use client";

import { useEffect, useState } from "react";

import { InstallSteps } from "@/components/InstallSteps";
import {
  PushActionError,
  refreshPushDevice,
  TURN_OFF_FAILED,
  TURN_ON_FAILED,
  turnOffPush,
  turnOnPush,
  usePushDevice,
} from "@/lib/push";

/**
 * alerts-line (Web Push step 4, docs/web-push-plan.md §1): the one line
 * above "What to include" on a forum's Notifications page that turns
 * alerts on or off for THIS device (all forums on it; other devices are
 * untouched). The page renders it only when `pushPublicKey` is non-null
 * and not in a view-as preview, so without keys nothing here exists.
 *
 * Detection runs after hydration: the server render and the first client
 * render are both the empty `#alerts` anchor (state "unknown"), so there's
 * no mismatch, and the browser is asked for permission only on the Turn on
 * click — never on page load.
 */
export function AlertsLine({
  pushPublicKey,
  viewerId,
}: {
  pushPublicKey: string;
  viewerId: string;
}) {
  const state = usePushDevice();
  const [busy, setBusy] = useState<"on" | "off" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshPushDevice(viewerId);
  }, [viewerId]);

  function turnOn() {
    setError(null);
    setBusy("on");
    // Called straight from the click: the permission prompt is the first
    // thing turnOnPush awaits, as iOS requires.
    turnOnPush(pushPublicKey, viewerId)
      .catch((e: unknown) =>
        setError(e instanceof PushActionError ? e.message : TURN_ON_FAILED),
      )
      .finally(() => setBusy(null));
  }

  function turnOff() {
    setError(null);
    setBusy("off");
    turnOffPush(viewerId)
      .catch((e: unknown) =>
        setError(e instanceof PushActionError ? e.message : TURN_OFF_FAILED),
      )
      .finally(() => setBusy(null));
  }

  return (
    <div id="alerts" className="alerts-line">
      <AlertsLineBody
        state={state}
        busy={busy}
        onTurnOn={turnOn}
        onTurnOff={turnOff}
      />
      {error ? (
        <p className="alerts-line-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const LOCK_SCREEN_NOTE =
  "Alerts show who wrote, where, and the first line, and some lock screens show them too.";

function AlertsLineBody({
  state,
  busy,
  onTurnOn,
  onTurnOff,
}: {
  state: ReturnType<typeof usePushDevice>;
  busy: "on" | "off" | null;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) {
  switch (state) {
    case "unknown":
      return null;
    case "unsupported":
      return (
        <p className="alerts-line-text">
          Alerts on this device: not available in this browser.
        </p>
      );
    case "ios-tab":
      return (
        <>
          <p className="alerts-line-text">Alerts on this device:</p>
          <InstallSteps />
        </>
      );
    case "denied":
      return (
        <p className="alerts-line-text">
          Alerts on this device: blocked in your browser or device settings. To
          turn them on, allow notifications for Topic there, then reload this
          page.
        </p>
      );
    case "off":
      return (
        <>
          <p className="alerts-line-text">
            Alerts on this device:{" "}
            <button
              type="button"
              className="alerts-line-action"
              onClick={onTurnOn}
              disabled={busy !== null}
            >
              {busy === "on" ? "Turning on…" : "Turn on"}
            </button>
          </p>
          <p className="alerts-line-note">{LOCK_SCREEN_NOTE}</p>
        </>
      );
    case "on":
      return (
        <>
          <p className="alerts-line-text">
            Alerts are on for this device ·{" "}
            <button
              type="button"
              className="alerts-line-action"
              onClick={onTurnOff}
              disabled={busy !== null}
            >
              {busy === "off" ? "Turning off…" : "Turn off"}
            </button>
          </p>
          <p className="alerts-line-note">{LOCK_SCREEN_NOTE}</p>
        </>
      );
  }
}
