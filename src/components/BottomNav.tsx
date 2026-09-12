import { NavLink, useLocation } from 'react-router-dom';
import { Timer, List, BarChart2, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const NAV_ITEMS = [
    { path: '/', icon: Timer, key: 'nav.timer' },
    { path: '/records', icon: List, key: 'nav.records' },
    { path: '/statistics', icon: BarChart2, key: 'nav.statistics' },
    { path: '/settings', icon: Settings, key: 'nav.settings' },
];

export default function BottomNav() {
    const { t } = useTranslation();
    const location = useLocation();

    const activeIndex = Math.max(
        0,
        NAV_ITEMS.findIndex((item) =>
            item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
        )
    );

    return (
        <nav className="bottom-nav" aria-label="Main navigation">
            <div className="bottom-nav__dock">
                {activeIndex >= 0 && (
                    <span
                        className="bottom-nav__slider"
                        style={{
                            transform: `translateX(${activeIndex * 100}%)`,
                            width: `calc((100% - 8px) / ${NAV_ITEMS.length})`,
                        }}
                    />
                )}
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const label = t(item.key);
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            aria-label={label}
                            title={label}
                            className={({ isActive }) =>
                                `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`
                            }
                            end={item.path === '/'}
                        >
                            {({ isActive }) => (
                                <span className="bottom-nav__icon-wrapper">
                                    <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                </span>
                            )}
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}
