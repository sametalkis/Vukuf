import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Bot, Check, Copy, Download, ExternalLink, Link2, RefreshCw, ShieldCheck, Smartphone, Sparkles, Unplug, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createInvite, createVault, deleteVault, disconnect, generateMcpConnection, joinVault, listDevices, recover, recoveryPackage, revokeDevice, rotateKey, syncNow, useSyncStatus } from '../sync/engine';
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
function describe(value: EntityValue | null, t: (k: string) => string, locale: string, lang: string): string {
    if (!value) return t('sync.deleted');
    if ('name' in value) return `${value.name} · ${value.color}`;
    return `${new Date(value.startTime).toLocaleString(locale)} → ${value.endTime ? new Date(value.endTime).toLocaleString(locale) : t('editRecord.running')}${value.duration !== undefined ? ` · ${formatDuration(value.duration, lang)}` : ''}`;
}
function ConflictRow({ conflict, onError }: { conflict: Conflict; onError: (text: string) => void }) {
    const { t, i18n } = useTranslation();
    const locale = i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US';
    const [selected, setSelected] = useState(0);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<EntityValue | null>(conflict.heads[0].value);
    const [saving, setSaving] = useState(false);
    const activityNames = useStore(s => s.recordTypes);
    const chosen = conflict.heads[selected]?.value ?? null;
    const label = chosen && 'name' in chosen ? chosen.name : chosen && 'recordTypeId' in chosen ? activityNames.find(a => a.id === chosen.recordTypeId)?.name ?? t('sync.session') : t('sync.deletedRecord');
    const save = async () => {
        setSaving(true);
        try { await resolveConflict(conflict.key, editing ? draft : chosen, conflict.heads.map(h => h.id)); }
        catch (error) { onError(String(error)); } finally { setSaving(false); }
    };
    return <details className="border-t border-gray-200 dark:border-gray-800 py-3">
        <summary className="cursor-pointer text-sm font-semibold">{t('sync.conflictReview', { name: label })}</summary>
        <p className="text-xs text-gray-600 dark:text-gray-400 my-3">{t('sync.commonVersion', { desc: describe(conflict.base, t, locale, i18n.language) })}</p>
        <fieldset className="space-y-2"><legend className="sr-only">{t('sync.versionToUse')}</legend>
            {conflict.heads.map((head, i) => <label key={head.id} className="flex gap-3 items-start p-2 rounded-lg bg-gray-50 dark:bg-gray-950">
                <input type="radio" name={conflict.key} checked={selected === i} onChange={() => { setSelected(i); setDraft(head.value); setEditing(false); }} />
                <span className="text-sm break-words min-w-0">{describe(head.value, t, locale, i18n.language)}<span className="block text-xs text-gray-600 dark:text-gray-400">{t('sync.device', { id: head.deviceId.slice(0, 6) })}</span></span>
            </label>)}
        </fieldset>
        {editing && draft && <div className="space-y-2 my-3">
            {'name' in draft ? <label className="block text-sm">{t('sync.activityName')}<input className={input} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label> : <>
                <label className="block text-sm">{t('sync.startTimeLabel')}<input className={input} value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value, ...(draft.endTime ? { duration: Math.round((Date.parse(draft.endTime) - Date.parse(e.target.value)) / 1000) } : {}) })} /></label>
                <label className="block text-sm">{t('sync.endTimeLabel')}<input className={input} value={draft.endTime ?? ''} onChange={e => { const endTime = e.target.value; setDraft({ ...draft, endTime, duration: Math.round((Date.parse(endTime) - Date.parse(draft.startTime)) / 1000) }); }} /></label>
            </>}
        </div>}
        <div className="flex flex-wrap gap-2 mt-3"><button className={button} disabled={saving} onClick={() => { void save(); }}>{t('sync.applyChoice')}</button>{chosen && <button className={button} onClick={() => { setDraft(chosen); setEditing(true); }}>{t('sync.mergeEdit')}</button>}</div>
    </details>;
}
export default function SyncPanel() {
    const { t, i18n } = useTranslation();
    const locale = i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US';
    const status = useSyncStatus();
    const [link, setLink] = useState('');
    const [devices, setDevices] = useState<Device[]>([]);
    const [invite, setInvite] = useState<{ link: string; expires: number; qr: string } | null>(null);
    const [recovery, setRecovery] = useState<{ code: string; file: string } | null>(null);
    const [recoveryCode, setRecoveryCode] = useState('');
    const [recoveryFile, setRecoveryFile] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [mcp, setMcp] = useState<{ url: string; copied: boolean } | null>(null);
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
    const makeMcpConnection = async () => {
        const res = await generateMcpConnection();
        setMcp({ url: res.mcpUrl, copied: false });
    };
    const isSecure = typeof window === 'undefined' || window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return <section className="space-y-3" aria-labelledby="sync-heading">
        <h2 id="sync-heading" className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Smartphone size={20} /> {t('sync.title')}</h2>
        <div className="rounded-2xl bg-white dark:bg-gray-900 p-4 space-y-4 text-gray-900 dark:text-gray-100">
            {!isSecure && (
                <div role="alert" className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400 text-xs space-y-1">
                    <p className="font-semibold text-sm flex items-center gap-1.5"><AlertCircle size={16} /> {t('sync.httpsRequired')}</p>
                    <p>{t('sync.httpsDesc')}</p>
                </div>
            )}
            <div aria-live="polite" className="flex items-start gap-3">
                {status.busy ? <RefreshCw size={18} className="animate-spin shrink-0 mt-0.5" /> : status.connected ? <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" /> : <Link2 size={18} className="shrink-0 mt-0.5" />}
                <div className="min-w-0">
                    <p className="text-sm font-semibold">{status.messageKey ? t(status.messageKey, status.messageParams) : status.message}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{status.connected ? `${t('sync.waitingChanges', { count: status.pending })}${status.lastSync ? ` · ${t('sync.lastSync', { time: new Date(status.lastSync).toLocaleTimeString(locale) })}` : ''}` : t('sync.qrNotice')}</p>
                </div>
            </div>
            {(error || status.error) && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    {error || (status.errorCode && i18n.exists(`sync.errors.${status.errorCode}`) ? t(`sync.errors.${status.errorCode}`) : status.error)}
                </p>
            )}
            {!status.connected ? <>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('sync.encryptedNote', { count: localCount })}</p>
                <div className="pt-1">
                    <button className={`${button} bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 px-5 shadow-md`} disabled={status.busy} onClick={() => { void run(async () => { await createVault(); await makeInvite(); }); }}><Link2 size={18} /> {t('sync.pairDevice')}</button>
                </div>
                <details open={status.invitePending} className="pt-2"><summary className="cursor-pointer text-sm font-semibold">{status.invitePending ? t('sync.invitePending') : t('sync.connectExisting')}</summary>
                    <div className="space-y-2 pt-3"><label className="block text-sm">{t('sync.pairingLink')}<input className={input} type="password" autoComplete="off" value={link} onChange={e => setLink(e.target.value)} placeholder={status.invitePending ? t('sync.qrReady') : t('sync.pasteLink')} /></label><button className={`${button} bg-emerald-600 hover:bg-emerald-700 text-white font-bold`} disabled={status.busy || (!link && !status.invitePending)} onClick={() => { void run(async () => { await joinVault(link); setLink(''); }); }}>{t('sync.mergeAndConnect')}</button></div>
                </details>
                <details><summary className="cursor-pointer text-sm font-semibold text-gray-500">{t('sync.recoveryRestore')}</summary><div className="space-y-3 pt-3">
                    <label className="block text-sm">{t('sync.recoveryFile')}<input type="file" accept=".json" className="block w-full mt-1 text-sm" onChange={e => { const file = e.target.files?.[0]; if (file) { if (file.size > 32000) setError(t('sync.recoveryTooLarge')); else void file.text().then(setRecoveryFile); } }} /></label>
                    <label className="block text-sm">{t('sync.recoveryCode')}<input className={input} type="password" autoComplete="off" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} /></label>
                    <button className={button} disabled={!recoveryFile || !recoveryCode || status.busy} onClick={() => { void run(async () => { await recover(recoveryFile, recoveryCode); setRecoveryCode(''); setRecoveryFile(''); }); }}>{t('sync.restoreAccess')}</button>
                </div></details>
            </> : <>
                <div className="flex flex-wrap gap-2">
                    <button className={button} disabled={status.busy} onClick={() => { void syncNow(); }}><RefreshCw size={16} /> {t('sync.syncNow')}</button>
                    <button className={button} disabled={status.busy} onClick={() => { void run(makeInvite); }}>{t('sync.addDevice')}</button>
                    <button className={button} disabled={status.busy} onClick={() => { void run(makeMcpConnection); }}><Bot size={16} /> {t('sync.connectAi')}</button>
                </div>
                {mcp && (
                    <div className="space-y-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-2 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 shrink-0">
                                    <Bot size={18} />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('sync.mcpConnection')}</h3>
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">{t('sync.mcpPermanent')}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t('sync.mcpBridgeDesc')}</p>
                                </div>
                            </div>
                            <button
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
                                onClick={() => setMcp(null)}
                                title={t('common.close')}
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">{t('sync.mcpCustomUrl')}</label>
                            <input className={`${input} font-mono text-xs select-all`} readOnly value={mcp.url} />
                            <div className="flex flex-wrap gap-2 pt-0.5">
                                <button
                                    className={`${button} ${mcp.copied ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                                    onClick={() => {
                                        void navigator.clipboard.writeText(mcp.url);
                                        setMcp({ ...mcp, copied: true });
                                        setTimeout(() => setMcp(prev => prev ? { ...prev, copied: false } : null), 2000);
                                    }}
                                    title={t('sync.copyLink')}
                                >
                                    {mcp.copied ? <Check size={16} /> : <Copy size={16} />}
                                    <span>{mcp.copied ? t('common.copied') : t('common.copy')}</span>
                                </button>
                                <button
                                    className={button}
                                    onClick={() => {
                                        void navigator.clipboard.writeText(mcp.url);
                                        setMcp({ ...mcp, copied: true });
                                        const claudeUrl = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent('Vukuf')}&connectorUrl=${encodeURIComponent(mcp.url)}`;
                                        window.open(claudeUrl, '_blank', 'noopener,noreferrer');
                                        setTimeout(() => setMcp(prev => prev ? { ...prev, copied: false } : null), 2000);
                                    }}
                                    title="Claude"
                                >
                                    <ExternalLink size={16} />
                                    <span>{t('sync.addToClaude')}</span>
                                </button>
                                <button
                                    className={button}
                                    onClick={() => {
                                        void navigator.clipboard.writeText(mcp.url);
                                        setMcp({ ...mcp, copied: true });
                                        const chatgptUrl = `https://chatgpt.com/plugins#settings/Connectors?create-connector=true&name=${encodeURIComponent('Vukuf')}&url=${encodeURIComponent(mcp.url)}&connectorName=${encodeURIComponent('Vukuf')}&connectorUrl=${encodeURIComponent(mcp.url)}&redirectAfter=%2Fplugins`;
                                        window.open(chatgptUrl, '_blank', 'noopener,noreferrer');
                                        setTimeout(() => setMcp(prev => prev ? { ...prev, copied: false } : null), 2000);
                                    }}
                                    title="ChatGPT"
                                >
                                    <ExternalLink size={16} />
                                    <span>{t('sync.addToChatgpt')}</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 pt-1">
                            <details className="border-t border-gray-200 dark:border-gray-800 pt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-gray-400" /> {t('sync.chatgptGuideTitle')}
                                </summary>
                                <ol className="list-decimal list-inside space-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400 pl-1 leading-relaxed">
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.chatgptStep1') }} />
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.chatgptStep2') }} />
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.chatgptStep3') }} />
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.chatgptStep4') }} />
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.chatgptStep5') }} />
                                </ol>
                            </details>

                            <details className="border-t border-gray-200 dark:border-gray-800 pt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-gray-400" /> {t('sync.claudeGuideTitle')}
                                </summary>
                                <ol className="list-decimal list-inside space-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400 pl-1 leading-relaxed">
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.claudeStep1') }} />
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.claudeStep2') }} />
                                    <li dangerouslySetInnerHTML={{ __html: t('sync.claudeStep3') }} />
                                </ol>
                            </details>

                            <details className="border-t border-gray-200 dark:border-gray-800 pt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                                    {t('sync.desktopGuideTitle')}
                                </summary>
                                <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                    <p dangerouslySetInnerHTML={{ __html: t('sync.desktopConfigDesc') }} />
                                    <pre className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 font-mono text-[11px] overflow-x-auto text-gray-800 dark:text-gray-200">
{JSON.stringify({
  mcpServers: {
    "vukuf": {
      url: mcp.url
    }
  }
}, null, 2)}
                                    </pre>
                                </div>
                            </details>
                        </div>

                        <p className="text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800 pt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('sync.mcpNotice') }} />
                    </div>
                )}
                {invite && <div className="space-y-3">
                    <img src={invite.qr} width={320} height={320} alt={t('sync.qrAlt')} className="block max-w-full mx-auto rounded-xl" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('sync.qrInviteInfo', { time: new Date(invite.expires).toLocaleTimeString(locale) })}</p>
                    <div className="flex gap-2"><button className={button} onClick={() => { void run(() => navigator.clipboard.writeText(invite.link)); }}>{t('sync.copyLink')}</button><button className={button} onClick={() => setInvite(null)}>{t('sync.hideQr')}</button></div>
                </div>}
                <details><summary className="text-sm font-semibold cursor-pointer" onClick={() => { void run(async () => setDevices(await listDevices())); }}>{t('sync.connectedDevices')}</summary>
                    <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-800">{devices.map(device => <li key={device.id} className="py-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0">{device.id.startsWith('ai_') && <Bot size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />}<div className="min-w-0"><span className="text-sm font-medium">{device.id === status.deviceId ? t('sync.thisDevice') : device.id.startsWith('ai_') ? t('sync.aiAssistantDevice') : t('sync.device', { id: device.id.slice(0, 6) })}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{device.id.startsWith('ai_') ? t('sync.mcpWritePerm') : device.role === 'admin' ? t('sync.adminRole') : t('sync.pairedRole')} · {new Date(device.seen).toLocaleDateString(locale)}</span></div></div>{status.role === 'admin' && device.id !== status.deviceId && <button className={button} disabled={status.busy} onClick={() => { if (confirm(t('sync.revokeConfirm', { name: device.id.startsWith('ai_') ? t('sync.aiAssistantDevice') : t('sync.thisDevice') }))) void run(async () => { await revokeDevice(device.id); setDevices(await listDevices()); }); }}>{t('sync.revokeAccess')}</button>}</li>)}</ul>
                </details>
                {status.role === 'admin' && <details><summary className="text-sm font-semibold cursor-pointer">{t('sync.recoverySecurity')}</summary><div className="space-y-3 pt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('sync.recoveryNotice')}</p>
                    <button className={button} disabled={status.busy} onClick={() => { void run(async () => setRecovery(await recoveryPackage())); }}>{t('sync.createRecovery')}</button>
                    {recovery && <div className="space-y-2"><label className="block text-sm">{t('sync.recoveryCode')}<input className={input} readOnly value={recovery.code} /></label><button className={button} onClick={() => downloadText(recovery.file, 'vukuf-recovery-v1.json')}><Download size={16} /> {t('sync.downloadRecovery')}</button><button className={button} onClick={() => setRecovery(null)}><Check size={16} /> {t('sync.recoverySaved')}</button></div>}
                    <button className={button} disabled={status.busy} onClick={() => { if (confirm(t('sync.rotateKeyConfirm'))) void run(async () => { await rotateKey(); setRecovery(null); setInvite(null); }); }}>{t('sync.rotateKey')}</button>
                    <button className={`${button} text-red-700 dark:text-red-300`} disabled={status.busy} onClick={() => { if (confirm(t('sync.deleteVaultConfirm'))) void run(deleteVault); }}>{t('sync.deleteVault')}</button>
                </div></details>}
                <button className={button} disabled={status.busy} onClick={() => { if (confirm(t('sync.disconnectConfirmDetail'))) void run(async () => { await disconnect(); setInvite(null); setRecovery(null); }); }}><Unplug size={16} /> {t('sync.removeDevice')}</button>
            </>}
            <button className="text-xs underline underline-offset-4 text-gray-600 dark:text-gray-400 block" onClick={() => { void run(async () => { const backup = await latestBackup(); if (!backup) throw new Error(t('sync.backupNotFound')); downloadText(JSON.stringify(JSON.parse(backup).state, null, 2), 'vukuf-local-backup.json'); }); }}>{t('sync.downloadPreMigrationBackup')}</button>
            {status.conflicts.length > 0 && <div className="space-y-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">{t('sync.conflictsCount', { count: status.conflicts.length })}</h3>
                    <button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm" disabled={status.busy} onClick={() => { void run(async () => { for (const c of status.conflicts) { await resolveConflict(c.key, c.heads[0].value, c.heads.map(h => h.id)); } }); }}>{t('sync.autoResolveAll')}</button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('sync.conflictsHelp')}</p>
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {status.conflicts.slice(0, 10).map(conflict => <ConflictRow key={`${conflict.key}:${conflict.heads.map(h => h.id).join(',')}`} conflict={conflict} onError={setError} />)}
                </div>
                {status.conflicts.length > 10 && <p className="text-xs text-amber-600 dark:text-amber-400 italic">{t('sync.conflictsMore', { count: status.conflicts.length - 10 })}</p>}
            </div>}
            {status.activeSessions.length > 1 && <div><h3 className="font-semibold text-sm">{t('sync.multipleSessionsTitle')}</h3><p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('sync.multipleSessionsDesc')}</p>{status.activeSessions.map(session => <div key={session.id} className="flex items-center justify-between gap-2 py-2"><span className="text-sm">{new Date(session.startTime).toLocaleString(locale)}</span><button className={button} onClick={() => { void run(async () => { const endTime = new Date().toISOString(); const heads = headsFor((await allOperations()).filter(o => entityKey(o) === `session:${session.id}`)); await resolveConflict(`session:${session.id}`, { ...session, endTime, duration: Math.round((Date.parse(endTime) - Date.parse(session.startTime)) / 1000) }, heads.map(h => h.id)); }); }}>{t('common.stop')}</button></div>)}</div>}
        </div>
    </section>;
}
