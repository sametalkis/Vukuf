import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trash2, Check, Clock, ChevronDown, X, Scissors, ArrowLeftToLine, ArrowRightToLine, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { getContrastColor } from '../utils/colors';
import { formatDuration } from '../utils/time';
import DynamicIcon from './DynamicIcon';
import SplitRecordModal from './SplitRecordModal';
import type { Record } from '../types';

interface EditRecordScreenProps {
    record: Record & { isRunning?: boolean };
    onClose: () => void;
}

// ── Helpers ──
function formatDate(iso: string, lang: string) {
    const d = new Date(iso);
    const locale = lang?.startsWith('tr') ? 'tr-TR' : 'en-US';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function EditRecordScreen({ record, onClose }: EditRecordScreenProps) {
    const { t, i18n } = useTranslation();
    const { recordTypes, records, updateRecord, deleteRecord, mergeRecords } = useStore();
    const [activityId, setActivityId] = useState(record.recordTypeId);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [start, setStart] = useState(new Date(record.startTime));
    const [end, setEnd] = useState(new Date(record.endTime));
    const [isStillRunning, setIsStillRunning] = useState(!!record.isRunning);
    const [showSplitModal, setShowSplitModal] = useState(false);

    const [liveDuration, setLiveDuration] = useState(() =>
        Math.max(0, Math.floor((Date.now() - new Date(record.startTime).getTime()) / 1000))
    );

    useEffect(() => {
        if (!record.isRunning || !isStillRunning) return;
        setLiveDuration(Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000)));
        const interval = setInterval(() => {
            setLiveDuration(Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000)));
        }, 1000);
        return () => clearInterval(interval);
    }, [record.isRunning, isStillRunning, start]);

    const activity = recordTypes.find((a) => a.id === activityId) ||
        (activityId === 'untracked' ? { id: 'untracked', name: t('timer.untrackedTitle'), color: '#6b7280', icon: 'Clock' } : recordTypes[0]);
    const contrast = activity ? getContrastColor(activity.color) : '#fff';

    // ── Find neighbor records for absorb feature ──
    const neighbors = useMemo(() => {
        if (record.id.startsWith('untracked-') || record.isRunning) return { prev: null, next: null };

        const sorted = [...records]
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        const currentIdx = sorted.findIndex((r) => r.id === record.id);
        if (currentIdx === -1) return { prev: null, next: null };

        const prev = currentIdx > 0 ? sorted[currentIdx - 1] : null;
        const next = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;

        // Only show absorb if neighbor is same activity and adjacent (gap < 60s)
        const isAdjacentPrev = prev &&
            prev.recordTypeId === record.recordTypeId &&
            Math.abs(new Date(prev.endTime).getTime() - new Date(record.startTime).getTime()) < 60000;

        const isAdjacentNext = next &&
            next.recordTypeId === record.recordTypeId &&
            Math.abs(new Date(record.endTime).getTime() - new Date(next.startTime).getTime()) < 60000;

        return {
            prev: isAdjacentPrev ? prev : null,
            next: isAdjacentNext ? next : null,
        };
    }, [records, record.id, record.recordTypeId, record.startTime, record.endTime, record.isRunning]);

    // ── Button Handlers ──
    const adjustTime = (type: 'start' | 'end', minutes: number) => {
        const now = new Date();
        if (type === 'start') {
            const newStart = new Date(start.getTime() + minutes * 60000);
            if (newStart > now) { setStart(now); return; }
            if (isStillRunning || newStart < end) setStart(newStart);
        } else {
            const newEnd = new Date(end.getTime() + minutes * 60000);
            if (newEnd > now) { setEnd(now); return; }
            if (newEnd > start) setEnd(newEnd);
        }
    };

    const setNow = (type: 'start' | 'end') => {
        const n = new Date();
        if (type === 'start') {
            if (isStillRunning || n < end) setStart(n);
        } else {
            if (n > start) setEnd(n);
        }
    };

    const handleSave = () => {
        updateRecord(record.id, {
            recordTypeId: activityId,
            startTime: start.toISOString(),
            ...(record.isRunning && isStillRunning ? {} : { endTime: end.toISOString() }),
        });
        onClose();
    };

    const handleStop = () => {
        const stopNow = new Date().toISOString();
        updateRecord(record.id, {
            recordTypeId: activityId,
            startTime: start.toISOString(),
            endTime: stopNow,
        });
        onClose();
    };

    const handleDelete = () => {
        if (record.id.startsWith('untracked-') && !record.isRunning) {
            onClose();
            return;
        }
        if (window.confirm(t('editRecord.deleteConfirm'))) {
            deleteRecord(record.id);
            onClose();
        }
    };

    const handleAbsorb = (direction: 'prev' | 'next') => {
        const neighbor = direction === 'prev' ? neighbors.prev : neighbors.next;
        if (!neighbor) return;

        if (window.confirm(t('editRecord.absorbConfirm'))) {
            const recId = (record as any).originalRecord?.id || record.id;
            const neighborId = (neighbor as any).originalRecord?.id || neighbor.id;
            mergeRecords([recId, neighborId]);
            onClose();
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showSplitModal) {
                    setShowSplitModal(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, showSplitModal]);

    const content = (
        <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            {/* Backdrop on desktop */}
            <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Dialog (Native full-screen on mobile, centered modal card on desktop) */}
            <motion.div
                className="relative z-10 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-[#0a0a0a] flex flex-col text-gray-200 sm:rounded-3xl sm:shadow-2xl sm:border sm:border-neutral-800 overflow-hidden"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div
                    className="flex items-center justify-between px-4 py-3.5 shadow-md flex-shrink-0"
                    style={{ backgroundColor: activity.color, color: contrast }}
                >
                    <div className="flex items-center gap-3 relative z-10">
                        <button
                            onClick={onClose}
                            className="p-1 -ml-1 rounded-full hover:bg-black/15 active:bg-black/25 transition-colors"
                        >
                            <ChevronLeft size={24} color={contrast} />
                        </button>
                        <div>
                            <h2 className="text-base font-bold leading-tight">{activity.name}</h2>
                            <div className="text-xs font-medium opacity-90 tracking-wide mt-0.5" style={{ color: contrast }}>
                                {formatTime(start.toISOString())} – {isStillRunning ? t('editRecord.running') : formatTime(end.toISOString())}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-base font-bold tracking-tight">
                            {isStillRunning ? formatDuration(liveDuration, i18n.language) : formatDuration(Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000)), i18n.language)}
                        </div>
                        <button
                            onClick={onClose}
                            className="hidden sm:flex p-1 rounded-full hover:bg-black/15 active:bg-black/25 transition-colors ml-1"
                            title={t('common.close')}
                        >
                            <X size={20} color={contrast} />
                        </button>
                    </div>
                </div>

            <div className="flex flex-col flex-1 overflow-y-auto px-4 py-5 space-y-4">
                {/* ── Action Buttons Row (Delete + Stop / Split) ── */}
                <div className="flex gap-2">
                    {/* Delete */}
                    {(!record.id.startsWith('untracked-') || record.isRunning) && (
                        <button
                            onClick={handleDelete}
                            className="flex-1 flex items-center justify-center gap-2 bg-[#171717] hover:bg-red-500/20 hover:text-red-400 py-3.5 rounded-xl text-sm font-semibold text-gray-300 transition-colors cursor-pointer"
                        >
                            <Trash2 size={16} /> {t('editRecord.deleteRecord')}
                        </button>
                    )}
                    {/* Stop Timer */}
                    {record.isRunning && isStillRunning && (
                        <button
                            onClick={handleStop}
                            className="flex-1 flex items-center justify-center gap-2 bg-[#171717] hover:bg-rose-500/20 hover:text-rose-400 py-3.5 rounded-xl text-sm font-semibold text-gray-300 transition-colors cursor-pointer"
                        >
                            <Square size={16} className="fill-current" /> {t('editRecord.stopTimer')}
                        </button>
                    )}
                    {/* Split */}
                    {!record.isRunning && !record.id.startsWith('untracked-') && (
                        <button
                            onClick={() => setShowSplitModal(true)}
                            className="flex-1 flex items-center justify-center gap-2 bg-[#171717] hover:bg-amber-500/20 hover:text-amber-400 py-3.5 rounded-xl text-sm font-semibold text-gray-300 transition-colors cursor-pointer"
                        >
                            <Scissors size={16} /> {t('editRecord.splitRecord')}
                        </button>
                    )}
                </div>

                {/* ── Absorb Neighbors ── */}
                {(neighbors.prev || neighbors.next) && (
                    <div className="flex gap-2">
                        {neighbors.prev && (
                            <button
                                onClick={() => handleAbsorb('prev')}
                                className="flex-1 flex items-center justify-center gap-2 bg-[#171717] hover:bg-emerald-500/20 hover:text-emerald-400 py-3 rounded-xl text-xs font-semibold text-gray-400 transition-colors"
                            >
                                <ArrowLeftToLine size={14} /> {t('editRecord.absorbPrev')}
                            </button>
                        )}
                        {neighbors.next && (
                            <button
                                onClick={() => handleAbsorb('next')}
                                className="flex-1 flex items-center justify-center gap-2 bg-[#171717] hover:bg-emerald-500/20 hover:text-emerald-400 py-3 rounded-xl text-xs font-semibold text-gray-400 transition-colors"
                            >
                                {t('editRecord.absorbNext')} <ArrowRightToLine size={14} />
                            </button>
                        )}
                    </div>
                )}

                {/* ── Start Time Box ── */}
                <div className="relative border border-[#2a2a2a] rounded-xl pt-4 pb-3 px-3 mt-4 text-center">
                    <span className="absolute -top-2.5 left-4 bg-[#0a0a0a] px-1 text-[11px] font-medium text-gray-500 uppercase tracking-wider">{t('editRecord.startLabel')}</span>

                    <div className="flex items-center justify-center gap-2 mb-3">
                        <span className="text-rose-500 font-bold text-sm tracking-wide">{formatDate(start.toISOString(), i18n.language)}</span>
                        <span className="text-white font-black text-3xl tracking-tight leading-none">{formatTime(start.toISOString())}</span>
                    </div>

                    <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                        {[-30, -5, -1, 1, 5, 30].map(v => (
                            <button
                                key={v}
                                onClick={() => adjustTime('start', v)}
                                className="flex-1 min-w-[36px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#171717] text-xs font-semibold text-gray-400 active:bg-[#333]"
                            >
                                {v > 0 ? '+' : ''}{v}
                            </button>
                        ))}
                        <button
                            onClick={() => setNow('start')}
                            className="flex-1 min-w-[48px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#171717] text-xs font-semibold text-gray-300 active:bg-[#333]"
                        >
                            {t('editRecord.now')}
                        </button>
                    </div>
                </div>

                {/* ── End Time Box ── */}
                <div className="relative border border-[#2a2a2a] rounded-xl pt-4 pb-3 px-3 text-center mt-2 bg-[#121212]">
                    <span className="absolute -top-2.5 left-4 bg-[#0a0a0a] px-1 text-[11px] font-medium text-gray-500 uppercase tracking-wider">{t('editRecord.endLabel')}</span>

                    {record.isRunning && (
                        <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-xs font-medium text-gray-400">
                                {isStillRunning ? t('editRecord.currentlyRunning') : t('editRecord.sessionEnded')}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (isStillRunning) {
                                        setIsStillRunning(false);
                                        setEnd(new Date());
                                    } else {
                                        setIsStillRunning(true);
                                    }
                                }}
                                className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                                    isStillRunning
                                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                }`}
                            >
                                {isStillRunning ? t('editRecord.finishSession') : t('editRecord.keepRunning')}
                            </button>
                        </div>
                    )}

                    {isStillRunning ? (
                        <div className="py-2 flex flex-col items-center justify-center gap-2">
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-white font-black text-2xl tracking-tight leading-none">
                                    {t('editRecord.running')}
                                </span>
                            </div>
                            <p className="text-xs text-neutral-400">
                                {t('editRecord.stopTimerHint')}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <span className="text-rose-500 font-bold text-sm tracking-wide">{formatDate(end.toISOString(), i18n.language)}</span>
                                <span className="text-white font-black text-3xl tracking-tight leading-none">{formatTime(end.toISOString())}</span>
                            </div>

                            <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                                {[-30, -5, -1, 1, 5, 30].map(v => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => adjustTime('end', v)}
                                        className="flex-1 min-w-[36px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#171717] text-xs font-semibold text-gray-400 active:bg-[#333] cursor-pointer"
                                    >
                                        {v > 0 ? '+' : ''}{v}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setNow('end')}
                                    className="flex-1 min-w-[48px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#171717] text-xs font-semibold text-gray-300 active:bg-[#333] cursor-pointer"
                                >
                                    {t('editRecord.now')}
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Activity Selector (Collapsible Accordion Grid) ── */}
                <div className="mt-4 space-y-2 pb-6">
                    <div className="border border-[#2a2a2a] rounded-xl bg-[#141414] overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setIsActivityOpen(!isActivityOpen)}
                            className="w-full p-3 flex items-center justify-between active:bg-[#171717] transition-colors"
                        >
                            <span className="text-gray-400 text-sm font-medium">{t('editRecord.activityLabel')}</span>
                            <div className="flex items-center gap-2">
                                <div
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm"
                                    style={{ backgroundColor: activity.color, color: contrast }}
                                >
                                    <DynamicIcon name={activity.icon} size={14} color={contrast} />
                                    <span>{activity.name}</span>
                                </div>
                                <ChevronDown
                                    size={18}
                                    className={`text-gray-400 transition-transform duration-200 ${isActivityOpen ? 'rotate-180' : ''}`}
                                />
                            </div>
                        </button>

                        <AnimatePresence initial={false}>
                            {isActivityOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                                    className="border-t border-[#222] p-3 overflow-hidden"
                                >
                                    <div className="grid grid-cols-4 gap-2">
                                        {recordTypes.map((rt) => {
                                            const isSelected = rt.id === activityId;
                                            const rtContrast = getContrastColor(rt.color);

                                            return (
                                                <motion.button
                                                    key={rt.id}
                                                    type="button"
                                                    whileTap={{ scale: 0.93 }}
                                                    onClick={() => {
                                                        setActivityId(rt.id);
                                                        setIsActivityOpen(false);
                                                    }}
                                                    className={`relative w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm transition-all overflow-hidden select-none cursor-pointer ${
                                                        isSelected
                                                            ? 'ring-4 ring-white ring-offset-2 ring-offset-[#141414] scale-[1.02] z-10'
                                                            : 'opacity-85 hover:opacity-100'
                                                    }`}
                                                    style={{ backgroundColor: rt.color }}
                                                >
                                                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 w-full">
                                                        <DynamicIcon name={rt.icon} size={24} color={rtContrast} />
                                                        <span
                                                            className="text-[11px] font-semibold text-center leading-tight px-1 w-full truncate"
                                                            style={{ color: rtContrast }}
                                                        >
                                                            {rt.name}
                                                        </span>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center text-black shadow-sm">
                                                            <Check size={10} strokeWidth={3} />
                                                        </div>
                                                    )}
                                                </motion.button>
                                            );
                                        })}

                                        {/* Untracked Option */}
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.93 }}
                                            onClick={() => {
                                                setActivityId('untracked');
                                                setIsActivityOpen(false);
                                            }}
                                            className={`relative w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm transition-all overflow-hidden select-none cursor-pointer border-2 border-dashed border-neutral-700 bg-neutral-900 text-neutral-300 ${
                                                activityId === 'untracked'
                                                    ? 'ring-4 ring-white ring-offset-2 ring-offset-[#141414] scale-[1.02] z-10'
                                                    : 'opacity-70 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex-1 flex flex-col items-center justify-center gap-1.5 w-full">
                                                <Clock size={22} className="text-neutral-400" />
                                                <span className="text-[11px] font-semibold text-center leading-tight px-1 w-full truncate text-neutral-400">
                                                    {t('timer.untrackedTitle')}
                                                </span>
                                            </div>
                                            {activityId === 'untracked' && (
                                                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center text-black shadow-sm">
                                                    <Check size={10} strokeWidth={3} />
                                                </div>
                                            )}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* ── Bottom Save Button ── */}
            <div className="p-4 bg-[#0a0a0a] border-t border-[#1e1e1e] flex-shrink-0">
                <button
                    onClick={handleSave}
                    className="w-full bg-[#1c1c1c] hover:bg-[#2a2a2a] py-4 rounded-[14px] text-gray-300 font-bold text-sm tracking-widest uppercase active:scale-[0.98] transition-all cursor-pointer"
                >
                    {record.isRunning && !isStillRunning ? t('editRecord.saveAndFinish') : t('common.save')}
                </button>
            </div>
        </motion.div>
    </motion.div>
    );

    if (typeof document === 'undefined') return null;
    return (
        <>
            {createPortal(content, document.body)}
            <AnimatePresence>
                {showSplitModal && (
                    <SplitRecordModal
                        record={record}
                        onClose={() => setShowSplitModal(false)}
                        onSplit={onClose}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
