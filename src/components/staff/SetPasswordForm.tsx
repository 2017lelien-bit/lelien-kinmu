"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!tokenHash || !type) {
    return <p className="text-sm text-red-600">リンクが無効です。もう一度リンクを発行してもらってください。</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません。");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    // トークンの消費(verifyOtp)は、本人がボタンを押した瞬間まで行わない。
    // リンクをそのままLINEなどに貼ると、トーク側の自動プレビュー取得でリンクが先に開かれてしまい、
    // 1回しか使えないトークンが本人が開く前に無効になってしまうため。
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash!,
      type: type as "invite" | "recovery",
    });
    if (verifyError) {
      setSubmitting(false);
      setError("リンクが無効か、有効期限が切れています。もう一度リンクを発行してもらってください。");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError("パスワードの設定に失敗しました。もう一度リンクを発行してもらってください。");
      return;
    }

    router.replace("/staff");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="flex flex-col gap-1 text-sm">
        新しいパスワード
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        新しいパスワード(確認)
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "設定中..." : "パスワードを設定する"}
      </button>
    </form>
  );
}
