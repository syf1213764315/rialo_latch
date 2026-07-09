import crypto from "node:crypto";
import { nanoid } from "nanoid";
import db from "./db.js";

export function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const PERMANENT_EXPIRES_AT = "2099-12-31T23:59:59.999Z";

export function createSession(userId) {
  const token = nanoid(48);
  const expires = PERMANENT_EXPIRES_AT;
  db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
  ).run(token, userId, expires);
  return { token, expiresAt: expires };
}

export function getSessionUser(sessionToken) {
  if (!sessionToken) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
    )
    .get(sessionToken);
  return row ?? null;
}

export function destroySession(sessionToken) {
  if (!sessionToken) return;
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(sessionToken);
}

export function upsertDiscordUser(profile) {
  const existing = db
    .prepare(`SELECT * FROM users WHERE discord_id = ?`)
    .get(profile.id);

  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(profile.discriminator || "0") % 5}.png`;

  if (existing) {
    db.prepare(
      `UPDATE users
       SET username = ?, global_name = ?, avatar = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(profile.username, profile.global_name ?? null, avatarUrl, existing.id);
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(existing.id);
  }

  const id = nanoid(16);
  db.prepare(
    `INSERT INTO users (id, discord_id, username, global_name, avatar)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, profile.id, profile.username, profile.global_name ?? null, avatarUrl);

  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

export function createApiKey(userId, name = "default") {
  const raw = `lat_${nanoid(40)}`;
  const id = nanoid(12);
  const prefix = raw.slice(0, 10);
  const keyHash = hashToken(raw);
  db.prepare(
    `INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, name, prefix, keyHash);
  return { id, name, prefix, key: raw, createdAt: new Date().toISOString() };
}

export function listApiKeys(userId) {
  return db
    .prepare(
      `SELECT id, name, key_prefix AS prefix, created_at AS createdAt, last_used_at AS lastUsedAt
       FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId);
}

export function revokeApiKey(userId, keyId) {
  const result = db
    .prepare(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`)
    .run(keyId, userId);
  return result.changes > 0;
}

export function getUserByApiKey(bearerToken) {
  if (!bearerToken) return null;
  const keyHash = hashToken(bearerToken);
  const row = db
    .prepare(
      `SELECT u.*, k.id AS api_key_id
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ?`,
    )
    .get(keyHash);
  if (!row) return null;
  db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(
    row.api_key_id,
  );
  const { api_key_id: _, ...user } = row;
  return user;
}

export function addCheckin({ userId, method, endpoint, note, payload }) {
  const id = nanoid(14);
  db.prepare(
    `INSERT INTO checkins (id, user_id, method, endpoint, note, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    method,
    endpoint,
    note ?? null,
    payload ? JSON.stringify(payload) : null,
  );
  return getCheckinById(id);
}

export function getCheckinById(id) {
  return db
    .prepare(
      `SELECT c.id, c.method, c.endpoint, c.note, c.payload, c.created_at AS createdAt,
              u.username, u.global_name AS globalName, u.avatar
       FROM checkins c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
    )
    .get(id);
}

export function listCheckins(limit = 100) {
  return db
    .prepare(
      `SELECT c.id, c.method, c.endpoint, c.note, c.payload, c.created_at AS createdAt,
              u.username, u.global_name AS globalName, u.avatar
       FROM checkins c
       JOIN users u ON u.id = c.user_id
       ORDER BY c.created_at DESC
       LIMIT ?`,
    )
    .all(limit)
    .map((row) => ({
      ...row,
      payload: row.payload ? JSON.parse(row.payload) : null,
    }));
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    discordId: user.discord_id,
    username: user.username,
    globalName: user.global_name,
    avatar: user.avatar,
  };
}
