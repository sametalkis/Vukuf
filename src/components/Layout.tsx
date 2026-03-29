import React from 'react';

interface LayoutProps {
    children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    return (
        <div className="pb-nav min-h-screen bg-gray-100 dark:bg-gray-950 transition-colors duration-300">
            {children}
        </div>
    );
}
