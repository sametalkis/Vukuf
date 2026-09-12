import { describe, it, expect } from 'vitest';
import { project, validateOperation } from '../shared/sync';
import type { Operation } from '../shared/sync';
import { aes, randomSecret, unbase64, seal, open, pairKeys, encode, decode, storeKey, exportSecret } from '../src/sync/crypto';

const start: Operation = { id: 'start', entity: 'session', entityId: 'session', deviceId: 'laptop', createdAt: '2026-09-12T10:00:00Z', parents: [], value: { id: 'session', recordTypeId: 'coding', startTime: '2026-09-12T10:00:00Z' } };
const stop: Operation = { ...start, id: 'stop', deviceId: 'phone', parents: ['start'], value: { ...start.value!, endTime: '2026-09-12T12:00:00Z', duration: 7200 } };
describe('causal records and cross-device timers', () => {
    it('stops the same session and does not resurrect it on stale-device delivery', () => {
        for (const ops of [[start, stop], [stop, start]]) {
            const view = project(ops); expect(view.runningRecord).toBeNull(); expect(view.records).toHaveLength(1); expect(view.records[0].id).toBe('session');
        }
    });
    it('retains both concurrent stop times without a running timer or arbitrary winner', () => {
        const other: Operation = { ...stop, id: 'other', createdAt: '2099-01-01T00:00:00Z', value: { ...stop.value!, endTime: '2026-09-12T13:00:00Z', duration: 10800 } };
        const view = project([start, stop, other]);
        expect(view.conflicts).toHaveLength(1); expect(view.runningRecord).toBeNull(); expect(view.records).toHaveLength(0);
        const resolution: Operation = { ...stop, id: 'resolved', parents: ['stop', 'other'] };
        expect(project([other, resolution, start, stop]).conflicts).toHaveLength(0);
        expect(project([start, stop, other, resolution]).records[0].duration).toBe(7200);
    });
    it('preserves delete/edit conflicts and common ancestor', () => {
        const deletion: Operation = { ...stop, id: 'deleted', value: null };
        const view = project([start, stop, deletion]); expect(view.conflicts).toHaveLength(1); expect(view.runningRecord).toBeNull();
    });
    it('treats equal concurrent results as equal and retains parallel offline timers', () => {
        expect(project([start, stop, { ...stop, id: 'same' }]).conflicts).toHaveLength(0);
        expect(project([start, { ...start, id: 'second', entityId: 'other', value: { ...start.value!, id: 'other' } }]).activeSessions).toHaveLength(2);
    });
    it('rejects invalid negative durations and self-parenting', () => {
        expect(() => validateOperation({ ...stop, value: { ...stop.value!, duration: -1 } })).toThrow();
        expect(() => validateOperation({ ...stop, parents: ['stop'] })).toThrow();
    });
});
describe('encrypted transport and key custody', () => {
    it('round trips Turkish content and authenticates context, versions, IV and ciphertext', async () => {
        const key = await aes(unbase64(randomSecret()));
        const box = await seal(key, await encode([stop, 'Çalışma 🪥']), 'data:vault:1:packet');
        expect(await decode(await open(key, box, 'data:vault:1:packet'))).toEqual([stop, 'Çalışma 🪥']);
        await expect(open(key, box, 'different-vault')).rejects.toThrow();
        await expect(open(key, { ...box, protocolVersion: 2 }, box.context)).rejects.toThrow();
        await expect(open(key, { ...box, ciphertext: (box.ciphertext[0] === 'A' ? 'B' : 'A') + box.ciphertext.slice(1) }, box.context)).rejects.toThrow();
        await expect(open(await aes(unbase64(randomSecret())), box, box.context)).rejects.toThrow();
        const second = await seal(key, await encode([stop]), box.context); expect(second.iv).not.toEqual(box.iv);
    });
    it('separates pair authentication from encryption and scopes invitations', async () => {
        const secret = randomSecret(), salt = randomSecret();
        const a = await pairKeys(secret, salt, 'vault', 'invite');
        const b = await pairKeys(secret, salt, 'vault', 'invite');
        const other = await pairKeys(secret, salt, 'vault', 'other');
        expect(a.auth).toEqual(b.auth); expect(a.auth).not.toEqual(other.auth);
        const box = await seal(a.key, await encode('private'), 'pair');
        await expect(open(await aes(unbase64(a.auth)), box, 'pair')).rejects.toThrow();
        expect(await decode(await open(b.key, box, 'pair'))).toBe('private');
    });
    it('stores non-extractable keys while retaining a wrapped pairing copy', async () => {
        const raw = randomSecret(), stored = await storeKey(raw);
        expect(stored.key.extractable).toBe(false); expect(stored.wrappingKey.extractable).toBe(false);
        await expect(crypto.subtle.exportKey('raw', stored.key)).rejects.toThrow();
        expect(await exportSecret(stored)).toBe(raw);
    });
    it('bounds decompression output', async () => {
        await expect(decode(await encode('x'.repeat(10000)), 100)).rejects.toThrow('boyutu');
    });
});
