import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { getDataDir } from "./paths.js";

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

function createAdapter(sqlDb, dbPath) {
  const persist = () => {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const data = sqlDb.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  };

  return {
    prepare(sql) {
      return {
        run(...params) {
          sqlDb.run(sql, params);
          persist();
          return { changes: sqlDb.getRowsModified() };
        },
        get(...params) {
          const stmt = sqlDb.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = sqlDb.prepare(sql);
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
      sqlDb.run(sql);
      persist();
    },
  };
}

async function initDatabase() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "rialo.db");

  const SQL = await initSqlJs({
    locateFile: (file) => resolveWasmPath(file),
  });
  let sqlDb;

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  const adapter = createAdapter(sqlDb, dbPath);
  adapter.exec("PRAGMA foreign_keys = ON;");
  adapter.exec(SCHEMA);
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
