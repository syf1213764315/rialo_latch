import { Router } from "express";
import { requireBearer } from "../auth.js";
import { addCheckin, listCheckins, publicUser } from "../store.js";

const router = Router();

/**
 * POST /api/checkin
 * Auth: Bearer <api_key>
 * Body JSON: { note?: string, meta?: object }
 */
router.post("/checkin", requireBearer, (req, res) => {
  const note =
    typeof req.body?.note === "string" ? req.body.note.slice(0, 200) : null;
  const meta =
    req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)
      ? req.body.meta
      : null;

  console.log("[checkin] 收到打卡", {
    userId: req.user.id,
    username: req.user.username,
    body: req.body,
  });

  const record = addCheckin({
    userId: req.user.id,
    method: "POST",
    endpoint: "/api/checkin",
    note,
    payload: { note, meta },
  });

  res.status(201).json({
    ok: true,
    message: "打卡成功",
    user: publicUser(req.user),
    checkin: record,
  });
});

/** Public feed — no auth */
router.get("/checkins", (_req, res) => {
  res.json({ checkins: listCheckins(100) });
});

/**
 * POST /api/latch-checkin
 * Body: { url: string, token: string, method?: string, body?: string }
 * Server-side proxy to onlatch.com (avoids browser CORS).
 */
router.post("/latch-checkin", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  const token = String(req.body?.token || "").trim();
  const method = String(req.body?.method || "POST").toUpperCase();
  const body = req.body?.body !== undefined ? String(req.body.body) : "{}";

  if (!url || !token) {
    return res.status(400).json({
      error: "missing_fields",
      message: "请提供打卡地址与 Authorization Bearer token",
    });
  }

  if (!/^https:\/\/(?:www\.)?onlatch\.com\/proxy\//i.test(url)) {
    return res.status(400).json({
      error: "invalid_url",
      message: "仅支持 https://onlatch.com/proxy/ 地址",
    });
  }

  const authorization = `Bearer ${token}`;
  const tokenPreview =
    token.length > 16 ? `${token.slice(0, 10)}…${token.slice(-6)}` : token;

  const fetchOptions = {
    method,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
  };
  if (method !== "GET" && method !== "HEAD") {
    fetchOptions.body = body;
  }

  console.log("[latch-checkin] 发起请求", {
    method,
    url,
    body: method === "GET" || method === "HEAD" ? undefined : body,
    authorization: `Bearer ${tokenPreview}`,
  });

  try {
    const upstream = await fetch(url, fetchOptions);
    const text = await upstream.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // keep raw text
    }

    console.log("[latch-checkin] 响应", {
      method,
      url,
      status: upstream.status,
      ok: upstream.ok,
      bodyPreview: typeof data === "string" ? data.slice(0, 500) : data,
    });

    return res.status(upstream.ok ? 200 : upstream.status).json({
      ok: upstream.ok,
      status: upstream.status,
      method,
      url,
      authorization,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      data,
    });
  } catch (error) {
    console.error("[latch-checkin] 失败", {
      method,
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(502).json({
      error: "proxy_failed",
      message: error instanceof Error ? error.message : "打卡请求失败",
    });
  }
});

export default router;
