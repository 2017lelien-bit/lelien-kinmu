# Le lien 勤務管理・給与計算システム

Next.js + Supabase + Resend による、空中フィットネススタジオ「Le lien」のスタッフ勤務管理・給与計算システム。お客様向けの予約機能は持たない(勤務管理・給与計算専用)。

- 各スタッフが自分の連絡先を編集し、毎月の実績(区分ごとの時間数 or 回数)を自己入力
- 管理者がスタッフごとに自由な「支払区分」(名前・単位・単価)を設定できる(時給制の時給区分、業務委託のレッスン単価区分のどちらもこの仕組みで表現する)
- 給与計算: 業務委託は報酬・料金等の源泉徴収(一律10.21%)、時給制は国税庁「月額表甲欄」の計算式で所得税を自動計算
- 通勤費・住民税・出勤日数は明細作成時に管理者が手入力
- 給与明細をメールで送信(Resend)。作成済み明細は内容が変わらないスナップショットとして保存

## セットアップ

### 1. Supabaseプロジェクトを作成する

1. https://supabase.com でプロジェクトを新規作成する
2. SQL Editorで [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) の内容を実行する(テーブル・RLS・初期データが作成される)
3. Authentication > Users で、最初の管理者スタッフをメール/パスワードで作成する
4. SQL Editorで、作成したユーザーの`auth.users.id`を使い、以下を実行して管理者権限を付与する

   ```sql
   insert into staff_profiles (id, name, role)
   values ('<auth.usersのUUID>', 'スタッフ氏名', 'admin');
   ```

   (以降の追加スタッフは、管理画面の「スタッフ管理 > 新規スタッフを招待」から招待メールで登録できる)

### 2. Resendを設定する

1. https://resend.com でアカウントを作成し、送信ドメインを認証する(未認証の場合は`onboarding@resend.dev`からの送信のみ利用可)
2. APIキーを発行する

### 3. 環境変数を設定する

`.env.example` を `.env.local` にコピーして値を埋める。

```bash
cp .env.example .env.local
```

| 変数名 | 説明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上(サーバー専用。絶対にクライアントに公開しない) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Resendで発行したAPIキーと送信元アドレス |
| `NEXT_PUBLIC_SITE_URL` | 本番URL(招待メール・給与明細メール内のリンク生成に使用) |

### 4. ローカルで起動する

```bash
npm install
npm run dev
```

http://localhost:3000/staff/login でスタッフログインが確認できる。

## デプロイ (Vercel)

1. Vercelにリポジトリを接続してデプロイする
2. 上記の環境変数をVercelのProject Settings > Environment Variablesに設定する

## ディレクトリ構成

```
src/
  app/
    page.tsx                 # トップページ(スタッフログインへの導線のみ)
    staff/                    # スタッフ向け画面(ログイン保護はproxy.tsで実施)
      mypage/                  # 各スタッフの自己入力画面
      admin/staff/              # 管理者向けスタッフ管理・給与計算画面
  components/staff/           # スタッフ画面のUI部品
  lib/
    supabase/                 # Supabaseクライアント(browser/server/admin)
    auth.ts                    # スタッフ認証ヘルパー
    staff-self.ts                # 本人が編集できる項目(プロフィール・実績入力)
    staff-admin.ts                # 管理者専用の操作(招待・税設定・在籍状態)
    pay-categories.ts               # 支払区分の管理(管理者専用)
    payroll.ts                       # 給与計算・明細生成・メール送信
    tax.ts                            # 源泉徴収税額の計算ロジック
    notifications.ts                   # Resendメール送信
supabase/migrations/0001_init.sql  # DBスキーマ・RLS
```

## 注意事項

- すべてのテーブルへの読み書きはクライアントから直接行わず、Service Roleクライアントを使うServer Action経由で行う設計になっている。RLSはService Role以外からの読み書きをデフォルトで拒否する。
- 通勤費・住民税・出勤日数は自動計算式が明確でなかったため、明細作成時に管理者が手入力する。
- 時給制の所得税計算は「甲欄」(扶養控除等申告書を提出している主たる勤務先)を前提としている。
- 社会保険料控除には対応していない(該当者が出た場合は追加実装が必要)。
