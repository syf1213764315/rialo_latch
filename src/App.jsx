import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCurlInput, CHECKIN_PROXY_URL } from "./curlParse.js";
import { enrichCheckinBody } from "./checkinBody.js";
import { clearApiKey, loadApiKey, saveApiKey } from "./storage.js";

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function formatLog(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [freshKey, setFreshKey] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [curlInput, setCurlInput] = useState("");
  const [checkinUrl, setCheckinUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [checkinMethod, setCheckinMethod] = useState("POST");
  const [requestBody, setRequestBody] = useState("{}");
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [showRequestPreview, setShowRequestPreview] = useState(false);
  const [responseLog, setResponseLog] = useState(null);
  const [lastSuccess, setLastSuccess] = useState(null);

  const refreshMe = useCallback(async () => {
    const data = await api("/api/auth/me");
    setUser(data.user);
    if (data.user?.id) {
      const saved = loadApiKey(data.user.id);
      if (saved) setFreshKey(saved);
      try {
        const keysData = await api("/api/auth/keys");
        setHasServerKey((keysData.keys || []).length > 0);
      } catch {
        setHasServerKey(false);
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "ok") {
      setMessage("Discord 登录成功");
      window.history.replaceState({}, "", "/");
    } else if (params.get("auth") === "error") {
      setError(params.get("message") || "登录失败");
      window.history.replaceState({}, "", "/");
    }

    (async () => {
      try {
        await refreshMe();
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshMe]);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.globalName || user.username;
  }, [user]);

  const createKey = async (force = false) => {
    setError(null);
    try {
      const data = await api("/api/auth/keys", {
        method: "POST",
        body: JSON.stringify(force ? { force: true } : {}),
      });
      setFreshKey(data.key.key);
      setHasServerKey(true);
      if (user?.id) saveApiKey(user.id, data.key.key);
      setMessage("API Key 已生成并保存");
    } catch (e) {
      const saved = user?.id ? loadApiKey(user.id) : null;
      if (saved) {
        setFreshKey(saved);
        setMessage("已加载本机保存的 API Key");
        return;
      }
      setError(e.message);
    }
  };

  const handleCopyKey = async () => {
    if (!freshKey) return;
    try {
      await copyText(freshKey);
      setMessage("API Key 已复制");
      setError(null);
    } catch {
      setError("复制失败，请手动选择文本复制");
    }
  };

  const applyParsedCurl = (parsed) => {
    setBearerToken(parsed.bearer || "");
    setCheckinUrl(parsed.url || "");
    setCheckinMethod(parsed.method || "POST");
    setRequestBody(enrichCheckinBody(parsed.body, user?.discordId));
    setShowRequestPreview(true);
    return parsed;
  };

  const requestPreview = useMemo(() => {
    if (!showRequestPreview || !checkinUrl || !bearerToken) return null;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return {
      method: checkinMethod,
      url: checkinUrl,
      authorization: `Bearer ${bearerToken}`,
      origin,
      body: requestBody,
    };
  }, [showRequestPreview, checkinUrl, bearerToken, checkinMethod, requestBody]);

  const handleParseCurl = () => {
    setError(null);
    const parsed = parseCurlInput(curlInput);
    if (!parsed.bearer) {
      setError("未能从 curl 中解析出 Authorization Bearer token");
      return;
    }
    if (!parsed.url) {
      setError("未能从 curl 中解析出打卡地址");
      return;
    }
    applyParsedCurl(parsed);
    setMessage("已解析打卡地址、Authorization 与 Body");
  };

  const handleCheckin = async () => {
    setError(null);
    setMessage(null);

    let url = checkinUrl;
    let token = bearerToken;
    let method = checkinMethod;
    let body = requestBody;

    if (!url || !token) {
      const parsed = parseCurlInput(curlInput);
      if (parsed.bearer && parsed.url) {
        url = parsed.url;
        token = parsed.bearer;
        method = parsed.method;
        body = enrichCheckinBody(parsed.body, user?.discordId);
      } else {
        const saved = user?.id ? loadApiKey(user.id) : null;
        if (saved) {
          token = saved;
          url = CHECKIN_PROXY_URL;
          method = "POST";
          body = enrichCheckinBody("{}", user.discordId);
        } else {
          setError("请先粘贴 curl 并点击解析");
          return;
        }
      }
    } else {
      body = enrichCheckinBody(body, user?.discordId);
    }

    const request = {
      method,
      url,
      authorization: `Bearer ${token}`,
      body,
    };

    setCheckinBusy(true);
    try {
      const res = await fetch("/api/latch-checkin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, token, method, body }),
      });
      const data = await res.json().catch(() => ({}));

      setResponseLog({
        time: new Date().toISOString(),
        request,
        status: data.status ?? res.status,
        ok: data.ok ?? res.ok,
        response: data,
      });

      if (!res.ok || !data.ok) {
        throw new Error(
          (typeof data.data === "object" && data.data?.message) ||
            data.data?.error ||
            data.message ||
            data.error ||
            `HTTP ${data.status ?? res.status}`,
        );
      }

      const payload = data.data || {};
      const checkinRecord = payload.checkin || {};
      const time = checkinRecord.createdAt || new Date().toISOString();

      setLastSuccess({
        avatar: user?.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
        name: user ? (user.globalName || user.username) : "用户",
        username: user?.username || "",
        time,
      });

      setMessage(payload.message || "打卡成功");
    } catch (e) {
      setError(e.message);
      setResponseLog((prev) =>
        prev
          ? { ...prev, error: e.message }
          : {
              time: new Date().toISOString(),
              request,
              error: e.message,
            },
      );
    } finally {
      setCheckinBusy(false);
    }
  };

  const logout = async () => {
    if (user?.id) clearApiKey(user.id);
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    setFreshKey(null);
    setBearerToken("");
    setCheckinUrl("");
    setRequestBody("{}");
    setShowRequestPreview(false);
    setHasServerKey(false);
    setResponseLog(null);
    setLastSuccess(null);
    setMessage("已退出登录");
  };

  if (loading) {
    return (
      <div className="shell">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-row">
          <a className="brand-link" href="https://onlatch.com/" target="_blank" rel="noreferrer">
            <img className="brand-icon" src="/rialo-icon.png" alt="跳转 rialo latch" />
            <span className="brand-name">跳转 rialo latch</span>
          </a>
          <div className="follow-row">
            <a
              className="x-link x-link-follow"
              href="https://x.com/RialoHQ"
              target="_blank"
              rel="noreferrer"
              title="关注 RialoHQ"
            >
              <img className="x-avatar" src="/rialo-icon.png" alt="RialoHQ" />
              <span>
                RialoHQ<span className="follow-plus">+</span>
              </span>
            </a>
            <a
              className="x-link x-link-follow"
              href="https://x.com/ayun24335167"
              target="_blank"
              rel="noreferrer"
              title="关注 ayun"
            >
              <img className="x-avatar" src="/ayun-avatar.png" alt="ayun" />
              <span>
                ayun<span className="follow-plus">+</span>
              </span>
            </a>
          </div>
        </div>
      </header>

      {message ? <p className="flash">{message}</p> : null}
      {error ? <p className="flash error">{error}</p> : null}

      <div className="dashboard">
        <section className="card account-card">
          <div className="account-grid">
            <div className="account-block">
              <h2>Discord 登录</h2>
              {user ? (
                <div className="user-row compact">
                  <img className="avatar sm" src={user.avatar} alt={displayName} />
                  <div className="user-info">
                    <div className="user-name">{displayName}</div>
                    <div className="muted mono">@{user.username}</div>
                  </div>
                  <button type="button" className="btn danger sm" onClick={logout}>
                    退出
                  </button>
                </div>
              ) : (
                <div className="account-actions">
                  <p className="muted compact-text">登录后可申请 API Key</p>
                  <a className="btn primary sm" href="/api/auth/discord">
                    Discord 登录
                  </a>
                </div>
              )}
            </div>

            <div className="account-divider" />

            <div className="account-block">
              <h2>API Key</h2>
              {!user ? (
                <p className="muted compact-text">
                  登录后生成 Key，请求头 <code>Authorization: Bearer &lt;key&gt;</code>
                </p>
              ) : (
                <>
                  <div className="actions">
                    {!freshKey ? (
                      <button type="button" className="btn primary sm" onClick={() => createKey(false)}>
                        {hasServerKey ? "加载 Key" : "生成 Key"}
                      </button>
                    ) : null}
                    {hasServerKey ? (
                      <button type="button" className="btn sm" onClick={() => createKey(true)}>
                        重新生成
                      </button>
                    ) : null}
                    {freshKey ? (
                      <button type="button" className="btn sm" onClick={handleCopyKey}>
                        复制
                      </button>
                    ) : null}
                  </div>
                  {freshKey ? (
                    <div className="key-inline mono">{freshKey}</div>
                  ) : (
                    <p className="empty compact-text">
                      {hasServerKey ? "本机未找到 Key" : "点击生成 Key（永久有效）"}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <section className="card checkin-card">
          <div className="checkin-head">
            <h2>打卡</h2>
            <p className="muted compact-text">粘贴 curl → 解析 → 打卡</p>
          </div>
          <div className="checkin-row">
            <label className="checkin-label">
              curl 命令
              <textarea
                className="curl-input"
                rows={3}
                placeholder={`curl https://onlatch.com/proxy/example/path -H "Authorization: Bearer lat_..."`}
                value={curlInput}
                onChange={(e) => {
                  setCurlInput(e.target.value);
                  setShowRequestPreview(false);
                }}
              />
            </label>
            <div className="checkin-side">
              <div className="actions">
                <button type="button" className="btn sm" onClick={handleParseCurl}>
                  解析
                </button>
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={handleCheckin}
                  disabled={checkinBusy}
                >
                  {checkinBusy ? "打卡中…" : "打卡"}
                </button>
              </div>
              {requestPreview ? (
                <div className="request-preview compact">
                  <div className="request-preview-title">请求预览</div>
                  <div className="mono request-line">
                    <span className={`method ${requestPreview.method.toLowerCase()}`}>
                      {requestPreview.method}
                    </span>{" "}
                    {requestPreview.url}
                  </div>
                  <div className="mono request-line">Authorization: {requestPreview.authorization}</div>
                  {requestPreview.method !== "GET" && requestPreview.method !== "HEAD" ? (
                    <div className="mono request-line">Body: {requestPreview.body}</div>
                  ) : null}
                </div>
              ) : (
                <p className="muted compact-text">解析后显示请求预览</p>
              )}
            </div>
          </div>
        </section>

        <section className="card wall-card">
          <div className="wall-grid">
            <div className="wall-panel">
              <div className="panel-head">
                <h2>打卡墙</h2>
              </div>
              {lastSuccess ? (
                <div className="success-card">
                  <div className="success-badge">打卡成功</div>
                  <img
                    className="success-avatar"
                    src={lastSuccess.avatar}
                    alt={lastSuccess.name}
                  />
                  <div className="success-name">{lastSuccess.name}</div>
                  {lastSuccess.username ? (
                    <div className="success-username mono">@{lastSuccess.username}</div>
                  ) : null}
                  <div className="success-time mono">{formatTime(lastSuccess.time)}</div>
                  <p className="success-hint">
                    可返回{" "}
                    <a href="https://onlatch.com/" target="_blank" rel="noreferrer">
                      Latch
                    </a>{" "}
                    查看请求状态
                  </p>
                </div>
              ) : (
                <div className="wall-empty">
                  <div className="wall-empty-icon">◎</div>
                  <p>完成打卡后，这里会显示你的打卡成功信息</p>
                </div>
              )}
            </div>

            <div className="wall-panel">
              <div className="panel-head">
                <h2>响应日志</h2>
                {responseLog ? (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => copyText(formatLog(responseLog))}
                  >
                    复制
                  </button>
                ) : null}
              </div>
              {responseLog ? (
                <pre className="response-log mono">{formatLog(responseLog)}</pre>
              ) : (
                <div className="wall-empty small">
                  <p>打卡后显示请求与响应日志</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
