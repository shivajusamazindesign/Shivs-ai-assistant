import React from 'react';
import Chatbot from './components/Chatbot';

export default function App() {
  return (
    <main className="h-screen w-screen bg-[#f5f2ed] selection:bg-black selection:text-white overflow-hidden">
      <Chatbot isProminent={true} />
    </main>
  );
}

