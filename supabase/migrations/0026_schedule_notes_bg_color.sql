-- スケジュールの日付メモに、文字色(color)とは別に「帯色」(背景色)を設定できるようにする。
alter table schedule_notes add column if not exists bg_color text;
