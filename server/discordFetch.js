import { ProxyAgent, fetch as undiciFetch } from "undici";

let agent = null;

function getProxyUrl() {
  return (
    process.env.DISCORD_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    ""
  ).trim();
}

function getAgent() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return null;
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    console.log(`[discord] using proxy: ${proxyUrl}`);
  }
  return agent;
}

/**
 * Fetch Discord API. Uses DISCORD_PROXY / HTTPS_PROXY when set.
 * Node does not use the system/browser proxy by default — required in many regions.
 */
export async function discordFetch(url, options = {}) {
  const dispatcher = getAgent();
  try {
    if (dispatcher) {
      return await undiciFetch(url, { ...options, dispatcher });
    }
    return await fetch(url, options);
  } catch (error) {
    const cause = error?.cause || error;
    const code = cause?.code || error?.code || "";
    if (
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "ETIMEDOUT" ||
      code === "ENOTFOUND" ||
      /fetch failed|Connect Timeout/i.test(String(error?.message || cause?.message || ""))
    ) {
      const hint = getProxyUrl()
        ? `代理 ${getProxyUrl()} 仍无法连接 Discord，请检查代理是否可用`
        : "服务器无法直连 discord.com。请在 .env 设置 DISCORD_PROXY=http://127.0.0.1:7890（按你的本地代理端口修改）后重启";
      const wrapped = new Error(hint);
      wrapped.cause = cause;
      throw wrapped;
    }
    throw error;
  }
}

export function discordNetworkHint() {
  return getProxyUrl()
    ? `当前代理: ${getProxyUrl()}`
    : "未配置代理。若登录报 fetch failed，请设置 DISCORD_PROXY";
}
