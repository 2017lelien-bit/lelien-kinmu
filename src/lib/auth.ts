import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface StaffUser {
  id: string;
  email: string | null;
  name: string;
  role: string;
}

// ログイン中のスタッフ情報を取得する。未ログイン、またはstaff_profilesに
// レコードが存在しない(=スタッフ権限がない)場合はnullを返す。
export async function getStaffUser(): Promise<StaffUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    name: profile.name,
    role: profile.role,
  };
}
