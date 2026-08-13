"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 招待・パスワード再設定メールのリンクは、セッション情報をURLのハッシュ(#access_token=...)に
// 付けてこのページへリダイレクトしてくる。ハッシュはサーバーには送られずクライアントでしか読めない上、
// createBrowserClientは自動検出しないため、ここで明示的に読み取ってセッションを張る。
function useSessionFromUrlHash(): { ready: boolean; error: string | null } {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setError("リンクが無効か、有効期限が切れています。もう一度リンクを発行してもらってください。");
        setReady(true);
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setError("リンクが無効か、有効期限が切れています。もう一度リンクを発行してもらってください。");
      } else {
        // ハッシュに認証情報が残ったままだと再読み込み時に混乱するため消しておく。
        window.history.replaceState(null, "", window.location.pathname);
      }
      setReady(true);
    }
    run();
  }, []);

  return { ready, error };
}

export default function SetPasswordForm() {
  const router = useRouter();
  const { ready, error: sessionError } = useSessionFromUrlHash();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError("パスワードの設定に失敗しました。もう一度リンクを発行してもらってください。");
      return;
    }

    router.replace("/staff");
    router.refresh();
  }

  if (!ready) {
    return <p className="text-sm text-neutral-500">確認中...</p>;
  }

  if (sessionError) {
    return <p className="text-sm text-red-600">{sessionError}</p>;
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
