import React from 'react';
import Hero from './components/Hero';
import ProjectGrid from './components/ProjectGrid';
import Chatbot from './components/Chatbot';

export default function App() {
  return (
    <main className="min-h-screen selection:bg-black selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 w-full z-40 px-6 py-8 flex justify-between items-center mix-blend-difference text-white">
        <div className="serif text-xl font-medium tracking-tighter cursor-pointer">
          SIVNCO
        </div>
        <div className="flex gap-8 text-xs font-semibold uppercase tracking-widest">
          <a href="#work" className="hover:opacity-50 transition-opacity">Work</a>
          <a href="#about" className="hover:opacity-50 transition-opacity">About</a>
          <a href="#gallery" className="hover:opacity-50 transition-opacity">Gallery</a>
        </div>
      </nav>

      {/* Hero Section */}
      <Hero />

      <div id="work">
        {/* Projects Grid */}
        <ProjectGrid />
      </div>

      <section id="about" className="px-6 py-32 max-w-7xl mx-auto bg-black text-white rounded-[3rem] my-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          <h2 className="serif text-5xl font-light leading-tight">
            I build visual languages that <span className="italic opacity-50">earn trust.</span>
          </h2>
          <div>
            <p className="text-lg opacity-70 leading-relaxed mb-6">
              I'm Shiv — H P Shivaraj. I lead brand and communication design at Jus Amazin, teach art at Openhouse learning hubs, and co-run Svarnart Academy. Born and raised in Namma Bengaluru, that texture shows up in everything I make.
            </p>
            <p className="text-lg opacity-70 leading-relaxed">
              Design is how I think. Art is how I feel. Both live in everything I put out — whether it's a packaging system for a D2C brand or an acrylic painting on a Saturday afternoon.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-20 max-w-7xl mx-auto border-t border-black/5">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="serif text-2xl font-light">
            Sivnco <span className="italic text-black/30">© 2024</span>
          </div>
          <div className="flex gap-6 text-sm text-black/40">
            <a href="https://www.instagram.com/sivnco/" className="hover:text-black transition-colors">Instagram</a>
            <a href="https://www.linkedin.com/in/hpshivaraj/" className="hover:text-black transition-colors">LinkedIn</a>
            <a href="https://wa.me/918431272507" className="hover:text-black transition-colors">WhatsApp</a>
          </div>
        </div>
      </footer>

      {/* The AI Assistant */}
      <Chatbot />
    </main>
  );
}

