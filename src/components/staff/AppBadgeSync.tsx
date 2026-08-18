"use client";

import { useEffect } from "react";

// ページを開くたびに、アプリアイコンのバッジ数を現在の未確認件数に合わせる
// (対応端末のみ。iOSはホーム画面に追加したPWAでのみ対応)。
export default function AppBadgeSync({ pendingCount }: { pendingCount: number }) {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (pendingCount > 0) {
      navigator.setAppBadge(pendingCount).catch(() => {});
    } else {
      navigator.clearAppBadge?.().catch(() => {});
    }
  }, [pendingCount]);

  return null;
}
