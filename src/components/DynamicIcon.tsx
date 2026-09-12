import React from 'react';
import * as LucideIcons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface DynamicIconProps extends LucideProps {
    name: string;
}

// Build case-insensitive and normalized lookup map for all Lucide icons
const NORMALIZED_LUCIDE_MAP = new Map<string, React.ComponentType<LucideProps>>();

for (const [key, value] of Object.entries(LucideIcons)) {
    if (
        /^[A-Z]/.test(key) &&
        !key.startsWith('Lucide') &&
        !key.endsWith('Icon') &&
        (typeof value === 'object' || typeof value === 'function')
    ) {
        // Direct key (e.g. 'Code')
        NORMALIZED_LUCIDE_MAP.set(key, value as React.ComponentType<LucideProps>);
        // Lowercase alphanumeric key (e.g. 'code', 'bookopen', 'gamepad2')
        NORMALIZED_LUCIDE_MAP.set(
            key.toLowerCase().replace(/[^a-z0-9]/g, ''),
            value as React.ComponentType<LucideProps>
        );
    }
}

// Unicode regex for emojis (extended pictographic)
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

function resolveIcon(name: string): React.ComponentType<LucideProps> | null {
    if (!name) return null;

    // 1. Direct match
    if (NORMALIZED_LUCIDE_MAP.has(name)) {
        return NORMALIZED_LUCIDE_MAP.get(name)!;
    }

    // 2. Normalized lowercase alphanumeric (handles 'code', 'book-open', 'book_open', etc.)
    const normalizedKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (NORMALIZED_LUCIDE_MAP.has(normalizedKey)) {
        return NORMALIZED_LUCIDE_MAP.get(normalizedKey)!;
    }

    return null;
}

export default function DynamicIcon({ name, size = 24, color, ...props }: DynamicIconProps) {
    const Icon = resolveIcon(name);

    if (Icon) {
        return <Icon size={size} color={color} {...props} />;
    }

    // If it's an emoji or contains pictographic characters, render it cleanly
    if (name && EMOJI_REGEX.test(name)) {
        return (
            <span
                style={{
                    fontSize: typeof size === 'number' ? size * 0.85 : 20,
                    lineHeight: 1,
                    color: color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {name}
            </span>
        );
    }

    // Fallback for unresolvable text/identifier slugs (prevent displaying raw text like "code" or "unknown")
    const FallbackIcon = LucideIcons.Activity;
    return <FallbackIcon size={size} color={color} {...props} />;
}
