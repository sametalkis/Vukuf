import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Check, MoreVertical } from 'lucide-react';
import { useStore } from '../store/useStore';

export type ViewMode = 'day' | 'month' | 'year' | 'all';

interface DateSelectorBarProps {
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
}

const RANGE_OPTIONS = [
    { id: 'day', label: 'Day' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All Time' },
] as const;

export default function DateSelectorBar({
    viewMode,
    setViewMode,
    selectedDate,
    setSelectedDate,
}: DateSelectorBarProps) {
    const [showRangeMenu, setShowRangeMenu] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { records } = useStore();

    const selectorItems = useMemo(() => {
        const items: { label: string; subLabel?: string; monthLabel?: string; date: Date; isSelected: boolean }[] = [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let earliestDate = new Date(now);
        earliestDate.setDate(earliestDate.getDate() - 30);
        if (records.length > 0) {
            const minTime = Math.min(...records.map(r => new Date(r.startTime).getTime()));
            const minDate = new Date(minTime);
            if (minDate < earliestDate) earliestDate = minDate;
        }
        earliestDate.setHours(0, 0, 0, 0);

        if (viewMode === 'day') {
            const curr = new Date(earliestDate);
            while (curr <= now) {
                const isSelected = selectedDate.toDateString() === curr.toDateString();
                const dayStr = curr.toLocaleDateString('en-US', { weekday: 'short' });
                const monthStr = isSelected
                    ? curr.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
                    : undefined;
                items.push({ label: curr.getDate().toString(), subLabel: dayStr, monthLabel: monthStr, date: new Date(curr), isSelected });
                curr.setDate(curr.getDate() + 1);
            }
        } else if (viewMode === 'month') {
            const curr = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
            while (curr <= now) {
                const isSelected = selectedDate.getFullYear() === curr.getFullYear() && selectedDate.getMonth() === curr.getMonth();
                items.push({ label: curr.toLocaleDateString('en-US', { month: 'short' }), subLabel: curr.getFullYear().toString(), date: new Date(curr), isSelected });
                curr.setMonth(curr.getMonth() + 1);
            }
        } else if (viewMode === 'year') {
            const curr = new Date(earliestDate.getFullYear(), 0, 1);
            while (curr <= now) {
                const isSelected = selectedDate.getFullYear() === curr.getFullYear();
                items.push({ label: curr.getFullYear().toString(), date: new Date(curr), isSelected });
                curr.setFullYear(curr.getFullYear() + 1);
            }
        }
        return items;
    }, [viewMode, selectedDate, records]);

    // Auto-scroll to most recent on mount/mode change — instant, no smooth animation
    useEffect(() => {
        requestAnimationFrame(() => {
            const el = scrollContainerRef.current;
            if (el) el.scrollLeft = el.scrollWidth;
        });
    }, [viewMode]);

    const handleRangeSelect = useCallback((id: string) => {
        setViewMode(id as ViewMode);
        setSelectedDate(new Date());
        setShowRangeMenu(false);
    }, [setViewMode, setSelectedDate]);

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-40 bg-white/90 dark:bg-[#141414]/90 backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-xl rounded-2xl"
            style={{
                width: 'min(92vw, 420px)',
                bottom: 'calc(80px + env(safe-area-inset-bottom, 14px))',
            }}
        >
            <div className="flex items-center">
                {/* Horizontal Date Scroller */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 flex items-center gap-1.5 px-2.5 py-2 overflow-x-auto no-scrollbar"
                >
                    {viewMode === 'all' ? (
                        <div className="flex-1 text-center text-sm font-semibold text-gray-500 py-3">
                            Showing all history
                        </div>
                    ) : (
                        selectorItems.map((item, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedDate(item.date)}
                                className={`flex-shrink-0 flex flex-col items-center justify-center min-w-[3.25rem] px-3 py-2 rounded-xl transition-all ${item.isSelected
                                    ? 'shadow-md scale-105 font-bold'
                                    : 'text-gray-500 hover:bg-gray-200/50 dark:hover:bg-neutral-800/50'
                                    }`}
                                style={item.isSelected ? {
                                    backgroundColor: 'var(--primary, #ff9100)',
                                    color: 'var(--primary-contrast, #ffffff)',
                                    boxShadow: '0 4px 14px var(--primary-soft, rgba(255, 145, 0, 0.25))'
                                } : undefined}
                            >
                                {item.monthLabel && (
                                    <span className={`text-[9px] uppercase font-bold tracking-wider opacity-90 ${item.isSelected ? 'opacity-90' : 'text-gray-400'}`}>
                                        {item.monthLabel}
                                    </span>
                                )}
                                {item.subLabel && (
                                    <span className={`text-[10px] uppercase font-bold tracking-wider mb-0.5 ${item.isSelected ? 'opacity-90' : 'text-gray-400'}`}>
                                        {item.subLabel}
                                    </span>
                                )}
                                <span className={`text-base font-bold leading-none ${!item.isSelected ? 'text-gray-800 dark:text-gray-200' : ''}`}>
                                    {item.label}
                                </span>
                            </button>
                        ))
                    )}
                </div>

                {/* Range Selector (3 dots) */}
                <div className="flex-shrink-0 px-2 py-2 border-l border-gray-200 dark:border-neutral-800 relative">
                    <button
                        onClick={() => setShowRangeMenu(!showRangeMenu)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${showRangeMenu
                            ? 'text-primary-600'
                            : 'text-gray-500 hover:bg-gray-200/50 dark:hover:bg-neutral-800/50'
                            }`}
                        style={showRangeMenu ? {
                            backgroundColor: 'var(--primary-soft, rgba(255, 145, 0, 0.15))',
                            color: 'var(--primary, #ff9100)',
                        } : undefined}
                    >
                        <MoreVertical size={20} />
                    </button>

                    {showRangeMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowRangeMenu(false)}
                            />
                            <div className="absolute right-1 bottom-full mb-3 w-44 bg-white/95 dark:bg-[#1c1c1c]/95 backdrop-blur-xl rounded-2xl shadow-2xl z-50 overflow-hidden border border-black/10 dark:border-white/15 font-medium">
                                {RANGE_OPTIONS.map(item => {
                                    const isSelected = viewMode === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleRangeSelect(item.id)}
                                            className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors ${isSelected
                                                ? 'font-bold'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/60 dark:hover:bg-neutral-800/60'
                                                }`}
                                            style={isSelected ? {
                                                backgroundColor: 'var(--primary-soft, rgba(255, 145, 0, 0.15))',
                                                color: 'var(--primary, #ff9100)'
                                            } : undefined}
                                        >
                                            {item.label}
                                            {isSelected && <Check size={16} style={{ color: 'var(--primary, #ff9100)' }} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
