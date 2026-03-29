import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useStore } from '../store/useStore';
import { PRESET_COLORS, getContrastColor } from '../utils/colors';
import { AVAILABLE_ICONS } from '../utils/icons';
import DynamicIcon from './DynamicIcon';

interface AddActivityModalProps {
    isOpen: boolean;
    onClose: () => void;
    editingId?: string | null;
}

export default function AddActivityModal({ isOpen, onClose, editingId }: AddActivityModalProps) {
    const { addRecordType, updateRecordType, recordTypes } = useStore();
    const nameRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[9]); // default: blue
    const [icon, setIcon] = useState('Zap');
    const [iconTab, setIconTab] = useState<'grid' | 'emoji'>('grid');
    const [emojiInput, setEmojiInput] = useState('');

    // If editing, populate form
    useEffect(() => {
        if (editingId) {
            const rt = recordTypes.find((r) => r.id === editingId);
            if (rt) {
                setName(rt.name);
                setColor(rt.color);
                setIcon(rt.icon);
                // Detect if icon is emoji/text rather than Lucide name
                const isLucide = AVAILABLE_ICONS.some(i => i.name === rt.icon);
                if (!isLucide) {
                    setIconTab('emoji');
                    setEmojiInput(rt.icon);
                } else {
                    setIconTab('grid');
                    setEmojiInput('');
                }
            }
        } else {
            setName('');
            setColor(PRESET_COLORS[9]);
            setIcon('Zap');
            setIconTab('grid');
            setEmojiInput('');
        }
    }, [editingId, recordTypes]);

    // Auto-focus name input when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => nameRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (editingId) {
            updateRecordType(editingId, { name: name.trim(), color, icon });
        } else {
            addRecordType({ name: name.trim(), color, icon });
        }
        onClose();
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center sm:items-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    >
                        {/* Sheet */}
                        <motion.div
                            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0 bg-white dark:bg-gray-900 z-10">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50">
                                    {editingId ? 'Edit Activity' : 'New Activity'}
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 flex-shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                                {/* Scrollable Form Body */}
                                <div className="flex-1 overflow-y-auto px-6 py-2 space-y-6">
                                    {/* Preview */}
                                    <div className="flex justify-center">
                                        <div
                                            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300"
                                            style={{ backgroundColor: color }}
                                        >
                                            <DynamicIcon
                                                name={icon}
                                                size={32}
                                                color={getContrastColor(color)}
                                            />
                                        </div>
                                    </div>

                                    {/* Name */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                            Activity Name
                                        </label>
                                        <input
                                            ref={nameRef}
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="e.g. Deep Work, Exercise..."
                                            maxLength={32}
                                            className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                                        />
                                    </div>

                                    {/* Color Picker */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                            Color
                                        </label>
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {/* Preset Colors */}
                                            {PRESET_COLORS.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setColor(c)}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 flex-shrink-0 ${color === c ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-gray-100 dark:ring-offset-gray-900' : ''}`}
                                                    style={{ backgroundColor: c }}
                                                >
                                                    {color === c && (
                                                        <Check size={14} color={getContrastColor(c)} strokeWidth={3} />
                                                    )}
                                                </button>
                                            ))}

                                            {/* Native Color Picker Option (Rainbow) */}
                                            <div
                                                className={`relative w-8 h-8 rounded-full flex-shrink-0 shadow-sm transition-transform hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer ${!PRESET_COLORS.includes(color) ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-gray-100 dark:ring-offset-gray-900' : ''}`}
                                                style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                                            >
                                                <input
                                                    type="color"
                                                    value={color}
                                                    onChange={(e) => setColor(e.target.value)}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                />
                                                {!PRESET_COLORS.includes(color) && (
                                                    <div
                                                        className="w-4 h-4 rounded-full border border-black/20 shadow-sm pointer-events-none"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Icon Picker */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                                Icon
                                            </label>
                                            {/* Tab switch */}
                                            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setIconTab('grid')}
                                                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${iconTab === 'grid'
                                                        ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                                                        : 'text-gray-400 dark:text-gray-500'
                                                        }`}
                                                >
                                                    Icons
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIconTab('emoji')}
                                                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${iconTab === 'emoji'
                                                        ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                                                        : 'text-gray-400 dark:text-gray-500'
                                                        }`}
                                                >
                                                    Emoji
                                                </button>
                                            </div>
                                        </div>

                                        {iconTab === 'grid' ? (
                                            <div className="grid grid-cols-8 gap-1.5 pb-2">
                                                {AVAILABLE_ICONS.map(({ name: iconName }) => (
                                                    <button
                                                        key={iconName}
                                                        type="button"
                                                        onClick={() => setIcon(iconName)}
                                                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${icon === iconName
                                                            ? 'text-white shadow-md scale-105'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                            }`}
                                                        style={icon === iconName ? { backgroundColor: color } : {}}
                                                    >
                                                        <DynamicIcon name={iconName} size={18} />
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="space-y-2 pb-2">
                                                <input
                                                    type="text"
                                                    value={emojiInput}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEmojiInput(val);
                                                        if (val.trim()) setIcon(val.trim());
                                                    }}
                                                    placeholder="Emoji veya metin: 📌 🎯 💻 🎮 ..."
                                                    maxLength={4}
                                                    className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                                                />
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    {['📌', '💻', '🎮', '📚', '🏃', '🎵', '😴', '🍕', '☕', '🎯', '✈️', '💪', '🧘', '💊', '🐕', '🌿', '✏️', '🎨', '🔬', '💰', '🏠', '📱', '⏰', '🌙', '❤️', '🔥', '🎬', '📺', '🚌', '🚂', '🌅', '🏔️', '🎹', '🃏'].map(e => (
                                                        <button
                                                            key={e}
                                                            type="button"
                                                            onClick={() => { setEmojiInput(e); setIcon(e); }}
                                                            className={`w-9 h-9 flex-shrink-0 rounded-xl text-lg flex items-center justify-center transition-all ${icon === e
                                                                ? 'scale-110 shadow-md ring-2 ring-offset-1'
                                                                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                                }`}
                                                            style={icon === e ? { outline: `2px solid ${color}`, outlineOffset: '2px' } : {}}
                                                        >
                                                            {e}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Fixed Submit Footer */}
                                <div className="p-6 pt-4 flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-10">
                                    <button
                                        type="submit"
                                        disabled={!name.trim()}
                                        className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                        style={{
                                            backgroundColor: name.trim() ? color : undefined,
                                            color: name.trim() ? getContrastColor(color) : undefined,
                                        }}
                                    >
                                        {editingId ? 'Save Changes' : 'Add Activity'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                </>
            )}
            {/* Optional Safe Area Footer padding in case they meant the submit button */}
        </AnimatePresence>
    );

    if (typeof document === 'undefined') return null; // SSR safety
    return createPortal(modalContent, document.body);
}
