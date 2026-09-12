import { DurableObject } from 'cloudflare:workers';
import { MAX_PACKET_BYTES, PROTOCOL_VERSION, SCHEMA_VERSION, VAULT_QUOTA, project } from '../shared/sync';
import type { CipherBox, Operation } from '../shared/sync';
import { importSecretKey, open, seal, gzipCompress, gzipDecompress, processMcpRpc } from './mcp';
import type { McpContext } from './mcp';

interface Env { SYNC_VAULTS: DurableObjectNamespace<SyncVault>; ASSETS: Fetcher; SYNC_CREATE_CODE?: string }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
const fail = (code: string, status = 400): never => { throw Object.assign(new Error(code), { status }); };
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(id);
const validHash = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{43}$/.test(s);
async function hash(value: string): Promise<string> {
    const data = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function body<T>(req: Request): Promise<T> {
    if (Number(req.headers.get('Content-Length')) > 1024 * 1024) fail('body_too_large', 413);
    const reader = req.body?.getReader(); if (!reader) return fail('missing_body');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1024 * 1024) { await reader.cancel(); fail('body_too_large', 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)) as T; } catch { return fail('invalid_json'); }
}
function checkBox(box: CipherBox, context: string, keyVersion: number) {
    if (!box || box.protocolVersion !== PROTOCOL_VERSION || box.schemaVersion !== SCHEMA_VERSION) fail('upgrade_required', 409);
    if (box.context !== context || box.keyVersion !== keyVersion || !/^[\w-]{16}$/.test(box.iv) || typeof box.ciphertext !== 'string' || !/^[\w-]+$/.test(box.ciphertext) || box.ciphertext.length < 22 || JSON.stringify(box).length > MAX_PACKET_BYTES) fail('invalid_packet');
}

async function handleMcpRequest(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-STT-Version, x-stt-auth',
        'Content-Type': 'application/json',
    };

    let vaultId = url.searchParams.get('vault') || url.searchParams.get('vaultId');
    let deviceId = url.searchParams.get('device') || url.searchParams.get('deviceId');
    let token = url.searchParams.get('token');
    let secretKey = url.searchParams.get('key') || url.searchParams.get('secretKey');

    const rawAuth = url.searchParams.get('auth') || req.headers.get('x-stt-auth') || req.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (rawAuth && rawAuth.includes(':')) {
        const parts = rawAuth.split(':');
        if (parts.length >= 4) {
            [vaultId, deviceId, token, secretKey] = parts;
        }
    }

    if (req.method === 'GET') {
        return new Response(JSON.stringify({
            name: 'Vukuf MCP Server',
            version: '1.0.0',
            status: 'ready',
            authenticated: !!(vaultId && deviceId && token && secretKey),
            transport: 'streamable-http',
        }), { status: 200, headers: corsHeaders });
    }

    let rpcBody: Record<string, unknown>;
    try {
        rpcBody = await req.json() as Record<string, unknown>;
    } catch {
        return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error: Geçersiz JSON gövdesi.' }
        }), { status: 400, headers: corsHeaders });
    }

    if (!vaultId || !deviceId || !token || !secretKey) {
        return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: rpcBody.id ?? null,
            error: {
                code: -32000,
                message: 'Kimlik doğrulama başarısız. Lütfen URL parametresinde (?auth=vaultId:deviceId:token:secretKey) veya Authorization başlığında geçerli kasa erişim bilgilerinizi sağlayın.'
            }
        }), { status: 401, headers: corsHeaders });
    }

    try {
        const stub = env.SYNC_VAULTS.get(env.SYNC_VAULTS.idFromName(vaultId));
        const res = await stub.executeMcp(deviceId, token, secretKey, rpcBody);
        if (!res) {
            return new Response(null, { status: 204, headers: corsHeaders });
        }
        return new Response(JSON.stringify(res), { status: 200, headers: corsHeaders });
    } catch (error) {
        const err = error as Error;
        return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: rpcBody.id ?? null,
            error: { code: -32603, message: `Sunucu hatası: ${err.message}` }
        }), { status: 500, headers: corsHeaders });
    }
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-STT-Version, x-stt-auth',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }
        const url = new URL(req.url);
        if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/') || url.pathname === '/api/mcp') {
            return handleMcpRequest(req, env);
        }
        if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
        try {
            if (!url.pathname.startsWith('/api/sync/')) return json({ error: 'not_found' }, 404);
            if (req.headers.get('Origin') && req.headers.get('Origin') !== url.origin) fail('origin_rejected', 403);
            if (url.pathname === '/api/sync/capabilities') return json({ protocolVersion: 1, schemaVersion: 1, maxPacketBytes: MAX_PACKET_BYTES, creationEnabled: true, serverTime: Date.now() });
            if (req.headers.get('X-STT-Version') !== '1') return json({ error: 'upgrade_required', minVersion: 1 }, 409);
            if (url.pathname === '/api/sync/create' && req.method === 'POST') {
                const input = await body<{ code?: string; vaultId: string; deviceId: string; tokenHash: string; recoveryHash: string }>(req);
                if (env.SYNC_CREATE_CODE && input.code && (await hash(input.code) !== await hash(env.SYNC_CREATE_CODE))) {
                    fail('creation_denied', 403);
                }
                if (![input.vaultId, input.deviceId].every(validId) || !validHash(input.tokenHash) || !validHash(input.recoveryHash)) fail('invalid_identity');
                const clientIp = req.headers.get('CF-Connecting-IP');
                const isLocal = !clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost';
                const registry = env.SYNC_VAULTS.get(env.SYNC_VAULTS.idFromName('registry'));
                await registry.reserve(input.vaultId, isLocal ? 'local' : await hash(clientIp));
                const stub = env.SYNC_VAULTS.get(env.SYNC_VAULTS.idFromName(input.vaultId));
                await stub.initialize(input.vaultId, input.deviceId, input.tokenHash, input.recoveryHash);
                return json({ vaultId: input.vaultId, keyVersion: 1 });
            }
            const match = url.pathname.match(/^\/api\/sync\/vaults\/([\w-]+)(\/.*)?$/);
            if (!match || !validId(match[1])) return fail('not_found', 404);
            return await env.SYNC_VAULTS.get(env.SYNC_VAULTS.idFromName(match[1])).fetch(req);
        } catch (error) {
            const e = error as Error & { status?: number };
            return json({ error: e.status ? e.message : 'server_error' }, e.status ?? 500);
        }
    },
} satisfies ExportedHandler<Env>;

