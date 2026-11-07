import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const FROM = process.env.RESEND_FROM_EMAIL ?? "Le lien <onboarding@resend.dev>";

// 宛先: 環境変数 STAFF_NOTIFICATION_EMAILS(カンマ区切り)があればそれ。なければ、管理者(admin)の連絡先メール。
async function alertRecipients(): Promise<string[]> {
  const fromEnv = (process.env.STAFF_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  const { data } = await createAdminClient().from("staff_profiles").select("contact_email").eq("role", "admin");
  return ((data ?? []) as { contact_email: string | null }[]).map((r) => r.contact_email?.trim() ?? "").filter(Boolean);
}

// スタッフ宛てに、Instagram自動投稿の異常・お知らせを送る。
// 宛先がない、または送信に失敗した場合は false を返す(呼び出し側は「通知済み」として記録しない)。
export async function sendInstagramAlertEmail(subject: string, lines: string[]): Promise<boolean> {
  const recipients = await alertRecipients();
  if (recipients.length === 0) {
    console.error("[instagram] alert not sent: no recipients (STAFF_NOTIFICATION_EMAILS or admin contact_email):", subject);
    return false;
  }
  const html = lines.map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("");
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to: recipients,
      subject: `【Le lien Instagram自動投稿】${subject}`,
      html,
    });
    if (error) {
      console.error("[instagram] alert email failed", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[instagram] alert email threw", e);
    return false;
  }
}
