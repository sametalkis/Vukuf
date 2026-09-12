export const PROTOCOL_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const MAX_PACKET_BYTES = 512 * 1024;
export const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export const VAULT_QUOTA = 20 * 1024 * 1024;

export interface ActivityValue { id: string; name: string; color: string; icon: string }
export interface SessionValue { id: string; recordTypeId: string; startTime: string; endTime?: string; duration?: number }
export type EntityValue = ActivityValue | SessionValue;
export interface Operation {
    id: string;
    entity: 'activity' | 'session';
    entityId: string;
    parents: string[];
    deviceId: string;
    createdAt: string;
    value: EntityValue | null;
}
export interface Conflict {
    key: string;
    heads: Operation[];
    base: EntityValue | null;
}
export interface Projection {
    recordTypes: ActivityValue[];
    records: (SessionValue & { endTime: string; duration: number })[];
    runningRecord: SessionValue | null;
    conflicts: Conflict[];
    activeSessions: SessionValue[];
}
export interface CipherBox {
    protocolVersion: number;
    schemaVersion: number;
    keyVersion: number;
    context: string;
    iv: string;
    ciphertext: string;
}
export const entityKey = (op: Pick<Operation, 'entity' | 'entityId'>) => `${op.entity}:${op.entityId}`;
export const equalValue = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}
export function validateOperation(input: unknown): asserts input is Operation {
    const o = input as Operation;
    if (!o || typeof o.id !== 'string' || !o.id || o.id.length > 150 || !['activity', 'session'].includes(o.entity) || typeof o.entityId !== 'string' || !o.entityId || o.entityId.length > 200 || typeof o.deviceId !== 'string' || !Array.isArray(o.parents) || o.parents.length > 100 || o.parents.some(p => typeof p !== 'string' || p === o.id) || typeof o.createdAt !== 'string' || !Number.isFinite(Date.parse(o.createdAt))) throw new Error('Geçersiz eşitleme işlemi.');
    if (o.value === null) return;
    if (!o.value || o.value.id !== o.entityId) throw new Error('Kayıt kimliği uyuşmuyor.');
    if (o.entity === 'activity') {
        const v = o.value as ActivityValue;
        if ([v.name, v.icon, v.color].some(x => typeof x !== 'string' || x.length > 2000) || !/^#[\da-f]{6}$/i.test(v.color)) throw new Error('Geçersiz aktivite.');
    } else {
        const v = o.value as SessionValue;
        if (typeof v.recordTypeId !== 'string' || !Number.isFinite(Date.parse(v.startTime))) throw new Error('Geçersiz oturum.');
        if (v.endTime !== undefined && (!Number.isFinite(Date.parse(v.endTime)) || Date.parse(v.endTime) < Date.parse(v.startTime) || typeof v.duration !== 'number' || !Number.isFinite(v.duration) || v.duration < 0)) throw new Error('Oturumun bitiş zamanı geçersiz.');
    }
}

export function headsFor(ops: Operation[]): Operation[] {
    const parents = new Set(ops.flatMap(o => o.parents));
    return ops.filter(o => !parents.has(o.id)).sort((a, b) => a.id.localeCompare(b.id));
}

// Parent links describe causality. Neither wall-clock time nor arrival order
// chooses a winner. All revisions (including tombstones) remain recoverable.
export function project(operations: Operation[]): Projection {
    const groups = new Map<string, Operation[]>();
    for (const op of operations) {
        const key = entityKey(op);
        const group = groups.get(key);
        if (group) group.push(op); else groups.set(key, [op]);
    }
    const result: Projection = { recordTypes: [], records: [], runningRecord: null, conflicts: [], activeSessions: [] };
    for (const [key, ops] of groups) {
        const heads = headsFor(ops);
        if (!heads.length) continue;
        let value = heads[0].value;
        if (heads.some(h => !equalValue(h.value, value))) {
            // Auto-reconciliation: If this is a session where start & end times match, it is the same historical session
            const validSessions = heads.map(h => h.value as SessionValue | null).filter((v): v is SessionValue => !!v);
            const isIdenticalSession = heads[0].entity === 'session' &&
                validSessions.length === heads.length &&
                validSessions.every(s => s.startTime === validSessions[0].startTime && s.endTime === validSessions[0].endTime);

            // Auto-reconciliation: If activities have the exact same name (case-insensitive)
            const validActivities = heads.map(h => h.value as ActivityValue | null).filter((v): v is ActivityValue => !!v);
            const isIdenticalActivity = heads[0].entity === 'activity' &&
                validActivities.length === heads.length &&
                validActivities.every(a => a.name.trim().toLowerCase() === validActivities[0].name.trim().toLowerCase());

            if (isIdenticalSession || isIdenticalActivity) {
                value = heads[0].value;
            } else {
                const byId = new Map(ops.map(o => [o.id, o]));
                const ancestors = (head: Operation) => {
                    const found = new Set<string>();
                    const todo = [...head.parents];
                    while (todo.length) {
                        const id = todo.pop()!;
                        if (found.has(id)) continue;
                        found.add(id);
                        todo.push(...(byId.get(id)?.parents ?? []));
                    }
                    return found;
                };
                const sets = heads.map(ancestors);
                const common = ops.filter(o => sets.every(s => s.has(o.id)));
                const bases = headsFor(common);
                value = bases.length === 1 ? bases[0].value : null;
                result.conflicts.push({ key, heads, base: value });
                // A concurrent stop must never resurrect a running timer.
                if (heads[0].entity === 'session' && heads.some(h => h.value === null || (h.value as SessionValue).endTime)) {
                    if (!(value as SessionValue | null)?.endTime) value = null;
                }
            }
        }
        if (!value) continue;
        if (heads[0].entity === 'activity') result.recordTypes.push(value as ActivityValue);
        else {
            const session = value as SessionValue;
            if (session.endTime !== undefined) result.records.push(session as Projection['records'][number]);
            else result.activeSessions.push(session);
        }
    }
    result.recordTypes.sort((a, b) => a.id.localeCompare(b.id));
    result.records.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
    // Multiple offline timers are preserved for explicit user resolution.
    result.activeSessions.sort((a, b) => a.id.localeCompare(b.id));
    result.runningRecord = result.activeSessions[0] ?? null;
    return result;
}
