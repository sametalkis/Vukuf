import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

import { ThemeProvider } from './context/ThemeContext';
import BottomNav from './components/BottomNav';
import Layout from './components/Layout';

import HomeScreen from './screens/HomeScreen';
import RecordsScreen from './screens/RecordsScreen';
import StatisticsScreen from './screens/StatisticsScreen';
import SettingsScreen from './screens/SettingsScreen';

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
  return (
    <ThemeProvider>
      {/* Mobile viewport container */}
      <div className="flex justify-center min-h-screen bg-gray-200 dark:bg-gray-950">
        <div className="relative w-full max-w-md bg-gray-100 dark:bg-gray-950 shadow-2xl">
          <Layout>
            <AnimatedRoutes />
          </Layout>
          <BottomNav />
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
