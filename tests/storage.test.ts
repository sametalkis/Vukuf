import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Operation } from '../shared/sync';

let storage: typeof import('../src/sync/storage');
const original = JSON.stringify({ version: 0, state: { recordTypes: [{ id: 'a', name: 'Yazılım', color: '#008800', icon: 'Code' }], records: [{ id: 'r', recordTypeId: 'a', startTime: '2026-09-12T10:00:00Z', endTime: '2026-09-12T11:00:00Z', duration: 3600 }], runningRecord: null, accentColor: '#00aa00' } });
beforeEach(async () => {
    vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('localStorage', { getItem: () => original });
    vi.stubGlobal('BroadcastChannel', class { postMessage() {} addEventListener() {} });
    storage = await import('../src/sync/storage');
});
afterEach(async () => { (await storage.database()).close(); vi.unstubAllGlobals(); });
describe('non-destructive migration and atomic journal', () => {
    it('preserves original data and IDs, marks migration only after validation', async () => {
        const migrated = await storage.syncStorage.getItem('simple-time-tracker');
        expect(JSON.parse(migrated!)).toEqual(JSON.parse(original));
        expect(await storage.latestBackup()).toBe(original);
        expect(await storage.getMeta('migrationComplete')).toBe(true);
        expect((await storage.allOperations()).map(o => o.entityId).sort()).toEqual(['a', 'r']);
        expect(await storage.pendingOperations()).toHaveLength(2);
        await storage.syncStorage.getItem('simple-time-tracker');
        expect(await storage.allOperations()).toHaveLength(2);
    });
    it('persists materialized records and outbox together; ack cannot delete newer operations', async () => {
        await storage.syncStorage.getItem('simple-time-tracker');
        const initial = await storage.pendingOperations();
        const saved = JSON.parse(original); saved.state.records[0].duration = 4000;
        await storage.syncStorage.setItem('simple-time-tracker', JSON.stringify(saved));
        await storage.acknowledge(initial.map(o => o.id));
        expect(await storage.pendingOperations()).toHaveLength(1);
        const raw = await storage.syncStorage.getItem('simple-time-tracker');
        expect(JSON.parse(raw!).state.records[0].duration).toBe(4000);
    });
    it('deduplicates remote operations and preserves the read cursor atomically', async () => {
        await storage.syncStorage.getItem('simple-time-tracker');
        const base = (await storage.allOperations()).find(o => o.entityId === 'r')!;
        const op: Operation = { ...base, id: 'remote', deviceId: 'other', parents: [base.id], value: null };
        await storage.ingest([op], 1); await storage.ingest([op], 1);
        expect(await storage.allOperations()).toHaveLength(3);
        expect(await storage.getMeta('cursor')).toBe(1);
        expect((await storage.refreshLocal())!.state.records).toHaveLength(0);
        await expect(storage.ingest([{ ...op, value: base.value }], 2)).rejects.toThrow();
        expect(await storage.getMeta('cursor')).toBe(1);
    });
    it('keeps two-tab concurrent edits as branches, not last-writer-wins', async () => {
        await storage.syncStorage.getItem('simple-time-tracker');
        vi.resetModules(); const second = await import('../src/sync/storage'); await second.syncStorage.getItem('simple-time-tracker');
        const firstEdit = JSON.parse(original), secondEdit = JSON.parse(original);
        firstEdit.state.recordTypes[0].name = 'Laptop'; secondEdit.state.recordTypes[0].name = 'Telefon';
        await storage.syncStorage.setItem('simple-time-tracker', JSON.stringify(firstEdit));
        await second.syncStorage.setItem('simple-time-tracker', JSON.stringify(secondEdit));
        const { project } = await import('../shared/sync');
        expect(project(await storage.allOperations()).conflicts).toHaveLength(1);
        (await second.database()).close();
    });
});
