"use client";

import { useState } from "react";
import Link from "next/link";
import { inviteStaff } from "@/lib/staff-admin";

export default function InviteStaffForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; inviteLink: string; name: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await inviteStaff({ name, email, role });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ id: res.data.id, inviteLink: res.data.inviteLink, name });
  }

  if (result) {
    return (
      <div className="flex max-w-md flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm font-semibold">{result.name} さんの招待を発行しました。</p>
        <p className="text-xs text-neutral-500">
          以下のURLをLINEなどでご本人に送ってください。開いてパスワードを設定すると使い始められます。
        </p>
        <input
          readOnly
          value={result.inviteLink}
          onFocus={(e) => e.currentTarget.select()}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800"
        />
        <div className="flex gap-4 text-sm">
          <button onClick={() => setResult(null)} className="underline">
            続けて別のスタッフを招待する
          </button>
          <Link href={`/staff/admin/staff/${result.id}`} className="underline">
            このスタッフの詳細へ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
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
        メールアドレス(ログインIDとして使います)
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        権限
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "staff" | "admin")}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        >
          <option value="staff">スタッフ</option>
          <option value="admin">管理者</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "発行中..." : "招待URLを発行する"}
      </button>
    </form>
  );
}
