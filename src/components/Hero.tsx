import React from 'react';
import { motion } from 'motion/react';
import { ArrowDownRight } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-end">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40 mb-6 block">
              Cinematic Brand Design & Packaging / Bengaluru
            </span>
            <h1 className="serif text-7xl md:text-8xl lg:text-9xl font-light leading-[0.85] tracking-tight mb-8">
              Sivn <br />
              <span className="italic">co.</span>
            </h1>
          </motion.div>
        </div>
        
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="lg:pl-12 pb-4"
        >
          <p className="text-xl md:text-2xl font-light text-black/70 leading-relaxed max-w-md">
            Work that speaks first. Cinematic brand design and packaging for brands that care deeply about the craft.
          </p>
          <div className="mt-8 flex items-center gap-4 text-sm font-medium uppercase tracking-wider">
            <span>Explore Practice</span>
            <ArrowDownRight size={16} className="animate-bounce" />
          </div>
        </motion.div>
      </div>
      
      <div className="mt-20 h-[1px] bg-black/10 w-full" />
    </section>
  );
}
