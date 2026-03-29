// Shared time formatting utilities

export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    if (s > 0 && m < 10) return `${m}m ${s}s`;
    return `${m}m`;
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
 */
export function splitRecordByDays<T extends { startTime: string; endTime: string; isRunning?: boolean }>(record: T): T[] {
    const rStart = new Date(record.startTime).getTime();
    const rEnd = new Date(record.endTime).getTime();

    // If starts and ends on the exact same day chronologically, don't split
    const startDate = new Date(rStart);
    const endDate = new Date(rEnd);
    if (startDate.toDateString() === endDate.toDateString()) {
        return [{ ...record }];
    }

    const chunks: T[] = [];
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
        });

        currentStart = endOfChunk + 1; // Slide smoothly into 00:00:00 of the subsequent day
    }

    return chunks;
}
