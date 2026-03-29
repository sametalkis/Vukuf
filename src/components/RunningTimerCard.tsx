import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Square } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getContrastColor } from '../utils/colors';
import DynamicIcon from './DynamicIcon';

function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function RunningTimerCard() {
    const { runningRecord, stopTimer, recordTypes } = useStore();
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!runningRecord) return;

        const tick = () => {
            const diff = Math.floor(
                (Date.now() - new Date(runningRecord.startTime).getTime()) / 1000
            );
            setElapsed(diff);
        };

        tick(); // immediate update
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [runningRecord]);

    if (!runningRecord) return null;

    let activity = recordTypes.find((r) => r.id === runningRecord.recordTypeId);
    if (!activity) {
        if (runningRecord.recordTypeId === 'untracked') {
            activity = { id: 'untracked', name: 'Untracked Time', color: '#6b7280', icon: 'Clock' };
        } else {
            return null;
        }
    }

    const contrast = getContrastColor(activity.color);
    const isUntracked = activity.id === 'untracked';

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
                            Automatic Background Tracker
                        </p>
                        <p className="text-base font-bold truncate text-gray-600 dark:text-gray-400 italic">
                            Untracked Time
                        </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                        <p className="text-2xl font-mono font-bold tabular-nums text-gray-600 dark:text-gray-400">
                            {formatElapsed(elapsed)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2 ml-0.5 relative z-10">
                    <span className="w-2 h-2 rounded-full animate-pulse bg-gray-400" />
                    <span className="text-xs font-medium opacity-60 text-gray-500">
                        Waiting for activity...
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
            className="mx-4 mt-4 rounded-2xl p-4 shadow-lg"
            style={{ backgroundColor: activity.color }}
        >
            <div className="flex items-center gap-3">
                {/* Icon */}
                <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
                >
                    <DynamicIcon name={activity.icon} size={22} color={contrast} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium opacity-75" style={{ color: contrast }}>
                        Running
                    </p>
                    <p className="text-base font-bold truncate" style={{ color: contrast }}>
                        {activity.name}
                    </p>
                </div>

                {/* Elapsed */}
                <div className="text-right flex-shrink-0">
                    <p
                        className="text-2xl font-mono font-bold tabular-nums"
                        style={{ color: contrast }}
                    >
                        {formatElapsed(elapsed)}
                    </p>
                </div>

                {/* Stop Button */}
                <button
                    onClick={stopTimer}
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
                    style={{ backgroundColor: 'rgba(0,0,0,0.20)' }}
                >
                    <Square size={18} fill={contrast} color={contrast} />
                </button>
            </div>

            {/* Pulsing indicator */}
            <div className="flex items-center gap-1.5 mt-2 ml-0.5">
                <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}
                />
                <span
                    className="text-xs font-medium opacity-60"
                    style={{ color: contrast }}
                >
                    Tracking time...
                </span>
            </div>
        </motion.div>
    );
}
