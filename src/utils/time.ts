// Shared time formatting utilities
import i18n from '../locales/i18n';

export function formatDuration(seconds: number, lang?: string): string {
    const activeLang = lang || (typeof i18n !== 'undefined' && i18n?.language ? i18n.language : 'tr');
    const isTr = activeLang.startsWith('tr');

    const sSuffix = isTr ? 'sn' : 's';
    const mSuffix = isTr ? 'dk' : 'm';
    const hSuffix = isTr ? 'sa' : 'h';

    if (seconds < 60) return `${seconds}${sSuffix}`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0 && m > 0) return `${h}${hSuffix} ${m}${mSuffix}`;
    if (h > 0) return `${h}${hSuffix}`;
    if (s > 0 && m < 10) return `${m}${mSuffix} ${s}${sSuffix}`;
    return `${m}${mSuffix}`;
}

/**
 * Formats a percentage number with intelligent decimal precision:
 * - 0 => '0%'
 * - < 0.1 (and > 0) => '<0.1%'
 * - 0.4 => '0.4%'
 * - 1.25 => '1.3%'
 * - 15.0 => '15%'
 * - 15.4 => '15.4%'
 */
export function formatPercent(n: number): string {
    if (!n || n <= 0) return '0%';
    if (n < 0.1) return '<0.1%';
    return `${parseFloat(n.toFixed(1))}%`;
}

export function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

/**
 * Splits a single record spanning multiple days into an array of smaller records,
 * bounded safely by the 00:00:00 midnight cutoff mathematically per-day.
 * Attaches originalRecord so editors and actions can access the true interval.
 */
export function splitRecordByDays<T extends { startTime: string; endTime: string; isRunning?: boolean }>(
    record: T
): (T & { originalRecord?: T; isSplitChunk?: boolean })[] {
    const rStart = new Date(record.startTime).getTime();
    const rEnd = new Date(record.endTime).getTime();

    // If starts and ends on the exact same day chronologically, don't split
    const startDate = new Date(rStart);
    const endDate = new Date(rEnd);
    if (startDate.toDateString() === endDate.toDateString()) {
        return [{ ...record, originalRecord: record }];
    }

    const chunks: (T & { originalRecord?: T; isSplitChunk?: boolean })[] = [];
    let currentStart = rStart;

    while (currentStart < rEnd) {
        let currentEnd = new Date(currentStart);
        currentEnd.setHours(23, 59, 59, 999);
        let endOfChunk = Math.min(rEnd, currentEnd.getTime());

        const isLastChunk = endOfChunk >= rEnd;

        chunks.push({
            ...record,
            startTime: new Date(currentStart).toISOString(),
            endTime: new Date(endOfChunk).toISOString(),
            duration: Math.max(0, Math.floor((endOfChunk - currentStart) / 1000)),
            ...(record.isRunning ? { isRunning: isLastChunk } : {}),
            originalRecord: record,
            isSplitChunk: true,
        });

        currentStart = endOfChunk + 1; // Slide smoothly into 00:00:00 of the subsequent day
    }

    return chunks;
}
