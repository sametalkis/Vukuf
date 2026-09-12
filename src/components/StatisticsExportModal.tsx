import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, X, Loader2, Check, Sparkles, Clock } from 'lucide-react';
import { toPng, toBlob } from 'html-to-image';
import type { Record as TimeRecord, RecordType, RunningRecord } from '../types';
import type { ViewMode } from './DateSelectorBar';
import { formatDuration, splitRecordByDays } from '../utils/time';
import DynamicIcon from './DynamicIcon';
import ActivityHeatmap from './ActivityHeatmap';

interface StatisticsExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    viewMode: ViewMode;
    selectedDate: Date;
    stats: {
        id: string;
        name: string;
        color: string;
        icon: string;
        duration: number;
        sessionCount: number;
        percent: number;
    }[];
    totalDuration: number;
    records: TimeRecord[];
    recordTypes: RecordType[];
    runningRecord: RunningRecord | null;
}

export default function StatisticsExportModal({
    isOpen,
    onClose,
    viewMode,
    selectedDate,
    stats,
    totalDuration,
    records,
    recordTypes,
    runningRecord,
}: StatisticsExportModalProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const exportCardRef = useRef<HTMLDivElement>(null);

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    // Period Title
    const periodTitle = useMemo(() => {
        if (viewMode === 'day') {
            const today = new Date();
            if (selectedDate.toDateString() === today.toDateString()) return 'Bugün (Günlük Rapor)';
            return selectedDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
        if (viewMode === 'month') {
            return selectedDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) + ' Raporu';
        }
        if (viewMode === 'year') {
            return `${selectedDate.getFullYear()} Yıllık İstatistik Raporu`;
        }
        return 'Tüm Zamanlar İstatistik Raporu';
    }, [viewMode, selectedDate]);

    // Active days and streak calculation for the export banner
    const { activeDaysCount, totalSessions } = useMemo(() => {
        let allRecords = [...records];
        if (runningRecord) {
            allRecords.push({
                ...runningRecord,
                endTime: new Date().toISOString(),
                duration: Math.floor((Date.now() - new Date(runningRecord.startTime).getTime()) / 1000),
            } as any);
        }
        const split = allRecords.flatMap(r => splitRecordByDays(r));
        const days = new Set<string>();
        let sessions = 0;

        for (const r of split) {
            const d = new Date(r.startTime);
            if (viewMode === 'day' && d.toDateString() !== selectedDate.toDateString()) continue;
            if (viewMode === 'month' && (d.getMonth() !== selectedDate.getMonth() || d.getFullYear() !== selectedDate.getFullYear())) continue;
            if (viewMode === 'year' && d.getFullYear() !== selectedDate.getFullYear()) continue;

            days.add(d.toDateString());
            sessions++;
        }

        return {
            activeDaysCount: days.size,
            totalSessions: sessions,
        };
    }, [records, runningRecord, viewMode, selectedDate]);

    // Generate PNG image on modal open
    useEffect(() => {
        if (!isOpen) {
            setImageUrl(null);
            setIsGenerating(false);
            return;
        }

        let isMounted = true;
        setIsGenerating(true);

        const generate = async () => {
            try {
                // Wait for document fonts and SVG charts to settle
                if (document.fonts) {
                    await document.fonts.ready;
                }
                await new Promise((r) => setTimeout(r, 200));

                if (!exportCardRef.current || !isMounted) return;

                const dataUrl = await toPng(exportCardRef.current, {
                    pixelRatio: 2,
                    quality: 0.95,
                    cacheBust: true,
                    backgroundColor: isDark ? '#0a0a0a' : '#f8fafc',
                });

                if (isMounted) {
                    setImageUrl(dataUrl);
                    setIsGenerating(false);
                }
            } catch (err) {
                console.error('Failed to generate image:', err);
                if (isMounted) setIsGenerating(false);
            }
        };

        generate();

        return () => {
            isMounted = false;
        };
    }, [isOpen, viewMode, selectedDate, stats, totalDuration, isDark]);

    // Download Handler
    const handleDownload = () => {
        if (!imageUrl) return;
        const link = document.createElement('a');
        const fileNameSafe = periodTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
        link.download = `simple-time-tracker-${fileNameSafe}-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = imageUrl;
        link.click();
    };

    // Native Web Share Handler
    const handleShare = async () => {
        if (!exportCardRef.current) return;
        try {
            const blob = await toBlob(exportCardRef.current, {
                pixelRatio: 2,
                quality: 0.95,
                backgroundColor: isDark ? '#0a0a0a' : '#f8fafc',
            });
            if (!blob) return;

            const file = new File([blob], `istatistik-${selectedDate.getFullYear()}.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `Simple Time Tracker - ${periodTitle}`,
                    text: `${periodTitle} için zaman takibi istatistiklerim: Toplam ${formatDuration(totalDuration)}`,
                    files: [file],
                });
            } else {
                handleDownload();
            }
        } catch {
            handleDownload();
        }
    };

    // Copy to clipboard
    const handleCopyImage = async () => {
        if (!exportCardRef.current) return;
        try {
            const blob = await toBlob(exportCardRef.current, {
                pixelRatio: 2,
                quality: 0.95,
                backgroundColor: isDark ? '#0a0a0a' : '#f8fafc',
            });
            if (!blob) return;

            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            handleDownload();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                {/* Backdrop Overlay */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/75 backdrop-blur-md"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 15 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl border border-gray-100 dark:border-neutral-800 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92dvh]"
                >
                    {/* Modal Header */}
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between flex-shrink-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md">
                        <div className="flex items-center gap-2.5">
                            <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-xs shadow-xs"
                                style={{
                                    backgroundColor: 'var(--primary-soft, rgba(255, 145, 0, 0.15))',
                                    color: 'var(--primary, #ff9100)',
                                }}
                            >
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                    Resim Olarak Dışa Aktar
                                </h3>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                    Tek sayfa yüksek çözünürlüklü istatistik kartı
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Modal Body: Preview Area */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-gray-50/60 dark:bg-neutral-950/60 flex flex-col items-center justify-center min-h-[280px]">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                                <Loader2 size={32} className="animate-spin text-primary" style={{ color: 'var(--primary, #ff9100)' }} />
                                <div>
                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                        İstatistik Görseli Hazırlanıyor...
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                        Grafikler ve ısı haritası render ediliyor
                                    </p>
                                </div>
                            </div>
                        ) : imageUrl ? (
                            <div className="space-y-3 w-full flex flex-col items-center">
                                <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-200/80 dark:border-neutral-800 max-h-[50dvh] overflow-y-auto w-full bg-white dark:bg-neutral-900">
                                    <img
                                        src={imageUrl}
                                        alt="İstatistik Raporu"
                                        className="w-full h-auto block select-none"
                                    />
                                </div>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                                    💡 İpucu: Mobilde görselin üzerine basılı tutarak doğrudan galerinize de kaydedebilirsiniz.
                                </p>
                            </div>
                        ) : null}
                    </div>

                    {/* Modal Footer: Action Buttons */}
                    <div className="p-4 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0 flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={isGenerating || !imageUrl}
                            className="flex-1 py-3 px-4 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                            style={{
                                backgroundColor: 'var(--primary, #ff9100)',
                                color: 'var(--primary-contrast, #ffffff)',
                            }}
                        >
                            <Download size={16} />
                            <span>Görseli İndir (PNG)</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleShare}
                            disabled={isGenerating || !imageUrl}
                            className="py-3 px-4 rounded-2xl font-bold text-sm bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-750 text-gray-700 dark:text-gray-200 border border-gray-200/60 dark:border-neutral-700/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Share2 size={16} />
                            <span className="hidden sm:inline">Paylaş</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleCopyImage}
                            disabled={isGenerating || !imageUrl}
                            className="py-3 px-3 rounded-2xl font-bold text-sm bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-750 text-gray-700 dark:text-gray-200 border border-gray-200/60 dark:border-neutral-700/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-center disabled:opacity-50"
                            title="Panoya Kopyala"
                        >
                            {copied ? <Check size={16} className="text-emerald-500" /> : <Clock size={16} />}
                        </button>
                    </div>
                </motion.div>

                {/* ── OFF-SCREEN DEDICATED EXPORT TEMPLATE (Pixel-Perfect 680px High-Res Infographic) ── */}
                <div
                    style={{
                        position: 'fixed',
                        left: '-9999px',
                        top: '-9999px',
                        pointerEvents: 'none',
                        zIndex: -1,
                    }}
                >
                    <div
                        ref={exportCardRef}
                        style={{ width: '680px' }}
                        className={`p-8 rounded-[36px] font-sans ${
                            isDark ? 'dark bg-[#0a0a0a] text-white' : 'bg-[#f8fafc] text-gray-900'
                        } border border-gray-200/80 dark:border-neutral-800 shadow-2xl space-y-6`}
                    >
                        {/* 1. Header & App Branding */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-neutral-800">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md font-bold text-xl"
                                    style={{
                                        backgroundColor: 'var(--primary, #ff9100)',
                                        color: 'var(--primary-contrast, #ffffff)',
                                    }}
                                >
                                    ⏱️
                                </div>
                                <div>
                                    <h1 className="text-lg font-black tracking-tight uppercase">
                                        Simple Time Tracker
                                    </h1>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">
                                        {periodTitle}
                                    </p>
                                </div>
                            </div>

                            <div className="text-right">
                                <span
                                    className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                                    style={{
                                        backgroundColor: 'var(--primary-soft, rgba(255,145,0,0.15))',
                                        color: 'var(--primary, #ff9100)',
                                    }}
                                >
                                    {viewMode === 'year' ? 'Yıllık Özet' : viewMode === 'month' ? 'Aylık Özet' : 'Günlük Özet'}
                                </span>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                    {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                        </div>

                        {/* 2. Hero Total Stats Banner */}
                        <div className="p-6 rounded-3xl bg-white dark:bg-[#121212] border border-gray-100 dark:border-neutral-800/80 shadow-sm flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    Toplam Süre
                                </span>
                                <div
                                    className="text-4xl font-black tracking-tight mt-1"
                                    style={{ color: 'var(--primary, #ff9100)' }}
                                >
                                    {formatDuration(totalDuration)}
                                </div>
                            </div>

                            <div className="flex items-center gap-6 text-right">
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                        Aktiviteler
                                    </span>
                                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                                        {stats.length}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                        Seans Sayısı
                                    </span>
                                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                                        {totalSessions}
                                    </div>
                                </div>

                                {viewMode !== 'day' && (
                                    <div>
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                            Aktif Gün
                                        </span>
                                        <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                                            {activeDaysCount}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. GitHub Activity Heatmap (Full width without horizontal scrollbars!) */}
                        {viewMode !== 'day' && (
                            <div className="rounded-3xl overflow-hidden border border-gray-100 dark:border-neutral-800/80 shadow-sm">
                                <ActivityHeatmap
                                    viewMode={viewMode}
                                    selectedDate={selectedDate}
                                    records={records}
                                    recordTypes={recordTypes}
                                    runningRecord={runningRecord}
                                />
                            </div>
                        )}

                        {/* 4. Activities Breakdown Table */}
                        <div className="p-6 rounded-3xl bg-white dark:bg-[#121212] border border-gray-100 dark:border-neutral-800/80 shadow-sm space-y-3.5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    Aktivite Dağılımı ({stats.length})
                                </span>
                                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                                    Oran & Süre
                                </span>
                            </div>

                            <div className="space-y-2.5">
                                {stats.map((item) => (
                                    <div
                                        key={item.id}
                                        className="p-3 rounded-2xl bg-gray-50/70 dark:bg-neutral-800/50 border border-gray-100 dark:border-neutral-800/50 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs"
                                                style={{ backgroundColor: item.color }}
                                            >
                                                <DynamicIcon name={item.icon} size={20} color="#ffffff" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                                    {item.name}
                                                </p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                    %{Math.round(item.percent)} • {item.sessionCount} seans
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <span className="text-sm font-black font-mono text-gray-900 dark:text-gray-100">
                                                {formatDuration(item.duration)}
                                            </span>
                                            {/* Mini Progress Bar */}
                                            <div className="w-24 h-1.5 bg-gray-200 dark:bg-neutral-700 rounded-full mt-1.5 overflow-hidden ml-auto">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${Math.max(4, Math.round(item.percent))}%`,
                                                        backgroundColor: item.color,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 5. Watermark Footer */}
                        <div className="pt-2 text-center text-xs text-gray-400 dark:text-gray-500 flex items-center justify-center gap-2">
                            <span>Simple Time Tracker</span>
                            <span>•</span>
                            <span>Zaman Takip & Verimlilik Raporu</span>
                        </div>
                    </div>
                </div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
