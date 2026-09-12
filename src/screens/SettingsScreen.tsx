import { useRef, useState } from 'react';
import { Moon, Sun, Download, Upload, Trash2, AlertTriangle, Check, Clock, Palette, Bell, Repeat, Volume2, VolumeX, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';
import { ACCENT_PRESETS } from '../utils/accentColor';
import { checkNotificationPermission, requestNotificationPermission, sendActivityNotification } from '../utils/notifications';

export default function SettingsScreen() {
    const { theme, toggleTheme } = useTheme();
    const {
        recordTypes, records, runningRecord,
        importData, importCSV, importBackup, clearAllData,
        showUntrackedTime, toggleUntrackedTime,
        accentColor, setAccentColor,
        notificationsEnabled, toggleNotifications,
        notificationMinutes, setNotificationMinutes,
        notificationRepeat, toggleNotificationRepeat,
        notificationSound, toggleNotificationSound,
    } = useStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState(checkNotificationPermission());

    const handleRequestPermission = async () => {
        const granted = await requestNotificationPermission();
        setPermissionStatus(checkNotificationPermission());
        if (granted && !notificationsEnabled) {
            toggleNotifications();
        }
    };

    const handleTestNotification = async () => {
        if (checkNotificationPermission() !== 'granted') {
            const granted = await requestNotificationPermission();
            setPermissionStatus(checkNotificationPermission());
            if (!granted) {
                alert('Bildirim izni verilmedi. Lütfen tarayıcı ayarlarından bildirimlere izin verin.');
                return;
            }
        }
        sendActivityNotification(
            '⏰ Hâlâ "Kodlama" mı yapıyorsunuz?',
            '"Kodlama" aktivitesi 45 dakikadır devam ediyor. Hâlâ bu aktiviteyi yapıyor musunuz?',
            notificationSound,
            [
                { action: 'stop', title: '⏹️ Hayır, Durdur' },
                { action: 'continue', title: '▶️ Evet, Devam Et' }
            ]
        );
    };

    const [importStatus, setImportStatus] = useState<{
        type: 'idle' | 'success' | 'error';
        message: string;
    }>({ type: 'idle', message: '' });

    // ── Export ──
    const handleExport = () => {
        const data = { recordTypes, records, runningRecord };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simple-time-tracker-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Unified Import ──
    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        const reader = new FileReader();

        reader.onload = (ev) => {
            const text = (ev.target?.result as string) || '';
            const trimmed = text.trim();

            try {
                // 1. Check if it's STT Android .backup format
                if (fileName.endsWith('.backup') || trimmed.startsWith('app simple time tracker')) {
                    const result = importBackup(text);
                    if (result.imported > 0 || result.activities > 0) {
                        setImportStatus({
                            type: 'success',
                            message: `✓ ${result.activities} activities, ${result.imported} records imported`,
                        });
                    } else {
                        setImportStatus({
                            type: 'error',
                            message: 'No valid data found in .backup file',
                        });
                    }
                }
                // 2. Check if it's CSV
                else if (fileName.endsWith('.csv') || (trimmed.toLowerCase().includes('activity name') && trimmed.toLowerCase().includes('time started'))) {
                    const result = importCSV(text);
                    if (result.imported > 0) {
                        setImportStatus({
                            type: 'success',
                            message: `✓ ${result.imported} records imported${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`,
                        });
                    } else {
                        setImportStatus({
                            type: 'error',
                            message: 'Format error: "activity name", "time started", "time ended" columns required',
                        });
                    }
                }
                // 3. Check if it's JSON
                else if (fileName.endsWith('.json') || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                    const parsed = JSON.parse(text);
                    if (parsed.recordTypes && parsed.records !== undefined) {
                        importData(text);
                        setImportStatus({
                            type: 'success',
                            message: `✓ ${parsed.records.length} records, ${parsed.recordTypes.length} activities imported`,
                        });
                    } else {
                        setImportStatus({
                            type: 'error',
                            message: 'Invalid JSON backup format',
                        });
                    }
                }
                // 4. Fallback attempt: try JSON, then Backup, then CSV
                else {
                    let handled = false;
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed.recordTypes && parsed.records !== undefined) {
                            importData(text);
                            setImportStatus({
                                type: 'success',
                                message: `✓ ${parsed.records.length} records, ${parsed.recordTypes.length} activities imported`,
                            });
                            handled = true;
                        }
                    } catch {}

                    if (!handled) {
                        const backupRes = importBackup(text);
                        if (backupRes.imported > 0 || backupRes.activities > 0) {
                            setImportStatus({
                                type: 'success',
                                message: `✓ ${backupRes.activities} activities, ${backupRes.imported} records imported`,
                            });
                            handled = true;
                        }
                    }

                    if (!handled) {
                        const csvRes = importCSV(text);
                        if (csvRes.imported > 0) {
                            setImportStatus({
                                type: 'success',
                                message: `✓ ${csvRes.imported} records imported`,
                            });
                            handled = true;
                        }
                    }

                    if (!handled) {
                        setImportStatus({
                            type: 'error',
                            message: 'Unsupported format (.json, .csv, .backup supported)',
                        });
                    }
                }
            } catch {
                setImportStatus({
                    type: 'error',
                    message: 'Failed to read or parse file',
                });
            }

            setTimeout(() => {
                setImportStatus({ type: 'idle', message: '' });
            }, 4500);
        };

        reader.readAsText(file);
        e.target.value = ''; // reset
    };

    // ── Clear ──
    const handleClear = () => {
        clearAllData();
        setShowClearConfirm(false);
    };

    return (
        <>
            <div className="px-4 pt-12 pb-6 space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Settings</h1>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Customize your experience</p>
                </div>

                {/* Appearance */}
                <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                        Appearance
                    </h2>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
                        <button
                            onClick={toggleTheme}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                {theme === 'dark' ? <Moon size={20} className="text-primary-500" /> : <Sun size={20} className="text-amber-500" />}
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    Tap to switch to {theme === 'dark' ? 'light' : 'dark'} mode
                                </p>
                            </div>
                            <div className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${theme === 'dark' ? 'bg-primary-600' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${theme === 'dark' ? 'left-6' : 'left-0.5'}`} />
                            </div>
                        </button>

                        {/* Show Untracked Time */}
                        <div className="flex items-center justify-between px-4 py-4 border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                    <Clock size={20} className="text-purple-500" />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Show Untracked Time</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Show gaps &gt; 1m as untracked</p>
                                </div>
                            </div>
                            <button
                                onClick={toggleUntrackedTime}
                                className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${showUntrackedTime ? 'bg-primary-600' : 'bg-gray-300'}`}
                            >
                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${showUntrackedTime ? 'left-6' : 'left-0.5'}`} />
                            </button>
                        </div>

                        {/* Accent Color */}
                        <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-800 transition-colors">
                            <div className="flex items-center gap-4 mb-3">
                                <div
                                    className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors"
                                    style={{
                                        backgroundColor: 'var(--primary-soft, rgba(255, 145, 0, 0.15))',
                                        color: 'var(--primary, #ff9100)'
                                    }}
                                >
                                    <Palette size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Accent Color</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Customize buttons, icons & active slider</p>
                                </div>
                            </div>

                            {/* Palette Swatches */}
                            <div className="accent-picker pl-14">
                                {ACCENT_PRESETS.map((opt) => {
                                    const isSelected = (accentColor || '#ff9100').toLowerCase() === opt.hex.toLowerCase();
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            title={opt.name}
                                            aria-label={opt.name}
                                            className={`accent-picker__item${isSelected ? ' accent-picker__item--active' : ''}`}
                                            style={{ color: opt.hex }}
                                            onClick={() => setAccentColor(opt.hex)}
                                        >
                                            <span className="accent-picker__swatch" style={{ backgroundColor: opt.hex }} />
                                        </button>
                                    );
                                })}

                                {/* Custom Color Picker */}
                                {(() => {
                                    const isCustom = !ACCENT_PRESETS.some(
                                        p => p.hex.toLowerCase() === (accentColor || '').toLowerCase()
                                    );
                                    return (
                                        <label
                                            className={`accent-picker__custom-wrapper${isCustom ? ' accent-picker__custom-wrapper--active' : ''}`}
                                            title="Custom Color Picker"
                                            style={{ color: isCustom ? accentColor : '#a3a3a3' }}
                                        >
                                            <span
                                                className="accent-picker__custom-swatch"
                                                style={{
                                                    background: isCustom
                                                        ? accentColor
                                                        : 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
                                                }}
                                            />
                                            <input
                                                type="color"
                                                className="accent-picker__custom-input"
                                                value={accentColor || '#ff9100'}
                                                onChange={(e) => setAccentColor(e.target.value)}
                                            />
                                        </label>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Notifications */}
                <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                        Notifications
                    </h2>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                        {/* Permission Banner (if not granted) */}
                        {permissionStatus !== 'granted' && (
                            <div className="p-4 bg-amber-500/10 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <Bell size={20} className="text-amber-500 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                                            {permissionStatus === 'denied' ? 'Bildirim İzni Engellenmiş' : 'Bildirim İzni Gerekli'}
                                        </p>
                                        <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5">
                                            {permissionStatus === 'denied'
                                                ? 'Aktivite uyarıları için tarayıcı site ayarlarından bildirimlere izin verin.'
                                                : 'Aktivite uyarılarını alabilmek için tarayıcı bildirimi izni verin.'}
                                        </p>
                                    </div>
                                </div>
                                {permissionStatus !== 'denied' && (
                                    <button
                                        onClick={handleRequestPermission}
                                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm flex-shrink-0"
                                        style={{ backgroundColor: 'var(--primary, #ff9100)', color: 'var(--primary-contrast, #ffffff)' }}
                                    >
                                        İzin Ver
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Enable/Disable Reminder */}
                        <div className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                            <div className="flex items-center gap-4">
                                <div
                                    className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                                    style={{
                                        backgroundColor: 'var(--primary-soft, rgba(255, 145, 0, 0.15))',
                                        color: 'var(--primary, #ff9100)'
                                    }}
                                >
                                    <Bell size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Aktivite Kontrol Bildirimi</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Hâlâ bu aktiviteyi yapıp yapmadığınızı sorar</p>
                                </div>
                            </div>
                            <button
                                onClick={toggleNotifications}
                                className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${notificationsEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                                style={notificationsEnabled ? { backgroundColor: 'var(--primary, #ff9100)' } : undefined}
                            >
                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${notificationsEnabled ? 'left-6' : 'left-0.5'}`} />
                            </button>
                        </div>

                        {/* Notification Duration Picker & Settings (when enabled) */}
                        {notificationsEnabled && (
                            <>
                                <div className="px-4 py-4 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Kontrol Süresi</p>
                                        <span
                                            className="text-xs font-bold px-2 py-0.5 rounded-md"
                                            style={{ backgroundColor: 'var(--primary-soft, rgba(255, 145, 0, 0.15))', color: 'var(--primary, #ff9100)' }}
                                        >
                                            {notificationMinutes < 60 ? `${notificationMinutes} dakika` : `${notificationMinutes / 60} saat`}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {[15, 30, 45, 60, 90, 120].map((mins) => {
                                            const isSelected = notificationMinutes === mins;
                                            return (
                                                <button
                                                    key={mins}
                                                    type="button"
                                                    onClick={() => setNotificationMinutes(mins)}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                                        isSelected
                                                            ? 'shadow-sm font-bold scale-105'
                                                            : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
                                                    }`}
                                                    style={isSelected ? {
                                                        backgroundColor: 'var(--primary, #ff9100)',
                                                        color: 'var(--primary-contrast, #ffffff)'
                                                    } : undefined}
                                                >
                                                    {mins < 60 ? `${mins} dk` : `${mins / 60} sa`}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Repeat Reminder */}
                                <div className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0 text-gray-500">
                                            <Repeat size={18} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Periyodik Tekrarla</p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Durdurulana kadar her {notificationMinutes} dakikada bir tekrar sor</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={toggleNotificationRepeat}
                                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${notificationRepeat ? 'bg-primary-600' : 'bg-gray-300'}`}
                                        style={notificationRepeat ? { backgroundColor: 'var(--primary, #ff9100)' } : undefined}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${notificationRepeat ? 'left-6' : 'left-0.5'}`} />
                                    </button>
                                </div>

                                {/* Notification Sound */}
                                <div className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0 text-gray-500">
                                            {notificationSound ? <Volume2 size={18} /> : <VolumeX size={18} />}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Sesli Uyarı</p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Bildirim geldiğinde nazik melodi çal</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={toggleNotificationSound}
                                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${notificationSound ? 'bg-primary-600' : 'bg-gray-300'}`}
                                        style={notificationSound ? { backgroundColor: 'var(--primary, #ff9100)' } : undefined}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${notificationSound ? 'left-6' : 'left-0.5'}`} />
                                    </button>
                                </div>

                                {/* Test Notification Button */}
                                <div className="p-4 bg-gray-50/50 dark:bg-neutral-900/50">
                                    <button
                                        type="button"
                                        onClick={handleTestNotification}
                                        className="w-full py-2.5 px-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Send size={14} /> Test Bildirimi Gönder
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {/* Data Management */}
                <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                        Data Management
                    </h2>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
                        {/* Export */}
                        <button
                            onClick={handleExport}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 transition-colors border-b border-gray-100 dark:border-gray-800"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                <Download size={18} className="text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Export Data</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    Download all data as JSON ({records.length} records, {recordTypes.length} activities)
                                </p>
                            </div>
                        </button>

                        {/* Unified Import */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 transition-colors"
                        >
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                                importStatus.type === 'success'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                    : importStatus.type === 'error'
                                    ? 'bg-red-100 dark:bg-red-900/30'
                                    : 'bg-blue-100 dark:bg-blue-900/30'
                            }`}>
                                {importStatus.type === 'success' ? (
                                    <Check size={18} className="text-emerald-500" />
                                ) : importStatus.type === 'error' ? (
                                    <AlertTriangle size={18} className="text-red-500" />
                                ) : (
                                    <Upload size={18} className="text-blue-600 dark:text-blue-400" />
                                )}
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Import Data</p>
                                <p className="text-xs mt-0.5">
                                    {importStatus.type === 'success' ? (
                                        <span className="text-emerald-500 font-medium">{importStatus.message}</span>
                                    ) : importStatus.type === 'error' ? (
                                        <span className="text-red-500 font-medium">{importStatus.message}</span>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-500">
                                            Restore from JSON, CSV or .backup file
                                        </span>
                                    )}
                                </p>
                            </div>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,.csv,.backup"
                            className="hidden"
                            onChange={handleImportFile}
                        />
                    </div>
                </section>

                {/* Danger Zone */}
                <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 px-1">
                        Danger Zone
                    </h2>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
                        <button
                            onClick={() => setShowClearConfirm(true)}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-red-50 dark:hover:bg-red-900/10 active:bg-red-100 transition-colors"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                <Trash2 size={18} className="text-red-600 dark:text-red-400" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-red-600 dark:text-red-400">Clear All Data</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    Permanently delete all activities and records
                                </p>
                            </div>
                        </button>
                    </div>
                </section>

                {/* About */}
                <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">About</h2>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 flex justify-between">
                            <span className="text-sm text-gray-700 dark:text-gray-300">Version</span>
                            <span className="text-sm text-gray-400">1.0.0</span>
                        </div>
                        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />
                        <div className="px-4 py-3 flex justify-between">
                            <span className="text-sm text-gray-700 dark:text-gray-300">Simple Time Tracker</span>
                            <span className="text-sm text-gray-400">Web App</span>
                        </div>
                    </div>
                </section>
            </div>

            {/* Clear Confirmation Modal */}
            <AnimatePresence>
                {showClearConfirm && (
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowClearConfirm(false)}
                    >
                        <motion.div
                            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl p-6 space-y-4 shadow-2xl"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                    <Trash2 size={28} className="text-red-600 dark:text-red-400" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50">Clear All Data?</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    This will permanently delete all <strong>{recordTypes.length}</strong> activities and <strong>{records.length}</strong> records. This cannot be undone.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleClear}
                                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                                >
                                    Clear All
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
