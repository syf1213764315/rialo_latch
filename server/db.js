import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { getDataDir, isServerless } from "./paths.js";
import { readDbBlob, writeDbBlob } from "./blobStore.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    global_name TEXT,
    avatar TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    note TEXT,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

function resolveWasmPath(file) {
  const name = file || "sql-wasm.wasm";
  const candidates = [
    path.join(process.cwd(), "netlify/functions", name),
    path.join(process.cwd(), name),
    path.join(process.cwd(), "node_modules/sql.js/dist", name),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(process.cwd(), "node_modules/sql.js/dist", name);
}

const state = {
  SQL: null,
  sqlDb: null,
  dbPath: null,
  dirty: false,
};

function applySchema() {
  state.sqlDb.run("PRAGMA foreign_keys = ON;");
  state.sqlDb.run(SCHEMA);
}

function persist() {
  state.dirty = true;
  try {
    fs.mkdirSync(path.dirname(state.dbPath), { recursive: true });
    fs.writeFileSync(state.dbPath, Buffer.from(state.sqlDb.export()));
  } catch (error) {
    console.error("[db] local persist failed:", error?.message || error);
  }
}

const adapter = {
  prepare(sql) {
    return {
      run(...params) {
        state.sqlDb.run(sql, params);
        persist();
        return { changes: state.sqlDb.getRowsModified() };
      },
      get(...params) {
        const stmt = state.sqlDb.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          return stmt.step() ? stmt.getAsObject() : undefined;
        } finally {
          stmt.free();
        }
      },
      all(...params) {
        const stmt = state.sqlDb.prepare(sql);
        const rows = [];
        try {
          if (params.length) stmt.bind(params);
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      },
    };
  },
  exec(sql) {
    state.sqlDb.run(sql);
    persist();
  },
};

async function initDatabase() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  state.dbPath = path.join(dataDir, "rialo.db");

  state.SQL = await initSqlJs({
    locateFile: (file) => resolveWasmPath(file),
  });

  let bytes = null;
  if (isServerless()) {
    bytes = await readDbBlob();
  }
  if (!bytes && fs.existsSync(state.dbPath)) {
    bytes = fs.readFileSync(state.dbPath);
  }

  state.sqlDb = bytes ? new state.SQL.Database(bytes) : new state.SQL.Database();
  applySchema();
  return adapter;
}

let dbInstance = null;

export async function initDb() {
  if (!dbInstance) {
    dbInstance = await initDatabase();
  }
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized");
  }
  return dbInstance;
}

/** 从 Netlify Blobs 拉取最新 DB（每个请求开始时调用，保证跨实例一致）。 */
export async function reloadFromBlob() {
  if (!isServerless() || !state.SQL) return;
  const bytes = await readDbBlob();
  if (bytes) {
    try {
      state.sqlDb = new state.SQL.Database(bytes);
      applySchema();
      state.dirty = false;
    } catch (error) {
      console.error("[db] reload failed:", error?.message || error);
    }
  }
}

/** 将本次改动写回 Netlify Blobs（请求结束前调用）。 */
export async function flushToBlob() {
  if (!isServerless() || !state.dirty || !state.sqlDb) return;
  try {
    await writeDbBlob(Buffer.from(state.sqlDb.export()));
    state.dirty = false;
  } catch (error) {
    console.error("[db] flush failed:", error?.message || error);
  }
}

const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const instance = getDb();
      const value = instance[prop];
      return typeof value === "function" ? value.bind(instance) : value;
    },
  },
);

export default db;
