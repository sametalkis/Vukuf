import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Scissors, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { formatDuration } from '../utils/time';
import DynamicIcon from './DynamicIcon';
import { getContrastColor } from '../utils/colors';

interface SplitRecordModalProps {
    record: { id: string; recordTypeId: string; startTime: string; endTime: string };
    onClose: () => void;
    onSplit: () => void;
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function SplitRecordModal({ record, onClose, onSplit }: SplitRecordModalProps) {
    const { t, i18n } = useTranslation();
    const { recordTypes, splitRecord } = useStore();
    const activity = recordTypes.find((a) => a.id === record.recordTypeId);
    const color = activity?.color || '#6b7280';
    const contrast = getContrastColor(color);

    const startMs = new Date(record.startTime).getTime();
    const endMs = new Date(record.endTime).getTime();
    const totalMs = endMs - startMs;

    // Slider value: 0 to 1000 (per-mille for precision)
    const [sliderValue, setSliderValue] = useState(500);

    const splitMs = useMemo(() => startMs + (totalMs * sliderValue) / 1000, [startMs, totalMs, sliderValue]);
    const splitTimeISO = useMemo(() => new Date(splitMs).toISOString(), [splitMs]);

    const part1Duration = Math.floor((splitMs - startMs) / 1000);
    const part2Duration = Math.floor((endMs - splitMs) / 1000);

    const handleSplit = () => {
        splitRecord(record.id, splitTimeISO);
        onSplit();
    };

    // Don't allow splits that result in <1 second parts
    const isValid = part1Duration >= 1 && part2Duration >= 1;

    const content = (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

                <motion.div
                    className="relative z-10 w-full max-w-sm bg-[#0a0a0a] rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-5 py-4"
                        style={{ backgroundColor: color }}
                    >
                        <div className="flex items-center gap-3">
                            <Scissors size={20} color={contrast} />
                            <h3 className="text-base font-bold" style={{ color: contrast }}>
                                {t('editRecord.splitTitle')}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-full hover:bg-black/15 active:bg-black/25 transition-colors"
                        >
                            <X size={20} color={contrast} />
                        </button>
                    </div>

                    <div className="p-5 space-y-5">
                        {/* Activity badge */}
                        {activity && (
                            <div className="flex items-center justify-center gap-2">
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold"
                                    style={{ backgroundColor: color, color: contrast }}
                                >
                                    <DynamicIcon name={activity.icon} size={16} color={contrast} />
                                    <span>{activity.name}</span>
                                </div>
                            </div>
                        )}

                        {/* Timeline visualization */}
                        <div className="space-y-3">
                            {/* Time labels */}
                            <div className="flex items-center justify-between text-xs font-mono text-gray-500">
                                <span>{formatTime(record.startTime)}</span>
                                <span className="text-white font-bold text-sm">
                                    {formatTime(splitTimeISO)}
                                </span>
                                <span>{formatTime(record.endTime)}</span>
                            </div>

                            {/* Slider track */}
                            <div className="relative">
                                <div className="h-3 rounded-full bg-[#1a1a1a] overflow-hidden flex">
                                    <div
                                        className="h-full rounded-l-full transition-all duration-75"
                                        style={{ width: `${sliderValue / 10}%`, backgroundColor: color, opacity: 0.8 }}
                                    />
                                    <div className="w-0.5 h-full bg-white flex-shrink-0" />
                                    <div
                                        className="h-full rounded-r-full flex-1 transition-all duration-75"
                                        style={{ backgroundColor: color, opacity: 0.4 }}
                                    />
                                </div>
                                <input
                                    type="range"
                                    min={10}
                                    max={990}
                                    value={sliderValue}
                                    onChange={(e) => setSliderValue(Number(e.target.value))}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Part previews */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 text-center">
                                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                                    {t('editRecord.part1')}
                                </div>
                                <div className="text-xs text-gray-400 font-mono">
                                    {formatTime(record.startTime)} → {formatTime(splitTimeISO)}
                                </div>
                                <div className="text-lg font-black text-white mt-1">
                                    {formatDuration(part1Duration, i18n.language)}
                                </div>
                            </div>
                            <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 text-center">
                                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                                    {t('editRecord.part2')}
                                </div>
                                <div className="text-xs text-gray-400 font-mono">
                                    {formatTime(splitTimeISO)} → {formatTime(record.endTime)}
                                </div>
                                <div className="text-lg font-black text-white mt-1">
                                    {formatDuration(part2Duration, i18n.language)}
                                </div>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3.5 rounded-xl bg-[#1c1c1c] text-gray-400 font-semibold text-sm hover:bg-[#222] transition-colors"
                            >
                                {t('editRecord.splitCancel')}
                            </button>
                            <button
                                onClick={handleSplit}
                                disabled={!isValid}
                                className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{
                                    backgroundColor: isValid ? color : '#1c1c1c',
                                    color: isValid ? contrast : '#666',
                                }}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <Scissors size={16} />
                                    {t('editRecord.splitConfirm')}
                                </span>
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(content, document.body);
}