export class SyncVault extends DurableObject<Env> {
    private sql: SqlStorage;
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env); this.sql = ctx.storage.sql;
        this.sql.exec(`CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, vault TEXT, epoch INTEGER, initialized INTEGER, recovery TEXT);
            CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, token TEXT NOT NULL, role TEXT NOT NULL, created INTEGER, seen INTEGER);
            CREATE TABLE IF NOT EXISTS packets (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, count INTEGER, expires INTEGER, done INTEGER, epoch INTEGER, rotate INTEGER, recovery TEXT, expectedSeq INTEGER);
            CREATE TABLE IF NOT EXISTS chunks (upload TEXT, part INTEGER, data TEXT, PRIMARY KEY(upload, part));
            CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, salt TEXT, auth TEXT, data TEXT, expires INTEGER, claimant TEXT, token TEXT);
            CREATE TABLE IF NOT EXISTS rate (id TEXT PRIMARY KEY, count INTEGER, expires INTEGER);
            CREATE TABLE IF NOT EXISTS registry (id TEXT PRIMARY KEY);`);
    }
    async reserve(id: string, ip: string): Promise<void> {
        if (this.sql.exec('SELECT id FROM registry WHERE id = ?', id).toArray().length) return;
        if (ip !== 'local' && ip !== await hash('local')) this.limit(`create:${ip}`, 20, 86400000);
        if (this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM registry').one().n >= 50) fail('installation_quota', 507);
        this.sql.exec('INSERT INTO registry VALUES (?)', id);
    }
    async initialize(vault: string, id: string, token: string, recovery: string): Promise<void> {
        const current = this.sql.exec('SELECT * FROM config').toArray();
        if (current.length) {
            if (!this.sql.exec('SELECT id FROM devices WHERE id = ? AND token = ?', id, token).toArray().length) fail('vault_exists', 409);
            return;
        }
        this.ctx.storage.transactionSync(() => {
            this.sql.exec('INSERT INTO config VALUES (1, ?, 1, 0, ?)', vault, recovery);
            this.sql.exec('INSERT INTO devices VALUES (?, ?, ?, ?, ?)', id, token, 'admin', Date.now(), Date.now());
        });
    }
    private config() { return this.sql.exec<{ vault: string; epoch: number; initialized: number; recovery: string }>('SELECT * FROM config').toArray()[0] ?? fail('vault_not_found', 404); }
    private limit(id: string, max: number, period = 60000) {
        const now = Date.now();
        this.sql.exec('DELETE FROM rate WHERE expires < ?', now);
        const current = this.sql.exec<{ count: number }>('SELECT count FROM rate WHERE id = ?', id).toArray()[0];
        if ((current?.count ?? 0) >= max) fail('rate_limited', 429);
        this.sql.exec('INSERT INTO rate VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1', id, now + period);
    }
    private bytes() { return this.sql.exec<{ n: number }>('SELECT COALESCE((SELECT SUM(LENGTH(data)) FROM packets),0) + COALESCE((SELECT SUM(LENGTH(data)) FROM chunks),0) + COALESCE((SELECT SUM(LENGTH(data)) FROM invites),0) AS n').one().n; }
    async fetch(req: Request): Promise<Response> {
        try {
            let cfg = this.config();
            const path = new URL(req.url).pathname.split(`/vaults/${cfg.vault}`)[1] || '/';
            const now = Date.now();
            this.sql.exec('DELETE FROM chunks WHERE upload IN (SELECT id FROM uploads WHERE expires < ? AND done = 0)', now);
            this.sql.exec('DELETE FROM uploads WHERE expires < ? AND done = 0', now);
            const clientIp = req.headers.get('CF-Connecting-IP');
            const isLocal = !clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost';
            if (!isLocal && clientIp) this.limit(`ip:${await hash(clientIp)}`, 180);
            const inviteMatch = path.match(/^\/invites\/([\w-]+)(\/claim)?$/);
            if (inviteMatch && (req.method === 'GET' || inviteMatch[2])) {
                this.limit('invite-attempts', 30);
                const invite = this.sql.exec<{ id: string; salt: string; auth: string; data: string; expires: number; claimant: string | null; token: string | null }>('SELECT * FROM invites WHERE id = ?', inviteMatch[1]).toArray()[0];
                if (!invite) fail('invite_expired', 410);
                if (req.method === 'GET') return json({ salt: invite.salt, expires: invite.expires, keyVersion: cfg.epoch });
                const input = await body<{ auth: string; deviceId: string; tokenHash: string }>(req);
                if (!validId(input.deviceId) || !validHash(input.tokenHash) || typeof input.auth !== 'string' || await hash(input.auth) !== invite.auth) fail('invite_denied', 403);
                this.ctx.storage.transactionSync(() => {
                    // Re-read after every await: two simultaneous claims must not both win.
                    const latest = this.sql.exec<{ claimant: string | null; token: string | null; expires: number }>('SELECT claimant, token, expires FROM invites WHERE id = ?', invite.id).toArray()[0];
                    if (!latest || latest.expires <= Date.now()) fail('invite_expired', 410);
                    if (latest.claimant && (latest.claimant !== input.deviceId || latest.token !== input.tokenHash)) fail('invite_used', 409);
                    if (!latest.claimant) {
                        if (this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM devices').one().n >= 10) fail('device_limit', 409);
                        this.sql.exec('INSERT INTO devices VALUES (?, ?, ?, ?, ?)', input.deviceId, input.tokenHash, 'write', now, now);
                        this.sql.exec('UPDATE invites SET claimant = ?, token = ? WHERE id = ?', input.deviceId, input.tokenHash, invite.id);
                    }
                });
                return json({ package: JSON.parse(invite.data), keyVersion: cfg.epoch });
            }
            if (path === '/recover' && req.method === 'POST') {
                this.limit('recovery', 5);
                const input = await body<{ token: string; deviceId: string; tokenHash: string }>(req);
                if (!validId(input.deviceId) || !validHash(input.tokenHash) || typeof input.token !== 'string') fail('recovery_denied', 403);
                const recoveryHash = await hash(input.token); cfg = this.config();
                if (recoveryHash !== cfg.recovery) fail('recovery_denied', 403);
                if (!this.sql.exec('SELECT id FROM devices WHERE id = ?', input.deviceId).toArray().length && this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM devices').one().n >= 10) fail('device_limit', 409);
                this.sql.exec('INSERT INTO devices VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET token = excluded.token, role = excluded.role', input.deviceId, input.tokenHash, 'admin', now, now);
                return json({ keyVersion: cfg.epoch });
            }
            const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
            const device = this.sql.exec<{ id: string; role: string }>('SELECT id, role FROM devices WHERE token = ?', await hash(token)).toArray()[0];
            if (!device) fail('device_revoked', 401);
            cfg = this.config();
            const reauthorize = () => { if (!this.sql.exec('SELECT id FROM devices WHERE id = ?', device.id).toArray().length) fail('device_revoked', 401); cfg = this.config(); };
            this.limit(`device:${device.id}`, 60);
            this.sql.exec('UPDATE devices SET seen = ? WHERE id = ?', now, device.id);
            if (path === '/meta' && req.method === 'GET') return json({ protocolVersion: 1, schemaVersion: 1, keyVersion: cfg.epoch, initialized: !!cfg.initialized, headSeq: this.sql.exec<{ n: number }>('SELECT COALESCE(MAX(seq),0) AS n FROM packets').one().n, serverTime: now, bytes: this.bytes(), quota: VAULT_QUOTA });
            if (path === '/devices' && req.method === 'GET') return json(this.sql.exec('SELECT id, role, created, seen FROM devices').toArray());
            if (path === '/devices' && req.method === 'POST') {
                if (device.role !== 'admin') fail('forbidden', 403);
                const input = await body<{ deviceId: string; tokenHash: string; role?: string }>(req);
                if (!validId(input.deviceId) || !validHash(input.tokenHash)) fail('invalid_identity');
                if (this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM devices').one().n >= 20) fail('device_limit', 409);
                this.sql.exec('INSERT INTO devices VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET token = excluded.token, seen = excluded.seen', input.deviceId, input.tokenHash, input.role ?? 'write', now, now);
                return json({ ok: true });
            }
            if (path.startsWith('/devices/') && req.method === 'DELETE') {
                const id = path.slice('/devices/'.length);
                if (device.role !== 'admin' && id !== device.id) fail('forbidden', 403);
                this.sql.exec('DELETE FROM devices WHERE id = ?', id); return json({ ok: true });
            }
            if (path === '/' && req.method === 'DELETE') {
                if (device.role !== 'admin') fail('forbidden', 403);
                // Keep an inaccessible marker: an old creation retry must not recreate this vault.
                this.ctx.storage.transactionSync(() => { for (const table of ['packets', 'chunks', 'uploads', 'invites', 'devices']) this.sql.exec(`DELETE FROM ${table}`); this.sql.exec('UPDATE config SET recovery = ?, initialized = 0', 'deleted'); });
                return json({ ok: true });
            }
            if (path === '/packets' && req.method === 'GET') {
                if (Number(new URL(req.url).searchParams.get('keyVersion')) !== cfg.epoch) fail('key_changed', 409);
                const after = Number(new URL(req.url).searchParams.get('after') ?? 0);
                if (!Number.isSafeInteger(after) || after < 0) fail('invalid_cursor');
                const rows = this.sql.exec<{ seq: number; id: string; data: string }>('SELECT * FROM packets WHERE seq > ? ORDER BY seq LIMIT 4', after).toArray();
                return json({ packets: rows.map(r => ({ seq: r.seq, id: r.id, box: JSON.parse(r.data) })), more: rows.length === 4 });
            }
            if (device.role === 'read') fail('read_only', 403);
            if (path === '/invites' && req.method === 'POST') {
                if (!cfg.initialized) fail('initial_sync_required', 409);
                this.limit('invite-create', 10);
                const input = await body<{ id: string; salt: string; authHash: string; package: CipherBox }>(req);
                reauthorize();
                if (!validId(input.id) || !validHash(input.salt) || !validHash(input.authHash)) fail('invalid_invite');
                checkBox(input.package, `pair:${cfg.vault}:${input.id}`, cfg.epoch);
                if (JSON.stringify(input.package).length > 8192 || this.bytes() + 8192 > VAULT_QUOTA) fail('vault_quota', 507);
                this.sql.exec('INSERT INTO invites VALUES (?, ?, ?, ?, ?, NULL, NULL)', input.id, input.salt, input.authHash, JSON.stringify(input.package), now + 300000);
                return json({ expires: now + 300000 });
            }
            const uploadMatch = path.match(/^\/uploads\/([\w-]+)(?:\/(\d+|commit))?$/);
            if (uploadMatch) {
                const id = uploadMatch[1], part = uploadMatch[2];
                if (!validId(id)) fail('invalid_upload');
                if (!part && req.method === 'POST') {
                    const input = await body<{ count: number; keyVersion: number; rotate?: boolean; recoveryHash?: string; expectedSeq?: number }>(req);
                    reauthorize();
                    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 256) fail('invalid_upload');
                    if (input.rotate && (device.role !== 'admin' || !validHash(input.recoveryHash))) fail('forbidden', 403);
                    const existing = this.sql.exec<{ count: number; epoch: number; done: number }>('SELECT * FROM uploads WHERE id = ?', id).toArray()[0];
                    if (existing && (existing.count !== input.count || existing.epoch !== input.keyVersion)) fail('upload_conflict', 409);
                    if (existing?.done) return json({ complete: true });
                    if (input.keyVersion !== cfg.epoch + (input.rotate ? 1 : 0)) fail('key_changed', 409);
                    if (input.rotate && !Number.isSafeInteger(input.expectedSeq)) fail('missing_revision');
                    if (!existing) {
                        if (this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM uploads WHERE done = 0').one().n >= 3) fail('upload_limit', 409);
                        this.sql.exec('INSERT INTO uploads VALUES (?, ?, ?, 0, ?, ?, ?, ?)', id, input.count, now + 86400000, input.keyVersion, input.rotate ? 1 : 0, input.recoveryHash ?? null, input.expectedSeq ?? null);
                    }
                    return json({ complete: !!existing?.done });
                }
                const upload = this.sql.exec<{ count: number; epoch: number; done: number; rotate: number; recovery: string; expectedSeq: number }>('SELECT * FROM uploads WHERE id = ?', id).toArray()[0];
                if (!upload) fail('upload_expired', 410);
                if (!part && req.method === 'DELETE' && !upload.done) { this.sql.exec('DELETE FROM chunks WHERE upload = ?', id); this.sql.exec('DELETE FROM uploads WHERE id = ?', id); return json({ ok: true }); }
                if (part !== 'commit' && req.method === 'PUT') {
                    if (upload.done) return json({ ok: true });
                    const index = Number(part); if (!Number.isInteger(index) || index < 0 || index >= upload.count) fail('invalid_part');
                    const box = await body<CipherBox>(req); reauthorize();
                    if (upload.epoch !== cfg.epoch + (upload.rotate ? 1 : 0)) fail('key_changed', 409);
                    if (!this.sql.exec('SELECT id FROM uploads WHERE id = ? AND done = 0', id).toArray().length) fail('upload_expired', 410);
                    checkBox(box, `data:${cfg.vault}:${upload.epoch}:${id}:${index}`, upload.epoch);
                    const data = JSON.stringify(box);
                    const prior = this.sql.exec<{ data: string }>('SELECT data FROM chunks WHERE upload = ? AND part = ?', id, index).toArray()[0];
                    if (prior && prior.data !== data) fail('part_conflict', 409);
                    if (!prior && this.bytes() + data.length > VAULT_QUOTA) fail('vault_quota', 507);
                    this.sql.exec('INSERT OR IGNORE INTO chunks VALUES (?, ?, ?)', id, index, data); return json({ ok: true });
                }
                if (part === 'commit' && req.method === 'POST') {
                    if (upload.done) return json({ ok: true, keyVersion: cfg.epoch });
                    if (upload.epoch !== cfg.epoch + (upload.rotate ? 1 : 0)) fail('key_changed', 409);
                    if (upload.rotate && device.role !== 'admin') fail('forbidden', 403);
                    if (upload.rotate && upload.expectedSeq !== this.sql.exec<{ n: number }>('SELECT COALESCE(MAX(seq),0) AS n FROM packets').one().n) fail('rotation_conflict', 409);
                    const chunks = this.sql.exec<{ part: number; data: string }>('SELECT part, data FROM chunks WHERE upload = ? ORDER BY part', id).toArray();
                    if (chunks.length !== upload.count) fail('incomplete_upload', 409);
                    this.ctx.storage.transactionSync(() => {
                        if (upload.rotate) { this.sql.exec('DELETE FROM packets'); this.sql.exec('DELETE FROM invites'); this.sql.exec('DELETE FROM devices WHERE id <> ?', device.id); this.sql.exec('UPDATE config SET epoch = ?, recovery = ?', upload.epoch, upload.recovery); }
                        for (const chunk of chunks) this.sql.exec('INSERT INTO packets (id, data) VALUES (?, ?)', `${id}:${chunk.part}`, chunk.data);
                        this.sql.exec('DELETE FROM chunks WHERE upload = ?', id);
                        this.sql.exec('UPDATE uploads SET done = 1 WHERE id = ?', id);
                        this.sql.exec('UPDATE config SET initialized = 1');
                    });
                    return json({ ok: true, keyVersion: upload.epoch });
                }
            }
            return json({ error: 'not_found' }, 404);
        } catch (error) {
            const e = error as Error & { status?: number };
            return json({ error: e.status ? e.message : 'server_error', ...(e.message === 'upgrade_required' ? { minVersion: 1 } : {}) }, e.status ?? 500);
        }
    }

    async executeMcp(
        deviceId: string,
        token: string,
        secretKey: string,
        rpcPayload: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> {
        const cfg = this.config();
        const tokenHash = await hash(token);
        const device = this.sql.exec<{ id: string; role: string }>(
            'SELECT id, role FROM devices WHERE id = ? AND token = ?',
            deviceId,
            tokenHash
        ).toArray()[0];

        if (!device) {
            return {
                jsonrpc: '2.0',
                id: (rpcPayload.id as string | number) ?? null,
                error: {
                    code: -32000,
                    message: 'Cihaz yetkisi geçersiz veya kaldırılmış (device_revoked).',
                },
            };
        }

        const now = Date.now();
        this.sql.exec('UPDATE devices SET seen = ? WHERE id = ?', now, device.id);

        const key = await importSecretKey(secretKey);

        const rows = this.sql.exec<{ seq: number; id: string; data: string }>(
            'SELECT seq, id, data FROM packets ORDER BY seq'
        ).toArray();

        const allOps: Operation[] = [];
        for (const row of rows) {
            try {
                const box = JSON.parse(row.data) as CipherBox;
                const context = `data:${cfg.vault}:${box.keyVersion}:${row.id}`;
                const decryptedBytes = await open(key, box, context, box.keyVersion);
                const decompressed = await gzipDecompress(decryptedBytes);
                const ops = JSON.parse(new TextDecoder().decode(decompressed)) as Operation[];
                if (Array.isArray(ops)) {
                    allOps.push(...ops);
                }
            } catch {
                // Ignore unreadable or corrupted packet
            }
        }

        const projection = project(allOps);

        const commitOps = async (newOps: Operation[]) => {
            if (!newOps.length) return;
            if (device.role === 'read') throw new Error('Bu cihaz salt-okunur yetkiye sahip.');

            const payloadBytes = new TextEncoder().encode(JSON.stringify(newOps));
            const compressed = await gzipCompress(payloadBytes);
            const packetId = `${crypto.randomUUID()}:0`;
            const context = `data:${cfg.vault}:${cfg.epoch}:${packetId}`;
            const box = await seal(key, compressed, context, cfg.epoch);

            this.ctx.storage.transactionSync(() => {
                this.sql.exec('INSERT INTO packets (id, data) VALUES (?, ?)', packetId, JSON.stringify(box));
                this.sql.exec('UPDATE config SET initialized = 1');
            });
        };

        const ctx: McpContext = {
            vaultId: cfg.vault,
            deviceId: device.id,
            keyVersion: cfg.epoch,
            key,
            allOps,
            projection,
            commitOps,
        };

        return await processMcpRpc(rpcPayload, ctx);
    }
}
