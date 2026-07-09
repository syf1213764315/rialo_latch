import { useCallback, useEffect, useMemo, useState } from "react";

const APIS = [
  {
    method: "POST",
    path: "/api/v1/checkin",
    label: "打卡接口",
    auth: "Bearer Token",
  },
  {
    method: "GET",
    path: "/api/v1/checkins",
    label: "公开打卡",
    auth: "无需鉴权",
  },
];

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
        <nav className="api-nav">
          {APIS.map((item) => (
            <div key={item.path} className="api-pill" title={item.auth}>
              <span className={`method ${item.method.toLowerCase()}`}>{item.method}</span>
              <span className="mono path">{item.path}</span>
              <span className="api-label">{item.label}</span>
            </div>
          ))}
        </nav>
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
                登录后可生成 Key。请求头：
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
                  <p className="empty">点击上方按钮生成 Key</p>
                )}
              </>
            )}
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
