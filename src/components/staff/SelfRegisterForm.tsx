"use client";

import { useState } from "react";
import Link from "next/link";
import { selfRegisterStaff } from "@/lib/staff-registration";

export default function SelfRegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await selfRegisterStaff({ name, email, password, code });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-center text-sm">
        <p>登録が完了しました。</p>
        <Link href="/staff/login" className="underline">
          ログイン画面へ進む
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="flex flex-col gap-1 text-sm">
        お名前
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        メールアドレス(ログインIDになります)
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        パスワード(8文字以上)
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
        登録コード
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "登録中..." : "登録する"}
      </button>
    </form>
  );
}
