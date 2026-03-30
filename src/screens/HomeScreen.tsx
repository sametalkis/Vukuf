import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { hexToHue } from '../utils/colors';
import RunningTimerCard from '../components/RunningTimerCard';
import ActivityCard from '../components/ActivityCard';
import AddActivityModal from '../components/AddActivityModal';

export default function HomeScreen() {
    const { recordTypes, runningRecord, startTimer, deleteRecordType, showUntrackedTime } = useStore();

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [contextMenuId, setContextMenuId] = useState<string | null>(null);

    const handleCardClick = (id: string) => {
        setContextMenuId(null);
        startTimer(id);
    };

    const handleLongPress = (id: string) => {
        setContextMenuId(id);
    };

    const handleEdit = (id: string) => {
        setEditingId(id);
        setShowModal(true);
        setContextMenuId(null);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Bu aktiviteyi kaldırmak istediğinden emin misin? Ona bağlı olan geçmiş tüm kayıtlar da kalıcı olarak silinecek!')) {
            deleteRecordType(id);
        }
        setContextMenuId(null);
    };

    const openAddModal = () => {
        setEditingId(null);
        setShowModal(true);
    };

    const gridActivities = useMemo(() => {
        const sorted = [...recordTypes].sort((a, b) => hexToHue(a.color) - hexToHue(b.color));
        if (showUntrackedTime) {
            return [...sorted, { id: 'untracked', name: 'Untracked Time', color: '#6b7280', icon: 'Clock' as any }];
        }
        return sorted;
    }, [recordTypes, showUntrackedTime]);

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
                <span className="text-xs font-bold uppercase tracking-widest text-gray-800 dark:text-gray-400">Activities</span>
                <div className="flex-1 h-px bg-gray-400 dark:bg-gray-700" />
            </div>

            {/* Activity Grid */}
            {gridActivities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center pb-20">
                    <div className="w-24 h-24 rounded-3xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Plus size={40} className="text-primary-500" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-gray-800 dark:text-gray-200">No activities yet</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-[200px] mx-auto leading-relaxed">
                            Tap the + button below to create your first tracking category.
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
                                        onLongPress={() => activity.id !== 'untracked' ? handleLongPress(activity.id) : undefined}
                                        isRunning={runningRecord?.recordTypeId === activity.id}
                                    />

                                    {/* Context Menu Overlay */}
                                    <AnimatePresence>
                                        {contextMenuId === activity.id && activity.id !== 'untracked' && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.85 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.85 }}
                                                className="absolute inset-0 rounded-2xl z-10 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm"
                                            >
                                                <button
                                                    onClick={() => handleEdit(activity.id)}
                                                    className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    <Pencil size={12} /> Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(activity.id)}
                                                    className="flex items-center gap-1.5 bg-red-500/80 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={12} /> Delete
                                                </button>
                                                <button
                                                    onClick={() => setContextMenuId(null)}
                                                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    <X size={12} /> Cancel
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* Dismiss context menu on outside tap */}
            {contextMenuId && (
                <div
                    className="fixed inset-0 z-[5]"
                    onClick={() => setContextMenuId(null)}
                />
            )}

            {/* FAB */}
            <motion.button
                onClick={openAddModal}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                className="fixed bottom-20 right-4 w-14 h-14 bg-primary-600 dark:bg-primary-500 text-white rounded-2xl shadow-xl flex items-center justify-center z-20"
            >
                <Plus size={28} />
            </motion.button>

            {/* Add/Edit Modal */}
            <AddActivityModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                editingId={editingId}
            />
        </div>
    );
}
