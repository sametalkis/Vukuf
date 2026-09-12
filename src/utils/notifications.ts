// ─── Web Notifications & Chime Sound Utilities ───────────────────────────────

export type NotificationSupportStatus = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Checks current browser notification permission status.
 */
export function checkNotificationPermission(): NotificationSupportStatus {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
    }
    return Notification.permission;
}

/**
 * Prompts user to grant notification permission.
 */
export async function requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
    }
    try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    } catch {
        return false;
    }
}

/**
 * Plays a gentle, pleasant 2-tone chime using the Web Audio API.
 */
export function playNotificationChime() {
    if (typeof window === 'undefined') return;

    try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;

        // Tone 1: C5 (523.25 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Tone 2: G5 (783.99 Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(783.99, now + 0.12);
        gain2.gain.setValueAtTime(0.18, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.55);

        setTimeout(() => {
            ctx.close().catch(() => {});
        }, 1000);
    } catch {
        // AudioContext may fail if user hasn't interacted with page yet
    }
}

/**
 * Dispatches a Web Notification using ServiceWorker if available, or native Notification fallback.
 */
export async function sendActivityNotification(title: string, body: string, playSound = true) {
    if (checkNotificationPermission() !== 'granted') return;

    if (playSound) {
        playNotificationChime();
    }

    const options: NotificationOptions & { vibrate?: number[] } = {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'simple-time-tracker-reminder',
        vibrate: [200, 100, 200],
    };

    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            if (reg && 'showNotification' in reg) {
                await reg.showNotification(title, options);
                return;
            }
        }
    } catch {
        // Fallback below
    }

    try {
        const notif = new Notification(title, options);
        notif.onclick = () => {
            window.focus();
            notif.close();
        };
    } catch {
        // Notification constructor may throw in some environments
    }
}
