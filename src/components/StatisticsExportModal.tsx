import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, X, Loader2, Check, Clock } from 'lucide-react';
import { toPng, toBlob } from 'html-to-image';
import { PieChart, Pie, Cell } from 'recharts';
import type { Record as TimeRecord, RecordType, RunningRecord } from '../types';
import type { ViewMode } from './DateSelectorBar';
import { formatDuration } from '../utils/time';
import DynamicIcon from './DynamicIcon';

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

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, payload }: any) => {
    if (payload.percent < 4) return null; // Dilim çok küçükse ikonu gizle

    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
        <foreignObject x={x - 10} y={y - 10} width={20} height={20}>
            <div className="w-full h-full flex items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                <DynamicIcon name={payload.icon} size={14} color="#ffffff" />
            </div>
        </foreignObject>
    );
};

export default function StatisticsExportModal({
    isOpen,
    onClose,
    viewMode,
    selectedDate,
    stats,
    totalDuration,
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
            if (selectedDate.toDateString() === today.toDateString()) return 'Bugün';
            return selectedDate.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        }
        if (viewMode === 'month') {
            return selectedDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        }
        if (viewMode === 'year') {
            return `${selectedDate.getFullYear()} Yılı`;
        }
        return 'Tüm Zamanlar';
    }, [viewMode, selectedDate]);

    const periodBadge = useMemo(() => {
        if (viewMode === 'day') return 'Günlük';
        if (viewMode === 'month') return 'Aylık';
        if (viewMode === 'year') return 'Yıllık';
        return 'Genel';
    }, [viewMode]);

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
                if (document.fonts) {
                    await document.fonts.ready;
                }
                // Short wait to ensure SVG paths are completely painted
                await new Promise((r) => setTimeout(r, 220));

                if (!exportCardRef.current || !isMounted) return;

                const dataUrl = await toPng(exportCardRef.current, {
                    pixelRatio: 2,
                    quality: 0.96,
                    cacheBust: true,
                    backgroundColor: isDark ? '#0d0d0d' : '#f8fafc',
                });

                if (isMounted) {
                    setImageUrl(dataUrl);
                    setIsGenerating(false);
                }
            } catch (err) {
                console.error('Failed to generate page image:', err);
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
                quality: 0.96,
                backgroundColor: isDark ? '#0d0d0d' : '#f8fafc',
            });
            if (!blob) return;

            const file = new File([blob], `istatistik-${periodTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `Simple Time Tracker - ${periodTitle}`,
                    text: `${periodTitle} zaman takibi istatistikleri: Toplam ${formatDuration(totalDuration)}`,
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
                quality: 0.96,
                backgroundColor: isDark ? '#0d0d0d' : '#f8fafc',
            });
            if (!blob) return;

            if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } else {
                handleDownload();
            }
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
                    className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl border border-gray-100 dark:border-neutral-800 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92dvh]"
                >
                    {/* Modal Header */}
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between flex-shrink-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md">
                        <div className="flex items-center gap-2.5">
                            <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs shadow-xs"
                                style={{
                                    backgroundColor: 'var(--primary-soft, rgba(255, 145, 0, 0.15))',
                                    color: 'var(--primary, #ff9100)',
                                }}
                            >
                                <Share2 size={16} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                    İstatistik Sayfası Görüntüsü
                                </h3>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                    {periodTitle} • {periodBadge} Özet
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
                                <Loader2 size={30} className="animate-spin" style={{ color: 'var(--primary, #ff9100)' }} />
                                <div>
                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                        Sayfa Görüntüsü Hazırlanıyor...
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                        İstatistik dairesi ve aktiviteler render ediliyor
                                    </p>
                                </div>
                            </div>
                        ) : imageUrl ? (
                            <div className="space-y-3 w-full flex flex-col items-center">
                                <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-200/80 dark:border-neutral-800 max-h-[52dvh] overflow-y-auto w-full bg-white dark:bg-neutral-900">
                                    <img
                                        src={imageUrl}
                                        alt="İstatistik Sayfası"
                                        className="w-full h-auto block select-none"
                                    />
                                </div>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                                    💡 İpucu: Mobilde görselin üzerine basılı tutarak doğrudan galerinize kaydedebilirsiniz.
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

                {/* ── OFF-SCREEN DEDICATED SNAPSHOT TEMPLATE (Circle + Activities) ── */}
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
                        style={{ width: '450px' }}
                        className={`p-6 rounded-[32px] font-sans ${
                            isDark ? 'dark bg-[#0d0d0d] text-white' : 'bg-[#f8fafc] text-gray-900'
                        } border border-gray-200/80 dark:border-neutral-800 shadow-2xl space-y-5`}
                    >
                        {/* 1. Header with Period & Branding */}
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-neutral-800">
                            <div>
                                <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">
                                    İstatistikler
                                </h1>
                                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">
                                    {periodTitle}
                                </p>
                            </div>

                            <span
                                className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                                style={{
                                    backgroundColor: 'var(--primary-soft, rgba(255,145,0,0.15))',
                                    color: 'var(--primary, #ff9100)',
                                }}
                            >
                                {periodBadge}
                            </span>
                        </div>

                        {/* 2. Donut Pie Chart (İstatistik Circle'ı) */}
                        <div className="relative w-full flex items-center justify-center my-2">
                            <PieChart width={390} height={230}>
                                <Pie
                                    data={stats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={72}
                                    outerRadius={106}
                                    paddingAngle={stats.length > 1 ? 3 : 0}
                                    dataKey="duration"
                                    nameKey="name"
                                    stroke="none"
                                    isAnimationActive={false}
                                    labelLine={false}
                                    label={renderCustomizedLabel}
                                >
                                    {stats.map((entry) => (
                                        <Cell key={entry.id} fill={entry.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                            {/* Center Duration & Label */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-black tracking-tight text-gray-900 dark:text-white tabular-nums">
                                    {formatDuration(totalDuration)}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">
                                    total
                                </span>
                            </div>
                        </div>

                        {/* 3. Section Header */}
                        <div className="flex items-center justify-between pt-1 mb-1">
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                Activities
                            </span>
                            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-200/70 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                                {stats.length} {stats.length === 1 ? 'activity' : 'activities'}
                            </span>
                        </div>

                        {/* 4. Activities List Matching the Screen */}
                        <div className="space-y-2">
                            {stats.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-3.5 rounded-2xl bg-white dark:bg-[#161616] border border-gray-100 dark:border-neutral-800/80 shadow-xs flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-xs"
                                            style={{ backgroundColor: item.color }}
                                        >
                                            <DynamicIcon name={item.icon} size={20} color="#ffffff" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                                {item.name}
                                            </p>
                                            <span className="text-xs text-gray-400 dark:text-gray-500 font-semibold">
                                                %{Math.round(item.percent)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                            {formatDuration(item.duration)}
                                        </span>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                                            {item.sessionCount} {item.sessionCount === 1 ? 'session' : 'sessions'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 5. Minimal Branding Footer */}
                        <div className="pt-2 text-center border-t border-gray-100 dark:border-neutral-800/80">
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                Simple Time Tracker
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
