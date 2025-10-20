import React from 'react';
import { Toaster } from '@/components/ui/sonner';
import Home from './pages/home';
import { TooltipProvider } from './components/ui/tooltip';

function App() {
  return (
    <div className="min-h-screen bg-background">
      <TooltipProvider>
        <Toaster position="bottom-right" />
        <Home />
      </TooltipProvider>
    </div>
  );
}

export default App;
