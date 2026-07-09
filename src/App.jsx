import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCurlInput } from "./curlParse.js";

const ONLATCH_PROXY_BASE = "https://onlatch.com/proxy";

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

export default function App() {
  const [user, setUser] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [freshKey, setFreshKey] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [curlInput, setCurlInput] = useState("");
  const [checkinPath, setCheckinPath] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [checkinMethod, setCheckinMethod] = useState("POST");
  const [checkinBusy, setCheckinBusy] = useState(false);

  const refreshMe = useCallback(async () => {
    const data = await api("/api/auth/me");
    setUser(data.user);
  }, []);

  const refreshCheckins = useCallback(async () => {
    const data = await api("/api/v1/checkins");
    setCheckins(data.checkins);
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
        await refreshCheckins();
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshMe, refreshCheckins]);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.globalName || user.username;
  }, [user]);

  const createKey = async () => {
    setError(null);
    try {
      const data = await api("/api/auth/keys", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setFreshKey(data.key.key);
      setMessage("API Key 已生成");
    } catch (e) {
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

  const requestPreview = useMemo(() => {
    const path = checkinPath.trim().replace(/^\/+/, "");
    if (!path || !bearerToken) return null;
    return {
      method: checkinMethod,
      url: `${ONLATCH_PROXY_BASE}/${path}`,
      authorization: `Bearer ${bearerToken}`,
    };
  }, [checkinPath, bearerToken, checkinMethod]);

  const handleParseCurl = () => {
    setError(null);
    const parsed = parseCurlInput(curlInput);
    if (!parsed.bearer) {
      setError("未能从 curl 中解析出 Authorization Bearer token");
      return;
    }
    setBearerToken(parsed.bearer);
    if (parsed.path) setCheckinPath(parsed.path);
    if (parsed.method) setCheckinMethod(parsed.method);
    const path = (parsed.path || checkinPath).trim().replace(/^\/+/, "");
    console.log("[打卡] 解析 curl", {
      method: parsed.method,
      url: path ? `${ONLATCH_PROXY_BASE}/${path}` : null,
      authorization: `Bearer ${parsed.bearer}`,
    });
    setMessage("已解析 Authorization 与打卡地址");
  };

  const handleCheckin = async () => {
    setError(null);
    setMessage(null);
    if (!bearerToken) {
      setError("请先粘贴 curl 并解析 Authorization");
      return;
    }
    if (!checkinPath.trim()) {
      setError("请填写打卡地址（onlatch.com/proxy/ 后的路径）");
      return;
    }

    const preview = {
      method: checkinMethod,
      url: `${ONLATCH_PROXY_BASE}/${checkinPath.trim().replace(/^\/+/, "")}`,
      authorization: `Bearer ${bearerToken}`,
    };
    console.log("[打卡] 发起请求", preview);

    setCheckinBusy(true);
    try {
      const data = await api("/api/v1/latch-checkin", {
        method: "POST",
        body: JSON.stringify({
          path: checkinPath.trim(),
          token: bearerToken,
          method: checkinMethod,
        }),
      });
      console.log("[打卡] 响应", { status: data.status, ok: data.ok, data: data.data });
      setMessage(data.ok ? "打卡成功" : `打卡返回 ${data.status}`);
      await refreshCheckins();
    } catch (e) {
      console.error("[打卡] 失败", e);
      setError(e.message);
    } finally {
      setCheckinBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    setFreshKey(null);
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

      <div className="split-layout">
        <aside className="split-left">
          <section className="card">
            <h2>Discord 登录</h2>
            {user ? (
              <div className="user-row">
                <img className="avatar" src={user.avatar} alt={displayName} />
                <div>
                  <div style={{ fontWeight: 600 }}>{displayName}</div>
                  <div className="muted mono">@{user.username}</div>
                  <div className="actions" style={{ marginTop: "0.75rem" }}>
                    <button type="button" className="btn danger" onClick={logout}>
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="muted">登录后可申请 API Key，调用打卡接口时使用 Bearer Token。</p>
                <a className="btn primary" href="/api/auth/discord">
                  使用 Discord 登录
                </a>
              </>
            )}
          </section>

          <section className="card">
            <h2>API Key</h2>
            {!user ? (
                <p className="muted">
                  登录后可生成 Key（永久有效）。请求头：
                  <code>Authorization: Bearer &lt;api_key&gt;</code>
                </p>
            ) : (
              <>
                <div className="actions">
                  <button type="button" className="btn primary" onClick={createKey}>
                    生成 API Key
                  </button>
                </div>
                {freshKey ? (
                  <div className="key-banner">
                    <div className="mono key-text">{freshKey}</div>
                    <button type="button" className="btn primary" onClick={handleCopyKey}>
                      复制全部
                    </button>
                  </div>
                ) : (
                  <p className="empty">点击上方按钮生成 Key（永久有效，不会过期）</p>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2>打卡</h2>
            <p className="muted">
              粘贴 curl 命令，自动提取 <code>Authorization: Bearer</code> 作为请求头。
            </p>
            <label>
              curl 命令
              <textarea
                rows={5}
                placeholder={`curl https://onlatch.com/proxy/example/path \\\n  -H "Authorization: Bearer lat_..."`}
                value={curlInput}
                onChange={(e) => setCurlInput(e.target.value)}
              />
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={handleParseCurl}>
                解析
              </button>
            </div>
            {requestPreview ? (
              <div className="request-preview">
                <div className="request-preview-title">请求预览</div>
                <div className="mono request-line">
                  <span className={`method ${requestPreview.method.toLowerCase()}`}>
                    {requestPreview.method}
                  </span>{" "}
                  {requestPreview.url}
                </div>
                <div className="mono request-line">
                  Authorization: {requestPreview.authorization}
                </div>
              </div>
            ) : null}
            <label>
              打卡地址
              <input
                type="text"
                placeholder="example/path（对应 https://onlatch.com/proxy/ 后的路径）"
                value={checkinPath}
                onChange={(e) => setCheckinPath(e.target.value)}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                onClick={handleCheckin}
                disabled={checkinBusy}
              >
                {checkinBusy ? "打卡中…" : "打卡"}
              </button>
            </div>
          </section>
        </aside>

        <main className="split-right card">
          <div className="actions" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0 }}>打卡墙</h2>
            <button type="button" className="btn" onClick={refreshCheckins}>
              刷新
            </button>
          </div>
          <p className="muted">公开可见。调用打卡接口后记录会出现在这里。</p>
          {checkins.length === 0 ? (
            <p className="empty">暂无打卡记录</p>
          ) : (
            <div className="checkin-list">
              {checkins.map((c) => (
                <div key={c.id} className="checkin-item">
                  <img src={c.avatar} alt={c.username} />
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {c.globalName || c.username}{" "}
                      <span className="muted mono">@{c.username}</span>
                    </div>
                    <div className="checkin-meta">
                      <span className={`method ${c.method.toLowerCase()}`}>{c.method}</span>{" "}
                      <span className="mono">{c.endpoint}</span>
                    </div>
                    {c.note ? <div style={{ marginTop: "0.35rem" }}>{c.note}</div> : null}
                  </div>
                  <div className="checkin-meta mono">{c.createdAt}</div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
