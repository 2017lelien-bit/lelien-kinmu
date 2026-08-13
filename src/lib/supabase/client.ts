import { createBrowserClient } from "@supabase/ssr";

// ブラウザ(クライアントコンポーネント)から使う匿名キーのSupabaseクライアント。
// スタッフのログインフォームと、お客様のSMS OTP認証(signInWithOtp/verifyOtp)にのみ使用する。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
