# Netlify 部署

## 1. 推送代码

在 Netlify 新建站点，连接 Git 仓库。

- **Base directory**: `rialo_latch`（若仓库根目录不是该文件夹则留空）
- **Build command**: `npm install && npm run build`（已在 `netlify.toml` 配置）
- **Publish directory**: `dist`

## 2. 环境变量

在 Netlify → Site configuration → Environment variables 添加：

| 变量 | 示例 |
|------|------|
| `APP_URL` | `https://你的站点.netlify.app` |
| `DISCORD_REDIRECT_URI` | `https://你的站点.netlify.app/api/auth/discord/callback` |
| `DISCORD_CLIENT_ID` | Discord 应用 Client ID |
| `DISCORD_CLIENT_SECRET` | Discord 应用 Client Secret |
| `SESSION_SECRET` | 随机长字符串 |

Netlify 上一般**不需要** `DISCORD_PROXY`（服务器可直连 Discord）。

## 3. Discord OAuth2 Redirects

在 [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2 → Redirects 添加：

```
https://你的站点.netlify.app/api/auth/discord/callback
```

必须与 `DISCORD_REDIRECT_URI` **完全一致**。

## 4. 部署后验证

- `https://你的站点.netlify.app/api/health` → `{"ok":true}`
- `https://你的站点.netlify.app/api/auth/discord` → 跳转 Discord 登录
- 首页右侧打卡墙可公开访问

## 构建说明

`npm run build` 会：
1. 构建前端 `dist/`
2. 用 esbuild 将 API 打成**单文件** `netlify/functions/api.cjs`（含 express、serverless-http、sql.js 等）
3. 复制 `sql-wasm.wasm` 到 `netlify/functions/`

Netlify 部署时 **不要**改 build command，保持 `npm install && npm run build`。

## 注意

- API 通过自包含的 `api.cjs` Function 运行，不依赖外部 `node_modules`
- 数据库使用 sql.js，数据写在 `/tmp/rialo-latch`，冷启动后可能丢失
