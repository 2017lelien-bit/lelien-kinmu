"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import { lessonColorKey } from "@/lib/lesson-color-key";
import { normalizeLessonName, type ActionResult } from "@/lib/types";

export type LessonColorStyle = "band" | "text" | "none";

export interface LessonColor {
  id: string;
  lesson_name: string;
  style: LessonColorStyle;
  color: string;
}

export async function getLessonColors(): Promise<LessonColor[]> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return [];

  const admin = createAdminClient();
  const { data } = await admin.from("lesson_colors").select("*").order("lesson_name", { ascending: true });
  return (data ?? []) as LessonColor[];
}

export async function upsertLessonColor(input: {
  lessonName: string;
  style: LessonColorStyle;
  color: string;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  if (!input.lessonName.trim()) return { ok: false, error: "レッスン名を入力してください。" };

  const admin = createAdminClient();
  const lessonName = normalizeLessonName(input.lessonName);

  // 全角/半角・大文字/小文字・スペースだけが違う名前の設定が別々に残っていると、どちらが使われるか
  // 分からず色が変わらなく見えるため、同じ名前とみなせる古い設定は消して1つにまとめる。
  const key = lessonColorKey(lessonName);
  const { data: existing } = await admin.from("lesson_colors").select("id, lesson_name");
  const duplicateIds = (existing ?? [])
    .filter((row) => lessonColorKey(row.lesson_name) === key && row.lesson_name !== lessonName)
    .map((row) => row.id);
  if (duplicateIds.length > 0) await admin.from("lesson_colors").delete().in("id", duplicateIds);

  const { error } = await admin
    .from("lesson_colors")
    .upsert({ lesson_name: lessonName, style: input.style, color: input.color }, { onConflict: "lesson_name" });
  if (error) return { ok: false, error: "保存に失敗しました。" };

  revalidatePath("/staff/admin/schedule/print");
  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

export async function deleteLessonColor(id: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("lesson_colors").delete().eq("id", id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidatePath("/staff/admin/schedule/print");
  return { ok: true, data: undefined };
}
