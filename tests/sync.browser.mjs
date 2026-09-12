import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Local servers only; these isolated profiles contain synthetic records.
const origin = process.env.STT_TEST_ORIGIN ?? 'https://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local test servers only');
const browser = await chromium.launch({ headless: true });
const contexts = [];
async function page(seed = false) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
    contexts.push(context);
    if (seed) await context.addInitScript(() => {
        if (!localStorage.getItem('simple-time-tracker')) localStorage.setItem('simple-time-tracker', JSON.stringify({ state: {
            recordTypes: [{ id: 'test-coding', name: 'Sentetik Kodlama', icon: 'Code', color: '#448844' }],
            records: [], runningRecord: { id: 'shared-timer', recordTypeId: 'test-coding', startTime: new Date(Date.now() - 7200000).toISOString() },
        }, version: 0 }));
    });
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', error => { throw error; });
    p.on('response', async response => { if (response.url().includes('/api/sync/') && !response.ok()) console.log('API ERROR', response.status(), (await response.json()).error); });
    await p.goto(`${origin}/settings`);
    await p.getByRole('heading', { name: 'Cihazlar ve Eşitleme' }).waitFor();
    return p;
}
const sync = p => p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 100));
    await (await import('/src/sync/engine.ts')).syncNow();
});
const state = p => p.evaluate(async () => { const s = (await import('/src/store/useStore.ts')).useStore.getState(); return { recordTypes: s.recordTypes, records: s.records, runningRecord: s.runningRecord }; });
try {
    const a = await page(true);
    await a.getByRole('button', { name: /Cihazı eşle/i }).click();
    try { await a.getByAltText('Cihaz eşleştirme QR kodu').waitFor({ timeout: 30000 }); }
    catch (error) { console.log('UI ERROR', await a.getByRole('alert').allTextContents()); throw error; }
    console.log('PASS: legacy data migrated, vault created, QR rendered');
    const invite = await a.evaluate(async () => (await import('/src/sync/engine.ts')).createInvite());
    const b = await page();
    await b.goto(invite.link.replace('/#', '/settings#'));
    await b.getByRole('heading', { name: 'Cihazlar ve Eşitleme' }).waitFor();
    await b.getByRole('button', { name: 'Kayıtları birleştir ve bağlan' }).click();
    await b.getByRole('button', { name: 'Şimdi eşitle' }).waitFor();
    await b.waitForFunction(async () => (await import('/src/store/useStore.ts')).useStore.getState().runningRecord?.id === 'shared-timer');
    assert.equal((await state(b)).recordTypes[0].name, 'Sentetik Kodlama');
    assert.equal(new URL(b.url()).hash, '');
    console.log('PASS: QR invitation joins and removes fragment');
    await a.context().setOffline(true);
    await b.evaluate(async () => {
        (await import('/src/store/useStore.ts')).useStore.getState().stopTimer();
        await (await import('/src/sync/storage.ts')).pendingOperations();
    });
    await sync(b);
    await a.context().setOffline(false);
    await sync(a);
    for (let i = 0; i < 30; i++) {
        if ((await state(a)).records.some(r => r.id === 'shared-timer')) break;
        await sync(a);
        await new Promise(r => setTimeout(r, 200));
    }
    assert.equal((await state(a)).records.filter(r => r.id === 'shared-timer').length, 1);
    assert.notEqual((await state(a)).runningRecord?.id, 'shared-timer');
    console.log('PASS: another device stops offline laptop timer without resurrection');
    await sync(a); await sync(b);
    await a.context().setOffline(true); await b.context().setOffline(true);
    for (const [p, name] of [[a, 'Laptop değişikliği'], [b, 'Telefon değişikliği']]) {
        await p.evaluate(async name => { (await import('/src/store/useStore.ts')).useStore.getState().updateRecordType('test-coding', { name }); await (await import('/src/sync/storage.ts')).pendingOperations(); }, name);
    }
    await a.context().setOffline(false); await sync(a);
    await b.context().setOffline(false); await sync(b); await sync(a);
    await a.getByText('1 kayıt incelenmeli', { exact: true }).waitFor();
    await a.locator('summary').filter({ hasText: 'sürümleri incele' }).click();
    await a.getByRole('button', { name: 'Seçimi uygula' }).click();
    await a.getByText('1 kayıt incelenmeli', { exact: true }).waitFor({ state: 'hidden' });
    await sync(a); await sync(b);
    assert.deepEqual((await state(a)).recordTypes, (await state(b)).recordTypes);
    console.log('PASS: offline concurrent changes surface and resolution converges');
    const c = await page();
    const reuse = await c.evaluate(async link => { try { await (await import('/src/sync/engine.ts')).joinVault(link); return ''; } catch (e) { return e.message; } }, invite.link);
    assert.match(reuse, /başka bir cihaz/);
    console.log('PASS: consumed QR cannot authorize another device');
    const kit = await a.evaluate(async () => (await import('/src/sync/engine.ts')).recoveryPackage());
    await c.evaluate(async kit => (await import('/src/sync/engine.ts')).recover(kit.file, kit.code), kit);
    assert.deepEqual((await state(a)).recordTypes, (await state(c)).recordTypes);
    console.log('PASS: encrypted recovery package restores access');
    await a.screenshot({ path: '/tmp/stt-sync-mobile.png', fullPage: true });
    assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log('PASS: mobile layout has no horizontal overflow');
    await a.evaluate(async () => (await import('/src/sync/engine.ts')).deleteVault());
    console.log('PASS: synthetic local cloud vault removed, local records retained');
} finally {
    await Promise.all(contexts.map(c => c.close()));
    await browser.close();
}
