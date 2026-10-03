/*
 * Topic's service worker (Web Push step 4, docs/web-push-plan.md §1).
 *
 * Alerts only. There is deliberately no fetch handler and no cache:
 * pages and their data always come from the server, so nothing a member
 * can read is ever stored here. Registered only when someone turns alerts
 * on (apps/web/src/lib/push.ts), and served with a no-cache header
 * (next.config.ts) so a change here reaches every browser on its next
 * visit.
 *
 * A push carries an encrypted JSON payload { title, body, url, tag } (the
 * shared `PushPayload`). If it is missing or fails the checks below, the
 * fixed "Topic — You have new activity" is shown and the tap opens
 * /notifications, the forum chooser.
 */

const FALLBACK = {
  title: "Topic",
  body: "You have new activity",
  url: "/notifications",
  tag: "topic-activity",
};

/* A same-origin PATH only — the same rule as `isSafePushUrl` in
 * packages/shared/src/push.ts (a worker can't import it; the parity test
 * in apps/web/src/lib/serviceWorker.test.ts keeps them in step). */
function isSafePath(url) {
  return (
    typeof url === "string" &&
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(url) &&
    url.length <= 1024
  );
}

/* The payload as an alert, or null when it isn't one. */
function readPayload(data) {
  if (!data) return null;
  let payload;
  try {
    payload = data.json();
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const { title, body, url, tag } = payload;
  if (typeof title !== "string" || !title.trim()) return null;
  if (typeof body !== "string") return null;
  if (!isSafePath(url)) return null;
  return {
    title,
    body,
    url,
    tag: typeof tag === "string" && tag ? tag.slice(0, 128) : "",
  };
}

self.addEventListener("install", () => {
  // A new version of this file takes over at once; it holds no state.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Control open Topic tabs straight away, so a tapped alert can navigate
  // one of them instead of opening another window.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const alert = readPayload(event.data) || FALLBACK;
  const options = {
    body: alert.body,
    icon: "/icon-192.png",
    data: { url: alert.url },
  };
  // One tag per thread: a later alert in the same thread replaces the
  // earlier one, and still buzzes (renotify).
  if (alert.tag) {
    options.tag = alert.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(alert.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const path = data && isSafePath(data.url) ? data.url : FALLBACK.url;
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(openTarget(target));
});

/* Focus an open Topic window and take it to the target, or open a new
 * one. Only windows on this origin are considered. */
async function openTarget(target) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    try {
      const focused = await client.focus();
      const navigated = await focused.navigate(target);
      if (navigated) return;
    } catch {
      // Not controlled by this worker (navigate refuses those): fall
      // through and open a new window instead.
    }
    break;
  }
  await self.clients.openWindow(target);
}
