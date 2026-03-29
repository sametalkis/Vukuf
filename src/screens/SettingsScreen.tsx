import { useRef, useState } from 'react';
import { Moon, Sun, Download, Upload, Trash2, AlertTriangle, Check, Clock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';

export default function SettingsScreen() {
    const { theme, toggleTheme } = useTheme();
    const {
        recordTypes, records, runningRecord,
        importData, importCSV, importBackup, clearAllData,
        showUntrackedTime, toggleUntrackedTime
    } = useStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const backupInputRef = useRef<HTMLInputElement>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const [csvStatus, setCsvStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [csvResult, setCsvResult] = useState<{ imported: number; skipped: number } | null>(null);

    const [backupStatus, setBackupStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [backupResult, setBackupResult] = useState<{ imported: number; activities: number; skipped: number } | null>(null);

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

    // ── Import ──
    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                importData(ev.target?.result as string);
                setImportStatus('success');
            } catch {
                setImportStatus('error');
            }
            setTimeout(() => setImportStatus('idle'), 2500);
        };
        reader.readAsText(file);
        e.target.value = ''; // reset
    };

    // ── Clear ──
    const handleClear = () => {
        clearAllData();
        setShowClearConfirm(false);
    };

    // ── CSV Import ──
    const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const result = importCSV(ev.target?.result as string);
                setCsvResult(result);
                setCsvStatus(result.imported > 0 ? 'success' : 'error');
            } catch {
                setCsvStatus('error');
                setCsvResult(null);
            }
            setTimeout(() => { setCsvStatus('idle'); setCsvResult(null); }, 4000);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // ── Backup Import ──
    const handleBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const result = importBackup(ev.target?.result as string);
                setBackupResult(result);
                // Even if 0 records imported, if activities imported it's a success
                setBackupStatus(result.imported > 0 || result.activities > 0 ? 'success' : 'error');
            } catch {
                setBackupStatus('error');
                setBackupResult(null);
            }
            setTimeout(() => { setBackupStatus('idle'); setBackupResult(null); }, 4000);
        };
        reader.readAsText(file);
        e.target.value = '';
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

                        {/* Import JSON */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 transition-colors border-b border-gray-100 dark:border-gray-800"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                {importStatus === 'success' ? (
                                    <Check size={18} className="text-emerald-500" />
                                ) : importStatus === 'error' ? (
                                    <AlertTriangle size={18} className="text-red-500" />
                                ) : (
                                    <Upload size={18} className="text-blue-600 dark:text-blue-400" />
                                )}
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Import JSON</p>
                                <p className="text-xs mt-0.5">
                                    {importStatus === 'success' ? (
                                        <span className="text-emerald-500">Imported successfully!</span>
                                    ) : importStatus === 'error' ? (
                                        <span className="text-red-500">Invalid file format</span>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-500">Upload a previously exported JSON backup</span>
                                    )}
                                </p>
                            </div>
                        </button>
                        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

                        {/* Import CSV (Simple Time Tracker format) */}
                        <button
                            onClick={() => csvInputRef.current?.click()}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 transition-colors border-b border-gray-100 dark:border-gray-800"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                                {csvStatus === 'success' ? (
                                    <Check size={18} className="text-emerald-500" />
                                ) : csvStatus === 'error' ? (
                                    <AlertTriangle size={18} className="text-red-500" />
                                ) : (
                                    <Upload size={18} className="text-violet-600 dark:text-violet-400" />
                                )}
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Import CSV <span className="text-xs font-normal text-gray-400">(Simple Time Tracker)</span></p>
                                <p className="text-xs mt-0.5">
                                    {csvStatus === 'success' && csvResult ? (
                                        <span className="text-emerald-500">
                                            ✓ {csvResult.imported} kayıt eklendi{csvResult.skipped > 0 ? `, ${csvResult.skipped} atlandı` : ''}
                                        </span>
                                    ) : csvStatus === 'error' ? (
                                        <span className="text-red-500">Format hatası — activity name, time started, time ended kolonları gerekli</span>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-500">STT CSV dışa aktarma dosyasını yükle</span>
                                    )}
                                </p>
                            </div>
                        </button>
                        <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />

                        {/* Import Backup (Simple Time Tracker format) */}
                        <button
                            onClick={() => backupInputRef.current?.click()}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 transition-colors"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                                {backupStatus === 'success' ? (
                                    <Check size={18} className="text-emerald-500" />
                                ) : backupStatus === 'error' ? (
                                    <AlertTriangle size={18} className="text-red-500" />
                                ) : (
                                    <Upload size={18} className="text-amber-600 dark:text-amber-400" />
                                )}
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Import Backup <span className="text-xs font-normal text-gray-400">(.backup)</span></p>
                                <p className="text-xs mt-0.5">
                                    {backupStatus === 'success' && backupResult ? (
                                        <span className="text-emerald-500">
                                            ✓ {backupResult.activities} aktivite, {backupResult.imported} kayıt eklendi
                                        </span>
                                    ) : backupStatus === 'error' ? (
                                        <span className="text-red-500">Geçersiz format — STT .backup dosyası gerekli</span>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-500">Android app .backup yedeğini yükle</span>
                                    )}
                                </p>
                            </div>
                        </button>
                        <input ref={backupInputRef} type="file" accept=".backup" className="hidden" onChange={handleBackupFile} />
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
