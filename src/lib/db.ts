import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Pool, type QueryResultRow } from "@neondatabase/serverless";

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

export type UserWithPasswordRecord = UserRecord & {
  passwordHash: string;
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
  sourceType: "text" | "link" | "pdf" | "image";
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

type DbRow = QueryResultRow;

export const DATA_DIR =
  process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
    ? "/tmp/nexus-data"
    : path.join(process.cwd(), "data");

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const valueString = stringValue(value);
  return valueString.length > 0 ? valueString : null;
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
  return value === true || value === 1 || value === "1";
}

function liveLinkStatusValue(value: unknown): LiveLinkExtractionRecord["status"] {
  return value === "success" ? "success" : "failed";
}

async function one<T extends DbRow = DbRow>(sql: string, params: unknown[] = []) {
  const result = await (await getDb()).query<T>(sql, params);
  return result.rows[0] ?? null;
}

async function many<T extends DbRow = DbRow>(sql: string, params: unknown[] = []) {
  const result = await (await getDb()).query<T>(sql, params);
  return result.rows;
}

async function exec(sql: string, params: unknown[] = []) {
  await (await getDb()).query(sql, params);
}

async function initialize(database: Pool) {
  mkdirSync(DATA_DIR, { recursive: true });
  const schema = readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8");
  await database.query(schema);
  await seed(database);
}

export async function getDb() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for Neon PostgreSQL.");
    }
    pool = new Pool({ connectionString });
  }
  initPromise ??= initialize(pool);
  await initPromise;
  return pool;
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

