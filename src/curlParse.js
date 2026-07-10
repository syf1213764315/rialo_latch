const ONLATCH_PROXY_BASE = "https://onlatch.com/proxy";
/** onlatch proxy 后的打卡接口路径（对应本站 POST /api/checkin） */
export const CHECKIN_PROXY_URL = `${ONLATCH_PROXY_BASE}/api/checkin`;

export function parseCurlInput(text) {
  const normalized = String(text || "")
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let bearer = null;
  const authPatterns = [
    /-H\s+["']Authorization:\s*Bearer\s+([^"']+)["']/i,
    /["']Authorization:\s*Bearer\s+([^"']+)["']/i,
    /Authorization\s*:\s*Bearer\s+([A-Za-z0-9._-]+)/i,
    /Bearer\s+(lat_[A-Za-z0-9]+)/i,
  ];
  for (const pattern of authPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      bearer = match[1].trim();
      break;
    }
  }

  let url = "";
  const urlMatch = normalized.match(/https?:\/\/[^\s'"\\]+/i);
  if (urlMatch?.[0]) {
    url = urlMatch[0].replace(/['"]/g, "");
  }
  if (url && /onlatch\.com\/proxy/i.test(url)) {
    url = CHECKIN_PROXY_URL;
  }

  let method = "POST";
  const methodMatch = normalized.match(/-X\s+([A-Za-z]+)/i);
  if (methodMatch?.[1]) {
    method = methodMatch[1].toUpperCase();
  }

  let body = "{}";
  const bodyPatterns = [
    /-d\s+['"]([^'"]*)['"]/i,
    /--data(?:-raw|-binary)?\s+['"]([^'"]*)['"]/i,
    /-d\s+(\{[^}]+\})/i,
  ];
  for (const pattern of bodyPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1] !== undefined) {
      body = match[1].trim() || "{}";
      break;
    }
  }
  if (body === "{}") {
    body = JSON.stringify({
      userId: "",
      timestamp: new Date().toISOString(),
      location: {},
    });
  }

  return { bearer, url, method, body };
}
