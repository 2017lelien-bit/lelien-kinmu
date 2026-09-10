-- 日付ごとの特記事項(イベントのお知らせなど)と、通常の定休日ルール(月曜)を上書きするための表。
-- is_closed_override: true=その日は臨時休業にする / false=その日は定休日でも営業日にする / null=通常ルールのまま
create table schedule_notes (
  entry_date date primary key,
  is_closed_override boolean,
  note text,
  updated_at timestamptz not null default now()
);

alter table schedule_notes enable row level security;

-- スタッフ全員が予定提出時にも見えるように、閲覧は誰でも可能にする(書き込みはService Role経由の管理者のみ)。
create policy schedule_notes_read on schedule_notes
  for select
  using (true);
