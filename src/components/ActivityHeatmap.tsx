import { useState, useMemo, useRef, useEffect } from 'react';
import { Flame, Calendar, X } from 'lucide-react';
import type { Record as TimeRecord, RecordType, RunningRecord } from '../types';
import type { ViewMode } from './DateSelectorBar';
import { formatDuration, splitRecordByDays } from '../utils/time';

interface ActivityHeatmapProps {
    viewMode: ViewMode;
    selectedDate: Date;
    records: TimeRecord[];
    recordTypes: RecordType[];
    runningRecord: RunningRecord | null;
    customColor?: string;
    title?: string;
    className?: string;
}

interface DayData {
    date: Date;
    dateKey: string; // YYYY-MM-DD
    totalDuration: number;
    sessionCount: number;
    activities: { id: string; name: string; color: string; duration: number }[];
    level: 0 | 1 | 2 | 3 | 4;
    isCurrentMonth?: boolean;
    isToday?: boolean;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getLevel(durationSec: number, maxSec: number): 0 | 1 | 2 | 3 | 4 {
    if (durationSec <= 0) return 0;
    if (maxSec <= 0) return 1;
    const ratio = durationSec / maxSec;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
}

// Background style for intensity levels
function getLevelBg(level: 0 | 1 | 2 | 3 | 4, customColor?: string): string {
    const base = customColor || 'var(--primary, #ff9100)';
    switch (level) {
        case 1:
            return `color-mix(in srgb, ${base} 25%, transparent)`;
        case 2:
            return `color-mix(in srgb, ${base} 50%, transparent)`;
        case 3:
            return `color-mix(in srgb, ${base} 75%, transparent)`;
        case 4:
            return base;
        case 0:
        default:
            return '';
    }
}

export default function ActivityHeatmap({
    viewMode,
    selectedDate,
    records,
    recordTypes,
    runningRecord,
    customColor,
    title,
    className,
}: ActivityHeatmapProps) {
    // Hidden in daily view
    if (viewMode === 'day') return null;

    const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 1. Process all split records into daily map
    const { dailyMap, maxDayDuration, allTrackedDaysCount, currentStreak, bestStreak } = useMemo(() => {
        let allRecords = [...records];
        if (runningRecord) {
            allRecords.push({
                ...runningRecord,
                endTime: new Date().toISOString(),
                duration: Math.floor((Date.now() - new Date(runningRecord.startTime).getTime()) / 1000),
            } as any);
        }

        const splitRecords = allRecords.flatMap((r) => splitRecordByDays(r));
        const map = new Map<string, { totalDuration: number; sessionCount: number; actMap: Map<string, number> }>();

        for (const r of splitRecords) {
            const d = new Date(r.startTime);
            const key = formatDateKey(d);

            if (!map.has(key)) {
                map.set(key, { totalDuration: 0, sessionCount: 0, actMap: new Map() });
            }
            const entry = map.get(key)!;
            entry.totalDuration += r.duration;
            entry.sessionCount += 1;
            entry.actMap.set(r.recordTypeId, (entry.actMap.get(r.recordTypeId) || 0) + r.duration);
        }

        let maxSec = 0;
        map.forEach((val) => {
            if (val.totalDuration > maxSec) maxSec = val.totalDuration;
        });

        // Calculate streaks across all recorded days
        const sortedDayStrings = Array.from(map.keys())
            .filter((k) => (map.get(k)?.totalDuration || 0) > 0)
            .sort();

        const sortedDatesMs = sortedDayStrings.map((s) => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(y, m - 1, d).getTime();
        });

        const ONE_DAY_MS = 24 * 3600 * 1000;
        let maxStr = 0;
        let str = 0;
        let prevT = 0;

        for (const t of sortedDatesMs) {
            if (prevT === 0) {
                str = 1;
            } else if (Math.round((t - prevT) / ONE_DAY_MS) === 1) {
                str++;
            } else {
                str = 1;
            }
            if (str > maxStr) maxStr = str;
            prevT = t;
        }

        // Current streak
        const todayMs = new Date().setHours(0, 0, 0, 0);
        const lastDateMs = sortedDatesMs[sortedDatesMs.length - 1] || 0;
        const diffDays = Math.round((todayMs - lastDateMs) / ONE_DAY_MS);
        const curStr = diffDays <= 1 ? str : 0;

        return {
            dailyMap: map,
            maxDayDuration: maxSec,
            allTrackedDaysCount: sortedDayStrings.length,
            currentStreak: curStr,
            bestStreak: maxStr,
        };
    }, [records, runningRecord]);

