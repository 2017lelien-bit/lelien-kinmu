-- Instagram自動投稿(文字だけのストーリーズ。/api/cron/instagram-post, /api/cron/instagram-token)用のテーブル。
-- 機能そのものは、環境変数 INSTAGRAM_AUTOPOST_ENABLED=true と、管理画面のスイッチ(story_enabled)の両方がONになるまで動かない。
-- 4つとも service role(サーバー)からのみ読み書きする。RLSを有効にしてポリシーを作らないことで、
-- 匿名キー・ログイン中のスタッフからも直接は一切読めない(アクセストークンを含むため)。管理画面はサーバー側で管理者を確認してから読み書きする。

-- 1) 設定(1行だけ)。アクセストークンは自動更新(60日ごと)で書き換わるため、環境変数ではなくここに保存する。
--    最初の1回だけ環境変数 INSTAGRAM_ACCESS_TOKEN から取り込み、以後はこちらが優先される。
create table if not exists instagram_settings (
  id int primary key default 1 check (id = 1),
  access_token text,
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  token_alert_sent_at timestamptz,
  story_enabled boolean not null default false,   -- 管理画面のスイッチ。初期はOFF
  updated_at timestamptz not null default now()
);
insert into instagram_settings (id) values (1) on conflict do nothing;

-- 2) ストーリーズに出す文(テンプレート)。渡部さんが承認した文だけを、1回ずつ順番に出す(AIが文章を作ることはない)。
--    文を変更すると is_approved は自動で外れ、再承認するまで出ない。一度出した文(last_posted_at あり)は二度と出さない。
create table if not exists instagram_post_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,                 -- 管理画面での呼び名
  body text not null,                  -- 画像に載せる文(改行は段落のあきになる)
  is_approved boolean not null default false,
  approved_at timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  last_posted_at timestamptz,
  post_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_post_templates_approved_needs_at check (not is_approved or approved_at is not null)
);

-- 3) 背景の写真ライブラリ。フォルダ「ストーリー背景」の写真から、最近使っていないものが順に選ばれる。
create table if not exists instagram_images (
  id uuid primary key default gen_random_uuid(),
  folder text not null default 'ストーリー背景',
  image_url text not null,             -- 公開バケット instagram-posts 内のJPEGの公開URL
  storage_path text not null,          -- バケット内のパス(削除用)
  is_active boolean not null default true,
  last_used_at timestamptz,
  use_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists instagram_images_folder_idx on instagram_images (folder, is_active);

-- 4) 投稿ログ兼、二重投稿防止の「確保」テーブル。
--    dedupe_key(例: story-text:2026-11-10:1)の一意制約により、同じ投稿を同時に二重に始められない。
--    投稿の前にこの行を作り(確保)、Instagramへ送るのはその行を確保できたときだけ。
create table if not exists instagram_posts (
  id uuid primary key default gen_random_uuid(),
  post_type text not null check (post_type = 'story'),
  dedupe_key text not null unique,
  post_date date not null,             -- 投稿予定日(日本時間)
  template_id uuid references instagram_post_templates(id) on delete set null,
  image_source text check (image_source is null or image_source = 'story'),
  image_id uuid references instagram_images(id) on delete set null,
  caption text not null default '',    -- ストーリーズには文面(キャプション)を付けないので空
  image_url text,
  status text not null default 'claimed' check (status in ('claimed', 'published', 'failed', 'gave_up')),
  attempts int not null default 0,
  container_id text,                   -- Instagramのメディアコンテナ。再試行時に「作り直さず同じものを使う」ために保存する
  media_id text,
  last_error text,
  error_kind text,                     -- token / transient / permanent
  next_retry_at timestamptz,
  claimed_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists instagram_posts_post_date_idx on instagram_posts (post_date);

alter table instagram_settings enable row level security;
alter table instagram_post_templates enable row level security;
alter table instagram_images enable row level security;
alter table instagram_posts enable row level security;

-- 5) 画像の置き場所(公開バケット。InstagramがURLから画像を取得するため公開が必須)。JPEGのみ。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instagram-posts', 'instagram-posts', true, 8388608, array['image/jpeg'])
on conflict (id) do nothing;
