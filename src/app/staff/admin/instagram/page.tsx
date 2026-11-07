import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { DAILY_LIMIT, STORY_FOLDER } from "@/lib/instagram/autopost";
import { getInstagramSettings, listInstagramLibraryImages, listInstagramTemplates, listRecentInstagramPosts } from "@/lib/instagram/store";
import { resolveCredentials } from "@/lib/instagram/token";
import { orderEligibleTemplates } from "@/lib/instagram/template-pick";
import { InstagramLibrary, InstagramSwitch, InstagramTemplates } from "@/components/staff/InstagramAdmin";

const STATUS_LABEL: Record<string, string> = {
  claimed: "投稿処理中",
  published: "投稿済み",
  failed: "失敗(再試行待ち)",
  gave_up: "失敗(再試行を終了)",
};

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function daysUntil(iso: string | null): number | null {
  return iso ? Math.floor((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
}

export default async function InstagramAdminPage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const [settings, templates, posts, libraryImages] = await Promise.all([
    getInstagramSettings(),
    listInstagramTemplates(),
    listRecentInstagramPosts(15),
    listInstagramLibraryImages(),
  ]);
  const envOn = process.env.INSTAGRAM_AUTOPOST_ENABLED === "true";
  const creds = resolveCredentials(settings);
  const daysLeft = daysUntil(settings.tokenExpiresAt);
  const remaining = orderEligibleTemplates(templates).ordered.length;
  const running = envOn && settings.storyEnabled;

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Instagram ストーリーズ自動投稿</h1>
        <p className="text-sm text-neutral-500">
          承認した文だけを、1回ずつ順番に、文字だけのストーリーズとして毎日自動で出します(1日{DAILY_LIMIT}回まで。11時ごろと16時ごろ)。
          一度出した文は、二度と出ません。AIが文章を作ることはありません。
        </p>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">いまの状態</dt>
          <dd className={running ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
            {running ? "動いています(投稿されます)" : "止まっています(まだ何も投稿されません)"}
          </dd>
          <dt className="text-neutral-500">Vercel側の許可</dt>
          <dd>{envOn ? "ON" : "OFF(環境変数 INSTAGRAM_AUTOPOST_ENABLED が true ではありません)"}</dd>
          <dt className="text-neutral-500">Instagramとの接続</dt>
          <dd>{creds ? "トークン設定済み" : "未設定(トークンまたはユーザーIDがありません)"}</dd>
          <dt className="text-neutral-500">トークンの期限</dt>
          <dd>
            {settings.tokenExpiresAt
              ? `${formatJst(settings.tokenExpiresAt)} まで(あと約${daysLeft}日・期限が近づくと自動で更新されます)`
              : "未確認(最初の自動更新で記録されます)"}
          </dd>
          <dt className="text-neutral-500">残りの文</dt>
          <dd className={remaining <= 4 ? "font-semibold text-red-600" : ""}>承認済みで、まだ出していないもの: {remaining}本{remaining <= 4 ? "(少なくなっています。新しい文を準備して承認してください)" : ""}</dd>
        </dl>
        <InstagramSwitch enabled={settings.storyEnabled} />
        <p className="text-xs text-neutral-400">「動いています」になるのは、Vercelの許可とこの画面のスイッチが、両方ONのときだけです。</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">ストーリーズに出す文(承認した文だけが、順番に出ます)</h2>
        <p className="text-sm text-neutral-500">
          「承認する」を押した文だけが出ます。文を直すと承認は外れます。「ストーリーズでの見え方」で、実際の画像を確認できます(投稿はされません)。
          効果効能・資格や経歴・特典・割引の表現は、登録できません。
        </p>
        <InstagramTemplates templates={templates} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">背景の写真</h2>
        <InstagramLibrary images={libraryImages} defaultFolder={STORY_FOLDER} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">最近の投稿</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-neutral-400">まだ投稿の記録がありません。</p>
        ) : (
          <ul className="flex flex-col text-sm">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5 border-b border-neutral-100 py-2 dark:border-neutral-900">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">ストーリーズ({p.post_date})</span>
                  <span className={p.status === "published" ? "text-green-700" : p.status === "claimed" ? "text-neutral-500" : "text-red-600"}>
                    {STATUS_LABEL[p.status] ?? p.status}
                    {p.published_at ? `・${formatJst(p.published_at)}` : ""}
                  </span>
                </div>
                {p.last_error && p.status !== "published" && <span className="text-xs text-red-600">{p.last_error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