async function seed(database: Pool) {
  const tenant = await database.query<{ id: string }>(
    `INSERT INTO tenants (name, soul, general_behavior)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [
      "Festpay",
      "Você é o Nexus da Festpay. Responda em português do Brasil, com objetividade, clareza e foco em operações financeiras.",
      "Priorize respostas práticas, cite incertezas e evite inventar políticas internas.",
    ],
  );
  const tenantId = tenant.rows[0].id;
  const adminPasswordHash = await bcrypt.hash("admin123", 12);
  const userPasswordHash = await bcrypt.hash("user123", 12);

  await database.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = CASE WHEN users.password_hash = '' THEN EXCLUDED.password_hash ELSE users.password_hash END,
       updated_at = NOW()`,
    [tenantId, "admin@festpay.local", "Administrador", "admin", adminPasswordHash],
  );

  await database.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = CASE WHEN users.password_hash = '' THEN EXCLUDED.password_hash ELSE users.password_hash END,
       updated_at = NOW()`,
    [tenantId, "usuario@festpay.local", "Usuário", "user", userPasswordHash],
  );

  const providerCount = await database.query<{ total: string }>("SELECT COUNT(*) AS total FROM providers WHERE tenant_id = $1", [tenantId]);
  if (Number(providerCount.rows[0]?.total ?? 0) > 0) return;

  const ollamaId = randomUUID();
  await database.query(
    `INSERT INTO providers (id, tenant_id, kind, name, endpoint_url, api_key, model, model_alias, enabled)
     VALUES
       (gen_random_uuid(), $1, 'openai', 'OpenAI', NULL, '', 'gpt-4o-mini', 'GPT-4o Mini', false),
       (gen_random_uuid(), $1, 'anthropic', 'Anthropic', NULL, '', 'claude-sonnet-4', 'Claude Sonnet 4', false),
       (gen_random_uuid(), $1, 'google', 'Google', NULL, '', 'gemini-2.0-flash', 'Gemini Flash', false),
       ($2, $1, 'ollama', 'Ollama local', 'http://localhost:11434', '', 'llama3.2', 'Llama 3.2', true)`,
    [tenantId, ollamaId],
  );
  await database.query("UPDATE tenants SET default_provider_id = $1, updated_at = NOW() WHERE id = $2", [ollamaId, tenantId]);
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

function mapUserWithPassword(item: DbRow): UserWithPasswordRecord {
  return {
    ...mapUser(item),
    passwordHash: stringValue(item.password_hash),
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
  const sourceType = item.source_type === "link" || item.source_type === "pdf" || item.source_type === "image" ? item.source_type : "text";
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

export async function findUserByEmail(email: string) {
  const item = await one(
    `SELECT users.*, tenants.name AS tenant_name
     FROM users
     JOIN tenants ON tenants.id = users.tenant_id
     WHERE lower(users.email) = lower($1)`,
    [email.trim()],
  );
  return item ? mapUserWithPassword(item) : null;
}

export async function getTenant(tenantId: string) {
  const item = await one("SELECT * FROM tenants WHERE id = $1", [tenantId]);
  return item ? mapTenant(item) : null;
}

export async function listUsers(tenantId: string) {
  const items = await many(
    `SELECT users.*, tenants.name AS tenant_name
     FROM users
     JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.tenant_id = $1
     ORDER BY role ASC, name ASC`,
    [tenantId],
  );
  return items.map(mapUser);
}

export async function updateUserModelOverride(tenantId: string, userId: string, providerId: string | null) {
  await exec("UPDATE users SET model_override_provider_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3", [providerId, userId, tenantId]);
}

export async function listProviders(tenantId: string) {
  return (await many("SELECT * FROM providers WHERE tenant_id = $1 ORDER BY enabled DESC, name ASC", [tenantId])).map(mapProvider);
}

export async function getProvider(tenantId: string, providerId: string) {
  const item = await one("SELECT * FROM providers WHERE tenant_id = $1 AND id = $2", [tenantId, providerId]);
  return item ? mapProvider(item) : null;
}

export async function upsertProvider(tenantId: string, values: Partial<ProviderRecord> & { id?: string; kind: ProviderKind; name: string; model: string }) {
  const id = values.id || randomUUID();
  const existing = values.id ? await getProvider(tenantId, values.id) : null;
  if (existing) {
    await exec(
      `UPDATE providers
       SET kind = $1, name = $2, endpoint_url = $3, api_key = $4, model = $5, model_alias = $6, enabled = $7, updated_at = NOW()
       WHERE id = $8 AND tenant_id = $9`,
      [values.kind, values.name, values.endpointUrl ?? null, values.apiKey ?? null, values.model, values.modelAlias ?? null, values.enabled !== false, id, tenantId],
    );
    return id;
  }
  await exec(
    `INSERT INTO providers (id, tenant_id, kind, name, endpoint_url, api_key, model, model_alias, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, tenantId, values.kind, values.name, values.endpointUrl ?? null, values.apiKey ?? null, values.model, values.modelAlias ?? null, values.enabled !== false],
  );
  return id;
}

export async function deleteProvider(tenantId: string, providerId: string) {
  const database = await getDb();
  await database.query("UPDATE tenants SET default_provider_id = NULL WHERE id = $1 AND default_provider_id = $2", [tenantId, providerId]);
  await database.query("UPDATE users SET model_override_provider_id = NULL WHERE tenant_id = $1 AND model_override_provider_id = $2", [tenantId, providerId]);
  await database.query("DELETE FROM providers WHERE tenant_id = $1 AND id = $2", [tenantId, providerId]);
}

export async function setTenantSettings(tenantId: string, values: { soul: string; generalBehavior: string; defaultProviderId: string | null }) {
  await exec(
    "UPDATE tenants SET soul = $1, general_behavior = $2, default_provider_id = $3, updated_at = NOW() WHERE id = $4",
    [values.soul, values.generalBehavior, values.defaultProviderId, tenantId],
  );
}

export async function resolveProviderForUser(user: SessionUser, requestedProviderId?: string | null) {
  const fullUser = await one("SELECT model_override_provider_id FROM users WHERE id = $1 AND tenant_id = $2", [user.id, user.tenantId]);
  const tenant = await getTenant(user.tenantId);
  const providerId = user.role === "admin" && requestedProviderId
    ? requestedProviderId
    : nullableString(fullUser?.model_override_provider_id) ?? tenant?.defaultProviderId ?? null;
  if (!providerId) return null;
  const provider = await getProvider(user.tenantId, providerId);
  return provider?.enabled ? provider : null;
}

