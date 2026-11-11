/**
 * SP-M8x Hybrid Music Production Suite
 * App.tsx — Root Application Entry Point
 */

import React, { useEffect } from 'react';
import { applyTouchOptimizations } from './styles/touchOptimizer';
import { SPM8xDashboard } from './components/SPM8xDashboard';

export const App: React.FC = () => {
  useEffect(() => {
    applyTouchOptimizations();
  }, []);

  return <SPM8xDashboard />;
};

export default App;