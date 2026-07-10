const KEY_PREFIX = "rialo_api_key:";

export function saveApiKey(userId, key) {
  if (!userId || !key) return;
  localStorage.setItem(`${KEY_PREFIX}${userId}`, key);
}

export function loadApiKey(userId) {
  if (!userId) return null;
  return localStorage.getItem(`${KEY_PREFIX}${userId}`);
}

export function clearApiKey(userId) {
  if (!userId) return;
  localStorage.removeItem(`${KEY_PREFIX}${userId}`);
}
