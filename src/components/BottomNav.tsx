import { NavLink } from 'react-router-dom';
import { Timer, List, BarChart2, Settings } from 'lucide-react';

const tabs = [
    { to: '/', icon: Timer, label: 'Timer' },
    { to: '/records', icon: List, label: 'Records' },
    { to: '/statistics', icon: BarChart2, label: 'Statistics' },
    { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function BottomNav() {
    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
            <div className="w-full max-w-md bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg">
                <div className="flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    {tabs.map(({ to, icon: Icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            className={({ isActive }) =>
                                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all duration-200 ${isActive
                                    ? 'text-primary-600 dark:text-primary-400'
                                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <div
                                        className={`p-1.5 rounded-2xl transition-all duration-200 ${isActive
                                                ? 'bg-primary-100 dark:bg-primary-900/40'
                                                : ''
                                            }`}
                                    >
                                        <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                    </div>
                                    <span className={`text-[10px] font-medium leading-none ${isActive ? 'font-semibold' : ''}`}>
                                        {label}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </div>
            </div>
        </nav>
    );
}
