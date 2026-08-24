"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/lib/push";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "checking" | "unsupported" | "not-installed" | "off" | "on";

export default function NotificationOptIn({ label = "通知" }: { label?: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      // iOSはホーム画面に追加したPWAでしかPush非対応(通常のSafariタブではPushManagerが無い)。
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIos && !isStandalone) {
        setStatus("not-installed");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? "on" : "off");
    }
    check().catch(() => setStatus("unsupported"));
  }, []);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("通知が許可されませんでした。端末の設定から通知を許可してください。");
        setBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("VAPID key is not configured");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const result = await savePushSubscription({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      setStatus("on");
    } catch {
      setError("通知の設定に失敗しました。");
    }
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setStatus("off");
    setBusy(false);
  }

  if (status === "checking") return null;

  if (status === "unsupported") {
    return <p className="text-xs text-neutral-400">この端末・ブラウザは通知に対応していません。</p>;
  }

  if (status === "not-installed") {
    return (
      <p className="text-xs text-neutral-400">
        通知を受け取るには、まずSafariの共有メニューから「ホーム画面に追加」してから、追加したアイコンで開いてください。
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      {error && <span className="text-red-600">{error}</span>}
      {status === "on" ? (
        <>
          <span className="text-neutral-500">{label}: オン</span>
          <button onClick={handleDisable} disabled={busy} className="underline disabled:opacity-40">
            オフにする
          </button>
        </>
      ) : (
        <button onClick={handleEnable} disabled={busy} className="underline disabled:opacity-40">
          {busy ? "設定中..." : `この端末で${label}を受け取る`}
        </button>
      )}
    </div>
  );
}
