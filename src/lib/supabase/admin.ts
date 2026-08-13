import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service role keyを使うクライアント。RLSを完全にバイパスするため、
// 必ずServer Action / Route Handler内で、呼び出し元の認可チェックを行った後にのみ使用すること。
// クライアントコンポーネントやServer Componentのレンダリングパスからは絶対に呼び出さない。
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
