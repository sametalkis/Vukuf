import type { StateStorage } from 'zustand/middleware';
import { entityKey, equalValue, headsFor, project, validateOperation } from '../../shared/sync';
import type { EntityValue, Operation, SessionValue } from '../../shared/sync';
import { randomUUID } from './crypto';

const STATE_KEY = 'simple-time-tracker';
type Saved = { state: Record<string, unknown> & { recordTypes?: EntityValue[]; records?: SessionValue[]; runningRecord?: SessionValue | null }; version?: number };
let connection: Promise<IDBDatabase> | undefined;
let baseline: Saved | null = null;
let known: Operation[] = [];
let deviceId = '';
let queue: Promise<void> = Promise.resolve();
let suppress = false;
export const storageEvents = new EventTarget();
export let hydrationError: string | null = null;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stt-storage-v1') : null;
export const request = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
});
export const completed = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Yerel kayıt tamamlanamadı.'));
});
export function database(): Promise<IDBDatabase> {
    if (!connection) connection = new Promise((resolve, reject) => {
        const req = indexedDB.open('simple-time-tracker-db', 2);
        req.onupgradeneeded = () => {
            for (const name of ['keyval', 'ops', 'outbox', 'meta', 'backups']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
        };
        req.onblocked = () => storageEvents.dispatchEvent(new CustomEvent('error', { detail: 'Diğer uygulama sekmelerini kapatıp yeniden deneyin.' }));
        req.onerror = () => { connection = undefined; reject(req.error); };
        req.onsuccess = () => {
            req.result.onversionchange = () => { req.result.close(); connection = undefined; };
            resolve(req.result);
        };
    });
    return connection;
}
export async function getMeta<T>(key: string): Promise<T | undefined> {
    return request((await database()).transaction('meta').objectStore('meta').get(key));
}
export async function setMeta(key: string, value: unknown): Promise<void> {
    const tx = (await database()).transaction('meta', 'readwrite'); const done = completed(tx);
    if (value === undefined) tx.objectStore('meta').delete(key); else tx.objectStore('meta').put(value, key);
    await done;
}
function entities(saved: Saved): Map<string, EntityValue> {
    const map = new Map<string, EntityValue>();
    for (const v of saved.state.recordTypes ?? []) map.set(`activity:${v.id}`, v);
    for (const v of saved.state.records ?? []) map.set(`session:${v.id}`, v);
    if (saved.state.runningRecord) map.set(`session:${saved.state.runningRecord.id}`, saved.state.runningRecord);
    return map;
}
function withProjection(saved: Saved, ops: Operation[]): Saved {
    const { recordTypes, records, runningRecord } = project(ops);
    return { ...saved, state: { ...saved.state, recordTypes, records, runningRecord } };
}
export async function allOperations(): Promise<Operation[]> {
    return request((await database()).transaction('ops').objectStore('ops').getAll());
}
export async function pendingOperations(): Promise<Operation[]> {
    await queue; return request((await database()).transaction('outbox').objectStore('outbox').getAll());
}
export async function acknowledge(ids: string[]): Promise<void> {
    const tx = (await database()).transaction('outbox', 'readwrite'); const done = completed(tx);
    ids.forEach(id => tx.objectStore('outbox').delete(id)); await done;
}
export async function backupLocal(label: string): Promise<void> {
    await queue;
    const tx = (await database()).transaction(['keyval', 'backups'], 'readwrite'); const done = completed(tx);
    const raw = await request(tx.objectStore('keyval').get(STATE_KEY));
    tx.objectStore('backups').put(raw, `${label}:${Date.now()}`); await done;
}
export async function latestBackup(): Promise<string | undefined> {
    return request((await database()).transaction('backups').objectStore('backups').get('before-sync-migration'));
}
async function migrate(): Promise<void> {
    const db = await database();
    // A frozen source and cursor checks also serialize migration on browsers
    // without Web Locks. No tab can overwrite a completed migration.
    const setup = db.transaction(['meta', 'keyval', 'backups'], 'readwrite'); const setupDone = completed(setup);
    const [finished, frozen, stored, priorDevice] = await Promise.all([
        request(setup.objectStore('meta').get('migrationComplete')),
        request<string | undefined>(setup.objectStore('backups').get('before-sync-migration')),
        request<string | undefined>(setup.objectStore('keyval').get(STATE_KEY)),
        request<string | undefined>(setup.objectStore('meta').get('deviceId')),
    ]);
    if (finished) { await setupDone; return; }
    const raw = frozen ?? stored ?? localStorage.getItem(STATE_KEY) ?? JSON.stringify({ state: { recordTypes: [], records: [], runningRecord: null }, version: 0 });
    const migrationDevice = priorDevice ?? randomUUID();
    setup.objectStore('meta').put(migrationDevice, 'deviceId');
    setup.objectStore('backups').put(raw, 'before-sync-migration'); await setupDone;
    const saved = JSON.parse(raw) as Saved;
    if (!saved.state || !Array.isArray(saved.state.records) || !Array.isArray(saved.state.recordTypes)) throw new Error('Yerel veri biçimi geçersiz. Veriler değiştirilmedi.');
    const items = [...entities(saved)];
    for (let cursor = (await getMeta<number>('migrationCursor')) ?? 0; cursor < items.length; cursor += 200) {
        const batch: Operation[] = items.slice(cursor, cursor + 200).map(([key, value]) => ({ id: randomUUID(), entity: key.startsWith('activity:') ? 'activity' : 'session', entityId: value.id, parents: [], deviceId: migrationDevice, createdAt: new Date().toISOString(), value }));
        batch.forEach(validateOperation);
        const tx = db.transaction(['ops', 'outbox', 'meta', 'backups'], 'readwrite'); const done = completed(tx);
        const currentCursor = (await request<number | undefined>(tx.objectStore('meta').get('migrationCursor'))) ?? 0;
        if (currentCursor > cursor) { await done; continue; }
        if (currentCursor !== cursor) { tx.abort(); await done.catch(() => undefined); throw new Error('Geçiş konumu değişti; yeniden deneyin.'); }
        tx.objectStore('backups').put(raw, 'before-sync-migration');
        for (const op of batch) { tx.objectStore('ops').put(op, op.id); tx.objectStore('outbox').put(op, op.id); }
        tx.objectStore('meta').put(cursor + batch.length, 'migrationCursor'); await done;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    const tx = db.transaction(['ops', 'meta', 'keyval', 'backups'], 'readwrite'); const done = completed(tx);
    const [alreadyFinished, ops] = await Promise.all([request(tx.objectStore('meta').get('migrationComplete')), request<Operation[]>(tx.objectStore('ops').getAll())]);
    if (alreadyFinished) { await done; return; }
    const values = new Map(ops.map(o => [entityKey(o), o.value]));
    if (ops.length !== items.length || items.some(([key, value]) => !equalValue(values.get(key), value))) { tx.abort(); await done.catch(() => undefined); throw new Error('Veri geçişi doğrulanamadı. Eski kopya korunuyor.'); }
    tx.objectStore('backups').put(raw, 'before-sync-migration'); tx.objectStore('keyval').put(raw, STATE_KEY);
    tx.objectStore('meta').put(true, 'migrationComplete'); await done;
}
export async function refreshLocal(): Promise<Saved | null> {
    await queue;
    const tx = (await database()).transaction(['ops', 'keyval']);
    const [ops, raw] = await Promise.all([request<Operation[]>(tx.objectStore('ops').getAll()), request<string | undefined>(tx.objectStore('keyval').get(STATE_KEY))]);
    known = ops; if (raw) baseline = JSON.parse(raw) as Saved;
    return baseline;
}
export function withoutPersistence(fn: () => void): void { suppress = true; try { fn(); } finally { suppress = false; } }
function notify() { channel?.postMessage('changed'); storageEvents.dispatchEvent(new Event('changed')); }
channel?.addEventListener('message', () => storageEvents.dispatchEvent(new Event('changed')));

async function commit(ops: Operation[], local: boolean, saved?: Saved, cursor?: number, expected?: { key: string; heads: string[] }): Promise<void> {
    ops.forEach(validateOperation);
    const tx = (await database()).transaction(['ops', 'outbox', 'keyval', 'meta'], 'readwrite'); const done = completed(tx);
    const [existing, raw] = await Promise.all([request<Operation[]>(tx.objectStore('ops').getAll()), request<string>(tx.objectStore('keyval').get(STATE_KEY))]);
    const abort = async (message: string): Promise<never> => { tx.abort(); await done.catch(() => undefined); throw new Error(message); };
    if (expected && !equalValue(headsFor(existing.filter(o => entityKey(o) === expected.key)).map(h => h.id).sort(), [...expected.heads].sort())) return abort('Kayıt yeniden değişti. Güncel sürümleri inceleyin.');
    const merged = new Map(existing.map(o => [o.id, o]));
    for (const op of ops) {
        if (merged.has(op.id) && !equalValue(merged.get(op.id), op)) { tx.abort(); await done.catch(() => undefined); throw new Error('İşlem kimliği çakışıyor.'); }
        merged.set(op.id, op);
    }
    // A malformed remote batch must not install cyclic history or advance its cursor.
    const visited = new Set<string>(), visiting = new Set<string>();
    const visit = (id: string): boolean => {
        if (visiting.has(id)) return false;
        if (visited.has(id)) return true;
        visiting.add(id);
        for (const parent of merged.get(id)?.parents ?? []) if (!visit(parent)) return false;
        visiting.delete(id); visited.add(id); return true;
    };
    if (ops.some(op => !visit(op.id))) return abort('Kayıt geçmişinde döngü bulundu.');
    for (const op of ops) {
        if (op.parents.some(id => !merged.has(id) || entityKey(merged.get(id)!) !== entityKey(op))) {
            tx.abort(); await done.catch(() => undefined); throw new Error('Önceki kayıt sürümü eksik.');
        }
        tx.objectStore('ops').put(op, op.id);
        if (local) tx.objectStore('outbox').put(op, op.id);
    }
    tx.objectStore('keyval').put(JSON.stringify(withProjection(saved ?? JSON.parse(raw), [...merged.values()])), STATE_KEY);
    if (cursor !== undefined) tx.objectStore('meta').put(cursor, 'cursor');
    await done;
}
export async function ingest(ops: Operation[], cursor?: number): Promise<void> { await queue; await commit(ops, false, undefined, cursor); notify(); }
export async function resolveConflict(key: string, value: EntityValue | null, expectedHeads: string[]): Promise<void> {
    await queue;
    const heads = headsFor((await allOperations()).filter(o => entityKey(o) === key));
    if (!heads.length || !equalValue(heads.map(h => h.id).sort(), [...expectedHeads].sort())) throw new Error('Kayıt yeniden değişti. Güncel sürümleri inceleyin.');
    await commit([{ id: randomUUID(), entity: heads[0].entity, entityId: heads[0].entityId, parents: expectedHeads, value, deviceId, createdAt: new Date().toISOString() }], true, undefined, undefined, { key, heads: expectedHeads });
    notify();
}
export const syncStorage: StateStorage = {
    getItem: async () => {
        try {
            if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('stt-migration', migrate); else await migrate();
            deviceId = (await getMeta<string>('deviceId'))!;
            const saved = await refreshLocal(); hydrationError = null; return saved ? JSON.stringify(saved) : null;
        } catch (error) {
            hydrationError = `Yerel veri yüklenemedi: ${String(error)}. Mevcut kayıtlar korunuyor.`;
            storageEvents.dispatchEvent(new CustomEvent('error', { detail: hydrationError }));
            throw error;
        }
    },
    setItem: (_name, raw) => {
        if (suppress) return;
        const saved = JSON.parse(raw) as Saved;
        if (!baseline) return;
        const before = entities(baseline), after = entities(saved), ops: Operation[] = [];
        for (const key of new Set([...before.keys(), ...after.keys()])) {
            const value = after.get(key) ?? null;
            if (equalValue(before.get(key) ?? null, value)) continue;
            const history = known.filter(o => entityKey(o) === key), heads = headsFor(history);
            if (heads.length > 1 && project(history).conflicts.length) {
                storageEvents.dispatchEvent(new CustomEvent('error', { detail: 'Önce bu kaydın çakışmasını çözün.' }));
                storageEvents.dispatchEvent(new Event('changed')); return;
            }
            ops.push({ id: randomUUID(), entity: key.startsWith('activity:') ? 'activity' : 'session', entityId: key.slice(key.indexOf(':') + 1), parents: heads.map(o => o.id), deviceId, createdAt: new Date().toISOString(), value });
        }
        try { ops.forEach(validateOperation); } catch (error) { storageEvents.dispatchEvent(new CustomEvent('error', { detail: String(error) })); storageEvents.dispatchEvent(new Event('changed')); return; }
        baseline = saved; known.push(...ops);
        queue = queue.then(() => commit(ops, true, saved)).catch(error => {
            storageEvents.dispatchEvent(new CustomEvent('error', { detail: `Yerel kayıt başarısız: ${String(error)}. Değişikliği tekrar deneyin.` }));
        });
        void queue.then(notify); return queue;
    },
    removeItem: async () => { throw new Error('Kayıt silme işlemini kullanın.'); },
};
