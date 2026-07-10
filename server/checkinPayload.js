import { getUserByApiKey } from "./store.js";

export function parseCheckinBody(raw) {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return { ...raw };
  }
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function normalizeLocation(payload) {
  const location = payload.location;
  if (
    typeof location === "object" &&
    location !== null &&
    !Array.isArray(location)
  ) {
    payload.location = location;
    return;
  }
  payload.location = {};
}

export function buildCheckinPayload(rawBody, bearerToken) {
  const payload = parseCheckinBody(rawBody);
  const user = getUserByApiKey(bearerToken);

  if (!payload.userId || typeof payload.userId !== "string") {
    if (user?.discord_id) {
      payload.userId = String(user.discord_id);
    }
  }

  if (!payload.timestamp) {
    payload.timestamp = new Date().toISOString();
  } else if (typeof payload.timestamp !== "string") {
    payload.timestamp = String(payload.timestamp);
  }

  normalizeLocation(payload);

  return JSON.stringify(payload);
}
