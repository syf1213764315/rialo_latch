import { Router } from "express";
import {
  currentUserPayload,
  logoutSession,
  requireSession,
  setSessionCookie,
} from "../auth.js";
import { discordFetch, discordNetworkHint } from "../discordFetch.js";
import {
  createApiKey,
  createSession,
  listApiKeys,
  revokeApiKey,
  upsertDiscordUser,
} from "../store.js";

const router = Router();

function discordConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Discord OAuth env vars are missing");
  }
  return { clientId, clientSecret, redirectUri };
}

function appBaseUrl(req) {
  // 优先使用请求本身的来源，避免 APP_URL 配置成 localhost 时登录后跳回 localhost。
  if (req) {
    const forwardedHost = req.headers["x-forwarded-host"];
    const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host;
    if (host && !/^localhost|127\.0\.0\.1/.test(host)) {
      const proto =
        (req.headers["x-forwarded-proto"] || "").toString().split(",")[0] ||
        (req.secure ? "https" : "http");
      return `${proto}://${host}`;
    }
  }
  return process.env.APP_URL || "http://localhost:8787";
}

async function finishDiscordLogin(req, res, redirectUriUsed) {
  const appUrl = appBaseUrl(req);
  const { code, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.redirect(
      `${appUrl}/?auth=error&message=${encodeURIComponent(String(errorDescription || error))}`,
    );
  }
  if (!code || typeof code !== "string") {
    return res.redirect(`${appUrl}/?auth=error&message=missing_code`);
  }

  const { clientId, clientSecret } = discordConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUriUsed,
  });

  let tokenRes;
  try {
    tokenRes = await discordFetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    console.error("[discord] token exchange failed:", error.message, discordNetworkHint());
    return res.redirect(
      `${appUrl}/?auth=error&message=${encodeURIComponent(error.message)}`,
    );
  }

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    return res.redirect(
      `${appUrl}/?auth=error&message=${encodeURIComponent(
        tokenJson.error_description || tokenJson.error || "token_failed",
      )}`,
    );
  }

  let meRes;
  try {
    meRes = await discordFetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
  } catch (error) {
    console.error("[discord] profile fetch failed:", error.message);
    return res.redirect(
      `${appUrl}/?auth=error&message=${encodeURIComponent(error.message)}`,
    );
  }

  const profile = await meRes.json();
  if (!meRes.ok) {
    return res.redirect(`${appUrl}/?auth=error&message=profile_failed`);
  }

  const user = upsertDiscordUser(profile);
  const session = createSession(user.id);
  setSessionCookie(res, session.token, session.expiresAt);
  return res.redirect(`${appUrl}/?auth=ok`);
}

router.get("/discord", (_req, res) => {
  try {
    const { clientId, redirectUri } = discordConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  } catch (error) {
    res.status(500).json({ error: "config_error", message: error.message });
  }
});

router.get("/discord/callback", async (req, res) => {
  // 避免浏览器缓存带 auth=error 的首页
  res.setHeader("Cache-Control", "no-store");
  try {
    const { redirectUri } = discordConfig();
    console.log("[discord] callback hit, exchanging code… redirect_uri=", redirectUri);
    await finishDiscordLogin(req, res, redirectUri);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "callback_failed";
    console.error("[discord] callback unhandled:", msg, error?.cause || "");
    res.redirect(
      `${appBaseUrl(req)}/?auth=error&message=${encodeURIComponent(msg)}`,
    );
  }
});

router.get("/discord/diag", async (_req, res) => {
  const { clientId, redirectUri } = discordConfig();
  const proxy = process.env.DISCORD_PROXY || process.env.HTTPS_PROXY || null;
  let discordReachable = false;
  let discordError = null;
  let tokenProbeStatus = null;
  let tokenProbeBody = null;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: "diag_invalid_code",
      redirect_uri: redirectUri,
    });
    const r = await discordFetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    tokenProbeStatus = r.status;
    tokenProbeBody = await r.text();
    // 400 invalid_grant = API 可达；5xx/网络错误 = 不可达
    discordReachable = r.status === 400 || r.status === 401 || r.ok;
  } catch (error) {
    discordError = error instanceof Error ? error.message : String(error);
  }

  res.json({
    ok: discordReachable,
    explanation: {
      callback302: "GET /api/auth/discord/callback?code=... 返回 302 是正常的，表示回调已命中",
      errorRedirect: "若最终跳到 /?auth=error，说明换 token 或拉用户信息失败，请看 message",
      commonCauses: [
        "服务器无法访问 discord.com（需配置 DISCORD_PROXY）",
        "Discord Redirects 与 DISCORD_REDIRECT_URI 不一致",
        "authorization code 已用过或过期（不能刷新回调 URL）",
      ],
    },
    config: {
      clientId,
      redirectUri,
      appUrl: appBaseUrl(_req),
      proxy,
    },
    discordApi: {
      reachable: discordReachable,
      error: discordError,
      tokenProbeStatus,
      tokenProbeBody: tokenProbeBody ? JSON.parse(tokenProbeBody) : null,
    },
  });
});

router.get("/me", (req, res) => {
  res.json({ user: currentUserPayload(req) });
});

router.post("/logout", (req, res) => {
  logoutSession(req, res);
});

router.get("/keys", requireSession, (req, res) => {
  res.json({ keys: listApiKeys(req.user.id) });
});

router.post("/keys", requireSession, (req, res) => {
  const existing = listApiKeys(req.user.id);
  if (existing.length > 0 && !req.body?.force) {
    return res.status(409).json({
      error: "key_exists",
      message: "已有 API Key，请使用已保存的 Key",
      keys: existing,
    });
  }

  if (req.body?.force) {
    for (const key of existing) {
      revokeApiKey(req.user.id, key.id);
    }
  }

  const name = String(req.body?.name || "default").slice(0, 64);
  const created = createApiKey(req.user.id, name);
  res.status(201).json({
    message: "请立即保存 API Key，服务端不会再次明文返回",
    key: created,
  });
});

router.delete("/keys/:id", requireSession, (req, res) => {
  const ok = revokeApiKey(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

/**
 * 说明接口。若 Discord Redirects 误填成了本地址，授权后会带 code 跳到这里，
 * 此时用本地址作为 redirect_uri 完成换票，避免只显示 JSON。
 */
router.get("/callback-info", async (req, res) => {
  if (typeof req.query.code === "string" || typeof req.query.error === "string") {
    try {
      const mistakenRedirect = `${appBaseUrl(req)}/api/auth/callback-info`;
      await finishDiscordLogin(req, res, mistakenRedirect);
      return;
    } catch (error) {
      return res.redirect(
        `${appBaseUrl(req)}/?auth=error&message=${encodeURIComponent(
          error instanceof Error ? error.message : "callback_failed",
        )}`,
      );
    }
  }

  res.json({
    discordRedirectUri: process.env.DISCORD_REDIRECT_URI,
    loginUrl: "/api/auth/discord",
    callbackUrl: "/api/auth/discord/callback",
    note: "Discord Redirects 必须填 callbackUrl，不要填本接口 /api/auth/callback-info",
  });
});

export default router;
