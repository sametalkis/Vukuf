import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Square, Play, X, Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import DynamicIcon from './DynamicIcon';

export default function ActivityInquiryModal() {
    const activeInquiry = useStore((s) => s.activeInquiry);
    const dismissInquiry = useStore((s) => s.dismissInquiry);
    const confirmInquiryStop = useStore((s) => s.confirmInquiryStop);

    if (!activeInquiry) return null;

    const activityColor = activeInquiry.activityColor || 'var(--primary, #ff9100)';

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                {/* Backdrop Blur Overlay */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={dismissInquiry}
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 320 }}
                    className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-2xl p-6 overflow-hidden text-center z-10"
                >
                    {/* Close Button */}
                    <button
                        type="button"
                        onClick={dismissInquiry}
                        className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                        aria-label="Kapat"
                    >
                        <X size={18} />
                    </button>

                    {/* Top Activity Icon Badge with Pulse Effect */}
                    <div className="flex justify-center mb-4 pt-2">
                        <div className="relative">
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg relative z-10"
                                style={{
                                    backgroundColor: `${activityColor}25`,
                                    color: activityColor,
                                    border: `1.5px solid ${activityColor}50`
                                }}
                            >
                                {activeInquiry.activityIcon ? (
                                    <DynamicIcon name={activeInquiry.activityIcon} size={30} />
                                ) : (
                                    <Clock size={30} />
                                )}
                            </div>
                            {/* Ambient Glow */}
                            <div
                                className="absolute inset-0 rounded-2xl blur-xl opacity-40 animate-pulse pointer-events-none"
                                style={{ backgroundColor: activityColor }}
                            />
                        </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                        Hâlâ devam ediyor musunuz?
                    </h3>

                    {/* Elapsed Time Pill */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 mb-3 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200/60 dark:border-neutral-700/60">
                        <Clock size={13} className="text-gray-500 dark:text-gray-400" />
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {activeInquiry.timeStr} geçti
                        </span>
                    </div>

                    {/* Description Message */}
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6 px-1">
                        <strong className="text-gray-900 dark:text-white font-semibold">"{activeInquiry.activityName}"</strong> aktivitesindesiniz. Bu aktiviteyi yapmaya devam ediyor musunuz?
                    </p>

                    {/* Actions */}
                    <div className="flex flex-col gap-2.5">
                        {/* Continue Button */}
                        <button
                            type="button"
                            onClick={dismissInquiry}
                            className="w-full py-3 px-4 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-95 active:scale-[0.98]"
                            style={{
                                backgroundColor: 'var(--primary, #ff9100)',
                                color: 'var(--primary-contrast, #ffffff)'
                            }}
                        >
                            <Play size={16} fill="currentColor" />
                            <span>Evet, Devam Ediyorum</span>
                        </button>

                        {/* Stop Button */}
                        <button
                            type="button"
                            onClick={confirmInquiryStop}
                            className="w-full py-3 px-4 rounded-2xl font-semibold text-sm bg-gray-100 dark:bg-neutral-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-neutral-700/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <Square size={15} />
                            <span>Hayır, Sayacı Durdur</span>
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
