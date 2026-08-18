self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    (async () => {
      if (typeof data.badgeCount === "number" && "setAppBadge" in self.navigator) {
        try {
          if (data.badgeCount > 0) await self.navigator.setAppBadge(data.badgeCount);
          else await self.navigator.clearAppBadge();
        } catch {
          // 対応していない端末では無視する。
        }
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192.png",
        data: { url: data.url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/staff/admin/staff";
  event.waitUntil(clients.openWindow(url));
});
