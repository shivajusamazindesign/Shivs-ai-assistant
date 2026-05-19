import React from 'react';
import Chatbot from './components/Chatbot';

export default function App() {
  return (
    <main className="h-[100dvh] w-full bg-[#f5f2ed] flex items-center justify-center selection:bg-black selection:text-white overflow-hidden">
      <Chatbot isProminent={true} />
    </main>
  );
}