export async function listConversations(user: SessionUser) {
  const items = await many(
    "SELECT id, title, created_at, updated_at FROM conversations WHERE tenant_id = $1 AND user_id = $2 ORDER BY updated_at DESC",
    [user.tenantId, user.id],
  );
  return items.map(mapConversation);
}

export async function createConversation(user: SessionUser, title = "Nova conversa") {
  const id = randomUUID();
  await exec("INSERT INTO conversations (id, tenant_id, user_id, title) VALUES ($1, $2, $3, $4)", [id, user.tenantId, user.id, title]);
  return id;
}

export async function getConversation(user: SessionUser, conversationId: string) {
  const item = await one("SELECT * FROM conversations WHERE tenant_id = $1 AND user_id = $2 AND id = $3", [user.tenantId, user.id, conversationId]);
  return item ? mapConversation(item) : null;
}

export async function deleteConversation(user: SessionUser, conversationId: string) {
  await exec("DELETE FROM conversations WHERE tenant_id = $1 AND user_id = $2 AND id = $3", [user.tenantId, user.id, conversationId]);
}

export async function listMessages(user: SessionUser, conversationId: string) {
  const conversation = await getConversation(user, conversationId);
  if (!conversation) return [];
  return (await many("SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC", [conversationId])).map(mapMessage);
}

export async function insertMessage(conversationId: string, role: MessageRecord["role"], content: string) {
  const id = randomUUID();
  await exec("INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)", [id, conversationId, role, content]);
  return id;
}

export async function listLiveLinkExtractions(conversationId: string) {
  return (await many("SELECT * FROM live_link_extractions WHERE conversation_id = $1 ORDER BY fetched_at ASC", [conversationId])).map(mapLiveLinkExtraction);
}

export async function getLiveLinkExtraction(conversationId: string, url: string) {
  const normalizedUrl = normalizeLiveLinkUrl(url);
  if (!normalizedUrl) return null;
  const item = await one("SELECT * FROM live_link_extractions WHERE conversation_id = $1 AND url = $2", [conversationId, normalizedUrl]);
  return item ? mapLiveLinkExtraction(item) : null;
}

