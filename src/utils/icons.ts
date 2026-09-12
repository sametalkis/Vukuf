import * as LucideIcons from 'lucide-react';

// Extract all valid Lucide icon component names (~1,937 unique icons)
export const ALL_LUCIDE_ICONS: string[] = Object.keys(LucideIcons)
    .filter(
        (key) =>
            /^[A-Z]/.test(key) &&
            !key.startsWith('Lucide') &&
            !key.endsWith('Icon') &&
            !['Icon', 'createLucideIcon'].includes(key) &&
            (typeof (LucideIcons as Record<string, unknown>)[key] === 'object' ||
                typeof (LucideIcons as Record<string, unknown>)[key] === 'function')
    )
    .sort();

export const ALL_LUCIDE_SET = new Set(ALL_LUCIDE_ICONS);

export function isLucideIcon(name: string): boolean {
    return ALL_LUCIDE_SET.has(name);
}

// Popular icons for quick selection
export const POPULAR_ICONS: { name: string; label: string }[] = [
    { name: 'Code', label: 'Code' },
    { name: 'Coffee', label: 'Coffee' },
    { name: 'BookOpen', label: 'Study' },
    { name: 'Dumbbell', label: 'Gym' },
    { name: 'Bike', label: 'Cycle' },
    { name: 'Music', label: 'Music' },
    { name: 'Gamepad2', label: 'Game' },
    { name: 'Utensils', label: 'Eat' },
    { name: 'Bed', label: 'Sleep' },
    { name: 'Car', label: 'Drive' },
    { name: 'ShoppingCart', label: 'Shop' },
    { name: 'Tv', label: 'TV' },
    { name: 'Heart', label: 'Health' },
    { name: 'Briefcase', label: 'Work' },
    { name: 'Home', label: 'Home' },
    { name: 'Pencil', label: 'Write' },
    { name: 'Phone', label: 'Call' },
    { name: 'Plane', label: 'Travel' },
    { name: 'Camera', label: 'Photo' },
    { name: 'Leaf', label: 'Nature' },
    { name: 'Star', label: 'Goals' },
    { name: 'Zap', label: 'Focus' },
    { name: 'GraduationCap', label: 'School' },
    { name: 'Bus', label: 'Bus' },
    { name: 'Train', label: 'Train' },
    { name: 'Moon', label: 'Night' },
    { name: 'Sun', label: 'Morning' },
    { name: 'Sunrise', label: 'Dawn' },
    { name: 'Flame', label: 'Fire' },
    { name: 'Waves', label: 'Water' },
    { name: 'Mountain', label: 'Hike' },
    { name: 'Brush', label: 'Art' },
    { name: 'Pill', label: 'Meds' },
    { name: 'Wrench', label: 'Fix' },
    { name: 'Target', label: 'Target' },
    { name: 'Trophy', label: 'Win' },
    { name: 'Gift', label: 'Gift' },
    { name: 'Users', label: 'Social' },
    { name: 'MessageCircle', label: 'Chat' },
    { name: 'Globe', label: 'Web' },
    { name: 'Headphones', label: 'Audio' },
    { name: 'Mic', label: 'Record' },
    { name: 'Video', label: 'Video' },
    { name: 'Monitor', label: 'PC' },
    { name: 'Wallet', label: 'Money' },
    { name: 'Building', label: 'Office' },
    { name: 'ChefHat', label: 'Cook' },
    { name: 'Apple', label: 'Diet' },
    { name: 'Droplets', label: 'Water' },
    { name: 'Rocket', label: 'Launch' },
    { name: 'Lightbulb', label: 'Idea' },
    { name: 'Bookmark', label: 'Save' },
    { name: 'Activity', label: 'Fit' },
    { name: 'Scissors', label: 'Craft' },
];

export const AVAILABLE_ICONS = POPULAR_ICONS;

export type IconCategory = 'popular' | 'work' | 'fitness' | 'lifestyle' | 'food' | 'all';

export const ICON_CATEGORIES: { id: IconCategory; label: string }[] = [
    { id: 'popular', label: 'Popular' },
    { id: 'work', label: 'Work & Study' },
    { id: 'fitness', label: 'Fitness & Health' },
    { id: 'lifestyle', label: 'Life & Leisure' },
    { id: 'food', label: 'Food & Drink' },
    { id: 'all', label: 'All Icons' },
];

export const CATEGORY_ICONS: Record<Exclude<IconCategory, 'popular' | 'all'>, string[]> = {
    work: [
        'Code', 'Laptop', 'Monitor', 'Briefcase', 'GraduationCap', 'BookOpen', 'Pencil',
        'Calculator', 'FileText', 'Clipboard', 'Lightbulb', 'Presentation', 'Folder',
        'Bookmark', 'Mail', 'PenTool', 'Brain', 'Compass', 'Terminal', 'Cpu', 'Layers',
        'Library', 'Scroll', 'Database', 'Shield', 'Landmark', 'Scale', 'Workflow',
        'LineChart', 'BarChart3', 'PieChart', 'Calendar', 'Timer', 'Hourglass'
    ],
    fitness: [
        'Dumbbell', 'Bike', 'Activity', 'Heart', 'Footprints', 'Flame', 'Apple',
        'Pill', 'Stethoscope', 'Droplets', 'Trophy', 'Medal', 'Timer', 'Waves',
        'Mountain', 'Cross', 'Sparkles', 'Zap', 'ShieldAlert', 'Target', 'Compass',
        'Trees', 'Sun', 'BatteryCharging'
    ],
    lifestyle: [
        'Home', 'Bed', 'ShoppingCart', 'Car', 'Phone', 'Music', 'Tv', 'Gamepad2',
        'Camera', 'Plane', 'Shirt', 'Bath', 'Armchair', 'Key', 'Dog', 'Cat',
        'Star', 'Gift', 'Moon', 'Sun', 'Sunrise', 'Sunset', 'Palette', 'Brush',
        'Scissors', 'Compass', 'Film', 'Smile', 'Wrench', 'Hammer', 'ShoppingBag',
        'Store', 'Wallet', 'Coins', 'CreditCard', 'Luggage', 'MapPin', 'Train', 'Bus'
    ],
    food: [
        'Utensils', 'Coffee', 'Pizza', 'Beer', 'Wine', 'Cake', 'Apple',
        'Croissant', 'Drumstick', 'Soup', 'CupSoda', 'Egg', 'Citrus', 'Cherry',
        'ChefHat', 'Cookie', 'Fish', 'Sandwich', 'IceCream2', 'GlassWater'
    ],
};

export type IconName = string;
