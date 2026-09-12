import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { sendActivityNotification } from '../utils/notifications';

export function useActivityReminder() {
    const runningRecord = useStore((s) => s.runningRecord);
    const recordTypes = useStore((s) => s.recordTypes);
    const notificationsEnabled = useStore((s) => s.notificationsEnabled);
    const notificationMinutes = useStore((s) => s.notificationMinutes);
    const notificationRepeat = useStore((s) => s.notificationRepeat);
    const notificationSound = useStore((s) => s.notificationSound);
    const setActiveInquiry = useStore((s) => s.setActiveInquiry);
    const dismissInquiry = useStore((s) => s.dismissInquiry);

    const lastSessionIdRef = useRef<string | null>(null);
    const lastNotifiedThresholdRef = useRef<number>(0);

    useEffect(() => {
        if (!notificationsEnabled || !runningRecord || runningRecord.recordTypeId === 'untracked') {
            lastSessionIdRef.current = null;
            lastNotifiedThresholdRef.current = 0;
            dismissInquiry();
            return;
        }

        // Reset if running record changed
        if (lastSessionIdRef.current !== runningRecord.id) {
            lastSessionIdRef.current = runningRecord.id;
            lastNotifiedThresholdRef.current = 0;
            dismissInquiry();
        }

        const checkReminder = () => {
            if (!runningRecord || runningRecord.recordTypeId === 'untracked') return;

            const startMs = new Date(runningRecord.startTime).getTime();
            const nowMs = Date.now();
            const elapsedMinutes = Math.floor((nowMs - startMs) / (60 * 1000));
            const threshold = Math.max(1, notificationMinutes);

            if (elapsedMinutes < threshold) return;

            const currentMultiple = Math.floor(elapsedMinutes / threshold);

            if (currentMultiple > lastNotifiedThresholdRef.current) {
                // If repeat is false, alert only once
                if (!notificationRepeat && lastNotifiedThresholdRef.current > 0) {
                    return;
                }

                lastNotifiedThresholdRef.current = currentMultiple;

                const activity = recordTypes.find((rt) => rt.id === runningRecord.recordTypeId);
                const activityName = activity?.name || 'Aktivite';

                const hours = Math.floor(elapsedMinutes / 60);
                const mins = elapsedMinutes % 60;
                let timeStr = '';
                if (hours > 0 && mins > 0) {
                    timeStr = `${hours} sa ${mins} dk`;
                } else if (hours > 0) {
                    timeStr = `${hours} saat`;
                } else {
                    timeStr = `${mins} dakika`;
                }

                const title = `⏰ Hâlâ "${activityName}" mi yapıyorsunuz?`;
                const body = `"${activityName}" aktivitesi ${timeStr}'dir devam ediyor. Hâlâ bu aktiviteyi yapıyor musunuz?`;

                // 1. Dispatch Web Notification
                sendActivityNotification(
                    title,
                    body,
                    notificationSound,
                    [
                        { action: 'stop', title: '⏹️ Hayır, Durdur' },
                        { action: 'continue', title: '▶️ Evet, Devam Et' }
                    ]
                );

                // 2. Trigger In-App Interactive Confirmation Dialog
                setActiveInquiry({
                    recordTypeId: runningRecord.recordTypeId,
                    activityName,
                    activityColor: activity?.color,
                    activityIcon: activity?.icon,
                    elapsedMinutes,
                    timeStr,
                    promptedAt: new Date().toISOString()
                });
            }
        };

        // Check immediately on mount/change, then every 15 seconds
        checkReminder();
        const timer = setInterval(checkReminder, 15000);

        return () => clearInterval(timer);
    }, [
        runningRecord,
        recordTypes,
        notificationsEnabled,
        notificationMinutes,
        notificationRepeat,
        notificationSound,
        setActiveInquiry,
        dismissInquiry
    ]);
}
