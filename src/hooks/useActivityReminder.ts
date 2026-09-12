import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { sendActivityNotification } from '../utils/notifications';

export function useActivityReminder() {
    const { t, i18n } = useTranslation();
    const runningRecord = useStore((s) => s.runningRecord);
    const recordTypes = useStore((s) => s.recordTypes);
    const notificationsEnabled = useStore((s) => s.notificationsEnabled);
    const notificationMinutes = useStore((s) => s.notificationMinutes);
    const notificationRepeat = useStore((s) => s.notificationRepeat);
    const notificationSound = useStore((s) => s.notificationSound);

    const lastSessionIdRef = useRef<string | null>(null);
    const lastNotifiedThresholdRef = useRef<number>(0);

    useEffect(() => {
        if (!notificationsEnabled || !runningRecord || runningRecord.recordTypeId === 'untracked') {
            lastSessionIdRef.current = null;
            lastNotifiedThresholdRef.current = 0;
            return;
        }

        // Reset if running record changed
        if (lastSessionIdRef.current !== runningRecord.id) {
            lastSessionIdRef.current = runningRecord.id;
            lastNotifiedThresholdRef.current = 0;
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
                const activityName = activity?.name || t('common.activity');

                const hours = Math.floor(elapsedMinutes / 60);
                const mins = elapsedMinutes % 60;
                let timeStr = '';
                const isTr = i18n.language.startsWith('tr');
                if (hours > 0 && mins > 0) {
                    timeStr = isTr ? `${hours} sa ${mins} dk` : `${hours}h ${mins}m`;
                } else if (hours > 0) {
                    timeStr = isTr ? `${hours} saat` : `${hours} hour${hours > 1 ? 's' : ''}`;
                } else {
                    timeStr = isTr ? `${mins} dakika` : `${mins} minute${mins > 1 ? 's' : ''}`;
                }

                const title = t('settings.timer.reminderTitle', { activity: activityName });
                const body = t('settings.timer.reminderBody', { activity: activityName, time: timeStr });

                // Dispatch Web Notification only
                sendActivityNotification(
                    title,
                    body,
                    notificationSound,
                    [
                        { action: 'stop', title: t('settings.timer.reminderStop') },
                        { action: 'continue', title: t('settings.timer.reminderContinue') }
                    ]
                );
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
        t,
        i18n.language
    ]);
}
