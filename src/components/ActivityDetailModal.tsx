import { useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Calendar, TrendingUp, Flame, ChevronRight, Award } from 'lucide-react';
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

export default function ActivityDetailModal({
    isOpen,
    onClose,
    activity,
    viewMode,
    selectedDate,
    activityRecords,
    onSelectRecord,
}: ActivityDetailModalProps) {
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

    // Compute Metrics & Insights
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

        // Longest session
        let longest: TimeRecord | null = null;
        let longestSec = 0;
        for (const r of activityRecords) {
            if (r.duration > longestSec) {
                longestSec = r.duration;
                longest = r;
            }
        }

        // Average session duration
        const avgSession = Math.round(activity.duration / Math.max(1, activityRecords.length));

        // Time of Day distribution
        // Morning: 06:00 - 12:00
        // Afternoon: 12:00 - 18:00
        // Evening: 18:00 - 24:00
        // Night: 00:00 - 06:00
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
            // Group by 2-hour or hourly buckets
            const hourBuckets = Array.from({ length: 12 }, (_, i) => ({
                hour: i * 2,
                label: `${(i * 2).toString().padStart(2, '0')}:00`,
                duration: 0,
            }));

            for (const r of activityRecords) {
                const h = new Date(r.startTime).getHours();
                const bucketIdx = Math.min(11, Math.floor(h / 2));
                hourBuckets[bucketIdx].duration += r.duration;
            }

            for (const b of hourBuckets) {
                cData.push({
                    label: b.label,
                    duration: Math.round(b.duration / 60), // in minutes
                    formatted: formatDuration(b.duration),
                });
            }
        } else if (viewMode === 'month') {
            // Days in month
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
                    duration: Math.round((b.duration / 3600) * 10) / 10, // in hours (1 decimal)
                    formatted: formatDuration(b.duration),
                });
            }
        } else if (viewMode === 'year') {
            // 12 months
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
                    duration: Math.round((b.duration / 3600) * 10) / 10, // in hours
                    formatted: formatDuration(b.duration),
                });
            }
        } else {
            // All time - last 6 months or all months
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
    }, [activity, activityRecords, viewMode, selectedDate]);

    // Sorted sessions (newest first)
    const sortedRecords = useMemo(() => {
        return [...activityRecords].sort(
            (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
    }, [activityRecords]);

    if (!isOpen || !activity) return null;

    const contrast = getContrastColor(activity.color);
    const totalDurationSec = activity.duration;
    const totalTodDuration = Math.max(
        1,
        timeOfDayStats.morning + timeOfDayStats.afternoon + timeOfDayStats.evening + timeOfDayStats.night
    );

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden z-10"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Mobile Pull Indicator */}
                    <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mt-2.5 mb-1 sm:hidden flex-shrink-0" />

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
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
                        {/* KPI Metric Grid */}
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
                                    {activity.sessionCount}
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

                            {/* Longest Session */}
                            {longestSession && (
                                <div className="col-span-2 sm:col-span-3 p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div
                                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                                            style={{ backgroundColor: activity.color }}
                                        >
                                            <Award size={16} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                                Longest Session
                                            </p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                                {formatDuration(longestSession.duration)}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                        {formatDate(longestSession.startTime)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Trend Bar Chart */}
                        {chartData.length > 0 && (
                            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                        Activity Distribution
                                    </span>
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                        {viewMode === 'day' ? 'Duration (min)' : 'Duration (hours)'}
                                    </span>
                                </div>
                                <div className="h-44 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
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
                                            <Bar dataKey="duration" radius={[4, 4, 0, 0]}>
                                                {chartData.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={activity.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* Time of Day Breakdown */}
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

                        {/* Recorded Sessions List */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    Sessions in this period ({sortedRecords.length})
                                </span>
                                {onSelectRecord && sortedRecords.length > 0 && (
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                        Tap to edit
                                    </span>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                {sortedRecords.map((rec) => (
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

                                {sortedRecords.length === 0 && (
                                    <div className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                                        No individual sessions found for this period.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
