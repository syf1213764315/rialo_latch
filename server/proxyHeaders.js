export function getAppOrigin() {
  const appUrl = process.env.APP_URL || "http://localhost:8787";
  return appUrl.replace(/\/$/, "");
}

export function buildProxyHeaders(authorization) {
  const origin = getAppOrigin();
  return {
    Authorization: authorization,
    "Content-Type": "application/json",
    Origin: origin,
    Referer: `${origin}/`,
  };
}
