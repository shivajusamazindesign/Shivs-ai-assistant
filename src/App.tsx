import React from 'react';
import Chatbot from './components/Chatbot';
import { motion } from 'motion/react';

export default function App() {
  return (
    <main className="min-h-screen bg-[#f5f2ed] flex items-center justify-center p-6 selection:bg-black selection:text-white overflow-hidden relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-black/[0.02] blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-black/[0.03] blur-3xl" />
      </div>

      <div className="z-10 text-center max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="serif text-4xl font-medium tracking-tighter mb-4 opacity-20">
            SIVNCO
          </div>
          <h1 className="serif text-5xl md:text-6xl font-light leading-tight mb-8">
            Digital Brand Assistant
          </h1>
          <p className="text-black/40 text-lg mb-12 max-w-md mx-auto leading-relaxed">
            Click below to speak with Shiv about brand design, packaging, and fine art practice.
          </p>
        </motion.div>
        
        {/* The Chatbot is actually positioned fixed/bottom right in its component, 
            but for a "Chatbot Only" site, I will modify the Chatbot component 
            to be more central if useful, or keep the floating style for a modern feel. 
            I'll keep it floating but add a prominent trigger in the center. */}
      </div>

      {/* The AI Assistant */}
      <Chatbot isProminent={true} />
    </main>
  );
}

