const CACHE_VERSION = "cfbelite-v43";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "New CFBElite update." };
  }

  const data = payload.data || {};
  const type = String(data.type || payload.type || "update").toLowerCase();
  const iconMap = {
    announcement: "📣",
    final: "🏈",
    game: "🏈",
    gameday: "🎙️",
    poll: "🗳️",
    rankings: "📊",
    message: "💬",
  };
  const prefix = iconMap[type] || "🏈";
  const title = `${prefix} ${payload.title || data.title || "CFBElite27"}`;
  const body = payload.body || data.body || "There is a new league update.";
  const url = data.url || payload.url || "/";
  const channel = data.channel || data.context || "CFBElite27";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: data.icon || payload.icon || "/icons/icon-192.png",
      badge: data.badge || payload.badge || "/icons/badge-96.png",
      image: data.image || payload.image,
      tag: data.tag || `${type}:${channel}`,
      renotify: Boolean(data.renotify),
      requireInteraction: Boolean(data.requireInteraction),
      timestamp: Number(data.timestamp || Date.now()),
      vibrate: [120, 70, 120],
      data: { ...data, url },
      actions: [
        { action: "open", title: "Open CFBElite" },
        { action: "dismiss", title: "Dismiss" },
      ],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url === target || client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
