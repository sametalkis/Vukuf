import { useRef, useState } from "react";
import {
    Moon, Sun, Download, Upload, Trash2, AlertTriangle, Check, Clock,
    Palette, Bell, Repeat, Volume2, VolumeX, Send, Cloud, Database,
    Info, HardDrive
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "../context/ThemeContext";
import { useStore } from "../store/useStore";
import { ACCENT_PRESETS } from "../utils/accentColor";
import { checkNotificationPermission, requestNotificationPermission, sendActivityNotification } from "../utils/notifications";
import SyncPanel from "../components/SyncPanel";

type SettingsTab = "appearance" | "timer" | "sync" | "data";

const TABS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
    { id: "appearance", label: "Görünüm", icon: Palette },
    { id: "timer", label: "Zamanlayıcı", icon: Clock },
    { id: "sync", label: "Bulut & AI", icon: Cloud },
    { id: "data", label: "Veri", icon: Database },
];

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

    const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
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
        if (checkNotificationPermission() !== "granted") {
            const granted = await requestNotificationPermission();
            setPermissionStatus(checkNotificationPermission());
            if (!granted) {
                alert("Bildirim izni verilmedi. Lütfen tarayıcı ayarlarından bildirimlere izin verin.");
                return;
            }
        }
        sendActivityNotification(
            "⏰ Hâlâ \"Kodlama\" mı yapıyorsunuz?",
            "\"Kodlama\" aktivitesi 45 dakikadır devam ediyor. Hâlâ bu aktiviteyi yapıyor musunuz?",
            notificationSound,
            [
                { action: "stop", title: "⏹️ Hayır, Durdur" },
                { action: "continue", title: "▶️ Evet, Devam Et" }
            ]
        );
    };

    const [importStatus, setImportStatus] = useState<{
        type: "idle" | "success" | "error";
        message: string;
    }>({ type: "idle", message: "" });

    // ── Export ──
    const handleExport = () => {
        const data = { recordTypes, records, runningRecord };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
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
            const text = (ev.target?.result as string) || "";
            const trimmed = text.trim();

            try {
                // 1. Check if it is STT Android .backup format
                if (fileName.endsWith(".backup") || trimmed.startsWith("app simple time tracker")) {
                    const result = importBackup(text);
                    if (result.imported > 0 || result.activities > 0) {
                        setImportStatus({
                            type: "success",
                            message: `✓ ${result.activities} aktivite, ${result.imported} kayıt içe aktarıldı`,
                        });
                    } else {
                        setImportStatus({
                            type: "error",
                            message: ".backup dosyasında geçerli veri bulunamadı",
                        });
                    }
                }
                // 2. Check if it is CSV
                else if (fileName.endsWith(".csv") || (trimmed.toLowerCase().includes("activity name") && trimmed.toLowerCase().includes("time started"))) {
                    const result = importCSV(text);
                    if (result.imported > 0) {
                        setImportStatus({
                            type: "success",
                            message: `✓ ${result.imported} kayıt içe aktarıldı${result.skipped > 0 ? `, ${result.skipped} atlandı` : ""}`,
                        });
                    } else {
                        setImportStatus({
                            type: "error",
                            message: "Format hatası: \"activity name\", \"time started\", \"time ended\" sütunları gerekli",
                        });
                    }
                }
                // 3. Check if it is JSON
                else if (fileName.endsWith(".json") || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
                    const parsed = JSON.parse(text);
                    if (parsed.recordTypes && parsed.records !== undefined) {
                        importData(text);
                        setImportStatus({
                            type: "success",
                            message: `✓ ${parsed.records.length} kayıt, ${parsed.recordTypes.length} aktivite içe aktarıldı`,
                        });
                    } else {
                        setImportStatus({
                            type: "error",
                            message: "Geçersiz JSON yedek formatı",
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
                                type: "success",
                                message: `✓ ${parsed.records.length} kayıt, ${parsed.recordTypes.length} aktivite içe aktarıldı`,
                            });
                            handled = true;
                        }
                    } catch {}

                    if (!handled) {
                        const backupRes = importBackup(text);
                        if (backupRes.imported > 0 || backupRes.activities > 0) {
                            setImportStatus({
                                type: "success",
                                message: `✓ ${backupRes.activities} aktivite, ${backupRes.imported} kayıt içe aktarıldı`,
                            });
                            handled = true;
                        }
                    }

                    if (!handled) {
                        const csvRes = importCSV(text);
                        if (csvRes.imported > 0) {
                            setImportStatus({
                                type: "success",
                                message: `✓ ${csvRes.imported} kayıt içe aktarıldı`,
                            });
                            handled = true;
                        }
                    }

                    if (!handled) {
                        setImportStatus({
                            type: "error",
                            message: "Desteklenmeyen dosya formatı (.json, .csv, .backup desteklenir)",
                        });
                    }
                }
            } catch {
                setImportStatus({
                    type: "error",
                    message: "Dosya okunurken veya ayrıştırılırken hata oluştu",
                });
            }

            setTimeout(() => {
                setImportStatus({ type: "idle", message: "" });
            }, 4500);
        };

        reader.readAsText(file);
        e.target.value = "";
    };

    // ── Clear ──
    const handleClear = () => {
        clearAllData();
        setShowClearConfirm(false);
    };

    return (
        <>
            <div className="px-4 pt-10 pb-16 space-y-5 max-w-xl mx-auto">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Ayarlar</h1>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Uygulama tercihleri ve senkronizasyon</p>
                </div>

                {/* Segmented Horizontal Pill Tabs */}
                <div className="grid grid-cols-4 p-1 rounded-2xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex sm:flex-row flex-col items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-1 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors duration-200 ${
                                    isActive
                                        ? "text-gray-900 dark:text-gray-100 shadow-sm"
                                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="activeTabBadge"
                                        className="absolute inset-0 bg-white dark:bg-gray-800 rounded-xl"
                                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center justify-center">
                                    <Icon
                                        size={15}
                                        style={isActive ? { color: "var(--primary, #ff9100)" } : undefined}
                                    />
                                </span>
                                <span className="relative z-10 truncate">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Tab Contents with AnimatePresence */}
                <AnimatePresence mode="wait">
                    {/* 🎨 TAB 1: GÖRÜNÜM */}
                    {activeTab === "appearance" && (
                        <motion.div
                            key="appearance"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18 }}
                            className="space-y-4"
                        >
                            {/* Tema Kartı */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                                <button
                                    onClick={toggleTheme}
                                    className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                        {theme === "dark" ? <Moon size={20} className="text-primary-500" /> : <Sun size={20} className="text-amber-500" />}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {theme === "dark" ? "Koyu Tema" : "Açık Tema"}
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                            {theme === "dark" ? "Açık temaya geçmek için dokunun" : "Koyu temaya geçmek için dokunun"}
                                        </p>
                                    </div>
                                    <div className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${theme === "dark" ? "bg-primary-600" : "bg-gray-300"}`}>
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${theme === "dark" ? "left-6" : "left-0.5"}`} />
                                    </div>
                                </button>

                                {/* Accent Color */}
                                <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-800 transition-colors">
                                    <div className="flex items-center gap-4 mb-3">
                                        <div
                                            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors"
                                            style={{
                                                backgroundColor: "var(--primary-soft, rgba(255, 145, 0, 0.15))",
                                                color: "var(--primary, #ff9100)"
                                            }}
                                        >
                                            <Palette size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Vurgu Rengi</p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Düğmeler, ikonlar ve aktif sayaç rengi</p>
                                        </div>
                                    </div>

                                    {/* Palette Swatches */}
                                    <div className="accent-picker pl-14">
                                        {ACCENT_PRESETS.map((opt) => {
                                            const isSelected = (accentColor || "#ff9100").toLowerCase() === opt.hex.toLowerCase();
                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    title={opt.name}
                                                    aria-label={opt.name}
                                                    className={`accent-picker__item${isSelected ? " accent-picker__item--active" : ""}`}
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
                                                p => p.hex.toLowerCase() === (accentColor || "").toLowerCase()
                                            );
                                            return (
                                                <label
                                                    className={`accent-picker__custom-wrapper${isCustom ? " accent-picker__custom-wrapper--active" : ""}`}
                                                    title="Özel Renk Seçici"
                                                    style={{ color: isCustom ? accentColor : "#a3a3a3" }}
                                                >
                                                    <span
                                                        className="accent-picker__custom-swatch"
                                                        style={{
                                                            background: isCustom
                                                                ? accentColor
                                                                : "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                                                        }}
                                                    />
                                                    <input
                                                        type="color"
                                                        className="accent-picker__custom-input"
                                                        value={accentColor || "#ff9100"}
                                                        onChange={(e) => setAccentColor(e.target.value)}
                                                    />
                                                </label>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Uygulama Hakkında */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                                <div className="px-4 py-3.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300 text-xs font-medium">
                                        <Info size={15} className="text-gray-400" />
                                        <span>Uygulama Sürümü</span>
                                    </div>
                                    <span className="text-xs font-semibold font-mono text-gray-500 dark:text-gray-400">v1.0.0</span>
                                </div>
                                <div className="px-4 py-3.5 flex items-center justify-between">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Simple Time Tracker</span>
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">PWA & E2EE Web App</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ⏱️ TAB 2: ZAMANLAYICI & BİLDİRİMLER */}
                    {activeTab === "timer" && (
                        <motion.div
                            key="timer"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18 }}
                            className="space-y-4"
                        >
                            {/* Takip Kuralları */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
                                            <Clock size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Boş Zamanları Göster</p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">1 dakikadan uzun boşlukları takip edilmeyen süre göster</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={toggleUntrackedTime}
                                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${showUntrackedTime ? "bg-primary-600" : "bg-gray-300"}`}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${showUntrackedTime ? "left-6" : "left-0.5"}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Aktivite Kontrol Bildirimleri */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                                {/* Permission Banner (if not granted) */}
                                {permissionStatus !== "granted" && (
                                    <div className="p-4 bg-amber-500/10 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <Bell size={20} className="text-amber-500 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                                                    {permissionStatus === "denied" ? "Bildirim İzni Engellenmiş" : "Bildirim İzni Gerekli"}
                                                </p>
                                                <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5">
                                                    {permissionStatus === "denied"
                                                        ? "Aktivite uyarıları için tarayıcı site ayarlarından bildirimlere izin verin."
                                                        : "Aktivite uyarılarını alabilmek için tarayıcı bildirimi izni verin."}
                                                </p>
                                            </div>
                                        </div>
                                        {permissionStatus !== "denied" && (
                                            <button
                                                onClick={handleRequestPermission}
                                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm flex-shrink-0"
                                                style={{ backgroundColor: "var(--primary, #ff9100)", color: "var(--primary-contrast, #ffffff)" }}
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
                                                backgroundColor: "var(--primary-soft, rgba(255, 145, 0, 0.15))",
                                                color: "var(--primary, #ff9100)"
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
                                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${notificationsEnabled ? "bg-primary-600" : "bg-gray-300"}`}
                                        style={notificationsEnabled ? { backgroundColor: "var(--primary, #ff9100)" } : undefined}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${notificationsEnabled ? "left-6" : "left-0.5"}`} />
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
                                                    style={{ backgroundColor: "var(--primary-soft, rgba(255, 145, 0, 0.15))", color: "var(--primary, #ff9100)" }}
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
                                                                    ? "shadow-sm font-bold scale-105"
                                                                    : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700"
                                                            }`}
                                                            style={isSelected ? {
                                                                backgroundColor: "var(--primary, #ff9100)",
                                                                color: "var(--primary-contrast, #ffffff)"
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
                                                className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${notificationRepeat ? "bg-primary-600" : "bg-gray-300"}`}
                                                style={notificationRepeat ? { backgroundColor: "var(--primary, #ff9100)" } : undefined}
                                            >
                                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${notificationRepeat ? "left-6" : "left-0.5"}`} />
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
                                                className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${notificationSound ? "bg-primary-600" : "bg-gray-300"}`}
                                                style={notificationSound ? { backgroundColor: "var(--primary, #ff9100)" } : undefined}
                                            >
                                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${notificationSound ? "left-6" : "left-0.5"}`} />
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
                        </motion.div>
                    )}

                    {/* ☁️ TAB 3: BULUT & AI */}
                    {activeTab === "sync" && (
                        <motion.div
                            key="sync"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18 }}
                            className="space-y-4"
                        >
                            <SyncPanel />
                        </motion.div>
                    )}

                    {/* 💾 TAB 4: VERİ & YEDEKLEME */}
                    {activeTab === "data" && (
                        <motion.div
                            key="data"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18 }}
                            className="space-y-4"
                        >
                            {/* Depolama Özeti */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                                        <HardDrive size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Yerel Veri Tabanı</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                            Cihazınızda {records.length} kayıt, {recordTypes.length} aktivite saklanıyor
                                        </p>
                                    </div>
                                </div>
                                <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    IndexedDB
                                </span>
                            </div>

                            {/* Dışa ve İçe Aktarma */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                                {/* Export */}
                                <button
                                    onClick={handleExport}
                                    className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 transition-colors border-b border-gray-100 dark:border-gray-800"
                                >
                                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                        <Download size={18} className="text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Verileri Dışa Aktar</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                            Tüm kayıtları JSON dosyası olarak cihazınıza indirin
                                        </p>
                                    </div>
                                </button>

                                {/* Unified Import */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 transition-colors"
                                >
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                                        importStatus.type === "success"
                                            ? "bg-emerald-100 dark:bg-emerald-900/30"
                                            : importStatus.type === "error"
                                            ? "bg-red-100 dark:bg-red-900/30"
                                            : "bg-blue-100 dark:bg-blue-900/30"
                                    }`}>
                                        {importStatus.type === "success" ? (
                                            <Check size={18} className="text-emerald-500" />
                                        ) : importStatus.type === "error" ? (
                                            <AlertTriangle size={18} className="text-red-500" />
                                        ) : (
                                            <Upload size={18} className="text-blue-600 dark:text-blue-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Verileri İçe Aktar</p>
                                        <p className="text-xs mt-0.5">
                                            {importStatus.type === "success" ? (
                                                <span className="text-emerald-500 font-medium">{importStatus.message}</span>
                                            ) : importStatus.type === "error" ? (
                                                <span className="text-red-500 font-medium">{importStatus.message}</span>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-500">
                                                    JSON, CSV veya .backup yedek dosyasından geri yükleyin
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

                            {/* Tehlikeli Bölge */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-950 shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setShowClearConfirm(true)}
                                    className="w-full flex items-center gap-4 px-4 py-4 hover:bg-red-50 dark:hover:bg-red-900/10 active:bg-red-100 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                        <Trash2 size={18} className="text-red-600 dark:text-red-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-medium text-red-600 dark:text-red-400">Tüm Verileri Sıfırla</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                            Bu cihazdaki tüm aktiviteleri ve geçmiş zaman kayıtlarını kalıcı olarak sil
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
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
                            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl p-6 space-y-4 shadow-2xl border-t border-gray-200 dark:border-gray-800"
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                    <Trash2 size={28} className="text-red-600 dark:text-red-400" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50">Tüm Veriler Silinsin mi?</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Bu işlem cihazınızdaki <strong>{recordTypes.length}</strong> aktiviteyi ve <strong>{records.length}</strong> zaman kaydını kalıcı olarak silecektir. Bu işlem geri alınamaz.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    onClick={handleClear}
                                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                                >
                                    Tümünü Sil
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
