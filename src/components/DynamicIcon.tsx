import * as LucideIcons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface DynamicIconProps extends LucideProps {
    name: string;
}

export default function DynamicIcon({ name, size = 24, color, ...props }: DynamicIconProps) {
    // Try to find as a Lucide icon first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Icon = (LucideIcons as any)[name] as React.ComponentType<LucideProps> | undefined;

    if (Icon) {
        return <Icon size={size} color={color} {...props} />;
    }

    // Fallback: render as emoji / text span
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
            {name || '📌'}
        </span>
    );
}
