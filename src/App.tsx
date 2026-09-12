import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

import { ThemeProvider } from './context/ThemeContext';
import BottomNav from './components/BottomNav';
import Layout from './components/Layout';
import { useStore } from './store/useStore';
import { applyAccentColor, DEFAULT_ACCENT_COLOR } from './utils/accentColor';

import HomeScreen from './screens/HomeScreen';
import RecordsScreen from './screens/RecordsScreen';
import StatisticsScreen from './screens/StatisticsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useActivityReminder } from './hooks/useActivityReminder';
import SyncGate from './components/SyncGate';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.18,
  ease: 'easeOut' as const,
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
      >
        <Routes location={location}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/records" element={<RecordsScreen />} />
          <Route path="/statistics" element={<StatisticsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const accentColor = useStore((s) => s.accentColor);

  useEffect(() => {
    applyAccentColor(accentColor || DEFAULT_ACCENT_COLOR);
  }, [accentColor]);

  // Active activity duration reminder hook
  useActivityReminder();

  return (
    <ThemeProvider>
      <SyncGate>
      {/* Mobile viewport container */}
      <div className="flex justify-center min-h-screen bg-gray-200 dark:bg-gray-950">
        <div className="relative w-full max-w-md bg-gray-100 dark:bg-gray-950 shadow-2xl">
          <Layout>
            <AnimatedRoutes />
          </Layout>
          <BottomNav />
        </div>
      </div>
      </SyncGate>
    </ThemeProvider>
  );
}

export default App;
