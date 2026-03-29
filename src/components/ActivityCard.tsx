import { motion } from 'framer-motion';

import DynamicIcon from './DynamicIcon';
import type { RecordType } from '../types';

interface ActivityCardProps {
    activity: RecordType;
    isRunning: boolean;
    onClick: () => void;
    onLongPress: () => void;
}

export default function ActivityCard({
    activity,
    isRunning,
    onClick,
    onLongPress,
}: ActivityCardProps) {


    // Long-press detection
    let pressTimer: ReturnType<typeof setTimeout>;
    const handlePointerDown = () => {
        pressTimer = setTimeout(() => onLongPress(), 500);
    };
    const handlePointerUp = () => clearTimeout(pressTimer);
    const handlePointerLeave = () => clearTimeout(pressTimer);

    return (
        <motion.button
            onClick={onClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            whileTap={{ scale: 0.93 }}
            className="relative w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm transition-shadow overflow-hidden select-none"
            style={{ backgroundColor: activity.color }}
        >
            {/* Running ring */}
            {isRunning && (
                <motion.div
                    className="absolute inset-0 rounded-2xl border-4"
                    style={{ borderColor: 'rgba(255,255,255,0.6)' }}
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                />
            )}

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center gap-1.5 w-full">
                <DynamicIcon name={activity.icon} size={28} color={'white'} />
                <span className="text-[11px] font-semibold text-center leading-tight px-1 w-full truncate text-white">
                    {activity.name}
                </span>
            </div>

            {/* Running badge */}
            {isRunning && (
                <div
                    className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full animate-pulse"
                    style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
                />
            )}
        </motion.button>
    );
}
