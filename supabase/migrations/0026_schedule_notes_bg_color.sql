-- スケジュールの日付メモに、文字色(color)とは別に「帯色」(背景色)を設定できるようにする。
-- (colorは0020で追加済みのはずだが、未適用の環境でもメモの保存が失敗しないよう、ここでも追加しておく)
alter table schedule_notes add column if not exists color text;
alter table schedule_notes add column if not exists bg_color text;