    // Helper to get DayData for any Date
    const getDayData = (date: Date): DayData => {
        const key = formatDateKey(date);
        const entry = dailyMap.get(key);
        const total = entry ? entry.totalDuration : 0;
        const sessions = entry ? entry.sessionCount : 0;

        const activities: { id: string; name: string; color: string; duration: number }[] = [];
        if (entry) {
            entry.actMap.forEach((dur, typeId) => {
                const rt = recordTypes.find((t) => t.id === typeId);
                activities.push({
                    id: typeId,
                    name: rt ? rt.name : typeId === 'untracked' ? 'Untracked' : 'Activity',
                    color: rt ? rt.color : '#9ca3af',
                    duration: dur,
                });
            });
            activities.sort((a, b) => b.duration - a.duration);
        }

        const todayKey = formatDateKey(new Date());

        return {
            date,
            dateKey: key,
            totalDuration: total,
            sessionCount: sessions,
            activities,
            level: getLevel(total, maxDayDuration),
            isToday: key === todayKey,
        };
    };

    // ── YEAR VIEW: 52-53 Weeks x 7 Days ──
    const yearGridData = useMemo(() => {
        if (viewMode !== 'year' && viewMode !== 'all') return null;

        const targetYear = selectedDate.getFullYear();
        const jan1 = new Date(targetYear, 0, 1);
        const dec31 = new Date(targetYear, 11, 31);

        // Find the Monday on or before Jan 1
        // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
        const jan1Day = jan1.getDay();
        const mondayOffset = jan1Day === 0 ? 6 : jan1Day - 1; // days to subtract to reach Monday
        const startDate = new Date(jan1);
        startDate.setDate(startDate.getDate() - mondayOffset);

        const weeks: {
            weekIndex: number;
            monthLabel?: string;
            days: (DayData | null)[];
        }[] = [];

        let cur = new Date(startDate);
        let weekIdx = 0;
        let lastMonthLabeled = -1;

        while (cur <= dec31 || cur.getDay() !== 1) {
            const weekDays: (DayData | null)[] = [];
            let firstDayInWeekMonth = -1;

            for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
                const d = new Date(cur);
                if (d.getFullYear() === targetYear) {
                    weekDays.push(getDayData(d));
                    if (firstDayInWeekMonth === -1 && d.getDate() <= 7) {
                        firstDayInWeekMonth = d.getMonth();
                    }
                } else {
                    weekDays.push(null); // Day from prev/next year
                }
                cur.setDate(cur.getDate() + 1);
            }

            let monthLabel: string | undefined;
            if (firstDayInWeekMonth !== -1 && firstDayInWeekMonth !== lastMonthLabeled) {
                monthLabel = MONTH_NAMES[firstDayInWeekMonth];
                lastMonthLabeled = firstDayInWeekMonth;
            }

            weeks.push({
                weekIndex: weekIdx,
                monthLabel,
                days: weekDays,
            });

            weekIdx++;
            if (weekIdx > 54) break; // safety guard
        }

        return weeks;
    }, [viewMode, selectedDate, dailyMap, maxDayDuration, recordTypes]);

    // ── MONTH VIEW: 7 Columns (Mon..Sun) Calendar Heatmap ──
    const monthGridData = useMemo(() => {
        if (viewMode !== 'month') return null;

        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // 1st of month
        const firstDay = new Date(year, month, 1);
        const firstDayWeekIdx = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon=0 ... Sun=6

        const cells: (DayData | null)[] = [];

        // Leading empty days from previous month
        for (let i = 0; i < firstDayWeekIdx; i++) {
            cells.push(null);
        }

        // Days of this month
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const data = getDayData(d);
            data.isCurrentMonth = true;
            cells.push(data);
        }

        // Trailing empty days to complete row of 7
        const remaining = (7 - (cells.length % 7)) % 7;
        for (let i = 0; i < remaining; i++) {
            cells.push(null);
        }

        return cells;
    }, [viewMode, selectedDate, dailyMap, maxDayDuration, recordTypes]);

    // Auto-scroll year view to current month on mount
    useEffect(() => {
        if ((viewMode === 'year' || viewMode === 'all') && scrollContainerRef.current) {
            const currentYear = new Date().getFullYear();
            if (selectedDate.getFullYear() === currentYear) {
                // Scroll towards right
                scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
            } else {
                scrollContainerRef.current.scrollLeft = 0;
            }
        }
    }, [viewMode, selectedDate]);

    // Period summary counts
    const periodActiveDays = useMemo(() => {
        if (viewMode === 'month') {
            return (monthGridData || []).filter((c) => c && c.totalDuration > 0).length;
        }
        if (yearGridData) {
            let count = 0;
            yearGridData.forEach((w) => {
                w.days.forEach((d) => {
                    if (d && d.totalDuration > 0) count++;
                });
            });
            return count;
        }
        return allTrackedDaysCount;
    }, [viewMode, monthGridData, yearGridData, allTrackedDaysCount]);

    return (
        <section className="w-full">
            <div className={className || "p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3.5"}>
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs"
                            style={{
                                backgroundColor: customColor ? `${customColor}22` : 'var(--primary-soft, rgba(255, 145, 0, 0.15))',
                                color: customColor || 'var(--primary, #ff9100)',
                            }}
                        >
                            <Calendar size={16} />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                                {title || (viewMode === 'year' ? 'Commit & Activity Heatmap' : 'Monthly Activity Heatmap')}
                            </h3>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                {periodActiveDays} active days • {bestStreak > 0 ? `Streak: ${bestStreak}d` : 'Daily consistency'}
                            </p>
                        </div>
                    </div>

                    {/* Streak Badge */}
                    {bestStreak > 0 && (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold">
                            <Flame size={13} className="fill-amber-500 text-amber-500" />
                            <span>{currentStreak > 0 ? `${currentStreak}d streak` : `${bestStreak}d best`}</span>
                        </div>
                    )}
                </div>

                {/* ── YEAR / ALL HEATMAP GRID (GitHub 53-week horizontal scroll) ── */}
                {(viewMode === 'year' || viewMode === 'all') && yearGridData && (
                    <div className="relative">
                        <div
                            ref={scrollContainerRef}
                            className="overflow-x-auto pb-2 scroll-smooth no-scrollbar select-none"
                        >
                            <div className="inline-flex flex-col min-w-max pt-1 pb-1">
                                {/* Month labels along top */}
                                <div className="flex text-[10px] text-gray-400 dark:text-gray-500 font-semibold mb-1 pl-6">
                                    {yearGridData.map((w) => (
                                        <div
                                            key={w.weekIndex}
                                            className="w-[14px] flex-shrink-0 text-left overflow-visible"
                                        >
                                            {w.monthLabel || ''}
                                        </div>
                                    ))}
                                </div>

                                {/* Heatmap Rows */}
                                <div className="flex gap-[3px]">
                                    {/* Weekday labels on left: Mon (0), Wed (2), Fri (4) */}
                                    <div className="flex flex-col justify-between text-[9px] text-gray-400 dark:text-gray-500 font-semibold pr-1.5 h-[116px] select-none">
                                        <span>Mon</span>
                                        <span>Wed</span>
                                        <span>Fri</span>
                                    </div>

                                    {/* Weeks columns */}
                                    {yearGridData.map((w) => (
                                        <div key={w.weekIndex} className="flex flex-col gap-[3px]">
                                            {w.days.map((day, dayIdx) => {
                                                if (!day) {
                                                    return (
                                                        <div
                                                            key={dayIdx}
                                                            className="w-[13px] h-[13px] rounded-[3px] opacity-0"
                                                        />
                                                    );
                                                }

                                                const isSelected = selectedDay?.dateKey === day.dateKey;
                                                const bg = getLevelBg(day.level, customColor);

                                                return (
                                                    <button
                                                        key={day.dateKey}
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedDay(isSelected ? null : day)
                                                        }
                                                        className={`w-[13px] h-[13px] rounded-[3px] transition-all duration-150 flex-shrink-0 relative ${
                                                            day.level === 0
                                                                ? 'bg-gray-100 dark:bg-neutral-800/80 hover:bg-gray-200 dark:hover:bg-neutral-700'
                                                                : 'hover:scale-125 hover:z-10'
                                                        } ${
                                                            isSelected
                                                                ? 'ring-2 ring-gray-900 dark:ring-white scale-125 z-20 shadow-md'
                                                                : ''
                                                        }`}
                                                        style={
                                                            day.level > 0
                                                                ? { backgroundColor: bg }
                                                                : undefined
                                                        }
                                                        title={`${day.date.toLocaleDateString([], {
                                                            weekday: 'short',
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })}: ${
                                                            day.totalDuration > 0
                                                                ? formatDuration(day.totalDuration)
                                                                : 'No activity'
                                                        }`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── MONTH VIEW: 7 Columns Calendar Grid ── */}
                {viewMode === 'month' && monthGridData && (
                    <div className="space-y-2">
                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-gray-400 dark:text-gray-500">
                            {WEEKDAY_SHORT.map((wd) => (
                                <span key={wd}>{wd}</span>
                            ))}
                        </div>

                        {/* Calendar cells */}
                        <div className="grid grid-cols-7 gap-1.5">
                            {monthGridData.map((day, idx) => {
                                if (!day) {
                                    return (
                                        <div
                                            key={`empty-${idx}`}
                                            className="aspect-square rounded-xl bg-transparent"
                                        />
                                    );
                                }

                                const isSelected = selectedDay?.dateKey === day.dateKey;
                                const bg = getLevelBg(day.level, customColor);

                                return (
                                    <button
                                        key={day.dateKey}
                                        type="button"
                                        onClick={() => setSelectedDay(isSelected ? null : day)}
                                        className={`aspect-square rounded-xl p-1 flex flex-col items-center justify-between transition-all relative ${
                                            day.level === 0
                                                ? 'bg-gray-100/80 dark:bg-neutral-800/60 hover:bg-gray-200 dark:hover:bg-neutral-700'
                                                : 'hover:scale-105 active:scale-95 shadow-xs'
                                        } ${
                                            isSelected
                                                ? 'ring-2 ring-gray-900 dark:ring-white scale-105 z-10 shadow-md'
                                                : ''
                                        }`}
                                        style={
                                            day.level > 0
                                                ? {
                                                      backgroundColor: bg,
                                                      color:
                                                          day.level >= 3
                                                              ? 'var(--primary-contrast, #ffffff)'
                                                              : undefined,
                                                  }
                                                : undefined
                                        }
                                    >
                                        <span
                                            className={`text-[11px] font-bold ${
                                                day.isToday
                                                    ? 'w-5 h-5 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900 flex items-center justify-center'
                                                    : day.level >= 3
                                                    ? 'text-white'
                                                    : 'text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            {day.date.getDate()}
                                        </span>

                                        {day.totalDuration > 0 && (
                                            <span
                                                className={`text-[9px] font-semibold tabular-nums leading-none ${
                                                    day.level >= 3
                                                        ? 'text-white/90'
                                                        : 'text-gray-600 dark:text-gray-400'
                                                }`}
                                            >
                                                {formatDuration(day.totalDuration)}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Selected Day Detail Popover / Card ── */}
                {selectedDay && (
                    <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-neutral-800/90 border border-gray-100 dark:border-neutral-700/60 shadow-sm animate-fadeIn space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                                    {selectedDay.date.toLocaleDateString([], {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    })}
                                </span>
                                {selectedDay.isToday && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                        Today
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDay(null)}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {selectedDay.sessionCount > 0
                                    ? `${selectedDay.sessionCount} sessions tracked`
                                    : 'No sessions recorded on this day'}
                            </span>
                            <span
                                className="text-xs font-bold px-2 py-0.5 rounded-md"
                                style={{
                                    backgroundColor: 'var(--primary-soft, rgba(255,145,0,0.15))',
                                    color: 'var(--primary, #ff9100)',
                                }}
                            >
                                {selectedDay.totalDuration > 0
                                    ? formatDuration(selectedDay.totalDuration)
                                    : '0m'}
                            </span>
                        </div>

                        {/* Activities Breakdown */}
                        {selectedDay.activities.length > 0 && (
                            <div className="pt-1.5 border-t border-gray-200/50 dark:border-neutral-700/50 flex flex-wrap gap-1.5">
                                {selectedDay.activities.map((act) => (
                                    <span
                                        key={act.id}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-neutral-700/80 border border-gray-100 dark:border-neutral-600/50 shadow-xs"
                                    >
                                        <span
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: act.color }}
                                        />
                                        <span className="text-gray-800 dark:text-gray-200">
                                            {act.name}
                                        </span>
                                        <span className="text-gray-400 dark:text-gray-400 font-mono">
                                            {formatDuration(act.duration)}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Legend ── */}
                <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-neutral-800">
                    <span className="text-[10px]">
                        {viewMode === 'year' ? '52-week activity' : 'Monthly consistency'}
                    </span>
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] mr-0.5">Less</span>
                        <span className="w-2.5 h-2.5 rounded-[2px] bg-gray-100 dark:bg-neutral-800 border border-gray-200/50 dark:border-neutral-700/40" />
                        <span
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{
                                backgroundColor: getLevelBg(1, customColor),
                            }}
                        />
                        <span
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{
                                backgroundColor: getLevelBg(2, customColor),
                            }}
                        />
                        <span
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{
                                backgroundColor: getLevelBg(3, customColor),
                            }}
                        />
                        <span
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{ backgroundColor: getLevelBg(4, customColor) }}
                        />
                        <span className="text-[10px] ml-0.5">More</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
