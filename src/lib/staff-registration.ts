"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

// 全スタッフ共通の登録用リンクから、本人が名前・メールアドレス・パスワードを入力して
// 自分でアカウントを作成できるようにする(管理者が事前に一人ずつ招待する必要をなくすため)。
// 誰でも作れてしまわないよう、共通の登録コード(STAFF_REGISTRATION_CODE)による確認を挟む。
// 権限は常に'staff'固定とし、自己登録では管理者権限を作れないようにする。
export async function selfRegisterStaff(input: {
  name: string;
  email: string;
  password: string;
  code: string;
}): Promise<ActionResult> {
  if (!process.env.STAFF_REGISTRATION_CODE || input.code !== process.env.STAFF_REGISTRATION_CODE) {
    return { ok: false, error: "登録コードが正しくありません。" };
  }
  if (!input.name.trim()) return { ok: false, error: "お名前を入力してください。" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません。" };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "パスワードは8文字以上で入力してください。" };
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { ok: false, error: "登録に失敗しました。既に登録済みのメールアドレスの可能性があります。" };
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    id: created.user.id,
    name: input.name.trim(),
    role: "staff",
  });

  if (profileError) {
    return { ok: false, error: "スタッフ情報の登録に失敗しました。" };
  }

  return { ok: true, data: undefined };
}
