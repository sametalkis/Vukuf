import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { getContrastColor } from '../utils/colors';
import DynamicIcon from './DynamicIcon';

interface TrackingCardProps {
    name: string;
    icon: string;
    color: string;
    subtitleLeft?: string;
    titleRight: string;
    subtitleRight?: string;
    onClick?: () => void;
    onLongPress?: () => void;
    className?: string;
    showChevron?: boolean;
}

export default function TrackingCard({
    name,
    icon,
    color,
    subtitleLeft,
    titleRight,
    subtitleRight,
    onClick,
    onLongPress,
    className = '',
    showChevron = false,
}: TrackingCardProps) {
    const contrast = getContrastColor(color);
    const timerRef = useRef<number | null>(null);
    const isLongPressRef = useRef(false);

    const handlePointerDown = () => {
        isLongPressRef.current = false;
        timerRef.current = window.setTimeout(() => {
            isLongPressRef.current = true;
            if (navigator.vibrate) navigator.vibrate(50);
            if (onLongPress) {
                onLongPress();
            } else if (onClick) {
                onClick();
            }
        }, 450);
    };

    const handlePointerUp = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (isLongPressRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (onClick) onClick();
    };

    return (
        <motion.div
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={handleClick}
            whileTap={{ scale: 0.98 }}
            className={`rounded-2xl px-4 py-3 shadow-md w-full text-left cursor-pointer transition-transform select-none ${className}`}
            style={{ backgroundColor: color }}
        >
            <div className="flex items-center justify-between">
                {/* Left side: icon + name + start time */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
                    >
                        <DynamicIcon name={icon} size={18} color={contrast} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: contrast }}>
                            {name}
                        </p>
                        {subtitleLeft && (
                            <p className="text-xs font-medium opacity-70" style={{ color: contrast }}>
                                {subtitleLeft}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right side: total elapsed + subtitle + optional chevron */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <div className="text-right">
                        <p
                            className="text-base font-bold tabular-nums"
                            style={{ color: contrast }}
                        >
                            {titleRight}
                        </p>
                        {subtitleRight && (
                            <p className="text-xs font-medium opacity-70" style={{ color: contrast }}>
                                {subtitleRight}
                            </p>
                        )}
                    </div>
                    {showChevron && (
                        <ChevronRight
                            size={16}
                            className="opacity-40 flex-shrink-0 -mr-0.5"
                            style={{ color: contrast }}
                        />
                    )}
                </div>
            </div>
        </motion.div>
    );
}
