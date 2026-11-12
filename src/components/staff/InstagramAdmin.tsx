"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveInstagramTemplate,
  checkInstagramConnection,
  createInstagramTemplate,
  deleteInstagramLibraryImage,
  deleteInstagramTemplate,
  moveInstagramLibraryImage,
  saveInstagramToken,
  setInstagramLibraryImageActive,
  setInstagramStoryEnabled,
  setInstagramTemplateActive,
  unapproveInstagramTemplate,
  updateInstagramTemplate,
  uploadInstagramLibraryImage,
} from "@/lib/instagram/actions";
import type { InstagramLibraryImage, InstagramTemplate } from "@/lib/instagram/store";

const INPUT = "rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800";
const BTN_DARK = "rounded-lg bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40 dark:bg-white dark:text-black";

// 自動投稿のスイッチ。環境変数 INSTAGRAM_AUTOPOST_ENABLED=true と両方ONのときだけ、実際に投稿される。
export function InstagramSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!enabled && !window.confirm("自動投稿のスイッチをONにします。承認した文が、毎日自動でストーリーズに出るようになります。よろしいですか?")) return;
    setBusy(true);
    setError(null);
    const res = await setInstagramStoryEnabled(!enabled);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className={enabled ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
        スイッチ: {enabled ? "ON" : "OFF"}
      </span>
      <button onClick={toggle} disabled={busy} className={BTN_DARK}>
        {enabled ? "OFFにする" : "ONにする"}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

// Instagramとの接続の確認ボタン(読み取りだけ。投稿はされない)。
export function InstagramConnectionCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function check() {
    setBusy(true);
    setResult(null);
    const res = await checkInstagramConnection();
    setBusy(false);
    setResult(
      res.ok
        ? { ok: true, text: `つながりました(アカウント: ${res.data.username ?? "不明"})。投稿はしていません。` }
        : { ok: false, text: res.error },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button onClick={check} disabled={busy} className={BTN_DARK}>
        {busy ? "確認中…" : "接続を確認する"}
      </button>
      {result && <span className={result.ok ? "font-semibold text-green-700" : "text-red-600"}>{result.text}</span>}
    </div>
  );
}

// アクセストークンの貼り付け・保存(管理者のみ)。保存前に、Instagramのアカウントが読めるか確かめる。値は画面に出さない。
export function InstagramTokenForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setResult(null);
    const res = await saveInstagramToken({ token });
    setBusy(false);
    if (res.ok) {
      setToken("");
      setResult({ ok: true, text: `保存しました(アカウント: ${res.data.username ?? "不明"})。` });
      router.refresh();
    } else {
      setResult({ ok: false, text: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-neutral-500">トークンを貼り付けて保存(貼り付けた文字は、画面に出ません)</span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ここに貼り付け"
          className={`${INPUT} min-w-[16rem] flex-1`}
        />
        <button onClick={save} disabled={busy || !token.trim()} className={BTN_DARK}>
          {busy ? "確認して保存中…" : "確認して保存する"}
        </button>
      </div>
      {result && <span className={result.ok ? "font-semibold text-green-700" : "text-red-600"}>{result.text}</span>}
    </div>
  );
}

function TemplateRow({ t }: { t: InstagramTemplate }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [body, setBody] = useState(t.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const posted = !!t.lastPostedAt;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "失敗しました。");
      return false;
    }
    router.refresh();
    return true;
  }

  const badge = posted ? (
    <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">投稿済み(もう出ません)</span>
  ) : t.isApproved ? (
    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">承認済み(順番に出ます)</span>
  ) : (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">未承認(出ません)</span>
  );

  return (
    <li className="flex flex-col gap-2 border-b border-neutral-100 py-4 dark:border-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`font-semibold ${t.isActive ? "" : "text-neutral-400 line-through"}`}>{t.title}</span>
        <div className="flex items-center gap-2">
          {badge}
          {posted && (
            <span className="text-xs text-neutral-400">
              {new Date(t.lastPostedAt!).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
            </span>
          )}
        </div>
      </div>

      {error && <p className="whitespace-pre-line text-sm text-red-600">{error}</p>}

      {editing ? (
        <div className="flex flex-col gap-2 text-sm">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={INPUT} />
          <p className="text-xs text-neutral-400">文を変更すると承認が外れます。もう一度「承認する」を押すまで出ません。</p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={async () => {
                if (await run(() => updateInstagramTemplate(t.id, { title, body }))) {
                  setEditing(false);
                  setShowPreview(false);
                }
              }}
              className={BTN_DARK}
            >
              保存
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setTitle(t.title);
                setBody(t.body);
                setError(null);
              }}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-40 dark:border-neutral-700"
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">{t.body}</p>
      )}

      {showPreview && !editing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/staff/admin/instagram/preview?id=${t.id}&v=${encodeURIComponent(t.body.length + ":" + t.body.slice(0, 20))}`}
          alt="ストーリーズでの見え方"
          className="w-48 rounded-lg border border-neutral-200 dark:border-neutral-800"
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {!editing && (
          <button onClick={() => setShowPreview((v) => !v)} className="text-neutral-500 underline">
            {showPreview ? "見え方を閉じる" : "ストーリーズでの見え方を見る"}
          </button>
        )}
        {!editing && !posted && (
          <button onClick={() => setEditing(true)} className="text-neutral-500 underline">
            文を編集
          </button>
        )}
        {!posted &&
          (t.isApproved ? (
            <button disabled={busy} onClick={() => run(() => unapproveInstagramTemplate(t.id))} className="text-neutral-500 underline">
              承認を取り消す
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => run(() => approveInstagramTemplate(t.id))}
              className="rounded-lg bg-green-700 px-3 py-1 text-white disabled:opacity-40"
            >
              この文で承認する
            </button>
          ))}
        {!posted && (
          <button disabled={busy} onClick={() => run(() => setInstagramTemplateActive(t.id, !t.isActive))} className="text-neutral-400 underline">
            {t.isActive ? "使わない" : "使う"}
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm(`「${t.title}」を削除します。元に戻せません。よろしいですか?`)) run(() => deleteInstagramTemplate(t.id));
          }}
          className="text-red-600 underline"
        >
          削除
        </button>
      </div>
    </li>
  );
}

function NewTemplateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 p-3 text-sm dark:border-neutral-700">
      {error && <p className="whitespace-pre-line text-red-600">{error}</p>}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="名前(例: 朝のハンモック)" className={INPUT} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="ストーリーズに出す文。行を変えると、そこで少しあきができます(1行は、「、」「。」で区切って自動で折り返されます)。効果効能・経歴や資格・特典の表現は登録できません。"
        className={INPUT}
      />
      <button
        disabled={busy || !title.trim() || !body.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await createInstagramTemplate({ title, body });
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setTitle("");
          setBody("");
          router.refresh();
        }}
        className={`self-start ${BTN_DARK}`}
      >
        {busy ? "登録中..." : "未承認で登録"}
      </button>
    </div>
  );
}

export function InstagramTemplates({ templates }: { templates: InstagramTemplate[] }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col">
        {templates.map((t) => (
          <TemplateRow key={t.id} t={t} />
        ))}
      </ul>
      <NewTemplateForm />
    </div>
  );
}

// 選んだ画像をJPEGに変換しつつ、長辺1440pxに縮小する(サーバーへ送る容量を抑えるため)。
async function toJpegBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.88));
}

// 写真ライブラリ: フォルダ「ストーリー背景」に写真を入れておくと、ストーリーズのたびに最近使っていないものが自動で選ばれる。
export function InstagramLibrary({ images, defaultFolder }: { images: InstagramLibraryImage[]; defaultFolder: string }) {
  const router = useRouter();
  const folders = Array.from(new Set([defaultFolder, ...images.map((i) => i.folder)]));
  const [folder, setFolder] = useState(defaultFolder);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    const errs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`アップロード中 ${i + 1} / ${files.length}`);
      try {
        const blob = await toJpegBlob(files[i]);
        const fd = new FormData();
        fd.append("file", new File([blob], "image.jpg", { type: "image/jpeg" }));
        const res = await uploadInstagramLibraryImage(folder, fd);
        if (!res.ok) errs.push(`${files[i].name}: ${res.error}`);
      } catch {
        errs.push(`${files[i].name}: 画像を読み込めませんでした。`);
      }
    }
    setProgress(null);
    setErrors(errs);
    setBusy(false);
    router.refresh();
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setErrors([res.error ?? "失敗しました。"]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-neutral-500">
          入れるフォルダ
          <input
            list="instagram-folders"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="w-32 rounded-lg border border-neutral-200 px-2 py-1 text-neutral-900 dark:border-neutral-800 dark:text-white"
          />
          <datalist id="instagram-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label className="cursor-pointer rounded-lg bg-neutral-900 px-3 py-1.5 text-white dark:bg-white dark:text-black">
          写真を選んで追加(複数OK)
          <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={busy || !folder.trim()} className="hidden" />
        </label>
        {progress && <span className="text-neutral-500">{progress}</span>}
      </div>
      <p className="text-xs text-neutral-400">
        ストーリーズの背景に使うのは、フォルダ「{defaultFolder}」の写真だけです。縦長の写真がきれいです(横長の写真は、中央が切り出されます)。
        文字が読みやすいよう、自動で暗くします。お客様の顔が写っている写真は、ご本人の許可があるものだけにしてください。
        写真がないときは、シンプルな背景に「Le lien」の文字が入った版で出ます。
      </p>
      {errors.length > 0 && (
        <ul className="text-red-600">
          {errors.map((er, i) => (
            <li key={i}>{er}</li>
          ))}
        </ul>
      )}

      {images.length === 0 ? (
        <p className="text-neutral-400">まだ写真がありません。</p>
      ) : (
        folders
          .filter((f) => images.some((i) => i.folder === f))
          .map((f) => (
            <div key={f} className="flex flex-col gap-2">
              <h3 className="font-semibold">
                {f}
                <span className="ml-2 text-xs font-normal text-neutral-400">{images.filter((i) => i.folder === f && i.isActive).length}枚(使う設定)</span>
              </h3>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {images
                  .filter((i) => i.folder === f)
                  .map((img) => (
                    <li key={img.id} className="flex flex-col gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.imageUrl}
                        alt=""
                        className={`aspect-[9/16] w-full rounded-lg border border-neutral-200 object-cover dark:border-neutral-800 ${img.isActive ? "" : "opacity-40"}`}
                      />
                      <span className="text-xs text-neutral-400">{img.useCount}回使用</span>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button disabled={busy} onClick={() => run(() => setInstagramLibraryImageActive(img.id, !img.isActive))} className="text-neutral-500 underline">
                          {img.isActive ? "使わない" : "使う"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const to = window.prompt("移動先のフォルダ名", img.folder);
                            if (to && to.trim() && to.trim() !== img.folder) run(() => moveInstagramLibraryImage(img.id, to));
                          }}
                          className="text-neutral-500 underline"
                        >
                          移動
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm("この写真を削除します。よろしいですか?")) run(() => deleteInstagramLibraryImage(img.id));
                          }}
                          className="text-red-600 underline"
                        >
                          削除
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))
      )}
    </div>
  );
}
