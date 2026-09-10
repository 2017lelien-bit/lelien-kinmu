"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

export interface MusuhiShift {
  id: string;
  staff_id: string;
  entry_date: string;
  start_time: string;
  end_time: string;
}

async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };
  return null;
}

export async function getMusuhiShifts(
  monthStart: string,
  monthEnd: string,
): Promise<(MusuhiShift & { staffName: string })[]> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("musuhi_shifts")
    .select("*, staff_profiles(name, schedule_display_name)")
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd)
    .order("entry_date", { ascending: true })
    .order("start_time", { ascending: true });

  return (
    (data ?? []) as unknown as (MusuhiShift & {
      staff_profiles: { name: string; schedule_display_name: string | null } | null;
    })[]
  ).map((s) => ({
    ...s,
    staffName: s.staff_profiles?.schedule_display_name || s.staff_profiles?.name || "(不明)",
  }));
}

export async function addMusuhiShift(input: {
  staffId: string;
  entryDate: string;
  startTime: string;
  endTime: string;
}): Promise<ActionResult<MusuhiShift>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  if (input.endTime <= input.startTime) return { ok: false, error: "終了時刻は開始時刻より後にしてください。" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("musuhi_shifts")
    .insert({
      staff_id: input.staffId,
      entry_date: input.entryDate,
      start_time: input.startTime,
      end_time: input.endTime,
    })
    .select()
    .single();
  if (error || !data) return { ok: false, error: "登録に失敗しました。" };

  revalidatePath("/staff/admin/musuhi-schedule");
  return { ok: true, data: data as MusuhiShift };
}

export async function updateMusuhiShift(
  id: string,
  input: { staffId?: string; startTime?: string; endTime?: string },
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const update: { staff_id?: string; start_time?: string; end_time?: string } = {};
  if (input.staffId !== undefined) update.staff_id = input.staffId;
  if (input.startTime !== undefined) update.start_time = input.startTime;
  if (input.endTime !== undefined) update.end_time = input.endTime;

  const admin = createAdminClient();
  const { error } = await admin.from("musuhi_shifts").update(update).eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath("/staff/admin/musuhi-schedule");
  return { ok: true, data: undefined };
}

export async function deleteMusuhiShift(id: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { error } = await admin.from("musuhi_shifts").delete().eq("id", id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidatePath("/staff/admin/musuhi-schedule");
  return { ok: true, data: undefined };
}
