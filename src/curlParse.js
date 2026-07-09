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

  let path = "";
  const urlMatch = normalized.match(
    /https?:\/\/(?:www\.)?onlatch\.com\/proxy\/([^\s'"?#]+)/i,
  );
  if (urlMatch?.[1]) {
    path = decodeURIComponent(urlMatch[1].replace(/\/$/, ""));
  }

  let method = "POST";
  const methodMatch = normalized.match(/-X\s+([A-Za-z]+)/i);
  if (methodMatch?.[1]) {
    method = methodMatch[1].toUpperCase();
  }

  return { bearer, path, method };
}
