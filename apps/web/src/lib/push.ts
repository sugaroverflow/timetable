/** Feature detection, including iPads that advertise a desktop user agent. */
export function pushSupport(): string | null {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone)
    return "On iPhone or iPad (iOS/iPadOS 16.4 or later), add Topic to your Home Screen and open it there to enable push.";
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "Push notifications are not supported in this browser. You can still use in-app notifications and email digests.";
  }
  return null;
}

export function applicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
