import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trash2, Check, Clock, ChevronDown, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getContrastColor } from '../utils/colors';
import DynamicIcon from './DynamicIcon';
import type { Record } from '../types';

interface EditRecordScreenProps {
    record: Record & { isRunning?: boolean };
    onClose: () => void;
}

// ── Helpers ──
function formatDuration(startISO: string, endISO: string): string {
    const s = new Date(startISO).getTime();
    const e = new Date(endISO).getTime();
    let seconds = Math.floor((e - s) / 1000);
    if (seconds < 0) seconds = 0;

    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);

    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function EditRecordScreen({ record, onClose }: EditRecordScreenProps) {
    const { recordTypes, updateRecord, deleteRecord } = useStore();
    const [activityId, setActivityId] = useState(record.recordTypeId);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [start, setStart] = useState(new Date(record.startTime));
    const [end, setEnd] = useState(new Date(record.endTime));

    const activity = recordTypes.find((a) => a.id === activityId) ||
        (activityId === 'untracked' ? { id: 'untracked', name: 'Untracked Time', color: '#6b7280', icon: 'Clock' } : recordTypes[0]);
    const contrast = activity ? getContrastColor(activity.color) : '#fff';

    // ── Button Handlers ──
    const adjustTime = (type: 'start' | 'end', minutes: number) => {
        const now = new Date();
        if (type === 'start') {
            const newStart = new Date(start.getTime() + minutes * 60000);
            if (newStart > now) { setStart(now); return; }
            if (newStart < end) setStart(newStart);
        } else {
            const newEnd = new Date(end.getTime() + minutes * 60000);
            if (newEnd > now) { setEnd(now); return; }
            if (newEnd > start) setEnd(newEnd);
        }
    };

    const setNow = (type: 'start' | 'end') => {
        const n = new Date();
        if (type === 'start' && (record.isRunning || n < end)) setStart(n);
        if (type === 'end' && !record.isRunning && n > start) setEnd(n);
    };

    const handleSave = () => {
        updateRecord(record.id, {
            recordTypeId: activityId,
            startTime: start.toISOString(),
            ...(record.isRunning ? {} : { endTime: end.toISOString() }),
        });
        onClose();
    };

    const handleDelete = () => {
        if (record.id.startsWith('untracked-')) {
            onClose();
            return;
        }
        if (window.confirm('Bu kaydı silmek istediğinden emin misin?')) {
            deleteRecord(record.id);
            onClose();
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const content = (
        <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            {/* Backdrop on desktop */}
            <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Dialog (Native full-screen on mobile, centered modal card on desktop) */}
            <motion.div
                className="relative z-10 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-[#121212] flex flex-col text-gray-200 sm:rounded-3xl sm:shadow-2xl sm:border sm:border-neutral-800 overflow-hidden"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div
                    className="flex items-center justify-between px-4 py-3.5 shadow-md flex-shrink-0"
                    style={{ backgroundColor: activity.color, color: contrast }}
                >
                    <div className="flex items-center gap-3 relative z-10">
                        <button
                            onClick={onClose}
                            className="p-1 -ml-1 rounded-full hover:bg-black/15 active:bg-black/25 transition-colors"
                        >
                            <ChevronLeft size={24} color={contrast} />
                        </button>
                        <div>
                            <h2 className="text-base font-bold leading-tight">{activity.name}</h2>
                            <div className="text-xs font-medium opacity-90 tracking-wide mt-0.5" style={{ color: contrast }}>
                                {formatTime(start.toISOString())} – {record.isRunning ? 'Running' : formatTime(end.toISOString())}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-base font-bold tracking-tight">
                            {record.isRunning ? 'Active' : formatDuration(start.toISOString(), end.toISOString())}
                        </div>
                        <button
                            onClick={onClose}
                            className="hidden sm:flex p-1 rounded-full hover:bg-black/15 active:bg-black/25 transition-colors ml-1"
                            title="Close"
                        >
                            <X size={20} color={contrast} />
                        </button>
                    </div>
                </div>

            <div className="flex flex-col flex-1 overflow-y-auto px-4 py-5 space-y-4">
                {/* ── Delete Row (only for saved records) ── */}
                {!record.id.startsWith('untracked-') && (
                    <button
                        onClick={handleDelete}
                        className="w-full flex items-center justify-center gap-2 bg-[#1f2429] hover:bg-red-500/20 hover:text-red-400 py-3.5 rounded-xl text-sm font-semibold text-gray-300 transition-colors"
                    >
                        <Trash2 size={16} /> Delete Record
                    </button>
                )}

                {/* ── Start Time Box ── */}
                <div className="relative border border-[#2a2a2a] rounded-xl pt-4 pb-3 px-3 mt-4 text-center">
                    <span className="absolute -top-2.5 left-4 bg-[#121212] px-1 text-[11px] font-medium text-gray-500 uppercase tracking-wider">Start</span>

                    <div className="flex items-center justify-center gap-2 mb-3">
                        <span className="text-rose-500 font-bold text-sm tracking-wide">{formatDate(start.toISOString())}</span>
                        <span className="text-white font-black text-3xl tracking-tight leading-none">{formatTime(start.toISOString())}</span>
                    </div>

                    <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                        {[-30, -5, -1, 1, 5, 30].map(v => (
                            <button
                                key={v}
                                onClick={() => adjustTime('start', v)}
                                className="flex-1 min-w-[36px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-xs font-semibold text-gray-400 active:bg-[#333]"
                            >
                                {v > 0 ? '+' : ''}{v}
                            </button>
                        ))}
                        <button
                            onClick={() => setNow('start')}
                            className="flex-1 min-w-[48px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-xs font-semibold text-gray-300 active:bg-[#333]"
                        >
                            Now
                        </button>
                    </div>
                </div>

                {/* ── End Time Box ── */}
                <div className={`relative border border-[#2a2a2a] rounded-xl pt-5 pb-3 px-3 text-center mt-2 ${record.isRunning ? 'opacity-30 pointer-events-none' : ''}`}>
                    <span className="absolute -top-2.5 left-4 bg-[#121212] px-1 text-[11px] font-medium text-gray-500 uppercase tracking-wider">End</span>

                    <div className="flex items-center justify-center gap-2 mb-3">
                        <span className="text-rose-500 font-bold text-sm tracking-wide">{record.isRunning ? 'Now' : formatDate(end.toISOString())}</span>
                        <span className="text-white font-black text-3xl tracking-tight leading-none">{record.isRunning ? 'Running' : formatTime(end.toISOString())}</span>
                    </div>

                    <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                        {[-30, -5, -1, 1, 5, 30].map(v => (
                            <button
                                key={v}
                                onClick={() => adjustTime('end', v)}
                                className="flex-1 min-w-[36px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-xs font-semibold text-gray-400 active:bg-[#333]"
                            >
                                {v > 0 ? '+' : ''}{v}
                            </button>
                        ))}
                        <button
                            onClick={() => setNow('end')}
                            className="flex-1 min-w-[48px] py-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-xs font-semibold text-gray-300 active:bg-[#333]"
                        >
                            Now
                        </button>
                    </div>
                </div>

                {/* ── Activity Selector (Collapsible Accordion Grid) ── */}
                <div className="mt-4 space-y-2 pb-6">
                    <div className="border border-[#2a2a2a] rounded-xl bg-[#151515] overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setIsActivityOpen(!isActivityOpen)}
                            className="w-full p-3 flex items-center justify-between active:bg-[#1a1a1a] transition-colors"
                        >
                            <span className="text-gray-400 text-sm font-medium">Activity</span>
                            <div className="flex items-center gap-2">
                                <div
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm"
                                    style={{ backgroundColor: activity.color, color: contrast }}
                                >
                                    <DynamicIcon name={activity.icon} size={14} color={contrast} />
                                    <span>{activity.name}</span>
                                </div>
                                <ChevronDown
                                    size={18}
                                    className={`text-gray-400 transition-transform duration-200 ${isActivityOpen ? 'rotate-180' : ''}`}
                                />
                            </div>
                        </button>

                        <AnimatePresence initial={false}>
                            {isActivityOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                                    className="border-t border-[#222] p-3 overflow-hidden"
                                >
                                    <div className="grid grid-cols-4 gap-2">
                                        {recordTypes.map((rt) => {
                                            const isSelected = rt.id === activityId;
                                            const rtContrast = getContrastColor(rt.color);

                                            return (
                                                <motion.button
                                                    key={rt.id}
                                                    type="button"
                                                    whileTap={{ scale: 0.93 }}
                                                    onClick={() => {
                                                        setActivityId(rt.id);
                                                        setIsActivityOpen(false);
                                                    }}
                                                    className={`relative w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm transition-all overflow-hidden select-none cursor-pointer ${
                                                        isSelected
                                                            ? 'ring-4 ring-white ring-offset-2 ring-offset-[#151515] scale-[1.02] z-10'
                                                            : 'opacity-85 hover:opacity-100'
                                                    }`}
                                                    style={{ backgroundColor: rt.color }}
                                                >
                                                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 w-full">
                                                        <DynamicIcon name={rt.icon} size={24} color={rtContrast} />
                                                        <span
                                                            className="text-[11px] font-semibold text-center leading-tight px-1 w-full truncate"
                                                            style={{ color: rtContrast }}
                                                        >
                                                            {rt.name}
                                                        </span>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center text-black shadow-sm">
                                                            <Check size={10} strokeWidth={3} />
                                                        </div>
                                                    )}
                                                </motion.button>
                                            );
                                        })}

                                        {/* Untracked Option */}
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.93 }}
                                            onClick={() => {
                                                setActivityId('untracked');
                                                setIsActivityOpen(false);
                                            }}
                                            className={`relative w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm transition-all overflow-hidden select-none cursor-pointer border-2 border-dashed border-neutral-700 bg-neutral-900 text-neutral-300 ${
                                                activityId === 'untracked'
                                                    ? 'ring-4 ring-white ring-offset-2 ring-offset-[#151515] scale-[1.02] z-10'
                                                    : 'opacity-70 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex-1 flex flex-col items-center justify-center gap-1.5 w-full">
                                                <Clock size={22} className="text-neutral-400" />
                                                <span className="text-[11px] font-semibold text-center leading-tight px-1 w-full truncate text-neutral-400">
                                                    Untracked
                                                </span>
                                            </div>
                                            {activityId === 'untracked' && (
                                                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center text-black shadow-sm">
                                                    <Check size={10} strokeWidth={3} />
                                                </div>
                                            )}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* ── Bottom Save Button ── */}
            <div className="p-4 bg-[#121212] border-t border-[#1e1e1e] flex-shrink-0">
                <button
                    onClick={handleSave}
                    className="w-full bg-[#1e2328] hover:bg-[#2c333a] py-4 rounded-[14px] text-gray-300 font-bold text-sm tracking-widest uppercase active:scale-[0.98] transition-all cursor-pointer"
                >
                    Save
                </button>
            </div>
        </motion.div>
    </motion.div>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(content, document.body);
}
