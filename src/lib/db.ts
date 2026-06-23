import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type UserRole = "admin" | "user";
export type ProviderKind = "openai" | "anthropic" | "google" | "ollama" | "custom";
export type MemoryType = "fact" | "preference" | "decision";

export type SessionUser = {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name: string;
  role: UserRole;
};

export type ProviderRecord = {
  id: string;
  tenantId: string;
  kind: ProviderKind;
  name: string;
  endpointUrl: string | null;
  apiKey: string | null;
  model: string;
  modelAlias: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicProvider = Omit<ProviderRecord, "apiKey"> & {
  hasApiKey: boolean;
};

export type TenantRecord = {
  id: string;
  name: string;
  soul: string;
  generalBehavior: string;
  defaultProviderId: string | null;
};

export type UserRecord = SessionUser & {
  modelOverrideProviderId: string | null;
};

export type ConversationRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
};

export type UserMemoryRecord = {
  id: string;
  tenantId: string;
  userId: string;
  type: MemoryType;
  content: string;
  tags: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  userName?: string;
};

export type OrgMemoryRecord = {
  id: string;
  tenantId: string;
  title: string;
  sourceType: "text" | "markdown" | "link" | "pdf" | "image";
  content: string;
  url: string | null;
  filePath: string | null;
  fileName: string | null;
  mimeType: string | null;
  tags: string;
  summary: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type BehaviorMemoryRecord = {
  id: string;
  tenantId: string;
  content: string;
  tags: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type LiveLinkExtractionRecord = {
  id: string;
  conversationId: string;
  url: string;
  status: "success" | "failed";
  content: string;
  error: string | null;
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
};

type DbRow = Record<string, unknown>;

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "nexus.sqlite");

let db: DatabaseSync | null = null;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function roleValue(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function providerKindValue(value: unknown): ProviderKind {
  if (value === "openai" || value === "anthropic" || value === "google" || value === "ollama" || value === "custom") {
    return value;
  }
  return "custom";
}

function memoryTypeValue(value: unknown): MemoryType {
  if (value === "preference" || value === "decision") return value;
  return "fact";
}

function boolValue(value: unknown): boolean {
  return value === 1 || value === true;
}

function liveLinkStatusValue(value: unknown): LiveLinkExtractionRecord["status"] {
  return value === "success" ? "success" : "failed";
}

function row(value: unknown): DbRow | null {
  return value && typeof value === "object" ? (value as DbRow) : null;
}

function rows(value: unknown[]): DbRow[] {
  return value.filter((item): item is DbRow => !!row(item)).map((item) => item as DbRow);
}

export function getDb() {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    seed(db);
  }
  return db;
}

export function normalizeLiveLinkUrl(value: string) {
  const trimmed = value.trim().replace(/[),.;\]]+$/g, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/g, "");
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      soul TEXT NOT NULL DEFAULT '',
      general_behavior TEXT NOT NULL DEFAULT '',
      default_provider_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      model_override_provider_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('openai', 'anthropic', 'google', 'ollama', 'custom')),
      name TEXT NOT NULL,
      endpoint_url TEXT,
      api_key TEXT,
      model TEXT NOT NULL DEFAULT '',
      model_alias TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'decision')),
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS org_memories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('text', 'markdown', 'link', 'pdf', 'image')),
      content TEXT NOT NULL,
      url TEXT,
      file_path TEXT,
      file_name TEXT,
      mime_type TEXT,
      tags TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS behavior_memories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS live_link_extractions (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
      content TEXT NOT NULL DEFAULT '',
      error TEXT,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(conversation_id, url)
    );

    CREATE INDEX IF NOT EXISTS idx_live_link_extractions_conversation
      ON live_link_extractions(conversation_id);
  `);
}

function seed(database: DatabaseSync) {
  const existing = row(database.prepare("SELECT id FROM tenants WHERE name = ?").get("Festpay"));
  const tenantId = existing ? stringValue(existing.id) : randomUUID();

  if (!existing) {
    database
      .prepare("INSERT INTO tenants (id, name, soul, general_behavior) VALUES (?, ?, ?, ?)")
      .run(
        tenantId,
        "Festpay",
        "Você é o Nexus da Festpay. Responda em português do Brasil, com objetividade, clareza e foco em operações financeiras.",
        "Priorize respostas práticas, cite incertezas e evite inventar políticas internas.",
      );
  }

  const adminEmail = "admin@festpay.local";
  const userEmail = "usuario@festpay.local";

  if (!row(database.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail))) {
    database
      .prepare("INSERT INTO users (id, tenant_id, email, name, role) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), tenantId, adminEmail, "Administrador", "admin");
  }

  if (!row(database.prepare("SELECT id FROM users WHERE email = ?").get(userEmail))) {
    database
      .prepare("INSERT INTO users (id, tenant_id, email, name, role) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), tenantId, userEmail, "Usuário", "user");
  }

  const providerCount = row(database.prepare("SELECT COUNT(*) AS total FROM providers WHERE tenant_id = ?").get(tenantId));
  if (Number(providerCount?.total ?? 0) === 0) {
    const ollamaId = randomUUID();
    const insertProvider = database.prepare(
      "INSERT INTO providers (id, tenant_id, kind, name, endpoint_url, api_key, model, model_alias, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insertProvider.run(randomUUID(), tenantId, "openai", "OpenAI", null, "", "gpt-4o-mini", "GPT-4o Mini", 0);
    insertProvider.run(randomUUID(), tenantId, "anthropic", "Anthropic", null, "", "claude-sonnet-4", "Claude Sonnet 4", 0);
    insertProvider.run(randomUUID(), tenantId, "google", "Google", null, "", "gemini-2.0-flash", "Gemini Flash", 0);
    insertProvider.run(ollamaId, tenantId, "ollama", "Ollama local", "http://localhost:11434", "", "llama3.2", "Llama 3.2", 1);
    database.prepare("UPDATE tenants SET default_provider_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(ollamaId, tenantId);
  }
}

function mapTenant(item: DbRow): TenantRecord {
  return {
    id: stringValue(item.id),
    name: stringValue(item.name),
    soul: stringValue(item.soul),
    generalBehavior: stringValue(item.general_behavior),
    defaultProviderId: nullableString(item.default_provider_id),
  };
}

function mapProvider(item: DbRow): ProviderRecord {
  return {
    id: stringValue(item.id),
    tenantId: stringValue(item.tenant_id),
    kind: providerKindValue(item.kind),
    name: stringValue(item.name),
    endpointUrl: nullableString(item.endpoint_url),
    apiKey: nullableString(item.api_key),
    model: stringValue(item.model),
    modelAlias: nullableString(item.model_alias),
    enabled: boolValue(item.enabled),
    createdAt: stringValue(item.created_at),
    updatedAt: stringValue(item.updated_at),
  };
}

export function toPublicProvider(provider: ProviderRecord): PublicProvider {
  const rest = {
    id: provider.id,
    tenantId: provider.tenantId,
    kind: provider.kind,
    name: provider.name,
    endpointUrl: provider.endpointUrl,
    model: provider.model,
    modelAlias: provider.modelAlias,
    enabled: provider.enabled,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
  return { ...rest, hasApiKey: !!provider.apiKey };
}

function mapSessionUser(item: DbRow): SessionUser {
  return {
    id: stringValue(item.id),
    tenantId: stringValue(item.tenant_id),
    tenantName: stringValue(item.tenant_name),
    email: stringValue(item.email),
    name: stringValue(item.name),
    role: roleValue(item.role),
  };
}

function mapUser(item: DbRow): UserRecord {
  return {
    ...mapSessionUser(item),
    modelOverrideProviderId: nullableString(item.model_override_provider_id),
  };
}

function mapConversation(item: DbRow): ConversationRecord {
  return {
    id: stringValue(item.id),
    title: stringValue(item.title),
    createdAt: stringValue(item.created_at),
    updatedAt: stringValue(item.updated_at),
  };
}

function mapMessage(item: DbRow): MessageRecord {
  return {
    id: stringValue(item.id),
    conversationId: stringValue(item.conversation_id),
    role: item.role === "system" || item.role === "assistant" ? item.role : "user",
    content: stringValue(item.content),
    createdAt: stringValue(item.created_at),
  };
}

function mapUserMemory(item: DbRow): UserMemoryRecord {
  return {
    id: stringValue(item.id),
    tenantId: stringValue(item.tenant_id),
    userId: stringValue(item.user_id),
    type: memoryTypeValue(item.type),
    content: stringValue(item.content),
    tags: stringValue(item.tags),
    summary: stringValue(item.summary),
    createdAt: stringValue(item.created_at),
    updatedAt: stringValue(item.updated_at),
    userName: nullableString(item.user_name) ?? undefined,
  };
}

function mapOrgMemory(item: DbRow): OrgMemoryRecord {
  const sourceType = item.source_type === "markdown" || item.source_type === "link" || item.source_type === "pdf" || item.source_type === "image" ? item.source_type : "text";
  return {
    id: stringValue(item.id),
    tenantId: stringValue(item.tenant_id),
    title: stringValue(item.title),
    sourceType,
    content: stringValue(item.content),
    url: nullableString(item.url),
    filePath: nullableString(item.file_path),
    fileName: nullableString(item.file_name),
    mimeType: nullableString(item.mime_type),
    tags: stringValue(item.tags),
    summary: stringValue(item.summary),
    createdBy: stringValue(item.created_by),
    createdAt: stringValue(item.created_at),
    updatedAt: stringValue(item.updated_at),
  };
}

function mapBehaviorMemory(item: DbRow): BehaviorMemoryRecord {
  return {
    id: stringValue(item.id),
    tenantId: stringValue(item.tenant_id),
    content: stringValue(item.content),
    tags: stringValue(item.tags),
    summary: stringValue(item.summary),
    createdAt: stringValue(item.created_at),
    updatedAt: stringValue(item.updated_at),
  };
}

function mapLiveLinkExtraction(item: DbRow): LiveLinkExtractionRecord {
  return {
    id: stringValue(item.id),
    conversationId: stringValue(item.conversation_id),
    url: stringValue(item.url),
    status: liveLinkStatusValue(item.status),
    content: stringValue(item.content),
    error: nullableString(item.error),
    fetchedAt: stringValue(item.fetched_at),
    createdAt: stringValue(item.created_at),
    updatedAt: stringValue(item.updated_at),
  };
}

export function findUserByEmail(email: string) {
  const item = row(
    getDb()
      .prepare(
        `SELECT users.*, tenants.name AS tenant_name
         FROM users
         JOIN tenants ON tenants.id = users.tenant_id
         WHERE lower(users.email) = lower(?)`,
      )
      .get(email.trim()),
  );
  return item ? mapUser(item) : null;
}

export function findSessionByTokenHash(tokenHash: string) {
  const item = row(
    getDb()
      .prepare(
        `SELECT users.id, users.tenant_id, users.email, users.name, users.role, tenants.name AS tenant_name
         FROM auth_sessions
         JOIN users ON users.id = auth_sessions.user_id
         JOIN tenants ON tenants.id = auth_sessions.tenant_id
         WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > datetime('now')`,
      )
      .get(tokenHash),
  );
  return item ? mapSessionUser(item) : null;
}

export function insertAuthSession(tokenHash: string, user: SessionUser, expiresAt: Date) {
  getDb()
    .prepare("INSERT INTO auth_sessions (id, token_hash, tenant_id, user_id, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), tokenHash, user.tenantId, user.id, expiresAt.toISOString());
}

export function deleteAuthSession(tokenHash: string) {
  getDb().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
}

export function getTenant(tenantId: string) {
  const item = row(getDb().prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId));
  return item ? mapTenant(item) : null;
}

export function listUsers(tenantId: string) {
  return rows(
    getDb()
      .prepare(
        `SELECT users.*, tenants.name AS tenant_name
         FROM users
         JOIN tenants ON tenants.id = users.tenant_id
         WHERE users.tenant_id = ?
         ORDER BY role ASC, name ASC`,
      )
      .all(tenantId),
  ).map(mapUser);
}

export function updateUserModelOverride(tenantId: string, userId: string, providerId: string | null) {
  getDb()
    .prepare("UPDATE users SET model_override_provider_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
    .run(providerId, userId, tenantId);
}

export function listProviders(tenantId: string) {
  return rows(getDb().prepare("SELECT * FROM providers WHERE tenant_id = ? ORDER BY enabled DESC, name ASC").all(tenantId)).map(mapProvider);
}

export function getProvider(tenantId: string, providerId: string) {
  const item = row(getDb().prepare("SELECT * FROM providers WHERE tenant_id = ? AND id = ?").get(tenantId, providerId));
  return item ? mapProvider(item) : null;
}

export function upsertProvider(tenantId: string, values: Partial<ProviderRecord> & { id?: string; kind: ProviderKind; name: string; model: string }) {
  const id = values.id || randomUUID();
  const existing = values.id ? getProvider(tenantId, values.id) : null;
  if (existing) {
    getDb()
      .prepare(
        `UPDATE providers
         SET kind = ?, name = ?, endpoint_url = ?, api_key = ?, model = ?, model_alias = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
      )
      .run(values.kind, values.name, values.endpointUrl ?? null, values.apiKey ?? null, values.model, values.modelAlias ?? null, values.enabled === false ? 0 : 1, id, tenantId);
    return id;
  }
  getDb()
    .prepare(
      `INSERT INTO providers (id, tenant_id, kind, name, endpoint_url, api_key, model, model_alias, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, tenantId, values.kind, values.name, values.endpointUrl ?? null, values.apiKey ?? null, values.model, values.modelAlias ?? null, values.enabled === false ? 0 : 1);
  return id;
}

export function deleteProvider(tenantId: string, providerId: string) {
  const database = getDb();
  database.prepare("UPDATE tenants SET default_provider_id = NULL WHERE id = ? AND default_provider_id = ?").run(tenantId, providerId);
  database.prepare("UPDATE users SET model_override_provider_id = NULL WHERE tenant_id = ? AND model_override_provider_id = ?").run(tenantId, providerId);
  database.prepare("DELETE FROM providers WHERE tenant_id = ? AND id = ?").run(tenantId, providerId);
}

export function setTenantSettings(tenantId: string, values: { soul: string; generalBehavior: string; defaultProviderId: string | null }) {
  getDb()
    .prepare("UPDATE tenants SET soul = ?, general_behavior = ?, default_provider_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(values.soul, values.generalBehavior, values.defaultProviderId, tenantId);
}

export function resolveProviderForUser(user: SessionUser, requestedProviderId?: string | null) {
  const database = getDb();
  const fullUser = row(database.prepare("SELECT model_override_provider_id FROM users WHERE id = ? AND tenant_id = ?").get(user.id, user.tenantId));
  const tenant = getTenant(user.tenantId);
  const providerId = user.role === "admin" && requestedProviderId
    ? requestedProviderId
    : nullableString(fullUser?.model_override_provider_id) ?? tenant?.defaultProviderId ?? null;
  if (!providerId) return null;
  const provider = getProvider(user.tenantId, providerId);
  return provider?.enabled ? provider : null;
}

export function listConversations(user: SessionUser) {
  return rows(
    getDb()
      .prepare("SELECT id, title, created_at, updated_at FROM conversations WHERE tenant_id = ? AND user_id = ? ORDER BY updated_at DESC")
      .all(user.tenantId, user.id),
  ).map(mapConversation);
}

export function createConversation(user: SessionUser, title = "Nova conversa") {
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO conversations (id, tenant_id, user_id, title) VALUES (?, ?, ?, ?)")
    .run(id, user.tenantId, user.id, title);
  return id;
}

export function getConversation(user: SessionUser, conversationId: string) {
  const item = row(
    getDb()
      .prepare("SELECT * FROM conversations WHERE tenant_id = ? AND user_id = ? AND id = ?")
      .get(user.tenantId, user.id, conversationId),
  );
  return item ? mapConversation(item) : null;
}

export function deleteConversation(user: SessionUser, conversationId: string) {
  getDb()
    .prepare("DELETE FROM conversations WHERE tenant_id = ? AND user_id = ? AND id = ?")
    .run(user.tenantId, user.id, conversationId);
}

export function listMessages(user: SessionUser, conversationId: string) {
  const conversation = getConversation(user, conversationId);
  if (!conversation) return [];
  return rows(
    getDb()
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(conversationId),
  ).map(mapMessage);
}

export function insertMessage(conversationId: string, role: MessageRecord["role"], content: string) {
  const id = randomUUID();
  getDb().prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)").run(id, conversationId, role, content);
  return id;
}

export function listLiveLinkExtractions(conversationId: string) {
  return rows(
    getDb()
      .prepare("SELECT * FROM live_link_extractions WHERE conversation_id = ? ORDER BY fetched_at ASC")
      .all(conversationId),
  ).map(mapLiveLinkExtraction);
}

export function getLiveLinkExtraction(conversationId: string, url: string) {
  const normalizedUrl = normalizeLiveLinkUrl(url);
  if (!normalizedUrl) return null;
  const item = row(
    getDb()
      .prepare("SELECT * FROM live_link_extractions WHERE conversation_id = ? AND url = ?")
      .get(conversationId, normalizedUrl),
  );
  return item ? mapLiveLinkExtraction(item) : null;
}

export function upsertLiveLinkExtraction(
  conversationId: string,
  values: { url: string; status: LiveLinkExtractionRecord["status"]; content?: string; error?: string | null },
) {
  const normalizedUrl = normalizeLiveLinkUrl(values.url);
  if (!normalizedUrl) return null;
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO live_link_extractions (id, conversation_id, url, status, content, error, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(conversation_id, url) DO UPDATE SET
         status = excluded.status,
         content = excluded.content,
         error = excluded.error,
         fetched_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(id, conversationId, normalizedUrl, values.status, values.content ?? "", values.error ?? null);
  return getLiveLinkExtraction(conversationId, normalizedUrl);
}

export function updateConversationAfterMessage(conversationId: string, title?: string) {
  getDb()
    .prepare("UPDATE conversations SET title = COALESCE(?, title), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(title ?? null, conversationId);
}

export function listUserMemories(user: SessionUser, targetUserId?: string) {
  const params: string[] = [user.tenantId];
  let sql = `
    SELECT user_memories.*, users.name AS user_name
    FROM user_memories
    JOIN users ON users.id = user_memories.user_id
    WHERE user_memories.tenant_id = ?`;
  if (user.role !== "admin") {
    sql += " AND user_memories.user_id = ?";
    params.push(user.id);
  } else if (targetUserId) {
    sql += " AND user_memories.user_id = ?";
    params.push(targetUserId);
  }
  sql += " ORDER BY user_memories.updated_at DESC";
  return rows(getDb().prepare(sql).all(...params)).map(mapUserMemory);
}

export function upsertUserMemory(user: SessionUser, values: { id?: string; userId?: string; type: MemoryType; content: string; tags?: string; summary?: string }) {
  const targetUserId = user.role === "admin" && values.userId ? values.userId : user.id;
  const id = values.id || randomUUID();
  const existing = values.id
    ? row(getDb().prepare("SELECT id, user_id FROM user_memories WHERE id = ? AND tenant_id = ?").get(values.id, user.tenantId))
    : null;
  if (existing) {
    if (user.role !== "admin" && stringValue(existing.user_id) !== user.id) return null;
    getDb()
      .prepare("UPDATE user_memories SET type = ?, content = ?, tags = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
      .run(values.type, values.content, values.tags ?? "", values.summary ?? "", id, user.tenantId);
    return id;
  }
  getDb()
    .prepare("INSERT INTO user_memories (id, tenant_id, user_id, type, content, tags, summary) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, user.tenantId, targetUserId, values.type, values.content, values.tags ?? "", values.summary ?? "");
  return id;
}

export function deleteUserMemory(user: SessionUser, memoryId: string) {
  const existing = row(getDb().prepare("SELECT user_id FROM user_memories WHERE id = ? AND tenant_id = ?").get(memoryId, user.tenantId));
  if (!existing) return;
  if (user.role !== "admin" && stringValue(existing.user_id) !== user.id) return;
  getDb().prepare("DELETE FROM user_memories WHERE id = ? AND tenant_id = ?").run(memoryId, user.tenantId);
}

export function listOrgMemories(tenantId: string) {
  return rows(getDb().prepare("SELECT * FROM org_memories WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenantId)).map(mapOrgMemory);
}

export function insertOrgMemory(user: SessionUser, values: Omit<OrgMemoryRecord, "id" | "tenantId" | "createdBy" | "createdAt" | "updatedAt">) {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO org_memories (id, tenant_id, title, source_type, content, url, file_path, file_name, mime_type, tags, summary, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, user.tenantId, values.title, values.sourceType, values.content, values.url, values.filePath, values.fileName, values.mimeType, values.tags, values.summary, user.id);
  return id;
}

export function deleteOrgMemory(user: SessionUser, memoryId: string) {
  if (user.role !== "admin") return;
  getDb().prepare("DELETE FROM org_memories WHERE id = ? AND tenant_id = ?").run(memoryId, user.tenantId);
}

export function listBehaviorMemories(tenantId: string) {
  return rows(getDb().prepare("SELECT * FROM behavior_memories WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenantId)).map(mapBehaviorMemory);
}

export function upsertBehaviorMemory(user: SessionUser, values: { id?: string; content: string; tags?: string; summary?: string }) {
  if (user.role !== "admin") return null;
  const id = values.id || randomUUID();
  const existing = values.id ? row(getDb().prepare("SELECT id FROM behavior_memories WHERE id = ? AND tenant_id = ?").get(values.id, user.tenantId)) : null;
  if (existing) {
    getDb()
      .prepare("UPDATE behavior_memories SET content = ?, tags = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
      .run(values.content, values.tags ?? "", values.summary ?? "", id, user.tenantId);
    return id;
  }
  getDb()
    .prepare("INSERT INTO behavior_memories (id, tenant_id, content, tags, summary) VALUES (?, ?, ?, ?, ?)")
    .run(id, user.tenantId, values.content, values.tags ?? "", values.summary ?? "");
  return id;
}

export function deleteBehaviorMemory(user: SessionUser, memoryId: string) {
  if (user.role !== "admin") return;
  getDb().prepare("DELETE FROM behavior_memories WHERE id = ? AND tenant_id = ?").run(memoryId, user.tenantId);
}
