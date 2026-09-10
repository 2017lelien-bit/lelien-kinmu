"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

export interface ScheduleNote {
  entry_date: string;
  is_closed_override: boolean | null;
  note: string | null;
}

export async function getScheduleNotes(monthStart: string, monthEnd: string): Promise<ScheduleNote[]> {
  const staff = await getStaffUser();
  if (!staff) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("schedule_notes")
    .select("*")
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd);
  return (data ?? []) as ScheduleNote[];
}

export async function upsertScheduleNote(input: {
  entryDate: string;
  isClosedOverride: boolean | null;
  note: string;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("schedule_notes").upsert(
    {
      entry_date: input.entryDate,
      is_closed_override: input.isClosedOverride,
      note: input.note.trim() || null,
    },
    { onConflict: "entry_date" },
  );
  if (error) return { ok: false, error: "保存に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  revalidatePath("/staff/admin/schedule/print");
  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}
