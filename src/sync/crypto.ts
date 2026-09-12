import { v4 as uuidv4 } from 'uuid';
import { canonical, MAX_SNAPSHOT_BYTES, PROTOCOL_VERSION, SCHEMA_VERSION } from '../../shared/sync';
import type { CipherBox } from '../../shared/sync';

export function randomUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try { return crypto.randomUUID(); } catch { /* fallback */ }
    }
    return uuidv4();
}

const encoder = new TextEncoder();
export function base64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unbase64(value: string): Uint8Array<ArrayBuffer> {
    if (!/^[\w-]*$/.test(value)) throw new Error('Geçersiz anahtar biçimi.');
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function subtle(): SubtleCrypto {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error(
            typeof window !== 'undefined' && !window.isSecureContext
                ? 'E2EE şifreleme için güvenli bağlantı (HTTPS) gereklidir. Lütfen adresi https:// ile açın.'
                : 'Tarayıcınız Web Cryptography API (crypto.subtle) desteklemiyor.'
        );
    }
    return crypto.subtle;
}

export const randomSecret = () => {
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
        throw new Error('Kriptografik rastgele sayı üreticisi bulunamadı.');
    }
    return base64(crypto.getRandomValues(new Uint8Array(32)));
};
export async function digest(value: string): Promise<string> {
    return base64(new Uint8Array(await subtle().digest('SHA-256', encoder.encode(value))));
}
export async function derive(secret: string, salt: string, info: string): Promise<Uint8Array<ArrayBuffer>> {
    const bytes = unbase64(secret);
    if (bytes.length !== 32 || unbase64(salt).length !== 32) throw new Error('Anahtar uzunluğu geçersiz.');
    const key = await subtle().importKey('raw', bytes, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: unbase64(salt), info: encoder.encode(info) }, key, 256));
}
export async function aes(raw: Uint8Array<ArrayBuffer>, extractable = false): Promise<CryptoKey> {
    return subtle().importKey('raw', raw, 'AES-GCM', extractable, ['encrypt', 'decrypt']);
}
function aad(box: Omit<CipherBox, 'ciphertext' | 'iv'>) { return encoder.encode(canonical(box)); }
export async function seal(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>, context: string, keyVersion = 1): Promise<CipherBox> {
    const header = { protocolVersion: PROTOCOL_VERSION, schemaVersion: SCHEMA_VERSION, keyVersion, context };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(header), tagLength: 128 }, key, bytes);
    return { ...header, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
}
export async function open(key: CryptoKey, box: CipherBox, context: string, keyVersion = 1): Promise<Uint8Array<ArrayBuffer>> {
    if (box.protocolVersion !== PROTOCOL_VERSION || box.schemaVersion !== SCHEMA_VERSION) throw new Error('Bu veri için uygulamayı güncelleyin.');
    if (box.context !== context || box.keyVersion !== keyVersion || unbase64(box.iv).length !== 12) throw new Error('Şifreli paket bağlamı uyuşmuyor.');
    const header = { protocolVersion: box.protocolVersion, schemaVersion: box.schemaVersion, keyVersion: box.keyVersion, context: box.context };
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: unbase64(box.iv), additionalData: aad(header), tagLength: 128 }, key, unbase64(box.ciphertext)));
}
export async function encode(value: unknown): Promise<Uint8Array<ArrayBuffer>> {
    const input = encoder.encode(JSON.stringify(value));
    if (input.length > MAX_SNAPSHOT_BYTES) throw new Error('Veri boyutu sınırı aşıldı.');
    return new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
export async function decode(bytes: Uint8Array<ArrayBuffer>, limit = MAX_SNAPSHOT_BYTES): Promise<unknown> {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > limit) throw new Error('Açılan veri boyutu sınırı aşıldı.');
            parts.push(new Uint8Array(value));
        }
    } finally { await reader.cancel(); }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output));
}
export interface KeyBundle { key: CryptoKey; wrappingKey: CryptoKey; wrapped: string }
export async function storeKey(secret: string): Promise<KeyBundle> {
    const raw = unbase64(secret);
    if (raw.length !== 32) throw new Error('Kasa anahtarı geçersiz.');
    const wrappingKey = await subtle().generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
    const exportable = await aes(raw, true);
    const wrapped = base64(new Uint8Array(await subtle().wrapKey('raw', exportable, wrappingKey, 'AES-KW')));
    return { key: await aes(raw), wrappingKey, wrapped };
}
export async function exportSecret(bundle: KeyBundle): Promise<string> {
    const key = await subtle().unwrapKey('raw', unbase64(bundle.wrapped), bundle.wrappingKey, 'AES-KW', 'AES-GCM', true, ['encrypt', 'decrypt']);
    return base64(new Uint8Array(await subtle().exportKey('raw', key)));
}
export async function pairKeys(secret: string, salt: string, vaultId: string, inviteId: string) {
    const context = (purpose: string) => JSON.stringify([`stt/pair/${purpose}/v1`, vaultId, inviteId]);
    return { key: await aes(await derive(secret, salt, context('encryption'))), auth: base64(await derive(secret, salt, context('authentication'))) };
}
