/* No fetch handler or offline cache: authenticated content stays on the server. */
self.addEventListener("push", (event) => {
  // Ignore all incoming content, including malformed/unexpected payloads.
  event.waitUntil(
    self.registration.showNotification("Topic", {
      body: "You have new activity. Open Topic to see your notifications.",
      tag: "topic-activity",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Fixed same-origin destination; never trust URLs from push data.
  event.waitUntil(
    self.clients.openWindow(
      new URL("/notifications", self.location.origin).href,
    ),
  );
});
