import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Pencil, Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import { formatDuration, splitRecordByDays } from '../utils/time';
import DynamicIcon from '../components/DynamicIcon';
import DateSelectorBar from '../components/DateSelectorBar';
import type { ViewMode } from '../components/DateSelectorBar';
import EditRecordScreen from '../components/EditRecordScreen';
import TrackingCard from '../components/TrackingCard';
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

function groupByDay(
    records: (Record & { isRunning?: boolean; originalRecord?: Record })[],
    showUntracked: boolean,
    viewContext?: { mode: ViewMode; date: Date }
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
        const label = getDayLabel(dateObj.toISOString());

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
        for (const iv of intervals) {
            if (merged.length === 0) {
                merged.push({ ...iv });
            } else {
                const last = merged[merged.length - 1];
                if (iv.start <= last.end) {
                    last.end = Math.max(last.end, iv.end);
                } else {
                    merged.push({ ...iv });
                }
            }
        }

        // Generate untracked gaps
        const untrackedRecords: (Record & { isRunning?: boolean })[] = [];
        let cursor = dayStart;

        for (const iv of merged) {
            if (iv.start - cursor >= 60000) { // >= 1 minute
                untrackedRecords.push({
                    id: `untracked-${new Date(cursor).toISOString()}-${new Date(iv.start).toISOString()}`,
                    recordTypeId: 'untracked',
                    startTime: new Date(cursor).toISOString(),
                    endTime: new Date(iv.start).toISOString(),
                    duration: Math.floor((iv.start - cursor) / 1000),
                });
            }
            cursor = Math.max(cursor, iv.end);
        }

        if (dayEnd - cursor >= 60000) {
            untrackedRecords.push({
                id: `untracked-${new Date(cursor).toISOString()}-${new Date(dayEnd).toISOString()}`,
                recordTypeId: 'untracked',
                startTime: new Date(cursor).toISOString(),
                endTime: new Date(dayEnd).toISOString(),
                duration: Math.floor((dayEnd - cursor) / 1000),
                isRunning: isToday,
            });
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
function RecordRow({ record, onEdit }: { record: Record & { isRunning?: boolean }; onEdit: () => void }) {
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

    // Untracked special rendering
    if (record.recordTypeId === 'untracked') {
        return (
            <TrackingCard
                name="Untracked Time"
                icon="Clock"
                color="#6b7280"
                subtitleLeft={formatTime(record.startTime)}
                titleRight={formatDuration(activeDuration)}
                subtitleRight={record.endTime ? formatTime(record.endTime) : formatTime(record.startTime)}
                onClick={onEdit}
            />
        );
    }

    let activity = recordTypes.find((rt) => rt.id === record.recordTypeId);
    if (!activity) return null;

    return (
        <TrackingCard
            name={activity.name}
            icon={activity.icon}
            color={activity.color}
            subtitleLeft={formatTime(record.startTime)}
            titleRight={formatDuration(activeDuration)}
            subtitleRight={record.endTime ? formatTime(record.endTime) : formatTime(record.startTime)}
            onClick={onEdit}
        />
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

    const handleEditRecord = (record: any) => {
        // If this row is a split chunk of a multi-day record, retrieve the true full original record
        const target = record.originalRecord || record;

        if (runningRecord && runningRecord.id === target.id) {
            setEditingRecord({
                ...runningRecord,
                endTime: now(),
                isRunning: true,
            });
        } else {
            const storeRecord = records.find(r => r.id === target.id);
            setEditingRecord(storeRecord || target);
        }
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
    const showUntracked = useStore(s => s.showUntrackedTime);
    const groups = useMemo(() => {
        return groupByDay(visibleRecords, showUntracked, { mode: viewMode, date: selectedDate });
    }, [visibleRecords, showUntracked, viewMode, selectedDate, tick]);

    return (
        <div className="flex flex-col min-h-screen pt-4 pb-[136px]">
            {/* Content */}
            {groups.length === 0 ? (
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

                            {/* Records cards */}
                            <div className="space-y-2">
                                <AnimatePresence>
                                    {group.records.map((record) => (
                                        <RecordRow
                                            key={`${record.id}-${record.startTime}`}
                                            record={record}
                                            onEdit={() => handleEditRecord(record)}
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
