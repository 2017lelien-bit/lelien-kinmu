// Instagram Graph API(Instagram APIのInstagramログイン方式)の薄いクライアント。
// 公式ドキュメント(Content Publishing / Refresh Access Token)で確認した仕様に基づく:
//  - POST {host}/{version}/{IG_ID}/media          : image_url, caption でメディアコンテナを作成(画像はJPEGのみ・公開URL)
//  - GET  {host}/{version}/{container_id}?fields=status_code : EXPIRED / ERROR / FINISHED / IN_PROGRESS / PUBLISHED
//  - POST {host}/{version}/{IG_ID}/media_publish  : creation_id=コンテナID で公開(24時間あたりAPI投稿100件まで)
//  - GET  {host}/refresh_access_token?grant_type=ig_refresh_token : 長期トークンを60日延長(発行から24時間以上・失効前のみ)
// アクセストークンはPOSTでは本文に入れて送る(GETはドキュメント通りクエリ)。URLやトークンをログに出さないこと。

export type GraphErrorKind = "token" | "transient" | "permanent";

export class GraphError extends Error {
  constructor(
    message: string,
    readonly kind: GraphErrorKind,
    readonly httpStatus: number | null,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export interface GraphConfig {
  userId: string;
  token: string;
  host?: string; // 既定 graph.instagram.com
  version?: string; // 既定 v23.0
  fetchImpl?: typeof fetch;
}

const DEFAULT_HOST = "graph.instagram.com";
const DEFAULT_VERSION = "v23.0";

function base(cfg: GraphConfig): string {
  return `https://${cfg.host ?? process.env.INSTAGRAM_GRAPH_HOST ?? DEFAULT_HOST}/${cfg.version ?? process.env.INSTAGRAM_GRAPH_API_VERSION ?? DEFAULT_VERSION}`;
}

// エラーを「トークン問題(再試行しても直らない・スタッフに通知)」「一時的(待てば直る可能性)」「恒久的(画像や内容の問題)」に分類する。
function classify(httpStatus: number, code: number | null, subcode: number | null, type: string | null): GraphErrorKind {
  if (code === 190 || httpStatus === 401 || type === "OAuthException") {
    // OAuthExceptionでも code 1/2(一時的な障害)や 4/17/32/613(レート制限)は一時的扱いにする。
    if (code !== null && [1, 2, 4, 17, 32, 341, 368, 613].includes(code)) return "transient";
    if (code === 190 || subcode === 463 || subcode === 467 || httpStatus === 401) return "token";
    if (code === 10 || code === 200 || (code !== null && code >= 200 && code <= 299)) return "token"; // 権限不足
  }
  if (httpStatus >= 500 || httpStatus === 429) return "transient";
  if (code !== null && [1, 2, 4, 17, 32, 341, 368, 613].includes(code)) return "transient";
  // 「The requested resource does not exist」(24/2207006)は、作ったばかりのコンテナがまだ引けないときなどに出る一時的なもの。続けて投稿したときに起きたため、再試行の対象にする。
  if (code === 24 || subcode === 2207006) return "transient";
  return "permanent";
}

async function request(
  cfg: GraphConfig,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const f = cfg.fetchImpl ?? fetch;
  const url = `${base(cfg)}/${path}`;
  let res: Response;
  try {
    if (method === "GET") {
      res = await f(`${url}?${new URLSearchParams({ ...params, access_token: cfg.token }).toString()}`);
    } else {
      res = await f(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...params, access_token: cfg.token }).toString(),
      });
    }
  } catch (e) {
    // 通信エラー(タイムアウト等)。公開リクエストの場合は結果が不明なので、呼び出し側でコンテナの状態を確認してから再試行する。
    throw new GraphError(`network error: ${(e as Error).message}`, "transient", null, null);
  }

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // JSONでない応答
  }
  if (!res.ok || json.error) {
    const err = (json.error ?? {}) as { message?: string; code?: number; error_subcode?: number; type?: string };
    const kind = classify(res.status, err.code ?? null, err.error_subcode ?? null, err.type ?? null);
    throw new GraphError(
      `Graph API ${res.status}: ${err.message ?? "unknown error"}${err.code ? ` (code ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ""})` : ""}`,
      kind,
      res.status,
      err.code ?? null,
    );
  }
  return json;
}

export async function createImageContainer(
  cfg: GraphConfig,
  input: { imageUrl: string; caption: string; mediaType?: "STORIES" },
): Promise<string> {
  // ストーリーズは media_type=STORIES で、キャプションは付けない。フィード投稿は media_type を指定しない。
  const params: Record<string, string> = { image_url: input.imageUrl };
  if (input.mediaType === "STORIES") params.media_type = "STORIES";
  else params.caption = input.caption;
  const json = await request(cfg, "POST", `${cfg.userId}/media`, params);
  const id = json.id;
  if (typeof id !== "string") throw new GraphError("Graph API: container id missing", "permanent", null, null);
  return id;
}

export type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED" | "UNKNOWN";

export async function getContainerStatus(cfg: GraphConfig, containerId: string): Promise<ContainerStatus> {
  const json = await request(cfg, "GET", containerId, { fields: "status_code" });
  const s = json.status_code;
  return s === "EXPIRED" || s === "ERROR" || s === "FINISHED" || s === "IN_PROGRESS" || s === "PUBLISHED" ? s : "UNKNOWN";
}

