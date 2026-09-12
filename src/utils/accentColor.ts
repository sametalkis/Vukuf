// ─── Accent Color Utilities ──────────────────────────────────────────────────

export interface AccentOption {
    id: string;
    name: string;
    hex: string;
}

export const ACCENT_PRESETS: AccentOption[] = [
    { id: 'orange', name: 'Turuncu Volt', hex: '#ff9100' },
    { id: 'purple', name: 'Elektrik Mor', hex: '#d500f9' },
    { id: 'cyan', name: 'Elektrik Mavi', hex: '#00d2ff' },
    { id: 'green', name: 'Neon Yeşil', hex: '#00e676' },
    { id: 'pink', name: 'Rose Pembe', hex: '#ff2a6d' },
    { id: 'red', name: 'Ateş Kırmızı', hex: '#ff3b30' },
];

export const DEFAULT_ACCENT_COLOR = '#ff9100';

/**
 * Calculates contrasting text color (#ffffff or #000000) for a given hex color.
 */
export function getContrastColor(hexColor: string): '#ffffff' | '#000000' {
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6) return '#ffffff';

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
}

/**
 * Applies the accent color to CSS root variables.
 */
export function applyAccentColor(accentHex: string = DEFAULT_ACCENT_COLOR) {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const contrast = getContrastColor(accentHex);

    root.style.setProperty('--primary', accentHex);
    root.style.setProperty('--primary-hover', accentHex);
    root.style.setProperty('--primary-contrast', contrast);
    root.style.setProperty('--primary-soft', `${accentHex}25`);
    root.style.setProperty('--primary-border', `${accentHex}40`);
    root.style.setProperty('--glow-primary', `0 0 20px ${accentHex}40`);
}
