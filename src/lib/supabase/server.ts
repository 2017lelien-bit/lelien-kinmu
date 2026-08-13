import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component / Server Action / Route Handler から使う匿名キーのSupabaseクライアント。
// スタッフのログインセッション(Cookie)の読み書きに使用する。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Componentからの呼び出し時はCookie書き込み不可のため無視する。
            // セッションのリフレッシュはmiddleware側で行われる。
          }
        },
      },
    },
  );
}
