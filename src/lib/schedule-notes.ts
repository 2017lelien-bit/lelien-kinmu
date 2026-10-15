"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

export interface ScheduleNote {
  entry_date: string;
  is_closed_override: boolean | null;
  note: string | null;
  color: string | null;
  bg_color: string | null;
  // 「片付け」など社内向けのメモを、お客様用・HP用の印刷に出さないようにする。
  hide_on_customer?: boolean | null;
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
  color?: string | null;
  bgColor?: string | null;
  hideOnCustomer?: boolean;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    entry_date: input.entryDate,
    is_closed_override: input.isClosedOverride,
    note: input.note.trim() || null,
    color: input.color ?? null,
    bg_color: input.bgColor ?? null,
  };
  // 列を追加する前のデータベースでも、他のメモの保存が失敗しないよう、指定されたときだけ書き込む。
  if (input.hideOnCustomer !== undefined) row.hide_on_customer = input.hideOnCustomer;
  const { error } = await admin.from("schedule_notes").upsert(row, { onConflict: "entry_date" });
  if (error) return { ok: false, error: "保存に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  revalidatePath("/staff/admin/schedule/print");
  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}

// 期間(1日だけでも可)をまとめて「臨時休業」にする、または臨時休業を取り消して通常(曜日どおり)に戻す。
// すでに入っているメモ・文字色・帯色は消さずに残す。休業にするときにメモを入れた場合だけ、メモを上書きする。
export async function setScheduleClosures(input: {
  startDate: string;
  endDate: string;
  closed: boolean;
  note?: string;
}): Promise<ActionResult<{ days: number }>> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };
  if (!input.startDate || !input.endDate) return { ok: false, error: "開始日と終了日を入力してください。" };
  if (input.endDate < input.startDate) return { ok: false, error: "終了日は開始日以降にしてください。" };

  const dates: string[] = [];
  const cursor = new Date(`${input.startDate}T00:00:00Z`);
  const end = new Date(`${input.endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (dates.length > 62) return { ok: false, error: "一度に設定できるのは62日間までです。" };

  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from("schedule_notes")
    .select("*")
    .gte("entry_date", input.startDate)
    .lte("entry_date", input.endDate);
  const existingByDate = new Map((existingRows ?? []).map((r) => [r.entry_date as string, r]));
  const note = input.note?.trim() || null;

  const rows = dates.map((date) => {
    const existing = existingByDate.get(date);
    return {
      entry_date: date,
      is_closed_override: input.closed ? true : null,
      note: input.closed && note ? note : (existing?.note ?? null),
      color: existing?.color ?? null,
      bg_color: existing?.bg_color ?? null,
    };
  });
  const { error } = await admin.from("schedule_notes").upsert(rows, { onConflict: "entry_date" });
  if (error) return { ok: false, error: "保存に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  revalidatePath("/staff/admin/schedule/print");
  revalidatePath("/staff/mypage");
  return { ok: true, data: { days: dates.length } };
}
