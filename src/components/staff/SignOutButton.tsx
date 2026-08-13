"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/staff/login");
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className="underline">
      ログアウト
    </button>
  );
}
