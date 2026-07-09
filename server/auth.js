import {
  destroySession,
  getSessionUser,
  getUserByApiKey,
  publicUser,
} from "./store.js";

const SESSION_COOKIE = "rialo_session";

export function getSessionToken(req) {
  return req.cookies?.[SESSION_COOKIE] || null;
}

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function requireSession(req, res, next) {
  const user = getSessionUser(getSessionToken(req));
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "请先使用 Discord 登录" });
  }
  req.user = user;
  next();
}

export function requireBearer(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({
      error: "missing_bearer_token",
      message: "请在 Authorization 头中提供 Bearer token（API Key）",
    });
  }
  const user = getUserByApiKey(match[1].trim());
  if (!user) {
    return res.status(401).json({
      error: "invalid_api_key",
      message: "API Key 无效或已撤销",
    });
  }
  req.user = user;
  next();
}

export function logoutSession(req, res) {
  destroySession(getSessionToken(req));
  clearSessionCookie(res);
  res.json({ ok: true });
}

export function currentUserPayload(req) {
  return publicUser(getSessionUser(getSessionToken(req)));
}
