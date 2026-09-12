import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Clock,
    Calendar,
    TrendingUp,
    Flame,
    ChevronRight,
    Award,
    ArrowRight,
    Repeat,
    Sparkles,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import type { Record as TimeRecord } from '../types';
import type { ViewMode } from './DateSelectorBar';
import DynamicIcon from './DynamicIcon';
import { getContrastColor } from '../utils/colors';
import { formatDuration } from '../utils/time';
import { useStore } from '../store/useStore';

interface ActivityDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    activity: {
        id: string;
        name: string;
        color: string;
        icon: string;
        duration: number;
        sessionCount: number;
        percent: number;
    } | null;
    viewMode: ViewMode;
    selectedDate: Date;
    activityRecords: TimeRecord[];
    onSelectRecord?: (record: TimeRecord) => void;
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ActivityDetailModal({
    isOpen,
    onClose,
    activity,
    viewMode,
    selectedDate,
    activityRecords,
    onSelectRecord,
}: ActivityDetailModalProps) {
    const { recordTypes, records: allStoreRecords } = useStore();

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Deduplicate split records back into full unique records
    const uniqueRecords = useMemo(() => {
        if (!activity || activityRecords.length === 0) return [];

        const map = new Map<string, TimeRecord>();
        for (const r of activityRecords) {
            const original = (r as any).originalRecord || r;
            const key = original.id || r.id;
            if (!map.has(key)) {
                map.set(key, original);
            }
        }
        return Array.from(map.values()).sort(
            (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
    }, [activity, activityRecords]);

    // Period Title
    const periodTitle = useMemo(() => {
        if (viewMode === 'day') {
            const today = new Date();
            if (selectedDate.toDateString() === today.toDateString()) return 'Today';
            return selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        }
        if (viewMode === 'month') {
            return selectedDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
        }
        if (viewMode === 'year') {
            return `${selectedDate.getFullYear()}`;
        }
        return 'All Time';
    }, [viewMode, selectedDate]);

    // ── Habit Sequence & Transition Insights ──
    // "En çok hangi aktiviteden sonra geliyor?" & "En çok hangisine geçiliyor?"
    const habitTransitions = useMemo(() => {
        if (!activity) {
            return {
                preceding: [],
                succeeding: [],
                topPreceding: null,
                topSucceeding: null,
                totalTransitions: 0,
            };
        }

        // Chronologically sorted all finished records
        const sorted = [...allStoreRecords].sort(
            (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        const precedingCounts: Record<string, number> = {};
        const succeedingCounts: Record<string, number> = {};
        let totalPreceding = 0;
        let totalSucceeding = 0;

        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].recordTypeId === activity.id) {
                // Preceding: closest previous record within 6 hours
                if (i > 0) {
                    const prev = sorted[i - 1];
                    const gapMs = new Date(sorted[i].startTime).getTime() - new Date(prev.endTime).getTime();
                    if (gapMs >= 0 && gapMs <= 6 * 3600 * 1000 && prev.recordTypeId !== activity.id) {
                        precedingCounts[prev.recordTypeId] = (precedingCounts[prev.recordTypeId] || 0) + 1;
                        totalPreceding++;
                    }
                }

                // Succeeding: closest next record within 6 hours
                if (i < sorted.length - 1) {
                    const next = sorted[i + 1];
                    const gapMs = new Date(next.startTime).getTime() - new Date(sorted[i].endTime).getTime();
                    if (gapMs >= 0 && gapMs <= 6 * 3600 * 1000 && next.recordTypeId !== activity.id) {
                        succeedingCounts[next.recordTypeId] = (succeedingCounts[next.recordTypeId] || 0) + 1;
                        totalSucceeding++;
                    }
                }
            }
        }

        const mapCounts = (counts: Record<string, number>, total: number) => {
            return Object.entries(counts)
                .map(([typeId, count]) => {
                    const act = recordTypes.find((r) => r.id === typeId);
                    return {
                        id: typeId,
                        name: act?.name || 'Activity',
                        color: act?.color || '#9ca3af',
                        icon: act?.icon || 'Clock',
                        count,
                        percent: total > 0 ? Math.round((count / total) * 100) : 0,
                    };
                })
                .sort((a, b) => b.count - a.count);
        };

        const precedingList = mapCounts(precedingCounts, totalPreceding);
        const succeedingList = mapCounts(succeedingCounts, totalSucceeding);

        return {
            preceding: precedingList,
            succeeding: succeedingList,
            topPreceding: precedingList[0] || null,
            topSucceeding: succeedingList[0] || null,
            totalTransitions: totalPreceding,
        };
    }, [activity, allStoreRecords, recordTypes]);

    // ── Day of Week Distribution (Pzt - Paz) ──
    const weekdayDistribution = useMemo(() => {
        if (!activity || activityRecords.length === 0) return [];

        // Monday (0) to Sunday (6)
        const days = Array.from({ length: 7 }, (_, i) => ({
            dayIndex: i,
            label: WEEKDAY_NAMES[i],
            duration: 0,
        }));

        for (const r of activityRecords) {
            const date = new Date(r.startTime);
            // JS getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
            const jsDay = date.getDay();
            const idx = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0 ... Sun=6
            days[idx].duration += r.duration;
        }

        const maxDuration = Math.max(1, ...days.map((d) => d.duration));
        const totalDuration = days.reduce((sum, d) => sum + d.duration, 0);

        return days.map((d) => ({
            ...d,
            percentOfMax: Math.round((d.duration / maxDuration) * 100),
            percentOfTotal: totalDuration > 0 ? Math.round((d.duration / totalDuration) * 100) : 0,
            formatted: formatDuration(d.duration),
        }));
    }, [activity, activityRecords]);

    const bestWeekday = useMemo(() => {
        if (!weekdayDistribution.length) return null;
        let best = weekdayDistribution[0];
        for (const d of weekdayDistribution) {
            if (d.duration > best.duration) best = d;
        }
        return best.duration > 0 ? best : null;
    }, [weekdayDistribution]);

    // ── Streak & Consistency Metrics ──
    const consistencyStats = useMemo(() => {
        if (!activity) return { activeDaysCount: 0, currentStreak: 0, bestStreak: 0 };

        const allActRecords = allStoreRecords.filter((r) => r.recordTypeId === activity.id);
        if (allActRecords.length === 0) return { activeDaysCount: 0, currentStreak: 0, bestStreak: 0 };

        // Unique days set
        const dayStrings = new Set<string>();
        for (const r of allActRecords) {
            const d = new Date(r.startTime);
            dayStrings.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
        }

        // Calculate streaks
        const sortedDates = Array.from(dayStrings)
            .map((s) => {
                const [y, m, d] = s.split('-').map(Number);
                return new Date(y, m - 1, d).getTime();
            })
            .sort((a, b) => a - b);

        let maxStreak = 0;
        let streak = 0;
        let prevTime = 0;
        const ONE_DAY_MS = 24 * 3600 * 1000;

        for (const t of sortedDates) {
            if (prevTime === 0) {
                streak = 1;
            } else if (Math.round((t - prevTime) / ONE_DAY_MS) === 1) {
                streak++;
            } else {
                streak = 1;
            }
            if (streak > maxStreak) maxStreak = streak;
            prevTime = t;
        }

        // Check if current streak extends to today/yesterday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastDate = sortedDates[sortedDates.length - 1];
        const diffDays = Math.round((today.getTime() - lastDate) / ONE_DAY_MS);
        const currentStreak = diffDays <= 1 ? streak : 0;

        // Active days in current period
        const periodDayStrings = new Set<string>();
        for (const r of activityRecords) {
            const d = new Date(r.startTime);
            periodDayStrings.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
        }

        return {
            activeDaysCount: periodDayStrings.size,
            currentStreak,
            bestStreak: maxStreak,
        };
    }, [activity, allStoreRecords, activityRecords]);

    // ── Trend Chart & Time of Day Calculation ──
    const {
        avgSessionDuration,
        longestSession,
        chartData,
        timeOfDayStats,
        peakTimeSlot,
    } = useMemo(() => {
        if (!activity || activityRecords.length === 0) {
            return {
                avgSessionDuration: 0,
                longestSession: null as TimeRecord | null,
                chartData: [] as { label: string; duration: number; formatted: string }[],
                timeOfDayStats: { morning: 0, afternoon: 0, evening: 0, night: 0 },
                peakTimeSlot: '',
            };
        }

        // Longest session from unique records
        let longest: TimeRecord | null = null;
        let longestSec = 0;
        for (const r of uniqueRecords) {
            if (r.duration > longestSec) {
                longestSec = r.duration;
                longest = r;
            }
        }

        // Average session duration
        const avgSession = Math.round(activity.duration / Math.max(1, uniqueRecords.length));

        // Time of Day distribution
        const tod = { morning: 0, afternoon: 0, evening: 0, night: 0 };
        for (const r of activityRecords) {
            const startH = new Date(r.startTime).getHours();
            if (startH >= 6 && startH < 12) tod.morning += r.duration;
            else if (startH >= 12 && startH < 18) tod.afternoon += r.duration;
            else if (startH >= 18 && startH < 24) tod.evening += r.duration;
            else tod.night += r.duration;
        }

        let peakSlot = 'morning';
        let peakMax = tod.morning;
        if (tod.afternoon > peakMax) {
            peakMax = tod.afternoon;
            peakSlot = 'afternoon';
        }
        if (tod.evening > peakMax) {
            peakMax = tod.evening;
            peakSlot = 'evening';
        }
        if (tod.night > peakMax) {
            peakMax = tod.night;
            peakSlot = 'night';
        }

        const peakSlotLabels: Record<string, string> = {
            morning: 'Morning (06:00 - 12:00)',
            afternoon: 'Afternoon (12:00 - 18:00)',
            evening: 'Evening (18:00 - 24:00)',
            night: 'Night (00:00 - 06:00)',
        };

        // Trend Chart Data
        const cData: { label: string; duration: number; formatted: string }[] = [];

        if (viewMode === 'day') {
            // Precise mathematical hourly buckets (00..23) without overflow
            const hourMins = Array.from({ length: 24 }, () => 0);

            for (const r of activityRecords) {
                const rStart = new Date(r.startTime);
                const rEnd = new Date(r.endTime);

                for (let h = 0; h < 24; h++) {
                    const bStart = new Date(selectedDate);
                    bStart.setHours(h, 0, 0, 0);
                    const bEnd = new Date(bStart);
                    bEnd.setHours(h + 1, 0, 0, 0);

                    const overlapStart = Math.max(rStart.getTime(), bStart.getTime());
                    const overlapEnd = Math.min(rEnd.getTime(), bEnd.getTime());
                    if (overlapEnd > overlapStart) {
                        hourMins[h] += Math.round((overlapEnd - overlapStart) / 60000);
                    }
                }
            }

            // Display every 2 hours or all hours with duration > 0
            for (let h = 0; h < 24; h++) {
                // Show alternate hour labels to avoid crowding
                const label = h % 2 === 0 ? `${h.toString().padStart(2, '0')}:00` : '';
                cData.push({
                    label: label || `${h}:00`,
                    duration: hourMins[h],
                    formatted: `${hourMins[h]}m`,
                });
            }
        } else if (viewMode === 'month') {
            const year = selectedDate.getFullYear();
            const month = selectedDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            const dayBuckets = Array.from({ length: daysInMonth }, (_, i) => ({
                day: i + 1,
                label: `${i + 1}`,
                duration: 0,
            }));

            for (const r of activityRecords) {
                const d = new Date(r.startTime).getDate();
                if (d >= 1 && d <= daysInMonth) {
                    dayBuckets[d - 1].duration += r.duration;
                }
            }

            for (const b of dayBuckets) {
                cData.push({
                    label: b.label,
                    duration: Math.round((b.duration / 3600) * 10) / 10, // in hours
                    formatted: formatDuration(b.duration),
                });
            }
        } else if (viewMode === 'year') {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthBuckets = monthNames.map((m) => ({ label: m, duration: 0 }));

            for (const r of activityRecords) {
                const m = new Date(r.startTime).getMonth();
                if (m >= 0 && m < 12) {
                    monthBuckets[m].duration += r.duration;
                }
            }

            for (const b of monthBuckets) {
                cData.push({
                    label: b.label,
                    duration: Math.round((b.duration / 3600) * 10) / 10,
                    formatted: formatDuration(b.duration),
                });
            }
        } else {
            const byMonthYear: Record<string, { label: string; duration: number }> = {};
            for (const r of activityRecords) {
                const d = new Date(r.startTime);
                const key = `${d.getFullYear()}-${d.getMonth()}`;
                const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                if (!byMonthYear[key]) {
                    byMonthYear[key] = { label, duration: 0 };
                }
                byMonthYear[key].duration += r.duration;
            }

            const sortedKeys = Object.keys(byMonthYear).sort();
            for (const k of sortedKeys.slice(-12)) {
                cData.push({
                    label: byMonthYear[k].label,
                    duration: Math.round((byMonthYear[k].duration / 3600) * 10) / 10,
                    formatted: formatDuration(byMonthYear[k].duration),
                });
            }
        }

        return {
            avgSessionDuration: avgSession,
            longestSession: longest,
            chartData: cData,
            timeOfDayStats: tod,
            peakTimeSlot: peakSlotLabels[peakSlot] || '',
        };
    }, [activity, activityRecords, uniqueRecords, viewMode, selectedDate]);

    if (!isOpen || !activity) return null;

    const contrast = getContrastColor(activity.color);
    const totalDurationSec = activity.duration;
    const totalTodDuration = Math.max(
        1,
        timeOfDayStats.morning + timeOfDayStats.afternoon + timeOfDayStats.evening + timeOfDayStats.night
    );

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden z-10 border border-gray-100 dark:border-gray-800"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Mobile Pull Indicator */}
                    <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mt-2.5 mb-1 sm:hidden flex-shrink-0" />

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
                                style={{ backgroundColor: activity.color }}
                            >
                                <DynamicIcon name={activity.icon} size={22} color={contrast} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                                    {activity.name}
                                </h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                        {periodTitle}
                                    </span>
                                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                        {Math.round(activity.percent)}% of total
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center transition-colors flex-shrink-0"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                        {/* ── KPI Metric Grid ── */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {/* Total Duration */}
                            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 mb-1">
                                    <Clock size={14} />
                                    <span className="text-xs font-medium">Total Time</span>
                                </div>
                                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {formatDuration(totalDurationSec)}
                                </p>
                            </div>

                            {/* Sessions */}
                            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 mb-1">
                                    <Calendar size={14} />
                                    <span className="text-xs font-medium">Sessions</span>
                                </div>
                                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {uniqueRecords.length}
                                </p>
                            </div>

                            {/* Avg Session */}
                            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 mb-1">
                                    <TrendingUp size={14} />
                                    <span className="text-xs font-medium">Avg Session</span>
                                </div>
                                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {formatDuration(avgSessionDuration)}
                                </p>
                            </div>

                            {/* Active Days */}
                            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 mb-1">
                                    <Repeat size={14} />
                                    <span className="text-xs font-medium">Active Days</span>
                                </div>
                                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {consistencyStats.activeDaysCount} days
                                </p>
                            </div>

                            {/* Best Streak */}
                            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-1.5 text-amber-500 mb-1">
                                    <Flame size={14} />
                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">Best Streak</span>
                                </div>
                                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {consistencyStats.bestStreak} {consistencyStats.bestStreak === 1 ? 'day' : 'days'}
                                </p>
                            </div>

                            {/* Longest Session */}
                            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-1.5 text-emerald-500 mb-1">
                                    <Award size={14} />
                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">Longest</span>
                                </div>
                                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate">
                                    {longestSession ? formatDuration(longestSession.duration) : '-'}
                                </p>
                            </div>
                        </div>

                        {/* ── Habit Sequence & Transition Analysis ("En Çok Hangi Aktiviteden Sonra Geliyor?") ── */}
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100/70 dark:from-gray-800/60 dark:to-gray-800/30 border border-gray-100 dark:border-gray-800 space-y-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={16} className="text-amber-500" />
                                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                                        Habit Sequence & Flow
                                    </span>
                                </div>
                                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                                    Transition Insights
                                </span>
                            </div>

                            {/* Visual Chain representation */}
                            <div className="flex items-center justify-between gap-1 p-3 rounded-xl bg-white dark:bg-gray-900/80 border border-gray-100 dark:border-gray-800 shadow-sm">
                                {/* Preceding Activity */}
                                <div className="flex-1 flex flex-col items-center text-center p-1">
                                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">
                                        Preceded By
                                    </span>
                                    {habitTransitions.topPreceding ? (
                                        <>
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center mb-1 text-white shadow-sm"
                                                style={{ backgroundColor: habitTransitions.topPreceding.color }}
                                            >
                                                <DynamicIcon name={habitTransitions.topPreceding.icon} size={16} />
                                            </div>
                                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[90px]">
                                                {habitTransitions.topPreceding.name}
                                            </p>
                                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                                %{habitTransitions.topPreceding.percent} ({habitTransitions.topPreceding.count}x)
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic py-3">-</span>
                                    )}
                                </div>

                                <ArrowRight size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />

                                {/* Current Activity */}
                                <div className="flex-1 flex flex-col items-center text-center p-1 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <span className="text-[10px] font-semibold text-primary-500 dark:text-primary-400 uppercase mb-1">
                                        This Activity
                                    </span>
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center mb-1 shadow-sm"
                                        style={{ backgroundColor: activity.color, color: contrast }}
                                    >
                                        <DynamicIcon name={activity.icon} size={16} />
                                    </div>
                                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate max-w-[90px]">
                                        {activity.name}
                                    </p>
                                    <span className="text-[10px] text-gray-400">Current</span>
                                </div>

                                <ArrowRight size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />

                                {/* Following Activity */}
                                <div className="flex-1 flex flex-col items-center text-center p-1">
                                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">
                                        Followed By
                                    </span>
                                    {habitTransitions.topSucceeding ? (
                                        <>
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center mb-1 text-white shadow-sm"
                                                style={{ backgroundColor: habitTransitions.topSucceeding.color }}
                                            >
                                                <DynamicIcon name={habitTransitions.topSucceeding.icon} size={16} />
                                            </div>
                                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[90px]">
                                                {habitTransitions.topSucceeding.name}
                                            </p>
                                            <span className="text-[10px] font-medium text-sky-600 dark:text-sky-400">
                                                %{habitTransitions.topSucceeding.percent} ({habitTransitions.topSucceeding.count}x)
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic py-3">-</span>
                                    )}
                                </div>
                            </div>

                            {/* Detailed transitions breakdown list if multiple */}
                            {habitTransitions.preceding.length > 1 && (
                                <div className="pt-1">
                                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                                        Other activities usually preceding {activity.name}:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {habitTransitions.preceding.slice(1).map((p) => (
                                            <div
                                                key={p.id}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-[11px]"
                                            >
                                                <div
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: p.color }}
                                                />
                                                <span className="font-semibold text-gray-700 dark:text-gray-300">
                                                    {p.name}
                                                </span>
                                                <span className="text-gray-400">%{p.percent} ({p.count}x)</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Day of the Week Distribution (Pzt - Paz) ── */}
                        {viewMode !== 'day' && weekdayDistribution.length > 0 && (
                            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                        Day of the Week Distribution
                                    </span>
                                    {bestWeekday && (
                                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                                            🏆 Peak Day: {bestWeekday.label} ({bestWeekday.formatted})
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-7 gap-1.5 pt-2">
                                    {weekdayDistribution.map((d) => (
                                        <div key={d.dayIndex} className="flex flex-col items-center">
                                            <div className="w-full h-24 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-end p-1 overflow-hidden">
                                                <div
                                                    style={{
                                                        height: `${Math.max(8, d.percentOfMax)}%`,
                                                        backgroundColor: activity.color,
                                                    }}
                                                    className="w-full rounded-lg transition-all duration-500 opacity-90 hover:opacity-100"
                                                    title={`${d.label}: ${d.formatted} (%${d.percentOfTotal})`}
                                                />
                                            </div>
                                            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mt-1.5">
                                                {d.label}
                                            </span>
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                                                {d.duration > 0 ? formatDuration(d.duration) : '-'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Trend Distribution Chart ── */}
                        {chartData.length > 0 && (
                            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                        Timeline Breakdown
                                    </span>
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                        {viewMode === 'day' ? 'Minutes per Hour' : 'Hours'}
                                    </span>
                                </div>
                                <div className="h-44 w-full min-w-0" style={{ minHeight: '176px' }}>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={176}>
                                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                            <XAxis
                                                dataKey="label"
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                            />
                                            <YAxis
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                            />
                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null;
                                                    const data = payload[0].payload;
                                                    return (
                                                        <div className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 text-xs">
                                                            <p className="font-bold text-gray-800 dark:text-gray-100">{data.label}</p>
                                                            <p className="text-gray-500 dark:text-gray-400">{data.formatted}</p>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Bar dataKey="duration" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                                {chartData.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={activity.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* ── Time of Day Pattern (Morning, Afternoon, Evening, Night) ── */}
                        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    Time of Day Pattern
                                </span>
                                {peakTimeSlot && (
                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md">
                                        <Flame size={12} />
                                        Peak: {peakTimeSlot}
                                    </span>
                                )}
                            </div>

                            {/* Stacked percentage bar */}
                            <div className="h-3.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                                <div
                                    style={{ width: `${(timeOfDayStats.morning / totalTodDuration) * 100}%` }}
                                    className="bg-sky-400 transition-all duration-500"
                                    title={`Morning: ${formatDuration(timeOfDayStats.morning)}`}
                                />
                                <div
                                    style={{ width: `${(timeOfDayStats.afternoon / totalTodDuration) * 100}%` }}
                                    className="bg-amber-400 transition-all duration-500"
                                    title={`Afternoon: ${formatDuration(timeOfDayStats.afternoon)}`}
                                />
                                <div
                                    style={{ width: `${(timeOfDayStats.evening / totalTodDuration) * 100}%` }}
                                    className="bg-indigo-500 transition-all duration-500"
                                    title={`Evening: ${formatDuration(timeOfDayStats.evening)}`}
                                />
                                <div
                                    style={{ width: `${(timeOfDayStats.night / totalTodDuration) * 100}%` }}
                                    className="bg-purple-600 transition-all duration-500"
                                    title={`Night: ${formatDuration(timeOfDayStats.night)}`}
                                />
                            </div>

                            {/* Legend */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 flex-shrink-0" />
                                    <span className="text-gray-500 dark:text-gray-400 truncate">
                                        Morning ({Math.round((timeOfDayStats.morning / totalTodDuration) * 100)}%)
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                                    <span className="text-gray-500 dark:text-gray-400 truncate">
                                        Afternoon ({Math.round((timeOfDayStats.afternoon / totalTodDuration) * 100)}%)
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0" />
                                    <span className="text-gray-500 dark:text-gray-400 truncate">
                                        Evening ({Math.round((timeOfDayStats.evening / totalTodDuration) * 100)}%)
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 flex-shrink-0" />
                                    <span className="text-gray-500 dark:text-gray-400 truncate">
                                        Night ({Math.round((timeOfDayStats.night / totalTodDuration) * 100)}%)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── Recorded Sessions List ── */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    Sessions in this period ({uniqueRecords.length})
                                </span>
                                {onSelectRecord && uniqueRecords.length > 0 && (
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                        Tap to edit
                                    </span>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                {uniqueRecords.map((rec) => (
                                    <button
                                        key={rec.id}
                                        type="button"
                                        onClick={() => onSelectRecord && onSelectRecord(rec)}
                                        className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors group"
                                    >
                                        <div>
                                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                                {formatDate(rec.startTime)}
                                            </p>
                                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                                                {formatTime(rec.startTime)} – {formatTime(rec.endTime)}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">
                                                {formatDuration(rec.duration)}
                                            </span>
                                            {onSelectRecord && (
                                                <ChevronRight
                                                    size={14}
                                                    className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors"
                                                />
                                            )}
                                        </div>
                                    </button>
                                ))}

                                {uniqueRecords.length === 0 && (
                                    <div className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                                        No individual sessions found for this period.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
