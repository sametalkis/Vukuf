import { useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore';
import { allOperations, pendingOperations, acknowledge, backupLocal, getMeta, setMeta, refreshLocal, withoutPersistence, storageEvents, ingest, database, completed, request, hydrationError } from './storage';
import { aes, decode, derive, digest, encode, exportSecret, open, pairKeys, randomSecret, randomUUID, seal, storeKey } from './crypto';
import type { KeyBundle } from './crypto';
import { MAX_SNAPSHOT_BYTES, project, validateOperation } from '../../shared/sync';
import type { CipherBox, Conflict, Operation, SessionValue } from '../../shared/sync';

interface Credentials extends KeyBundle { vaultId: string; deviceId: string; token: string; keyVersion: number; recoveryToken?: string; role: 'admin' | 'write' | 'read' }
interface UploadJob { id: string; boxes: CipherBox[]; operationIds: string[]; rotate?: boolean; next?: Credentials; expectedSeq?: number }
export interface Device { id: string; role: string; created: number; seen: number }
interface SyncStatus {
    ready: boolean; busy: boolean; connected: boolean; vaultId?: string; deviceId?: string; role?: string;
    message: string; error: string | null; pending: number; lastSync: number | null;
    conflicts: Conflict[]; activeSessions: SessionValue[]; invitePending: boolean;
}
let state: SyncStatus = { ready: false, busy: false, connected: false, message: 'Yerel veriler hazırlanıyor…', error: null, pending: 0, lastSync: null, conflicts: [], activeSessions: [], invitePending: false };
const listeners = new Set<() => void>();
function update(patch: Partial<SyncStatus>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
export const useSyncStatus = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
export const getSyncState = () => state;
let credential: Credentials | undefined;
let started = false;
let refreshing = false;
let needsRefresh = false;
let syncing = false;
let actionBusy = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let retryAfter = 0;
const errors: Record<string, string> = {
    creation_disabled: 'Sunucuda eşleştirme henüz etkinleştirilmemiş. Kurulum yöneticisinin oluşturma kodunu yapılandırması gerekiyor.',
    creation_denied: 'Kasa oluşturma kodu geçersiz.',
    invite_expired: 'Davetin süresi doldu. Diğer cihazdan yeni bir QR kod oluşturun.',
    invite_used: 'Bu davet başka bir cihaz tarafından kullanılmış.',
    invite_denied: 'Eşleştirme bağlantısı doğrulanamadı.',
    device_revoked: 'Bu cihazın erişimi kaldırılmış. Yeniden eşleştirin.',
    key_changed: 'Kasanın anahtarı yenilenmiş. Bu cihazı yeniden eşleştirin.',
    upgrade_required: 'Eşitlemeye devam etmek için uygulamayı güncelleyin. Yerel değişiklikleriniz korunuyor.',
    vault_quota: 'Kasa depolama sınırına ulaştı. Yerel kayıtlarınız korunuyor; yeni gönderimler bekliyor.',
    rate_limited: 'Çok fazla istek gönderildi. Biraz sonra yeniden denenecek.',
    forbidden: 'Bu işlem için kasa yöneticisi yetkisi gerekiyor.',
    recovery_denied: 'Kurtarma bilgisi geçersiz veya eski anahtar sürümüne ait.',
    initial_sync_required: 'Önce ilk eşitlemenin tamamlanmasını bekleyin.',
    rotation_conflict: 'Anahtar yenilenirken başka cihazdan veri geldi. Veriler korunuyor; yeniden eşitleyip anahtar yenilemeyi tekrar deneyin.',
};
export async function api<T>(path: string, method = 'GET', data?: unknown, auth = credential): Promise<T> {
    const response = await fetch(`/api/sync${path}`, {
        method, cache: 'no-store', signal: AbortSignal.timeout(20000),
        headers: { 'X-STT-Version': '1', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Eşitleme API’sine ulaşılamıyor. Yerel geliştirmede Worker sunucusunu da başlatın.');
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(errors[result.error] ?? `Eşitleme başarısız (${result.error ?? response.status}).`), { code: result.error });
    return result as T;
}
const vaultPath = (suffix: string, auth = credential!) => `/vaults/${auth.vaultId}${suffix}`;
async function reloadProjection() {
    if (refreshing) { needsRefresh = true; return; }
    refreshing = true;
    try {
        do {
            needsRefresh = false;
            const saved = await refreshLocal();
            if (saved) withoutPersistence(() => useStore.setState(saved.state as Partial<ReturnType<typeof useStore.getState>>));
            const projection = project(await allOperations());
            credential = await getMeta<Credentials>('credentials');
            update({ conflicts: projection.conflicts, activeSessions: projection.activeSessions, pending: (await pendingOperations()).length, connected: !!credential, vaultId: credential?.vaultId, deviceId: credential?.deviceId, role: credential?.role });
        } while (needsRefresh);
    } finally { refreshing = false; }
}
export function startSync() {
    if (started) return; started = true;
    storageEvents.addEventListener('error', event => update({ error: (event as CustomEvent<string>).detail }));
    if (hydrationError) update({ error: hydrationError });
    storageEvents.addEventListener('changed', () => {
        void reloadProjection().catch(error => update({ error: String(error) }));
        clearTimeout(debounce);
        debounce = setTimeout(() => { if (!syncing) void syncNow(false); }, 750);
    });
    const onReady = async () => {
        try {
            await reloadProjection();
            const pending = await getMeta<string>('pairLink');
            update({ ready: true, message: credential ? 'Eşitleme bekleniyor' : 'Bu cihazda kayıtlı', invitePending: !!pending });
            void syncNow(false);
        } catch (error) { update({ error: String(error), message: 'Yerel veri yüklenemedi' }); }
    };
    if (useStore.persist.hasHydrated()) void onReady(); else useStore.persist.onFinishHydration(() => { void onReady(); });
    window.addEventListener('online', () => { retryAfter = 0; void syncNow(false); });
    window.addEventListener('offline', () => update({ message: 'Çevrimdışı — değişiklikler bu cihazda saklanıyor' }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncNow(false); });
    setInterval(() => { if (!document.hidden) void syncNow(false); }, 30000);
    void capturePairLink();
    window.addEventListener('hashchange', () => { void capturePairLink(); });
}
async function capturePairLink() {
    if (!location.hash.startsWith('#pair=')) return;
    const link = location.hash.slice(6);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    if (!/^[\w-]+:[\w-]+:[\w-]{43}$/.test(link)) { update({ error: 'Eşleştirme bağlantısının biçimi geçersiz.' }); return; }
    await setMeta('pairLink', link);
    update({ invitePending: true });
}
export async function cancelPair() { await setMeta('pairLink', undefined); update({ invitePending: false }); }
async function exclusively<T>(fn: () => Promise<T>): Promise<T> {
    if (navigator.locks) return navigator.locks.request('stt-network', fn);
    // Transactional lease fallback. Requests are bounded; renew while working.
    const owner = randomUUID();
    const claim = async (renew = false) => {
        const tx = (await database()).transaction('meta', 'readwrite'); const done = completed(tx);
        const lease = await request<{ owner: string; until: number } | undefined>(tx.objectStore('meta').get('networkLease'));
        if (lease && lease.owner !== owner && lease.until > Date.now()) { await done; throw new Error('Diğer sekme eşitliyor. Biraz sonra yeniden deneyin.'); }
        if (renew && lease?.owner !== owner) { await done; throw new Error('Eşitleme kilidi değişti.'); }
        tx.objectStore('meta').put({ owner, until: Date.now() + 90000 }, 'networkLease'); await done;
    };
    await claim();
    const interval = setInterval(() => { void claim(true).catch(() => undefined); }, 20000);
    try { return await fn(); } finally {
        clearInterval(interval);
        const tx = (await database()).transaction('meta', 'readwrite'); const done = completed(tx);
        const lease = await request<{ owner: string } | undefined>(tx.objectStore('meta').get('networkLease'));
        if (lease?.owner === owner) tx.objectStore('meta').delete('networkLease'); await done;
    }
}
// Bound each plaintext chunk and preserve parent-before-child order.
function ordered(ops: Operation[]): Operation[] {
    const pending = new Map(ops.map(o => [o.id, o])), result: Operation[] = [];
    while (pending.size) {
        const ready = [...pending.values()].filter(o => o.parents.every(id => !pending.has(id)));
        if (!ready.length) throw new Error('Kayıt geçmişinde döngü bulundu.');
        for (const op of ready) { result.push(op); pending.delete(op.id); }
    }
    return result;
}
async function prepareJob(ops: Operation[], auth: Credentials, rotate = false): Promise<UploadJob> {
    const sorted = ordered(ops), groups: Operation[][] = []; let group: Operation[] = [], bytes = 2, total = 0;
    for (const op of sorted) {
        const size = new TextEncoder().encode(JSON.stringify(op)).length + 1;
        if (size > 256 * 1024) throw new Error('Tek kayıt aktarım sınırını aşıyor.');
        total += size; if (total > MAX_SNAPSHOT_BYTES) throw new Error('Tam kopya 32 MiB sınırını aşıyor.');
        if (bytes + size > 256 * 1024) { groups.push(group); group = []; bytes = 2; }
        group.push(op); bytes += size;
    }
    if (group.length || !groups.length) groups.push(group);
    const id = randomUUID(), boxes: CipherBox[] = [];
    for (let index = 0; index < groups.length; index++) {
        update({ message: `Şifreleniyor: ${index + 1}/${groups.length} parça` });
        boxes.push(await seal(auth.key, await encode(groups[index]), `data:${auth.vaultId}:${auth.keyVersion}:${id}:${index}`, auth.keyVersion));
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { id, boxes, operationIds: ops.map(o => o.id), rotate, ...(rotate ? { next: auth } : {}) };
}
async function sendJob(job: UploadJob) {
    const auth = job.next ?? credential!;
    const root = vaultPath(`/uploads/${job.id}`);
    const begun = await api<{ complete: boolean }>(root, 'POST', { count: job.boxes.length, keyVersion: auth.keyVersion, rotate: job.rotate, ...(job.rotate ? { recoveryHash: await digest(auth.recoveryToken!), expectedSeq: job.expectedSeq } : {}) });
    if (!begun.complete) {
        for (let i = 0; i < job.boxes.length; i++) {
            update({ message: `Yükleniyor: ${i + 1}/${job.boxes.length} parça` });
            await api(`${root}/${i}`, 'PUT', job.boxes[i]);
        }
        try { await api(`${root}/commit`, 'POST', {}); } catch (error) {
            if ((error as { code?: string }).code === 'rotation_conflict') { await api(root, 'DELETE'); await setMeta('uploadJob', undefined); }
            throw error;
        }
    }
    if (job.next) { credential = job.next; await setMeta('credentials', credential); await setMeta('cursor', 0); }
    await acknowledge(job.operationIds);
    await setMeta('uploadJob', undefined);
}
async function pull() {
    let more = true;
    while (more) {
        const cursor = (await getMeta<number>('cursor')) ?? 0;
        const response = await api<{ packets: { seq: number; id: string; box: CipherBox }[]; more: boolean }>(vaultPath(`/packets?after=${cursor}&keyVersion=${credential!.keyVersion}`));
        const ops: Operation[] = [];
        let nextCursor = cursor;
        for (const packet of response.packets) {
            if (packet.seq <= nextCursor) throw new Error('Sunucu sıra numarası geçersiz.');
            const decoded = await decode(await open(credential!.key, packet.box, `data:${credential!.vaultId}:${credential!.keyVersion}:${packet.id}`, credential!.keyVersion), 256 * 1024);
            if (!Array.isArray(decoded)) throw new Error('Geçersiz eşitleme içeriği.');
            decoded.forEach(validateOperation); ops.push(...decoded); nextCursor = packet.seq;
        }
        if (nextCursor !== cursor) await ingest(ops, nextCursor);
        more = response.more;
    }
}
async function cycle() {
    credential = await getMeta<Credentials>('credentials'); if (!credential) return;
    const job = await getMeta<UploadJob>('uploadJob');
    if (job) await sendJob(job);
    const meta = await api<{ keyVersion: number; initialized: boolean; serverTime: number }>(vaultPath('/meta'));
    if (meta.keyVersion !== credential.keyVersion) throw new Error(errors.key_changed);
    await setMeta('serverOffset', { offset: meta.serverTime - Date.now(), measuredAt: Date.now() });
    if (meta.initialized) await pull();
    const pending = await pendingOperations();
    if (pending.length || !meta.initialized) {
        const next = await prepareJob(pending, credential);
        await setMeta('uploadJob', next); await sendJob(next);
    }
    await pull();
    await reloadProjection();
    const now = Date.now(); await setMeta('lastSync', now);
    update({ lastSync: now, message: 'Eşitlendi', error: null });
}
export async function syncNow(manual = true) {
    if (!state.ready) {
        await reloadProjection();
        update({ ready: true });
    }
    const auth = await getCredential();
    if (!auth || actionBusy || (!manual && Date.now() < retryAfter)) return;
    if (syncing) {
        if (!manual) return;
        for (let i = 0; i < 50; i++) {
            if (!syncing) break;
            await new Promise(r => setTimeout(r, 100));
        }
        if (syncing) return;
    }
    if (!navigator.onLine) { update({ message: 'Çevrimdışı — değişiklikler bu cihazda saklanıyor' }); return; }
    syncing = true; update({ busy: true, message: 'Eşitleniyor…' });
    try { await exclusively(cycle); failures = 0; retryAfter = 0; }
    catch (error) { failures++; retryAfter = Date.now() + Math.min(300000, 5000 * 2 ** failures); update({ error: error instanceof Error ? error.message : 'Eşitleme başarısız.', message: 'Gönderimler bekliyor' }); }
    finally { syncing = false; update({ busy: false }); }
}
async function action<T>(fn: () => Promise<T>): Promise<T> {
    if (actionBusy || syncing) {
        for (let i = 0; i < 50; i++) {
            if (!actionBusy && !syncing) break;
            await new Promise(r => setTimeout(r, 100));
        }
        if (actionBusy || syncing) throw new Error('Devam eden işlemin tamamlanmasını bekleyin.');
    }
    actionBusy = true; update({ busy: true, error: null });
    try { return await exclusively(fn); }
    catch (error) { update({ error: error instanceof Error ? error.message : String(error) }); throw error; }
    finally {
        try { await reloadProjection(); }
        finally { actionBusy = false; update({ busy: false }); }
    }
}
async function getCredential(): Promise<Credentials | undefined> {
    if (!credential) credential = await getMeta<Credentials>('credentials');
    return credential;
}
export async function createVault(code = '') {
    return action(async () => {
        if (await getCredential()) throw new Error('Bu cihaz zaten bir kasaya bağlı.');
        await backupLocal('before-pair');
        let pending = await getMeta<Credentials>('pendingCreate');
        if (!pending) {
            pending = { ...(await storeKey(randomSecret())), vaultId: randomUUID(), deviceId: (await getMeta<string>('deviceId'))!, token: randomSecret(), recoveryToken: randomSecret(), keyVersion: 1, role: 'admin' };
            await setMeta('pendingCreate', pending);
        }
        await api('/create', 'POST', { code, vaultId: pending.vaultId, deviceId: pending.deviceId, tokenHash: await digest(pending.token), recoveryHash: await digest(pending.recoveryToken!) });
        credential = pending; await setMeta('credentials', pending); await setMeta('pendingCreate', undefined); await setMeta('cursor', 0);
        const job = await prepareJob(await allOperations(), pending); await setMeta('uploadJob', job); await sendJob(job);
        await cycle();
    });
}
export async function createInvite(): Promise<{ link: string; expires: number }> {
    return action(async () => {
        const auth = await getCredential();
        if (!auth) throw new Error('Önce kasa oluşturun.');
        await cycle();
        const id = randomUUID(), secret = randomSecret(), salt = randomSecret();
        const keys = await pairKeys(secret, salt, auth.vaultId, id);
        const box = await seal(keys.key, await encode({ vaultId: auth.vaultId, secret: await exportSecret(auth), keyVersion: auth.keyVersion }), `pair:${auth.vaultId}:${id}`, auth.keyVersion);
        const { expires } = await api<{ expires: number }>(vaultPath('/invites', auth), 'POST', { id, salt, authHash: await digest(keys.auth), package: box });
        return { link: `${location.origin}/#pair=${auth.vaultId}:${id}:${secret}`, expires };
    });
}
export async function joinVault(linkInput?: string) {
    return action(async () => {
        if (await getCredential()) throw new Error('Önce mevcut kasanın bağlantısını kaldırın.');
        const text = linkInput?.trim() || await getMeta<string>('pairLink');
        const link = text?.includes('#pair=') ? text.split('#pair=')[1] : text;
        if (!link || !/^[\w-]+:[\w-]+:[\w-]{43}$/.test(link)) throw new Error('Eşleştirme bağlantısı geçersiz.');
        const [vaultId, inviteId, secret] = link.split(':');
        await setMeta('pairLink', link); await backupLocal('before-join');
        const meta = await api<{ salt: string; keyVersion: number }>(`/vaults/${vaultId}/invites/${inviteId}`);
        const keys = await pairKeys(secret, meta.salt, vaultId, inviteId);
        let joining = await getMeta<{ inviteId: string; token: string; deviceId: string }>('joining');
        if (!joining || joining.inviteId !== inviteId) {
            joining = { inviteId, token: randomSecret(), deviceId: (await getMeta<string>('deviceId'))! }; await setMeta('joining', joining);
        }
        const result = await api<{ package: CipherBox }>(`/vaults/${vaultId}/invites/${inviteId}/claim`, 'POST', { auth: keys.auth, deviceId: joining.deviceId, tokenHash: await digest(joining.token) });
        const payload = await decode(await open(keys.key, result.package, `pair:${vaultId}:${inviteId}`, meta.keyVersion), 8192) as { vaultId: string; keyVersion: number; secret: string };
        if (payload.vaultId !== vaultId || payload.keyVersion !== meta.keyVersion) throw new Error('Davet içeriği doğrulanamadı.');
        credential = { ...(await storeKey(payload.secret)), vaultId, deviceId: joining.deviceId, token: joining.token, keyVersion: meta.keyVersion, role: 'write' };
        await setMeta('credentials', credential); await setMeta('cursor', 0);
        await cancelPair(); await setMeta('joining', undefined); await cycle();
    });
}
export async function listDevices(): Promise<Device[]> {
    const auth = await getCredential();
    return api(vaultPath('/devices', auth));
}
export async function revokeDevice(id: string) {
    return action(async () => {
        const auth = await getCredential();
        await api(vaultPath(`/devices/${id}`, auth), 'DELETE');
    });
}
export async function disconnect() {
    return action(async () => {
        const auth = await getCredential();
        if (auth && navigator.onLine) {
            try { await api(vaultPath(`/devices/${auth.deviceId}`, auth), 'DELETE'); } catch { /* Local disconnect must work offline. */ }
        }
        credential = undefined;
        for (const key of ['credentials', 'cursor', 'uploadJob', 'pendingCreate', 'joining', 'pairLink']) await setMeta(key, undefined);
        update({ connected: false, invitePending: false, message: 'Bağlantı kaldırıldı. Yerel kayıtlar korunuyor.' });
    });
}
export async function deleteVault() {
    return action(async () => {
        const auth = await getCredential();
        await api(vaultPath('/', auth), 'DELETE');
        credential = undefined;
        await setMeta('credentials', undefined);
        await setMeta('uploadJob', undefined);
        update({ message: 'Bulut kasası silindi. Yerel kayıtlar korunuyor.' });
    });
}
export async function rotateKey() {
    return action(async () => {
        const auth = await getCredential();
        if (auth?.role !== 'admin') throw new Error('Kasa yöneticisi yetkisi gerekiyor.');
        await cycle();
        const expectedSeq = (await getMeta<number>('cursor')) ?? 0;
        const next = { ...auth, ...(await storeKey(randomSecret())), keyVersion: auth.keyVersion + 1, recoveryToken: randomSecret() };
        const job = await prepareJob(await allOperations(), next, true); job.expectedSeq = expectedSeq; await setMeta('uploadJob', job); await sendJob(job); await cycle();
        update({ message: 'Anahtar yenilendi. Diğer cihazları yeniden eşleştirin ve yeni kurtarma paketi oluşturun.' });
    });
}
export async function recoveryPackage(): Promise<{ code: string; file: string }> {
    return action(async () => {
        const auth = await getCredential();
        if (!auth?.recoveryToken) throw new Error('Kurtarma paketi kasa yöneticisi cihazdan oluşturulur.');
        const code = randomSecret(), salt = randomSecret();
        const key = await aes(await derive(code, salt, 'stt/recovery/encryption/v1'));
        const box = await seal(key, await encode({ origin: location.origin, vaultId: auth.vaultId, secret: await exportSecret(auth), keyVersion: auth.keyVersion, recoveryToken: auth.recoveryToken }), 'stt/recovery/v1', auth.keyVersion);
        return { code, file: JSON.stringify({ format: 'stt-recovery', version: 1, kdf: 'HKDF-SHA-256', salt, box }, null, 2) };
    });
}
export async function recover(file: string, code: string) {
    return action(async () => {
        if (await getCredential()) throw new Error('Önce mevcut kasanın bağlantısını kaldırın.');
        if (file.length > 32000) throw new Error('Kurtarma dosyası çok büyük.');
        const pkg = JSON.parse(file);
        if (pkg.format !== 'stt-recovery' || pkg.version !== 1 || pkg.kdf !== 'HKDF-SHA-256') throw new Error('Kurtarma dosyası desteklenmiyor.');
        const key = await aes(await derive(code.trim(), pkg.salt, 'stt/recovery/encryption/v1'));
        const payload = await decode(await open(key, pkg.box, 'stt/recovery/v1', pkg.box.keyVersion), 8192) as { origin: string; vaultId: string; secret: string; keyVersion: number; recoveryToken: string };
        if (payload.origin !== location.origin) throw new Error('Kurtarma dosyası farklı bir uygulama adresine ait.');
        await backupLocal('before-recovery');
        const token = randomSecret(), id = (await getMeta<string>('deviceId'))!;
        const result = await api<{ keyVersion: number }>(`/vaults/${payload.vaultId}/recover`, 'POST', { token: payload.recoveryToken, deviceId: id, tokenHash: await digest(token) });
        if (result.keyVersion !== payload.keyVersion) throw new Error('Bu kurtarma paketi eski anahtara ait.');
        credential = { ...(await storeKey(payload.secret)), vaultId: payload.vaultId, deviceId: id, token, keyVersion: payload.keyVersion, recoveryToken: payload.recoveryToken, role: 'admin' };
        await setMeta('credentials', credential); await setMeta('cursor', 0); await cycle();
    });
}

if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__STT_SYNC__ = { syncNow, createInvite, joinVault, recoveryPackage, recover, deleteVault, getSyncState };
}
