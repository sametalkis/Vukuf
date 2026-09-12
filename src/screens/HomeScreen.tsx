import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { hexToHue } from '../utils/colors';
import RunningTimerCard from '../components/RunningTimerCard';
import ActivityCard from '../components/ActivityCard';
import AddActivityModal from '../components/AddActivityModal';

export default function HomeScreen() {
    const { t } = useTranslation();
    const { recordTypes, runningRecord, startTimer, showUntrackedTime } = useStore();

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleCardClick = (id: string) => {
        startTimer(id);
    };

    const handleEdit = (id: string) => {
        setEditingId(id);
        setShowModal(true);
    };

    const openAddModal = () => {
        setEditingId(null);
        setShowModal(true);
    };

    const gridActivities = useMemo(() => {
        const sorted = [...recordTypes].sort((a, b) => hexToHue(a.color) - hexToHue(b.color));
        if (showUntrackedTime) {
            return [...sorted, { id: 'untracked', name: t('timer.untrackedTitle'), color: '#6b7280', icon: 'Clock' as any }];
        }
        return sorted;
    }, [recordTypes, showUntrackedTime, t]);

    return (
        <div className="flex flex-col min-h-screen">
            {/* Running Timer */}
            <div className="pt-8 pb-2">
                <AnimatePresence>
                    {runningRecord && <RunningTimerCard key="running" />}
                </AnimatePresence>
            </div>

            {/* Top bar */}
            <div className="flex items-center gap-3 px-6 pt-4 pb-2 opacity-60">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-800 dark:text-gray-400">{t('timer.activities')}</span>
                <div className="flex-1 h-px bg-gray-400 dark:bg-gray-700" />
            </div>

            {/* Activity Grid */}
            {gridActivities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center pb-20">
                    <div className="w-24 h-24 rounded-3xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Plus size={40} className="text-primary-500" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('timer.noActivities')}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-[200px] mx-auto leading-relaxed">
                            {t('timer.noActivitiesDesc')}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto px-6 pb-[90px]">
                    <div className="grid grid-cols-4 gap-2">
                        <AnimatePresence>
                            {gridActivities.map((activity: any) => (
                                <motion.div
                                    key={activity.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="relative"
                                >
                                    <ActivityCard
                                        activity={activity}
                                        onClick={() => handleCardClick(activity.id)}
                                        onLongPress={() => activity.id !== 'untracked' ? handleEdit(activity.id) : undefined}
                                        isRunning={runningRecord?.recordTypeId === activity.id}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* FAB */}
            <div className="fixed inset-x-0 bottom-0 pointer-events-none z-20 flex justify-center">
                <div className="relative w-full max-w-md">
                    <motion.button
                        onClick={openAddModal}
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        style={{
                            backgroundColor: 'var(--primary, #ff9100)',
                            color: 'var(--primary-contrast, #ffffff)',
                            bottom: 'calc(80px + env(safe-area-inset-bottom, 14px))',
                            boxShadow: '0 8px 24px var(--primary-soft, rgba(255, 145, 0, 0.35))',
                        }}
                        className="absolute right-4 w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center pointer-events-auto"
                        aria-label={t('timer.addActivity')}
                        title={t('timer.addActivity')}
                    >
                        <Plus size={28} />
                    </motion.button>
                </div>
            </div>

            {/* Add/Edit Modal */}
            <AddActivityModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                editingId={editingId}
            />
        </div>
    );
}