export async function publishContainer(cfg: GraphConfig, containerId: string): Promise<string> {
  const json = await request(cfg, "POST", `${cfg.userId}/media_publish`, { creation_id: containerId });
  const id = json.id;
  if (typeof id !== "string") throw new GraphError("Graph API: media id missing", "permanent", null, null);
  return id;
}

// トークンが有効かの確認(読み取りのみ)。
export async function verifyToken(cfg: GraphConfig): Promise<{ username: string | null; userId: string | null }> {
  const json = await request(cfg, "GET", "me", { fields: "user_id,username" });
  return {
    username: typeof json.username === "string" ? json.username : null,
    userId: json.user_id !== undefined && json.user_id !== null ? String(json.user_id) : null,
  };
}

// 24時間あたりの公開上限の使用状況(クォータ)。
export async function getPublishingUsage(cfg: GraphConfig): Promise<{ used: number; total: number } | null> {
  const json = await request(cfg, "GET", `${cfg.userId}/content_publishing_limit`, { fields: "quota_usage,config" });
  const data = (json.data as { quota_usage?: number; config?: { quota_total?: number } }[] | undefined)?.[0];
  if (!data) return null;
  return { used: data.quota_usage ?? 0, total: data.config?.quota_total ?? 100 };
}

// 長期トークンの更新。成功すると新しいトークンと有効秒数を返す(古いトークンは破棄してよい)。
export async function refreshLongLivedToken(
  token: string,
  opts?: { host?: string; fetchImpl?: typeof fetch },
): Promise<{ accessToken: string; expiresInSec: number }> {
  const f = opts?.fetchImpl ?? fetch;
  const host = opts?.host ?? process.env.INSTAGRAM_GRAPH_HOST ?? DEFAULT_HOST;
  let res: Response;
  try {
    res = await f(
      `https://${host}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token }).toString()}`,
    );
  } catch (e) {
    throw new GraphError(`network error: ${(e as Error).message}`, "transient", null, null);
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string; code?: number; error_subcode?: number; type?: string };
  };
  if (!res.ok || json.error || !json.access_token) {
    const e = json.error ?? {};
    throw new GraphError(
      `Graph API ${res.status}: ${e.message ?? "refresh failed"}${e.code ? ` (code ${e.code})` : ""}`,
      classify(res.status, e.code ?? null, e.error_subcode ?? null, e.type ?? null),
      res.status,
      e.code ?? null,
    );
  }
  return { accessToken: json.access_token, expiresInSec: json.expires_in ?? 60 * 24 * 60 * 60 };
}

export interface PublishHooks {
  // コンテナを作った直後(公開する前)に呼ばれる。ここでDBにコンテナIDを保存しておくと、
  // 途中で落ちても再試行時に「作り直さず同じコンテナを使う/すでに公開済みか確認する」ことができる。
  onContainerCreated?: (containerId: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export interface PublishResult {
  containerId: string;
  mediaId: string | null; // すでに公開済みだったことだけが分かった場合は null
  alreadyPublished: boolean;
}

// 投稿の実行。二重投稿しないための手順:
//  1. existingContainerId があれば、まずその状態を確認する。
//     PUBLISHED → 公開済み。何もしない / FINISHED・IN_PROGRESS → 同じコンテナで続行 / ERROR・EXPIRED → 新しく作り直す。
//  2. コンテナ作成 → onContainerCreated(ID保存) → FINISHED になるまで待つ → media_publish。
//  3. media_publish の応答が失われた(通信エラー)場合は、再度ステータスを見て PUBLISHED なら成功として扱う。
export async function publishImagePost(
  cfg: GraphConfig,
  input: { imageUrl: string; caption: string; existingContainerId?: string | null; mediaType?: "STORIES" },
  hooks: PublishHooks = {},
): Promise<PublishResult> {
  const sleep = hooks.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = hooks.pollIntervalMs ?? 5000;
  const maxPolls = hooks.maxPolls ?? 12;

  let containerId = input.existingContainerId ?? null;
  if (containerId) {
    const status = await getContainerStatus(cfg, containerId);
    if (status === "PUBLISHED") return { containerId, mediaId: null, alreadyPublished: true };
    if (status === "ERROR" || status === "EXPIRED") containerId = null;
  }
  if (!containerId) {
    containerId = await createImageContainer(cfg, { imageUrl: input.imageUrl, caption: input.caption, mediaType: input.mediaType });
    await hooks.onContainerCreated?.(containerId);
  }

  for (let i = 0; i < maxPolls; i++) {
    const status = await getContainerStatus(cfg, containerId);
    if (status === "FINISHED") break;
    if (status === "PUBLISHED") return { containerId, mediaId: null, alreadyPublished: true };
    if (status === "ERROR" || status === "EXPIRED") {
      throw new GraphError(`container ${status}`, "permanent", null, null);
    }
    if (i === maxPolls - 1) throw new GraphError("container not ready in time", "transient", null, null);
    await sleep(interval);
  }

  try {
    const mediaId = await publishContainer(cfg, containerId);
    return { containerId, mediaId, alreadyPublished: false };
  } catch (e) {
    // 応答が届かなかっただけで実際には公開されている可能性があるため、ステータスで確認する。
    if (e instanceof GraphError && e.kind === "transient") {
      try {
        const status = await getContainerStatus(cfg, containerId);
        if (status === "PUBLISHED") return { containerId, mediaId: null, alreadyPublished: true };
      } catch {
        // 確認もできなかった場合は元のエラーを投げ直す。次回の再試行でコンテナの状態を確認してから進む。
      }
    }
    throw e;
  }
}
