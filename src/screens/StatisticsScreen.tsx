import { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../store/useStore';
import { formatDuration, splitRecordByDays } from '../utils/time';
import DateSelectorBar from '../components/DateSelectorBar';
import type { ViewMode } from '../components/DateSelectorBar';
import DynamicIcon from '../components/DynamicIcon';

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, payload }: any) => {
    if (payload.percent < 3) return null; // Hide icon if slice is too small (<10%) to avoid overlap

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

function formatPercent(n: number): string {
    return `${Math.round(n)}%`;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: { name: string; value: number; payload: { color: string } }[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl px-3 py-2 shadow-lg border border-gray-100 dark:border-gray-700">
            <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{payload[0].name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatDuration(payload[0].value)}</p>
        </div>
    );
}

export default function StatisticsScreen() {
    const { records, recordTypes, runningRecord } = useStore();

    // View mode constraints
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Live tick for running record on stats screen
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!runningRecord) return;
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, [runningRecord]);

    // ── Filter Records ──
    const filteredRecords = useMemo(() => {
        let allRecords = [...records];
        if (runningRecord) {
            allRecords.push({
                ...runningRecord,
                endTime: new Date().toISOString(),
                duration: Math.floor((Date.now() - new Date(runningRecord.startTime).getTime()) / 1000),
            } as any);
        }

        // Apply rigorous logical mathematically split records!
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

    // ── Compute Statistics ──
    const stats = useMemo(() => {
        const totalAll = filteredRecords.reduce((s, r) => s + r.duration, 0);

        const byType: Record<string, number> = {};
        for (const r of filteredRecords) {
            byType[r.recordTypeId] = (byType[r.recordTypeId] ?? 0) + r.duration;
        }

        const extendedTypes = [...recordTypes, { id: 'untracked', name: 'Untracked Time', color: '#6b7280', icon: 'Clock' }];

        return extendedTypes
            .filter((rt) => byType[rt.id] !== undefined)
            .map((rt) => ({
                id: rt.id,
                name: rt.name,
                color: rt.color,
                icon: rt.icon,
                duration: byType[rt.id],
                percent: totalAll > 0 ? (byType[rt.id] / totalAll) * 100 : 0,
            }))
            .sort((a, b) => b.duration - a.duration);
    }, [filteredRecords, recordTypes]);

    const totalDuration = stats.reduce((s, a) => s + a.duration, 0);

    return (
        <div className="flex flex-col min-h-screen pt-4 pb-[136px]">
            {stats.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
                    <div className="w-20 h-20 rounded-3xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <span className="text-4xl">📊</span>
                    </div>
                    <div>
                        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No data found</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try selecting a different date range</p>
                    </div>
                </div>
            ) : (
                <div className="px-4">
                    {/* Doughnut Chart */}
                    <div className="relative mt-8 mb-6 h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={105}
                                    paddingAngle={3}
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
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Center label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                                {formatDuration(totalDuration)}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-1">total</span>
                        </div>
                    </div>

                    {/* Legend / List */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-800/50">
                        {stats.map((item, idx) => (
                            <div
                                key={item.id}
                                className={`flex items-center gap-3 px-4 py-3.5 ${idx < stats.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
                                    }`}
                            >
                                {/* Color swatch */}
                                <div
                                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: item.color }}
                                />

                                {/* Name */}
                                <span className="flex-1 text-[15px] font-medium text-gray-800 dark:text-gray-200 truncate">
                                    {item.name}
                                </span>

                                {/* Duration */}
                                <span className="text-[15px] font-bold text-gray-700 dark:text-gray-300 flex-shrink-0">
                                    {formatDuration(item.duration)}
                                </span>

                                {/* Percent bar + text */}
                                <div className="flex items-center gap-2.5 w-24 flex-shrink-0">
                                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                                        />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 w-8 text-right tabular-nums">
                                        {formatPercent(item.percent)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <DateSelectorBar
                viewMode={viewMode}
                setViewMode={setViewMode}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
            />
        </div>
    );
}
