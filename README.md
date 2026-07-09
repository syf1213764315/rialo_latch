# Rialo Latch

Discord 登录 + API Key（Bearer）+ 公开打卡墙。

## Discord 回调地址（必须配置）

在 [Discord Developer Portal](https://discord.com/developers/applications) → 你的应用 → **OAuth2** → **Redirects** 添加：

```
http://localhost:8787/api/auth/discord/callback
```

生产环境请改成你的域名，例如：

```
https://your-domain.com/api/auth/discord/callback
```

并同步更新 `.env` 中的 `DISCORD_REDIRECT_URI` 与 `APP_URL`。

| 用途 | 路径 |
|------|------|
| 发起登录 | `GET /api/auth/discord` |
| OAuth 回调 | `GET /api/auth/discord/callback` |

## 启动

```bash
cd rialo_latch
npm install
npm run build
npm start
```

开发（API + 前端热更新）：

```bash
# 终端 1
npm run dev

# 终端 2
npx vite
```

打开 http://localhost:5175 （Vite 会把 `/api` 代理到 8787）。

## 业务接口

### GET `/api/v1/ping`

- Header: `Authorization: Bearer <api_key>`
- Query: `note?`
- 成功后写入公开打卡记录

### POST `/api/v1/checkin`

- Header: `Authorization: Bearer <api_key>`
- Body: `{ "note"?: string, "meta"?: object }`
- 成功后写入公开打卡记录

### GET `/api/v1/checkins`

- 公开，无需登录
