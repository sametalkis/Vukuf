import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { startSync, useSyncStatus } from '../sync/engine';

export default function SyncGate({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const status = useSyncStatus();
    useEffect(() => { startSync(); }, []);
    if (!status.ready) return <main className="min-h-screen flex items-center justify-center px-6 bg-gray-100 dark:bg-gray-950"><div className="max-w-sm space-y-3"><h1 className="text-lg font-bold">{t('sync.syncGateTitle')}</h1><p className="text-sm text-gray-600 dark:text-gray-400">{t('sync.syncGateDesc')}</p>{status.error && <p role="alert" className="text-sm text-red-600">{status.error}</p>}<button className="text-sm underline" onClick={() => location.reload()}>{t('sync.syncGateRetry')}</button></div></main>;
    return <>{status.invitePending && <div className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-emerald-800 text-white text-center text-sm"><Link to="/settings" className="underline font-semibold">{t('sync.syncGateInviteBanner')}</Link></div>}{status.error && !status.connected && <div role="alert" className="bg-red-100 text-red-900 p-3 text-sm">{status.error}</div>}{children}</>;
}
