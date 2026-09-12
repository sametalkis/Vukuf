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
            className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-[rgba(243,244,246,0.95)] dark:bg-[rgba(23,23,23,0.95)] backdrop-blur-md border-t border-gray-200 dark:border-gray-800"
            style={{ bottom: 'calc(58px + env(safe-area-inset-bottom))' }}
        >
            <div className="flex items-center">
                {/* Horizontal Date Scroller */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar"
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
                                className={`flex-shrink-0 flex flex-col items-center justify-center min-w-[3.25rem] px-3 py-2 rounded-xl transition-colors ${item.isSelected
                                    ? 'bg-gray-800 dark:bg-gray-700 text-white shadow-sm scale-105'
                                    : 'text-gray-500 hover:bg-gray-200/50 dark:hover:bg-gray-800/50'
                                    }`}
                            >
                                {item.monthLabel && <span className="text-[9px] uppercase font-bold tracking-wider opacity-90 text-gray-300">{item.monthLabel}</span>}
                                {item.subLabel && <span className={`text-[10px] uppercase font-bold tracking-wider mb-0.5 opacity-80 ${item.isSelected ? 'text-gray-300' : ''}`}>{item.subLabel}</span>}
                                <span className={`text-base font-bold leading-none ${!item.isSelected ? 'text-gray-800 dark:text-gray-200' : ''}`}>{item.label}</span>
                            </button>
                        ))
                    )}
                </div>

                {/* Range Selector (3 dots) */}
                <div className="flex-shrink-0 px-2 py-2 border-l border-gray-200 dark:border-gray-800 relative">
                    <button
                        onClick={() => setShowRangeMenu(!showRangeMenu)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${showRangeMenu ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600' : 'text-gray-500 hover:bg-gray-200/50 dark:hover:bg-gray-800/50'
                            }`}
                    >
                        <MoreVertical size={20} />
                    </button>

                    {showRangeMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowRangeMenu(false)}
                            />
                            <div className="absolute right-4 bottom-14 w-40 bg-white dark:bg-gray-800 rounded-2xl shadow-xl z-50 overflow-hidden border border-gray-100 dark:border-gray-700 font-medium">
                                {RANGE_OPTIONS.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleRangeSelect(item.id)}
                                        className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between ${viewMode === item.id
                                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                            }`}
                                    >
                                        {item.label}
                                        {viewMode === item.id && <Check size={16} />}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
