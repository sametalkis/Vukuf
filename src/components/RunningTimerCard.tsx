import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { formatDuration, formatTime } from '../utils/time';
import DynamicIcon from './DynamicIcon';
import TrackingCard from './TrackingCard';

function formatElapsed(seconds: number, isTr: boolean): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const hS = isTr ? 'sa' : 'h';
    const mS = isTr ? 'dk' : 'm';
    const sS = isTr ? 'sn' : 's';
    if (h > 0) {
        return `${h}${hS} ${m}${mS} ${s}${sS}`;
    }
    return `${m}${mS} ${s}${sS}`;
}

export default function RunningTimerCard() {
    const { t, i18n } = useTranslation();
    const isTr = i18n.language?.startsWith('tr');
    const { runningRecord, stopTimer, recordTypes, records } = useStore();
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!runningRecord) return;

        const tick = () => {
            const diff = Math.floor(
                (Date.now() - new Date(runningRecord.startTime).getTime()) / 1000
            );
            setElapsed(diff);
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [runningRecord]);

    // Calculate today's total for this activity (completed records + current session)
    const todayTotal = useMemo(() => {
        if (!runningRecord) return 0;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        const completedToday = records
            .filter((r) => {
                if (r.recordTypeId !== runningRecord.recordTypeId) return false;
                const start = new Date(r.startTime).getTime();
                const end = new Date(r.endTime).getTime();
                // Record overlaps with today
                return end >= todayStart && start < todayStart + 86400000;
            })
            .reduce((sum, r) => {
                const start = Math.max(new Date(r.startTime).getTime(), todayStart);
                const end = Math.min(new Date(r.endTime).getTime(), todayStart + 86400000);
                return sum + Math.max(0, Math.floor((end - start) / 1000));
            }, 0);

        // Add current running session's contribution to today
        const runStart = Math.max(new Date(runningRecord.startTime).getTime(), todayStart);
        const runningToday = Math.max(0, Math.floor((Date.now() - runStart) / 1000));

        return completedToday + runningToday;
    }, [runningRecord, records, elapsed]); // elapsed dependency keeps it fresh every second

    if (!runningRecord) return null;

    let activity = recordTypes.find((r) => r.id === runningRecord.recordTypeId);
    if (!activity) {
        if (runningRecord.recordTypeId === 'untracked') {
            activity = { id: 'untracked', name: t('timer.untrackedTitle'), color: '#6b7280', icon: 'Clock' };
        } else {
            return null;
        }
    }

    const isUntracked = activity.id === 'untracked';
    const activityName = isUntracked ? t('timer.untrackedTitle') : activity.name;
    const startTimeStr = formatTime(runningRecord.startTime);

    if (isUntracked) {
        return (
            <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.97 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                className="mx-4 mt-4 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 border-dashed relative overflow-hidden"
                style={{ backgroundColor: 'rgba(128, 128, 128, 0.05)' }}
            >
                {/* Flowing background animation for untracked */}
                <div className="absolute inset-0 opacity-10 bg-[length:20px_20px] bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,1)_25%,rgba(0,0,0,1)_50%,transparent_50%,transparent_75%,rgba(0,0,0,1)_75%,rgba(0,0,0,1)_100%)] dark:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,1)_25%,rgba(255,255,255,1)_50%,transparent_50%,transparent_75%,rgba(255,255,255,1)_75%,rgba(255,255,255,1)_100%)] animate-[scan_20s_linear_infinite]" />

                <div className="flex items-center gap-3 relative z-10">
                    <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'rgba(128, 128, 128, 0.1)' }}
                    >
                        <DynamicIcon name="Clock" size={22} className="text-gray-500" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium opacity-75 text-gray-500">
                            {t('timer.autoTracker')}
                        </p>
                        <p className="text-base font-bold truncate text-gray-600 dark:text-gray-400 italic">
                            {activityName}
                        </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                        <p className="text-2xl font-mono font-bold tabular-nums text-gray-600 dark:text-gray-400">
                            {formatElapsed(elapsed, isTr)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2 ml-0.5 relative z-10">
                    <span className="w-2 h-2 rounded-full animate-pulse bg-gray-400" />
                    <span className="text-xs font-medium opacity-60 text-gray-500">
                        {t('timer.waiting')}
                    </span>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            className="mx-4 mt-4"
        >
            <TrackingCard
                name={activityName}
                icon={activity.icon}
                color={activity.color}
                subtitleLeft={startTimeStr}
                titleRight={formatElapsed(elapsed, isTr)}
                subtitleRight={t('timer.todayDuration', { duration: formatDuration(todayTotal) })}
                onClick={stopTimer}
            />
        </motion.div>
    );
}