export async function upsertLiveLinkExtraction(
  conversationId: string,
  values: { url: string; status: LiveLinkExtractionRecord["status"]; content?: string; error?: string | null },
) {
  const normalizedUrl = normalizeLiveLinkUrl(values.url);
  if (!normalizedUrl) return null;
  const id = randomUUID();
  const item = await one(
    `INSERT INTO live_link_extractions (id, conversation_id, url, status, content, error, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT(conversation_id, url) DO UPDATE SET
       status = EXCLUDED.status,
       content = EXCLUDED.content,
       error = EXCLUDED.error,
       fetched_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [id, conversationId, normalizedUrl, values.status, values.content ?? "", values.error ?? null],
  );
  return item ? mapLiveLinkExtraction(item) : null;
}

export async function updateConversationAfterMessage(conversationId: string, title?: string) {
  await exec("UPDATE conversations SET title = COALESCE($1, title), updated_at = NOW() WHERE id = $2", [title ?? null, conversationId]);
}

export async function listUserMemories(user: SessionUser, targetUserId?: string) {
  const params: string[] = [user.tenantId];
  let sql = `
    SELECT user_memories.*, users.name AS user_name
    FROM user_memories
    JOIN users ON users.id = user_memories.user_id
    WHERE user_memories.tenant_id = $1`;
  if (user.role !== "admin") {
    params.push(user.id);
    sql += ` AND user_memories.user_id = $${params.length}`;
  } else if (targetUserId) {
    params.push(targetUserId);
    sql += ` AND user_memories.user_id = $${params.length}`;
  }
  sql += " ORDER BY user_memories.updated_at DESC";
  return (await many(sql, params)).map(mapUserMemory);
}

export async function upsertUserMemory(user: SessionUser, values: { id?: string; userId?: string; type: MemoryType; content: string; tags?: string; summary?: string }) {
  const targetUserId = user.role === "admin" && values.userId ? values.userId : user.id;
  const id = values.id || randomUUID();
  const existing = values.id
    ? await one("SELECT id, user_id FROM user_memories WHERE id = $1 AND tenant_id = $2", [values.id, user.tenantId])
    : null;
  if (existing) {
    if (user.role !== "admin" && stringValue(existing.user_id) !== user.id) return null;
    await exec(
      "UPDATE user_memories SET type = $1, content = $2, tags = $3, summary = $4, updated_at = NOW() WHERE id = $5 AND tenant_id = $6",
      [values.type, values.content, values.tags ?? "", values.summary ?? "", id, user.tenantId],
    );
    return id;
  }
  await exec(
    "INSERT INTO user_memories (id, tenant_id, user_id, type, content, tags, summary) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, user.tenantId, targetUserId, values.type, values.content, values.tags ?? "", values.summary ?? ""],
  );
  return id;
}

export async function deleteUserMemory(user: SessionUser, memoryId: string) {
  const existing = await one("SELECT user_id FROM user_memories WHERE id = $1 AND tenant_id = $2", [memoryId, user.tenantId]);
  if (!existing) return;
  if (user.role !== "admin" && stringValue(existing.user_id) !== user.id) return;
  await exec("DELETE FROM user_memories WHERE id = $1 AND tenant_id = $2", [memoryId, user.tenantId]);
}

export async function listOrgMemories(tenantId: string) {
  return (await many("SELECT * FROM org_memories WHERE tenant_id = $1 ORDER BY updated_at DESC", [tenantId])).map(mapOrgMemory);
}

export async function insertOrgMemory(user: SessionUser, values: Omit<OrgMemoryRecord, "id" | "tenantId" | "createdBy" | "createdAt" | "updatedAt">) {
  const id = randomUUID();
  await exec(
    `INSERT INTO org_memories (id, tenant_id, title, source_type, content, url, file_path, file_name, mime_type, tags, summary, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, user.tenantId, values.title, values.sourceType, values.content, values.url, values.filePath, values.fileName, values.mimeType, values.tags, values.summary, user.id],
  );
  return id;
}

export async function deleteOrgMemory(user: SessionUser, memoryId: string) {
  if (user.role !== "admin") return;
  await exec("DELETE FROM org_memories WHERE id = $1 AND tenant_id = $2", [memoryId, user.tenantId]);
}

export async function listBehaviorMemories(tenantId: string) {
  return (await many("SELECT * FROM behavior_memories WHERE tenant_id = $1 ORDER BY updated_at DESC", [tenantId])).map(mapBehaviorMemory);
}

export async function upsertBehaviorMemory(user: SessionUser, values: { id?: string; content: string; tags?: string; summary?: string }) {
  if (user.role !== "admin") return null;
  const id = values.id || randomUUID();
  const existing = values.id ? await one("SELECT id FROM behavior_memories WHERE id = $1 AND tenant_id = $2", [values.id, user.tenantId]) : null;
  if (existing) {
    await exec(
      "UPDATE behavior_memories SET content = $1, tags = $2, summary = $3, updated_at = NOW() WHERE id = $4 AND tenant_id = $5",
      [values.content, values.tags ?? "", values.summary ?? "", id, user.tenantId],
    );
    return id;
  }
  await exec(
    "INSERT INTO behavior_memories (id, tenant_id, content, tags, summary) VALUES ($1, $2, $3, $4, $5)",
    [id, user.tenantId, values.content, values.tags ?? "", values.summary ?? ""],
  );
  return id;
}

export async function deleteBehaviorMemory(user: SessionUser, memoryId: string) {
  if (user.role !== "admin") return;
  await exec("DELETE FROM behavior_memories WHERE id = $1 AND tenant_id = $2", [memoryId, user.tenantId]);
}
