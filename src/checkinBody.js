export function buildDefaultCheckinBody(discordId) {
  return JSON.stringify({
    userId: discordId ? String(discordId) : "",
    timestamp: new Date().toISOString(),
  });
}

export function enrichCheckinBody(rawBody, discordId) {
  let payload = {};
  try {
    const parsed = JSON.parse(String(rawBody || "{}"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      payload = parsed;
    }
  } catch {
    payload = {};
  }

  if (!payload.userId && discordId) {
    payload.userId = String(discordId);
  }
  if (!payload.timestamp) {
    payload.timestamp = new Date().toISOString();
  } else if (typeof payload.timestamp !== "string") {
    payload.timestamp = String(payload.timestamp);
  }

  if (payload.location !== undefined) {
    const location = payload.location;
    if (
      typeof location !== "object" ||
      location === null ||
      Array.isArray(location)
    ) {
      delete payload.location;
    }
  }

  return JSON.stringify(payload);
}
