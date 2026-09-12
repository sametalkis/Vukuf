import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Check, Download, Link2, RefreshCw, ShieldCheck, Smartphone, Unplug } from 'lucide-react';
import { createInvite, createVault, deleteVault, disconnect, joinVault, listDevices, recover, recoveryPackage, revokeDevice, rotateKey, syncNow, useSyncStatus } from '../sync/engine';
import type { Device } from '../sync/engine';
import { allOperations, latestBackup, resolveConflict } from '../sync/storage';
import { entityKey, headsFor } from '../../shared/sync';
import type { Conflict, EntityValue } from '../../shared/sync';
import { useStore } from '../store/useStore';
import { formatDuration } from '../utils/time';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const input = 'w-full min-w-0 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
function downloadText(text: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function describe(value: EntityValue | null): string {
    if (!value) return 'Silinmiş';
    if ('name' in value) return `${value.name} · ${value.color}`;
    return `${new Date(value.startTime).toLocaleString('tr-TR')} → ${value.endTime ? new Date(value.endTime).toLocaleString('tr-TR') : 'Çalışıyor'}${value.duration !== undefined ? ` · ${formatDuration(value.duration)}` : ''}`;
}
function ConflictRow({ conflict, onError }: { conflict: Conflict; onError: (text: string) => void }) {
    const [selected, setSelected] = useState(0);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<EntityValue | null>(conflict.heads[0].value);
    const [saving, setSaving] = useState(false);
    const activityNames = useStore(s => s.recordTypes);
    const chosen = conflict.heads[selected]?.value ?? null;
    const label = chosen && 'name' in chosen ? chosen.name : chosen && 'recordTypeId' in chosen ? activityNames.find(a => a.id === chosen.recordTypeId)?.name ?? 'Oturum' : 'Silinen kayıt';
    const save = async () => {
        setSaving(true);
        try { await resolveConflict(conflict.key, editing ? draft : chosen, conflict.heads.map(h => h.id)); }
        catch (error) { onError(String(error)); } finally { setSaving(false); }
    };
    return <details className="border-t border-gray-200 dark:border-gray-800 py-3">
        <summary className="cursor-pointer text-sm font-semibold">{label}: sürümleri incele</summary>
        <p className="text-xs text-gray-600 dark:text-gray-400 my-3">Ortak sürüm: {describe(conflict.base)}. Seçiminiz diğer sürümleri geçmişte korur.</p>
        <fieldset className="space-y-2"><legend className="sr-only">Kullanılacak sürüm</legend>
            {conflict.heads.map((head, i) => <label key={head.id} className="flex gap-3 items-start p-2 rounded-lg bg-gray-50 dark:bg-gray-950">
                <input type="radio" name={conflict.key} checked={selected === i} onChange={() => { setSelected(i); setDraft(head.value); setEditing(false); }} />
                <span className="text-sm break-words min-w-0">{describe(head.value)}<span className="block text-xs text-gray-600 dark:text-gray-400">Cihaz {head.deviceId.slice(0, 6)}</span></span>
            </label>)}
        </fieldset>
        {editing && draft && <div className="space-y-2 my-3">
            {'name' in draft ? <label className="block text-sm">Aktivite adı<input className={input} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label> : <>
                <label className="block text-sm">Başlangıç (tarih ve saat)<input className={input} value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value, ...(draft.endTime ? { duration: Math.round((Date.parse(draft.endTime) - Date.parse(e.target.value)) / 1000) } : {}) })} /></label>
                <label className="block text-sm">Bitiş (tarih ve saat)<input className={input} value={draft.endTime ?? ''} onChange={e => { const endTime = e.target.value; setDraft({ ...draft, endTime, duration: Math.round((Date.parse(endTime) - Date.parse(draft.startTime)) / 1000) }); }} /></label>
            </>}
        </div>}
        <div className="flex flex-wrap gap-2 mt-3"><button className={button} disabled={saving} onClick={() => { void save(); }}>Seçimi uygula</button>{chosen && <button className={button} onClick={() => { setDraft(chosen); setEditing(true); }}>Düzenleyerek birleştir</button>}</div>
    </details>;
}
export default function SyncPanel() {
    const status = useSyncStatus();
    const [link, setLink] = useState('');
    const [devices, setDevices] = useState<Device[]>([]);
    const [invite, setInvite] = useState<{ link: string; expires: number; qr: string } | null>(null);
    const [recovery, setRecovery] = useState<{ code: string; file: string } | null>(null);
    const [recoveryCode, setRecoveryCode] = useState('');
    const [recoveryFile, setRecoveryFile] = useState('');
    const [error, setError] = useState<string | null>(null);
    const localCount = useStore(s => s.records.length);
    const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    useEffect(() => {
        if (!invite) return;
        const timer = setTimeout(() => setInvite(null), Math.max(0, invite.expires - Date.now()));
        return () => clearTimeout(timer);
    }, [invite]);
    const makeInvite = async () => {
        const result = await createInvite();
        setInvite({ ...result, qr: await QRCode.toDataURL(result.link, { errorCorrectionLevel: 'M', margin: 3, width: 320, color: { dark: '#111111', light: '#ffffff' } }) });
    };
    const isSecure = typeof window === 'undefined' || window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return <section className="space-y-3" aria-labelledby="sync-heading">
        <h2 id="sync-heading" className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Smartphone size={20} /> Cihazlar ve Eşitleme</h2>
        <div className="rounded-2xl bg-white dark:bg-gray-900 p-4 space-y-4 text-gray-900 dark:text-gray-100">
            {!isSecure && (
                <div role="alert" className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400 text-xs space-y-1">
                    <p className="font-semibold text-sm flex items-center gap-1.5"><AlertCircle size={16} /> Güvenli Bağlantı (HTTPS) Gerekli</p>
                    <p>Tarayıcılar uçtan uca şifreleme (Web Cryptography) standartlarını yalnızca HTTPS üzerinden etkinleştirir. Lütfen bu sayfayı adres çubuğunda <code>https://</code> ile açın.</p>
                </div>
            )}
            <div aria-live="polite" className="flex items-start gap-3">
                {status.busy ? <RefreshCw size={18} className="animate-spin shrink-0 mt-0.5" /> : status.connected ? <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" /> : <Link2 size={18} className="shrink-0 mt-0.5" />}
                <div className="min-w-0"><p className="text-sm font-semibold">{status.message}</p><p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{status.connected ? `${status.pending} değişiklik bekliyor${status.lastSync ? ` · Son eşitleme ${new Date(status.lastSync).toLocaleTimeString('tr-TR')}` : ''}` : 'Kayıtlarınızı QR kodla diğer cihazlarınıza taşıyın.'}</p></div>
            </div>
            {(error || status.error) && <p role="alert" className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2"><AlertCircle size={18} className="shrink-0 mt-0.5" />{error || status.error}</p>}
            {!status.connected ? <>
                <p className="text-sm text-gray-600 dark:text-gray-400">Sunucuya yalnızca şifreli veri gönderilir. Yerel kayıtlarınız ({localCount} kayıt) bu cihazda okunabilir biçimde korunur. Tüm cihazlarınızı ve kurtarma bilginizi kaybederseniz bulut verileri çözülemez.</p>
                <div className="pt-1">
                    <button className={`${button} bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 px-5 shadow-md`} disabled={status.busy} onClick={() => { void run(async () => { await createVault(); await makeInvite(); }); }}><Link2 size={18} /> Cihazı eşle (QR Kod Oluştur)</button>
                </div>
                <details open={status.invitePending} className="pt-2"><summary className="cursor-pointer text-sm font-semibold">{status.invitePending ? '✨ QR daveti alındı — eşleştirmeyi tamamla' : 'Mevcut kasaya bağlan'}</summary>
                    <div className="space-y-2 pt-3"><label className="block text-sm">Eşleştirme bağlantısı<input className={input} type="password" autoComplete="off" value={link} onChange={e => setLink(e.target.value)} placeholder={status.invitePending ? 'QR bağlantısı hazır' : 'Diğer cihazdaki bağlantıyı yapıştırın'} /></label><button className={`${button} bg-emerald-600 hover:bg-emerald-700 text-white font-bold`} disabled={status.busy || (!link && !status.invitePending)} onClick={() => { void run(async () => { await joinVault(link); setLink(''); }); }}>Kayıtları birleştir ve bağlan</button></div>
                </details>
                <details><summary className="cursor-pointer text-sm font-semibold text-gray-500">Kurtarma paketiyle erişimi geri kazan</summary><div className="space-y-3 pt-3">
                    <label className="block text-sm">Kurtarma dosyası<input type="file" accept=".json" className="block w-full mt-1 text-sm" onChange={e => { const file = e.target.files?.[0]; if (file) { if (file.size > 32000) setError('Kurtarma dosyası çok büyük.'); else void file.text().then(setRecoveryFile); } }} /></label>
                    <label className="block text-sm">Kurtarma kodu<input className={input} type="password" autoComplete="off" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} /></label>
                    <button className={button} disabled={!recoveryFile || !recoveryCode || status.busy} onClick={() => { void run(async () => { await recover(recoveryFile, recoveryCode); setRecoveryCode(''); setRecoveryFile(''); }); }}>Erişimi geri kazan</button>
                </div></details>
            </> : <>
                <div className="flex flex-wrap gap-2"><button className={button} disabled={status.busy} onClick={() => { void syncNow(); }}><RefreshCw size={16} /> Şimdi eşitle</button><button className={button} disabled={status.busy} onClick={() => { void run(makeInvite); }}>Yeni cihaz ekle</button></div>
                {invite && <div className="space-y-3">
                    <img src={invite.qr} width={320} height={320} alt="Cihaz eşleştirme QR kodu" className="block max-w-full mx-auto rounded-xl" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Telefon kamerasıyla okutun. Tek kullanımlık davet {new Date(invite.expires).toLocaleTimeString('tr-TR')} saatinde sona erer. Bu bağlantıyı yalnızca kendi cihazınızda açın.</p>
                    <div className="flex gap-2"><button className={button} onClick={() => { void run(() => navigator.clipboard.writeText(invite.link)); }}>Bağlantıyı kopyala</button><button className={button} onClick={() => setInvite(null)}>QR kodunu gizle</button></div>
                </div>}
                <details><summary className="text-sm font-semibold cursor-pointer" onClick={() => { void run(async () => setDevices(await listDevices())); }}>Bağlı cihazlar</summary>
                    <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-800">{devices.map(device => <li key={device.id} className="py-3 flex items-center justify-between gap-2"><span className="text-sm">{device.id === status.deviceId ? 'Bu cihaz' : `Cihaz ${device.id.slice(0, 6)}`}<span className="block text-xs text-gray-600 dark:text-gray-400">{device.role === 'admin' ? 'Yönetici' : 'Eşleşmiş cihaz'} · {new Date(device.seen).toLocaleDateString('tr-TR')}</span></span>{status.role === 'admin' && device.id !== status.deviceId && <button className={button} disabled={status.busy} onClick={() => { if (confirm('Bu cihazın sunucu erişimi kapatılsın mı? Daha önce indirdiği veriler silinmez.')) void run(async () => { await revokeDevice(device.id); setDevices(await listDevices()); }); }}>Erişimi kapat</button>}</li>)}</ul>
                </details>
                {status.role === 'admin' && <details><summary className="text-sm font-semibold cursor-pointer">Kurtarma ve güvenlik</summary><div className="space-y-3 pt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Kurtarma dosyası ve kodunu birlikte saklayın. Bu paket zaman kayıtlarının yedeği değildir.</p>
                    <button className={button} disabled={status.busy} onClick={() => { void run(async () => setRecovery(await recoveryPackage())); }}>Kurtarma paketi oluştur</button>
                    {recovery && <div className="space-y-2"><label className="block text-sm">Kurtarma kodu<input className={input} readOnly value={recovery.code} /></label><button className={button} onClick={() => downloadText(recovery.file, 'simple-time-tracker-recovery-v1.json')}><Download size={16} /> Kurtarma dosyasını indir</button><button className={button} onClick={() => setRecovery(null)}><Check size={16} /> Sakladım, gizle</button></div>}
                    <button className={button} disabled={status.busy} onClick={() => { if (confirm('Anahtar yenilensin mi? Diğer cihazların erişimi kapanacak. Yeniden eşleştirme ve yeni kurtarma paketi gerekecek.')) void run(async () => { await rotateKey(); setRecovery(null); setInvite(null); }); }}>Anahtarı yenile</button>
                    <button className={`${button} text-red-700 dark:text-red-300`} disabled={status.busy} onClick={() => { if (confirm('Buluttaki kasayı kalıcı olarak silmek istiyor musunuz? Cihazlardaki yerel kayıtlar korunur.')) void run(deleteVault); }}>Bulut kasasını sil</button>
                </div></details>}
                <button className={button} disabled={status.busy} onClick={() => { if (confirm('Bu cihazın bağlantısı kaldırılsın mı? Gönderilmemiş kayıtlar buluta ulaşmaz. Yerel kayıtlar korunur. Tek cihazınızsa önce kurtarma paketinizi saklayın.')) void run(async () => { await disconnect(); setInvite(null); setRecovery(null); }); }}><Unplug size={16} /> Bu cihazın bağlantısını kaldır</button>
            </>}
            <button className="text-xs underline underline-offset-4 text-gray-600 dark:text-gray-400 block" onClick={() => { void run(async () => { const backup = await latestBackup(); if (!backup) throw new Error('Geçiş yedeği bulunamadı.'); downloadText(JSON.stringify(JSON.parse(backup).state, null, 2), 'simple-time-tracker-local-backup.json'); }); }}>Geçiş öncesi yerel yedeği indir</button>
            {status.conflicts.length > 0 && <div className="space-y-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">{status.conflicts.length} kayıt incelenmeli</h3>
                    <button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm" disabled={status.busy} onClick={() => { void run(async () => { for (const c of status.conflicts) { await resolveConflict(c.key, c.heads[0].value, c.heads.map(h => h.id)); } }); }}>Tümünü Bu Cihazla Otomatik Çöz</button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Şimdi inceleyebilir veya "Tümünü Bu Cihazla Otomatik Çöz" diyerek bu cihazdaki versiyonları geçerli kılabilirsiniz.</p>
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {status.conflicts.slice(0, 10).map(conflict => <ConflictRow key={`${conflict.key}:${conflict.heads.map(h => h.id).join(',')}`} conflict={conflict} onError={setError} />)}
                </div>
                {status.conflicts.length > 10 && <p className="text-xs text-amber-600 dark:text-amber-400 italic">...ve {status.conflicts.length - 10} kayıt daha (tarayıcı performansı için ilk 10 gösteriliyor).</p>}
            </div>}
            {status.activeSessions.length > 1 && <div><h3 className="font-semibold text-sm">Birden fazla cihazda sayaç başlatılmış</h3><p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Oturumlar korunuyor. Bitirdiğiniz oturumları durdurun.</p>{status.activeSessions.map(session => <div key={session.id} className="flex items-center justify-between gap-2 py-2"><span className="text-sm">{new Date(session.startTime).toLocaleString('tr-TR')}</span><button className={button} onClick={() => { void run(async () => { const endTime = new Date().toISOString(); const heads = headsFor((await allOperations()).filter(o => entityKey(o) === `session:${session.id}`)); await resolveConflict(`session:${session.id}`, { ...session, endTime, duration: Math.round((Date.parse(endTime) - Date.parse(session.startTime)) / 1000) }, heads.map(h => h.id)); }); }}>Durdur</button></div>)}</div>}
        </div>
    </section>;
}
