import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Pencil, Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import { formatDuration, splitRecordByDays } from '../utils/time';
import DynamicIcon from '../components/DynamicIcon';
import DateSelectorBar from '../components/DateSelectorBar';
import type { ViewMode } from '../components/DateSelectorBar';
import EditRecordScreen from '../components/EditRecordScreen';
import { getContrastColor } from '../utils/colors';
import type { Record } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getDayLabel(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    if (sameDay(date, today)) return 'Today';
    if (sameDay(date, yesterday)) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByDay(records: (Record & { isRunning?: boolean })[], showUntracked: boolean): { label: string; date: string; records: (Record & { isRunning?: boolean })[] }[] {
    const sorted = [...records].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    let processedRecords = sorted;

    if (showUntracked && sorted.length > 0) {
        processedRecords = [];
        for (let i = 0; i < sorted.length; i++) {
            processedRecords.push(sorted[i]);

            if (i < sorted.length - 1) {
                const newer = sorted[i];
                const older = sorted[i + 1];
                const gapMs = new Date(newer.startTime).getTime() - new Date(older.endTime).getTime();

                if (gapMs >= 60000) { // >= 1 minute
                    processedRecords.push({
                        id: `untracked-${older.endTime}-${newer.startTime}`,
                        recordTypeId: 'untracked',
                        startTime: older.endTime,
                        endTime: newer.startTime,
                        duration: Math.floor(gapMs / 1000)
                    });
                }
            }
        }
    }

    const groups: { label: string; date: string; records: (Record & { isRunning?: boolean })[] }[] = [];

    for (const record of processedRecords) {
        const dateKey = new Date(record.startTime).toDateString();
        const label = getDayLabel(record.startTime);
        const existing = groups.find((g) => g.date === dateKey);
        if (existing) {
            existing.records.push(record);
        } else {
            groups.push({ label, date: dateKey, records: [record] });
        }
    }
    return groups;
}

function dayTotal(records: Record[]): string {
    const total = records.reduce((sum, r) => sum + r.duration, 0);
    return formatDuration(total);
}

// ─── Record Row ────────────────────────────────────────────────────────────────
function RecordRow({ record, onEdit }: { record: Record & { isRunning?: boolean }; onEdit: () => void }) {
    const { recordTypes, deleteRecord } = useStore();

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

    // Untracked special rendering
    if (record.recordTypeId === 'untracked') {
        let isUntrackedRunning = false;
        if (record.isRunning) isUntrackedRunning = true;

        return (
            <motion.div
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 py-2 px-4 shadow-sm relative overflow-hidden group"
            >
                {/* Active scanline effect if running */}
                {isUntrackedRunning && (
                    <div className="absolute inset-0 opacity-10 bg-[length:20px_20px] bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,1)_25%,rgba(0,0,0,1)_50%,transparent_50%,transparent_75%,rgba(0,0,0,1)_75%,rgba(0,0,0,1)_100%)] dark:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,1)_25%,rgba(255,255,255,1)_50%,transparent_50%,transparent_75%,rgba(255,255,255,1)_75%,rgba(255,255,255,1)_100%)] animate-[scan_20s_linear_infinite]" />
                )}

                <div className="w-10 h-10 rounded-xl flex flex-shrink-0 items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 relative z-10">
                    <Clock size={16} />
                </div>
                <div className="flex-1 min-w-0 relative z-10 cursor-pointer" onClick={onEdit}>
                    <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-500 italic">
                        Untracked Time {isUntrackedRunning ? '(Running)' : ''}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1 mt-0.5">
                        {formatTime(record.startTime)} – {isUntrackedRunning ? 'Now' : formatTime(record.endTime)}
                    </p>
                </div>
                <span className="text-sm font-bold text-gray-400 dark:text-gray-600 flex-shrink-0 min-w-[40px] text-right relative z-10">
                    {formatDuration(activeDuration)}
                </span>

                {/* Actions container with full visibility on Edit */}
                <div className="flex items-center gap-1 flex-shrink-0 relative z-10">
                    <button
                        onClick={onEdit}
                        className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                    >
                        <Pencil size={13} />
                    </button>
                    <button
                        onClick={() => {
                            if (window.confirm('Bu kaydı silmek istediğinden emin misin?')) {
                                deleteRecord(record.id);
                            }
                        }}
                        className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </motion.div>
        );
    }

    let activity = recordTypes.find((rt) => rt.id === record.recordTypeId);
    if (!activity) return null;
    const contrast = getContrastColor(activity.color);

    return (
        <motion.div
            layout
            exit={{ opacity: 0, x: -40 }}
            className="flex items-center gap-3 py-3 first:pt-4 last:pb-4 px-4"
        >
            {/* Color dot / icon */}
            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: activity.color }}
            >
                <DynamicIcon name={activity.icon} size={18} color={contrast} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
                    {activity.name}
                    {record.isRunning && (
                        <span className="text-[10px] uppercase font-bold tracking-wider bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded-md">Running</span>
                    )}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {formatTime(record.startTime)} – {record.isRunning ? 'Now' : formatTime(record.endTime)}
                </p>
            </div>

            {/* Duration */}
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex-shrink-0 min-w-[40px] text-right">
                {formatDuration(activeDuration)}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={onEdit}
                    className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                >
                    <Pencil size={13} />
                </button>
                <button
                    onClick={() => {
                        if (window.confirm('Bu kaydı silmek istediğinden emin misin?')) {
                            deleteRecord(record.id);
                        }
                    }}
                    className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </motion.div>
    );
}

// ─── Records Screen ────────────────────────────────────────────────────────────

export default function RecordsScreen() {
    const { records, runningRecord } = useStore();
    const [editingRecord, setEditingRecord] = useState<(Record & { isRunning?: boolean }) | null>(null);

    // View mode constraints
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [limit, setLimit] = useState(50);

    // Live tick for midnight-crossing running records
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!runningRecord) return;
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, [runningRecord]);

    const handleSetSelectedDate = (date: Date) => {
        setSelectedDate(date);
        setLimit(50);
    };

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
    const groups = groupByDay(visibleRecords, useStore(s => s.showUntrackedTime));

    return (
        <div className="flex flex-col min-h-screen pt-4 pb-[136px]">
            {/* Content */}
            {sortedRecords.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center pt-20">
                    <div className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Clock size={36} className="text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">No records found</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try selecting a different date</p>
                    </div>
                </div>
            ) : (
                <div className="px-4 space-y-4">
                    {groups.map((group) => (
                        <div key={group.date}>
                            {/* Day header */}
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{group.label}</span>
                                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                    {dayTotal(group.records)}
                                </span>
                            </div>

                            {/* Records card */}
                            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                                <AnimatePresence>
                                    {group.records.map((record) => (
                                        <RecordRow
                                            key={record.id}
                                            record={record}
                                            onEdit={() => setEditingRecord(record)}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    ))}

                    {/* Load More Button */}
                    {hasMore && (
                        <button
                            onClick={() => setLimit(l => l + 50)}
                            className="w-full py-4 mt-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-bold text-sm transition-colors"
                        >
                            Load More
                        </button>
                    )}
                </div>
            )}

            <DateSelectorBar
                viewMode={viewMode}
                setViewMode={setViewMode}
                selectedDate={selectedDate}
                setSelectedDate={handleSetSelectedDate}
            />

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
        </div>
    );
}
