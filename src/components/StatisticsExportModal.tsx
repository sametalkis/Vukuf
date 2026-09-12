import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Check, Copy, Download, Loader2, RefreshCw, Share2, X } from 'lucide-react';
import { getFontEmbedCSS, toBlob } from 'html-to-image';
import { useTranslation } from 'react-i18next';
import type { ViewMode } from './DateSelectorBar';
import { formatDuration } from '../utils/time';

interface StatisticsExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    viewMode: ViewMode;
    selectedDate: Date;
    totalDuration: number;
    sourceElement: HTMLElement;
}

const MAX_CANVAS_EDGE = 8192;
const MAX_CANVAS_AREA = 16_000_000;

function getSafePixelRatio(width: number, height: number): number {
    return Math.min(
        2,
        MAX_CANVAS_EDGE / width,
        MAX_CANVAS_EDGE / height,
        Math.sqrt(MAX_CANVAS_AREA / (width * height)),
    );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(
            () => reject(new Error(timeoutMsg)),
            timeoutMs,
        );

        promise.then(
            (value) => {
                window.clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timeoutId);
                reject(error);
            },
        );
    });
}

function createFileSlug(value: string): string {
    return value
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function getEffectiveBackgroundColor(node: HTMLElement, fallback: string): string {
    let current: HTMLElement | null = node;

    while (current) {
        const backgroundColor = getComputedStyle(current).backgroundColor;
        if (backgroundColor && backgroundColor !== 'transparent' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
            return backgroundColor;
        }
        current = current.parentElement;
    }

    return fallback;
}

export default function StatisticsExportModal({
    isOpen,
    onClose,
    viewMode,
    selectedDate,
    totalDuration,
    sourceElement,
}: StatisticsExportModalProps) {
    const { t, i18n } = useTranslation();
    const locale = i18n.language?.startsWith('tr') ? 'tr-TR' : 'en-US';
    const isTr = i18n.language?.startsWith('tr');

    const [isGenerating, setIsGenerating] = useState(true);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageBlob, setImageBlob] = useState<Blob | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [generationAttempt, setGenerationAttempt] = useState(0);
    const [copied, setCopied] = useState(false);
    const objectUrlRef = useRef<string | null>(null);

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    // Period Title
    const periodTitle = useMemo(() => {
        if (viewMode === 'day') {
            const today = new Date();
            if (selectedDate.toDateString() === today.toDateString()) return t('time.today');
            return selectedDate.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        }
        if (viewMode === 'month') {
            return selectedDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        }
        if (viewMode === 'year') {
            return isTr ? `${selectedDate.getFullYear()} Yılı` : `${selectedDate.getFullYear()}`;
        }
        return t('dateSelector.allHistory');
    }, [viewMode, selectedDate, locale, isTr, t]);

    const periodBadge = useMemo(() => {
        if (viewMode === 'day') return t('dateSelector.day');
        if (viewMode === 'month') return t('dateSelector.month');
        if (viewMode === 'year') return t('dateSelector.year');
        return t('dateSelector.all');
    }, [viewMode, t]);

    const generateImage = useCallback(async () => {
        if (!sourceElement.isConnected) throw new Error(t('export.disconnected'));

        // Freeze the real page before any async work. Only this detached copy
        // receives export spacing and text wrapping; the live timer keeps running.
        const node = sourceElement.cloneNode(true) as HTMLElement;
        const backgroundColor = getEffectiveBackgroundColor(sourceElement, isDark ? '#030712' : '#f3f4f6');
        const sourceStyle = getComputedStyle(sourceElement);
        const width = Math.ceil(sourceElement.getBoundingClientRect().width);
        if (width <= 0) throw new Error(t('export.unmeasurable'));

        Object.assign(node.style, {
            width: `${width}px`,
            boxSizing: 'border-box',
            paddingTop: '20px',
            paddingBottom: '24px',
            backgroundColor,
            fontFamily: sourceStyle.fontFamily,
            fontSize: sourceStyle.fontSize,
            lineHeight: sourceStyle.lineHeight,
            color: sourceStyle.color,
        });
        // Preserve inherited accent tokens when moving the snapshot to body.
        for (const property of sourceStyle) {
            if (property.startsWith('--')) node.style.setProperty(property, sourceStyle.getPropertyValue(property));
        }
        node.querySelectorAll('[data-export-exclude], .recharts-tooltip-wrapper').forEach((element) => element.remove());
        node.querySelectorAll<HTMLElement>('[data-export-activity-name]').forEach((element) => {
            Object.assign(element.style, {
                whiteSpace: 'normal',
                overflow: 'visible',
                textOverflow: 'clip',
                overflowWrap: 'anywhere',
            });
        });

        const host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        host.inert = true;
        Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', pointerEvents: 'none' });
        host.appendChild(node);
        document.body.appendChild(host);

        try {
            let fontEmbedCSS = '';
            try {
                // Loaded web fonts are not automatically available inside the SVG
                // image. Embed them so text keeps its original metrics in PNG.
                fontEmbedCSS = await withTimeout(getFontEmbedCSS(node, { preferredFontFormat: 'woff2' }), 4000, t('export.timeout'));
            } catch {
                // Offline export remains available using the system font below.
            }
            if (!fontEmbedCSS) {
                node.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            }
            if ('fonts' in document) {
                await withTimeout(document.fonts.ready, 3000, t('export.timeout')).catch(() => undefined);
            }

            const height = Math.ceil(node.getBoundingClientRect().height);
            const blob = await withTimeout(
                toBlob(node, {
                    pixelRatio: getSafePixelRatio(width, height),
                    fontEmbedCSS,
                    skipFonts: !fontEmbedCSS,
                    backgroundColor,
                    width,
                    height,
                }),
                15_000,
                t('export.timeout'),
            );
            if (!blob) throw new Error(t('export.blobError'));
            return blob;
        } finally {
            host.remove();
        }
    }, [isDark, sourceElement, t]);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;

        generateImage()
            .then((blob) => {
                if (!isMounted) return;

                if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
                const nextUrl = URL.createObjectURL(blob);
                objectUrlRef.current = nextUrl;
                setImageBlob(blob);
                setImageUrl(nextUrl);
                setGenerationError(null);
            })
            .catch((error: unknown) => {
                if (!isMounted) return;
                console.error('Failed to generate statistics image:', error);
                setGenerationError(error instanceof Error ? error.message : t('export.failed'));
            })
            .finally(() => {
                if (isMounted) setIsGenerating(false);
            });

        return () => {
            isMounted = false;
        };
    }, [generateImage, generationAttempt, isOpen, t]);

    useEffect(() => () => {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    }, []);

    const handleRetry = () => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
        setImageUrl(null);
        setImageBlob(null);
        setGenerationError(null);
        setIsGenerating(true);
        setGenerationAttempt((attempt) => attempt + 1);
    };

    // Download Handler
    const handleDownload = () => {
        if (!imageUrl) return;
        const link = document.createElement('a');
        const fileNameSafe = createFileSlug(periodTitle) || (isTr ? 'istatistik' : 'statistics');
        link.download = `vukuf-${fileNameSafe}-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = imageUrl;
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    // Native Web Share Handler
    const handleShare = async () => {
        if (!imageBlob) return;
        try {
            const file = new File([imageBlob], `${createFileSlug(periodTitle) || (isTr ? 'istatistik' : 'statistics')}.png`, {
                type: 'image/png',
            });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `Vukuf - ${periodTitle}`,
                    text: t('export.shareText', { period: periodTitle, total: formatDuration(totalDuration) }),
                    files: [file],
                });
            } else {
                handleDownload();
            }
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            handleDownload();
        }
    };

    // Copy to clipboard
    const handleCopyImage = async () => {
        if (!imageBlob) return;
        try {
            if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                const item = new ClipboardItem({ 'image/png': imageBlob });
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
                                    {t('export.title')}
                                </h3>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                    {t('export.summary', { period: periodTitle, badge: periodBadge })}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('export.close')}
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
                                        {t('export.preparingTitle')}
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                        {t('export.preparingDesc')}
                                    </p>
                                </div>
                            </div>
                        ) : imageUrl ? (
                            <div className="space-y-3 w-full flex flex-col items-center">
                                <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-200/80 dark:border-neutral-800 max-h-[52dvh] overflow-y-auto w-full bg-white dark:bg-neutral-900">
                                    <img
                                        src={imageUrl}
                                        alt={t('export.title')}
                                        className="w-full h-auto block select-none"
                                    />
                                </div>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                                    {t('export.mobileHint')}
                                </p>
                            </div>
                        ) : generationError ? (
                            <div className="flex flex-col items-center text-center py-10 max-w-xs">
                                <AlertCircle size={28} className="text-red-500 mb-3" />
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                    {t('export.failed')}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
                                    {t('export.retryHint', { error: generationError })}
                                </p>
                                <button
                                    type="button"
                                    onClick={handleRetry}
                                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white"
                                    style={{ backgroundColor: 'var(--primary, #ff9100)' }}
                                >
                                    <RefreshCw size={15} />
                                    {t('export.retry')}
                                </button>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500 dark:text-gray-400 py-10">{t('export.notReady')}</div>
                        )}
                    </div>

                    {/* Modal Footer: Action Buttons */}
                    <div className="p-4 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0 flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={isGenerating || !imageBlob}
                            className="flex-1 py-3 px-4 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                            style={{
                                backgroundColor: 'var(--primary, #ff9100)',
                                color: 'var(--primary-contrast, #ffffff)',
                            }}
                        >
                            <Download size={16} />
                            <span>{t('export.downloadImage')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleShare}
                            disabled={isGenerating || !imageBlob}
                            className="py-3 px-4 rounded-2xl font-bold text-sm bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-750 text-gray-700 dark:text-gray-200 border border-gray-200/60 dark:border-neutral-700/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Share2 size={16} />
                            <span className="hidden sm:inline">{t('export.share')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleCopyImage}
                            disabled={isGenerating || !imageBlob}
                            className="py-3 px-3 rounded-2xl font-bold text-sm bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-750 text-gray-700 dark:text-gray-200 border border-gray-200/60 dark:border-neutral-700/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-center disabled:opacity-50"
                            title={t('export.copyImage')}
                        >
                            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                        </button>
                    </div>
                </motion.div>

            </div>
        </AnimatePresence>,
        document.body
    );
}
