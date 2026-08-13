"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteStaff } from "@/lib/staff-admin";

export default function InviteStaffForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await inviteStaff({ name, email, role });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/staff/admin/staff/${result.data.id}`);
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
        メールアドレス(招待メールの送付先)
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
        {submitting ? "招待中..." : "招待メールを送信する"}
      </button>
    </form>
  );
}
