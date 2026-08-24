"use server";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

let configured = false;
function configureWebPush() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "ログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      staff_id: staff.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: "通知の登録に失敗しました。" };
  return { ok: true, data: undefined };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "ログインしてください。" };

  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("staff_id", staff.id);
  return { ok: true, data: undefined };
}

async function sendToStaffIds(
  staffIds: string[],
  payload: { title: string; body: string; url: string; badgeCount?: number },
): Promise<void> {
  configureWebPush();
  if (staffIds.length === 0) return;

  const admin = createAdminClient();
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("staff_id", staffIds);

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, badgeCount: payload.badgeCount ?? 0 }),
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // 端末側で通知が無効化/失効している。購読情報を削除する。
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("[web-push] send failed", error);
      }
    }
  }
}

// 管理者権限を持つ全スタッフの、登録済み端末すべてにプッシュ通知を送る。
export async function notifyAdmins(payload: { title: string; body: string; url: string }): Promise<void> {
  const admin = createAdminClient();
  const { data: admins } = await admin.from("staff_profiles").select("id").eq("role", "admin");
  const adminIds = (admins ?? []).map((a) => a.id);

  const { count: badgeCount } = await admin
    .from("period_submissions")
    .select("id", { count: "exact", head: true })
    .is("acknowledged_at", null);

  await sendToStaffIds(adminIds, { ...payload, badgeCount: badgeCount ?? 0 });
}

// 管理者ではないスタッフ全員の、登録済み端末すべてにプッシュ通知を送る(スケジュール提出の締切連絡など)。
export async function notifyStaff(payload: { title: string; body: string; url: string }): Promise<void> {
  const admin = createAdminClient();
  const { data: staffRows } = await admin.from("staff_profiles").select("id").eq("role", "staff").eq("is_active", true);
  const staffIds = (staffRows ?? []).map((s) => s.id);

  await sendToStaffIds(staffIds, payload);
}
