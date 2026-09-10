-- 印刷カレンダーのレッスン名ごとの色分けを、管理画面から自由に設定できるようにする。
-- style: 'band'(背景に色帯、文字色は自動で白/黒を選ぶ) / 'text'(文字色のみ) / 'none'(色なし)
create table lesson_colors (
  id uuid primary key default gen_random_uuid(),
  lesson_name text not null unique,
  style text not null default 'band' check (style in ('band', 'text', 'none')),
  color text not null default '#FFFF00',
  created_at timestamptz not null default now()
);

alter table lesson_colors enable row level security;

-- これまでコード側で決め打ちしていた色を、そのまま初期値として登録しておく(見た目を変えないための移行)。
insert into lesson_colors (lesson_name, style, color) values
  ('筋膜リリース75', 'band', '#FFFF00'),
  ('Fアクティブ', 'band', '#E91E63'),
  ('Fストレッチ', 'band', '#FFCCFF'),
  ('Fコアバランス', 'band', '#FFE8CC'),
  ('Fアロマリラックス', 'band', '#A0FFA0'),
  ('Fミックス', 'band', '#2E7D32'),
  ('Fkids', 'band', '#FF0066'),
  ('Kidsティシュー', 'band', '#FF0066'),
  ('crystalbowl', 'band', '#0070C0'),
  ('Fエンジョイ', 'none', '#FFFFFF'),
  ('4Dpro', 'none', '#FFFFFF'),
  ('Fシニア', 'none', '#FFFFFF'),
  ('バンジーフィットネス', 'none', '#FFFFFF'),
  ('Fデトックス', 'none', '#FFFFFF'),
  ('ティシュー', 'text', '#0070C0'),
  ('ティシュー初級〜', 'text', '#0070C0');
