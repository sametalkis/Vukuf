import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, CheckSquare, Square, X, Trash2, Link2, Palette, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { formatDuration, splitRecordByDays } from '../utils/time';
import DateSelectorBar from '../components/DateSelectorBar';
import type { ViewMode } from '../components/DateSelectorBar';
import EditRecordScreen from '../components/EditRecordScreen';
import StatisticsExportModal from '../components/StatisticsExportModal';
import TrackingCard from '../components/TrackingCard';
import DynamicIcon from '../components/DynamicIcon';
import { getContrastColor } from '../utils/colors';
import type { Record } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function sameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function getDayLabel(iso: string, t: (key: string) => string, locale: string): string {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (sameDay(date, today)) return t('common.today');
    if (sameDay(date, yesterday)) return t('common.yesterday');
    return date.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByDay(
    records: (Record & { isRunning?: boolean; originalRecord?: Record })[],
    showUntracked: boolean,
    viewContext: { mode: ViewMode; date: Date } | undefined,
    t: (key: string) => string,
    locale: string
): { label: string; date: string; records: (Record & { isRunning?: boolean })[] }[] {
    const dayMap = new Map<string, { dateObj: Date; records: (Record & { isRunning?: boolean })[] }>();

    // 1. Group records by calendar day
    for (const record of records) {
        const d = new Date(record.startTime);
        const dateKey = d.toDateString();
        if (!dayMap.has(dateKey)) {
            dayMap.set(dateKey, { dateObj: d, records: [] });
        }
        dayMap.get(dateKey)!.records.push(record);
    }

    // In day view, if showUntracked is on and selected day is not in future, ensure it exists in dayMap
    if (showUntracked && viewContext?.mode === 'day') {
        const sel = viewContext.date;
        const selKey = sel.toDateString();
        const today = new Date();
        const isPastOrToday = sel.getTime() <= today.getTime() || sameDay(sel, today);
        if (isPastOrToday && !dayMap.has(selKey)) {
            dayMap.set(selKey, { dateObj: sel, records: [] });
        }
    }

    const groups: { label: string; date: string; records: (Record & { isRunning?: boolean })[] }[] = [];

    // 2. Process each day
    for (const [dateKey, { dateObj, records: dayRecords }] of dayMap.entries()) {
        const label = getDayLabel(dateObj.toISOString(), t, locale);

        if (!showUntracked) {
            const sorted = [...dayRecords].sort(
                (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
            );
            groups.push({ label, date: dateKey, records: sorted });
            continue;
        }

        const isToday = sameDay(dateObj, new Date());
        const dayStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0, 0).getTime();
        const dayEnd = isToday
            ? Date.now()
            : new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999).getTime();

        // Active tracked records (exclude untracked records since gaps are calculated dynamically)
        const activeRecords = dayRecords.filter(r => r.recordTypeId !== 'untracked');

        // Build occupied intervals
        const intervals: { start: number; end: number }[] = [];
        for (const r of activeRecords) {
            const s = Math.max(dayStart, new Date(r.startTime).getTime());
            const e = Math.min(dayEnd, new Date(r.endTime).getTime());
            if (e > s) {
                intervals.push({ start: s, end: e });
            }
        }

        // Merge overlapping / contiguous intervals
        intervals.sort((a, b) => a.start - b.start);
        const merged: { start: number; end: number }[] = [];
        for (const int of intervals) {
            if (merged.length === 0) {
                merged.push({ ...int });
            } else {
                const prev = merged[merged.length - 1];
                if (int.start <= prev.end) {
                    prev.end = Math.max(prev.end, int.end);
                } else {
                    merged.push({ ...int });
                }
            }
        }

        // Fill gaps >= 60s as Untracked records
        const untrackedRecords: (Record & { isRunning?: boolean })[] = [];
        let cursor = dayStart;

        for (const occ of merged) {
            if (occ.start > cursor) {
                const dur = Math.floor((occ.start - cursor) / 1000);
                if (dur >= 60) {
                    untrackedRecords.push({
                        id: `untracked-${dateKey}-${cursor}`,
                        recordTypeId: 'untracked',
                        startTime: new Date(cursor).toISOString(),
                        endTime: new Date(occ.start).toISOString(),
                        duration: dur,
                    });
                }
            }
            cursor = Math.max(cursor, occ.end);
        }

        // Tail gap up to dayEnd
        if (dayEnd > cursor) {
            const dur = Math.floor((dayEnd - cursor) / 1000);
            if (dur >= 60) {
                untrackedRecords.push({
                    id: `untracked-${dateKey}-${cursor}`,
                    recordTypeId: 'untracked',
                    startTime: new Date(cursor).toISOString(),
                    endTime: new Date(dayEnd).toISOString(),
                    duration: dur,
                    isRunning: isToday,
                });
            }
        }

        const combined = [...activeRecords, ...untrackedRecords].sort(
            (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );

        groups.push({ label, date: dateKey, records: combined });
    }

    groups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return groups;
}

function dayTotal(records: (Record & { isRunning?: boolean })[]): string {
    const total = records
        .filter(r => r.recordTypeId !== 'untracked')
        .reduce((sum, r) => sum + r.duration, 0);
    return formatDuration(total);
}

// ─── Record Row ────────────────────────────────────────────────────────────────
function RecordRow({
    record,
    onEdit,
    isSelectionMode,
    isSelected,
    onToggleSelect,
    onLongPress,
}: {
    record: Record & { isRunning?: boolean };
    onEdit: () => void;
    isSelectionMode: boolean;
    isSelected: boolean;
    onToggleSelect: () => void;
    onLongPress: () => void;
}) {
    const { t } = useTranslation();
    const { recordTypes } = useStore();

    // Live tick for running timer duration
    const [elapsed, setElapsed] = useState(record.duration);

    useEffect(() => {
        if (!record.isRunning) return;
        const tick = () => {
            setElapsed(Math.floor((Date.now() - new Date(record.startTime).getTime()) / 1000));
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [record.isRunning, record.startTime]);

    const activeDuration = record.isRunning ? elapsed : record.duration;

    const handleClick = () => {
        if (isSelectionMode) {
            onToggleSelect();
        } else {
            onEdit();
        }
    };

    // Untracked special rendering
    if (record.recordTypeId === 'untracked') {
        return (
            <div className="relative flex items-center gap-2">
                {isSelectionMode && (
                    <div data-export-exclude className="flex-shrink-0 opacity-30">
                        <Square size={20} className="text-gray-600" />
                    </div>
                )}
                <div className="flex-1">
                    <TrackingCard
                        name={t('timer.untrackedTitle')}
                        icon="Clock"
                        color="#6b7280"
                        subtitleLeft={formatTime(record.startTime)}
                        titleRight={formatDuration(activeDuration)}
                        subtitleRight={record.endTime ? formatTime(record.endTime) : formatTime(record.startTime)}
                        onClick={isSelectionMode ? undefined : onEdit}
                    />
                </div>
            </div>
        );
    }

    const activity = recordTypes.find((rt) => rt.id === record.recordTypeId);
    if (!activity) return null;

    return (
        <div
            className="relative flex items-center gap-2"
            onContextMenu={(e) => {
                e.preventDefault();
                if (!isSelectionMode) {
                    onLongPress();
                } else {
                    onToggleSelect();
                }
            }}
        >
            {isSelectionMode && (
                <button
                    data-export-exclude
                    onClick={onToggleSelect}
                    className="flex-shrink-0 transition-transform active:scale-90"
                >
                    {isSelected ? (
                        <CheckSquare size={20} className="text-emerald-400" />
                    ) : (
                        <Square size={20} className="text-gray-500" />
                    )}
                </button>
            )}
            <div className={`flex-1 ${isSelectionMode && isSelected ? 'ring-2 ring-emerald-400/50 rounded-2xl' : ''}`}>
                <TrackingCard
                    name={activity.name}
                    icon={activity.icon}
                    color={activity.color}
                    subtitleLeft={formatTime(record.startTime)}
                    titleRight={formatDuration(activeDuration)}
                    subtitleRight={record.endTime ? formatTime(record.endTime) : formatTime(record.startTime)}
                    onClick={handleClick}
                    onLongPress={isSelectionMode ? undefined : onLongPress}
                />
            </div>
        </div>
    );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkActionBar({
    selectedCount,
    canMerge,
    onMerge,
    onDelete,
    onChangeActivity,
    onCancel,
}: {
    selectedCount: number;
    canMerge: boolean;
    onMerge: () => void;
    onDelete: () => void;
    onChangeActivity: () => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();

    return (
        <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-4"
            style={{
                bottom: 'calc(80px + env(safe-area-inset-bottom, 14px))',
            }}
        >
            <div
                className="pointer-events-auto bg-[#141414]/95 backdrop-blur-xl border border-neutral-800 rounded-2xl px-4 py-3 shadow-2xl"
                style={{
                    width: 'min(92vw, 420px)',
                }}
            >
                {/* Selection count + close */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-200">
                        {t('records.selected', { count: selectedCount })}
                    </span>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-1 rounded-full hover:bg-neutral-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={onMerge}
                        disabled={!canMerge}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors
                                   disabled:opacity-30 disabled:cursor-not-allowed
                                   bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    >
                        <Link2 size={14} />
                        {t('records.mergeSelected')}
                    </button>
                    <button
                        onClick={onChangeActivity}
                        disabled={selectedCount === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors
                                   disabled:opacity-30 disabled:cursor-not-allowed
                                   bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                    >
                        <Palette size={14} />
                        {t('records.changeActivity')}
                    </button>
                    <button
                        onClick={onDelete}
                        disabled={selectedCount === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors
                                   disabled:opacity-30 disabled:cursor-not-allowed
                                   bg-red-500/15 text-red-400 hover:bg-red-500/25"
                    >
                        <Trash2 size={14} />
                        {t('records.deleteSelected')}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Activity Picker Modal (for bulk change) ──────────────────────────────────
function ActivityPickerModal({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const { recordTypes } = useStore();

    return (
        <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                className="relative z-10 w-full max-w-xs bg-[#0a0a0a] rounded-3xl border border-neutral-800 shadow-2xl p-5"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-200">{t('records.changeActivity')}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-neutral-700">
                        <X size={18} className="text-gray-400" />
                    </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {recordTypes.map((rt) => {
                        const rtContrast = getContrastColor(rt.color);
                        return (
                            <motion.button
                                key={rt.id}
                                whileTap={{ scale: 0.93 }}
                                onClick={() => onSelect(rt.id)}
                                className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer"
                                style={{ backgroundColor: rt.color }}
                            >
                                <DynamicIcon name={rt.icon} size={22} color={rtContrast} />
                                <span
                                    className="text-[10px] font-semibold text-center leading-tight px-1 w-full truncate"
                                    style={{ color: rtContrast }}
                                >
                                    {rt.name}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Records Screen ────────────────────────────────────────────────────────────

export default function RecordsScreen() {
    const { t, i18n } = useTranslation();
    const locale = i18n.language?.startsWith('tr') ? 'tr-TR' : 'en-US';
    const { records, runningRecord, mergeRecords, deleteRecord, updateRecord } = useStore();
    const [editingRecord, setEditingRecord] = useState<(Record & { isRunning?: boolean }) | null>(null);

    // View mode constraints
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [limit, setLimit] = useState(50);

    // Multi-select state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [showActivityPicker, setShowActivityPicker] = useState(false);

    // Export / Share state
    const exportAreaRef = useRef<HTMLDivElement>(null);
    const [exportSnapshot, setExportSnapshot] = useState<{
        viewMode: ViewMode;
        selectedDate: Date;
        totalDuration: number;
        sourceElement: HTMLElement;
    } | null>(null);

    const isTr = i18n.language?.startsWith('tr');

    // Live tick for midnight-crossing running records
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!runningRecord) return;
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, [runningRecord]);

    // Update selectedDate when viewMode changes
    const handleSetSelectedDate = (date: Date) => {
        setSelectedDate(date);
        setLimit(50);
    };

    const handleEditRecord = (rec: Record & { isRunning?: boolean }) => {
        // If it's a split-day chunk, edit the master/original record interval!
        const target = (rec as any).originalRecord || rec;
        const storeRecord = records.find(r => r.id === target.id);
        if (storeRecord) {
            setEditingRecord(storeRecord);
        } else if (target.id.startsWith('untracked-')) {
            // Dynamically computed untracked block converted to editable draft
            setEditingRecord({
                id: target.id,
                recordTypeId: 'untracked',
                startTime: target.startTime,
                endTime: target.endTime,
                duration: target.duration,
                isRunning: target.isRunning,
            });
        }
    };

    // ── Multi-select handlers ──
    const handleLongPress = useCallback((recordId: string) => {
        setIsSelectionMode(true);
        setSelectedIds(new Set([recordId]));
    }, []);

    const handleToggleSelect = useCallback((recordId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(recordId)) {
                next.delete(recordId);
            } else {
                next.add(recordId);
            }
            return next;
        });
    }, []);

    const handleCancelSelection = useCallback(() => {
        setIsSelectionMode(false);
        setSelectedIds(new Set());
    }, []);

    const handleBulkMerge = useCallback(() => {
        if (selectedIds.size < 2) return;
        const ids = Array.from(selectedIds);
        const allAvailable = runningRecord
            ? [...records, { id: runningRecord.id, recordTypeId: runningRecord.recordTypeId, startTime: runningRecord.startTime, endTime: '', duration: 0 }]
            : records;
        const selectedRecords = allAvailable.filter((r) => ids.includes(r.id));

        // Check all same activity
        const activities = new Set(selectedRecords.map((r) => r.recordTypeId));
        if (activities.size > 1) {
            alert(t('records.mergeRequiresSameActivity'));
            return;
        }

        mergeRecords(ids);
        handleCancelSelection();
    }, [selectedIds, records, runningRecord, mergeRecords, handleCancelSelection, t]);

    const handleBulkDelete = useCallback(() => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(t('records.deleteSelectedConfirm', { count: selectedIds.size }))) return;

        for (const id of selectedIds) {
            deleteRecord(id);
        }
        handleCancelSelection();
    }, [selectedIds, deleteRecord, handleCancelSelection, t]);

    const handleBulkChangeActivity = useCallback((activityId: string) => {
        for (const id of selectedIds) {
            updateRecord(id, { recordTypeId: activityId });
        }
        setShowActivityPicker(false);
        handleCancelSelection();
    }, [selectedIds, updateRecord, handleCancelSelection]);

    // Can merge: 2+ selected, all same activity
    const canMerge = useMemo(() => {
        if (selectedIds.size < 2) return false;
        const ids = Array.from(selectedIds);
        const allAvailable = runningRecord
            ? [...records, { id: runningRecord.id, recordTypeId: runningRecord.recordTypeId, startTime: runningRecord.startTime, endTime: '', duration: 0 }]
            : records;
        const selectedRecords = allAvailable.filter((r) => ids.includes(r.id));
        if (selectedRecords.length < 2) return false;
        const activities = new Set(selectedRecords.map((r) => r.recordTypeId));
        return activities.size === 1;
    }, [selectedIds, records, runningRecord]);

    // ── Filter Records ──
    const filteredRecords = useMemo(() => {
        let allRecords = [...records];
        if (runningRecord) {
            allRecords.push({
                ...runningRecord,
                endTime: new Date().toISOString(),
                duration: Math.floor((Date.now() - new Date(runningRecord.startTime).getTime()) / 1000),
                isRunning: true
            } as Record & { isRunning?: boolean });
        }

        // Apply mathematical split strictly across chronological days!
        const splitRecords = allRecords.flatMap(r => splitRecordByDays(r));

        if (viewMode === 'all') return splitRecords;

        return splitRecords.filter(r => {
            const rDate = new Date(r.startTime);
            if (viewMode === 'day') {
                return rDate.toDateString() === selectedDate.toDateString();
            }
            if (viewMode === 'month') {
                return rDate.getMonth() === selectedDate.getMonth() && rDate.getFullYear() === selectedDate.getFullYear();
            }
            if (viewMode === 'year') {
                return rDate.getFullYear() === selectedDate.getFullYear();
            }
            return true;
        });
    }, [records, viewMode, selectedDate, runningRecord, tick]);

    // ── Sort & Paginate ──
    const sortedRecords = useMemo(() => {
        return [...filteredRecords].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    }, [filteredRecords]);

    const visibleRecords = sortedRecords.slice(0, limit);
    const hasMore = limit < sortedRecords.length;
    const showUntracked = useStore(s => s.showUntrackedTime);
    const groups = useMemo(() => {
        return groupByDay(visibleRecords, showUntracked, { mode: viewMode, date: selectedDate }, t, locale);
    }, [visibleRecords, showUntracked, viewMode, selectedDate, tick, t, locale]);

    const totalDuration = useMemo(() => {
        return filteredRecords
            .filter((r) => r.recordTypeId !== 'untracked')
            .reduce((sum, r) => sum + r.duration, 0);
    }, [filteredRecords]);

    const periodTitle = useMemo(() => {
        if (viewMode === 'day') {
            const today = new Date();
            if (selectedDate.toDateString() === today.toDateString()) return t('common.today');
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

    const periodSubtitle = useMemo(() => {
        if (viewMode === 'day') {
            return selectedDate.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
        }
        if (viewMode === 'month') {
            return selectedDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        }
        if (viewMode === 'year') {
            return `${selectedDate.getFullYear()}`;
        }
        return t('common.allTime');
    }, [viewMode, selectedDate, locale, t]);

    return (
        <div className="flex flex-col min-h-screen pt-4 pb-[168px]">
            {/* Content */}
            {groups.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center pt-20">
                    <div className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Clock size={36} className="text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{t('records.noRecords')}</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('records.trySelectingDate')}</p>
                    </div>
                </div>
            ) : (
                <div ref={exportAreaRef} className="px-4 space-y-4">
                    {/* Header bar with Selection toggle and Share */}
                    <div className="flex items-center justify-between pt-1 pb-1 mb-1 px-1">
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                                {t('nav.records')}
                            </h1>
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">
                                {periodSubtitle} • {formatDuration(totalDuration)}
                            </p>
                        </div>

                        <div data-export-exclude className="flex items-center gap-2">
                            {/* Share screenshot button */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (!exportAreaRef.current) return;
                                    if (isSelectionMode) handleCancelSelection();
                                    setExportSnapshot({
                                        viewMode,
                                        selectedDate: new Date(selectedDate),
                                        totalDuration,
                                        sourceElement: exportAreaRef.current,
                                    });
                                }}
                                className="w-10 h-10 rounded-2xl bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-700 dark:text-gray-200 border border-gray-200/80 dark:border-neutral-800 shadow-xs flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                                title={t('common.share')}
                                aria-label={t('common.share')}
                            >
                                <Share2 size={18} style={{ color: 'var(--primary, #ff9100)' }} />
                            </button>

                            {/* Select button (Icon only) */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (isSelectionMode) {
                                        handleCancelSelection();
                                    } else {
                                        setIsSelectionMode(true);
                                    }
                                }}
                                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-95 cursor-pointer border ${
                                    isSelectionMode
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-xs'
                                        : 'bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-700 dark:text-gray-200 border-gray-200/80 dark:border-neutral-800 shadow-xs'
                                }`}
                                title={isSelectionMode ? t('common.cancel') : t('records.select')}
                                aria-label={isSelectionMode ? t('common.cancel') : t('records.select')}
                            >
                                {isSelectionMode ? <X size={18} /> : <CheckSquare size={18} />}
                            </button>
                        </div>
                    </div>

                    {groups.map((group) => (
                        <div key={group.date}>
                            {/* Day header */}
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{group.label}</span>
                                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                    {dayTotal(group.records)}
                                </span>
                            </div>

                            {/* Records cards */}
                            <div className="space-y-2">
                                <AnimatePresence>
                                    {group.records.map((record) => (
                                        <div key={`${record.id}-${record.startTime}`}>
                                            <RecordRow
                                                record={record}
                                                onEdit={() => handleEditRecord(record)}
                                                isSelectionMode={isSelectionMode}
                                                isSelected={selectedIds.has(record.id)}
                                                onToggleSelect={() => handleToggleSelect(record.id)}
                                                onLongPress={() => handleLongPress(record.id)}
                                            />
                                        </div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    ))}


                    {/* Load More Button */}
                    {hasMore && (
                        <button
                            data-export-exclude
                            onClick={() => setLimit(l => l + 50)}
                            className="w-full py-4 mt-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-bold text-sm transition-colors cursor-pointer"
                        >
                            {t('common.loadMore')}
                        </button>
                    )}
                </div>
            )}

            {!isSelectionMode && (
                <DateSelectorBar
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    selectedDate={selectedDate}
                    setSelectedDate={handleSetSelectedDate}
                />
            )}

            {/* Multi-select action bar */}
            <AnimatePresence>
                {isSelectionMode && (
                    <BulkActionBar
                        selectedCount={selectedIds.size}
                        canMerge={canMerge}
                        onMerge={handleBulkMerge}
                        onDelete={handleBulkDelete}
                        onChangeActivity={() => setShowActivityPicker(true)}
                        onCancel={handleCancelSelection}
                    />
                )}
            </AnimatePresence>

            {/* Activity picker modal for bulk change */}
            <AnimatePresence>
                {showActivityPicker && (
                    <ActivityPickerModal
                        onSelect={handleBulkChangeActivity}
                        onClose={() => setShowActivityPicker(false)}
                    />
                )}
            </AnimatePresence>

            {/* Edit modal */}
            <AnimatePresence>
                {editingRecord && (
                    <EditRecordScreen
                        key={editingRecord.id}
                        record={editingRecord}
                        onClose={() => setEditingRecord(null)}
                    />
                )}
            </AnimatePresence>

            {/* Records Single-Page Image Export Modal */}
            {exportSnapshot && (
                <StatisticsExportModal
                    isOpen
                    onClose={() => setExportSnapshot(null)}
                    viewMode={exportSnapshot.viewMode}
                    selectedDate={exportSnapshot.selectedDate}
                    totalDuration={exportSnapshot.totalDuration}
                    sourceElement={exportSnapshot.sourceElement}
                    customTitle={t('export.recordsTitle')}
                    customSubtitle={t('export.recordsShareText', {
                        period: periodTitle,
                        total: formatDuration(exportSnapshot.totalDuration),
                    })}
                    filePrefix={isTr ? 'kayitlar' : 'records'}
                />
            )}
        </div>
    );
}
