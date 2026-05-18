import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ExternalLink } from 'lucide-react';
import { Project } from '../types';

export default function ProjectGrid() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        setProjects(data);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div className="py-20 flex justify-center">
      <div className="w-8 h-8 border-2 border-black/10 border-t-black rounded-full animate-spin" />
    </div>
  );

  return (
    <section className="px-6 py-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
        <div>
          <h2 className="serif text-5xl font-light tracking-tight">Recent Works</h2>
          <p className="text-black/50 mt-2 font-medium uppercase text-xs tracking-widest italic">Selected Projects 2024–2025</p>
        </div>
        <div className="text-right">
          <span className="text-sm text-black/40">Filter / Sort</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-16">
        {projects.map((project, index) => (
          <ProjectCard key={project.id} project={project} index={index} />
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group"
    >
      <div className="aspect-[16/10] bg-zinc-100 rounded-2xl overflow-hidden relative mb-6">
        {/* Placeholder image representation */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 flex items-center justify-center">
          <div className="text-4xl font-serif italic text-black/10 group-hover:text-black/20 transition-colors uppercase tracking-widest">
            {project.title}
          </div>
        </div>
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />
        
        <button className="absolute top-6 right-6 p-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 shadow-lg">
          <ExternalLink size={20} className="text-black" />
        </button>
      </div>

      <div className="flex justify-between items-start">
        <div>
          <span className="text-xs uppercase tracking-widest text-black/40 font-semibold mb-2 block">
            {project.category}
          </span>
          <h3 className="serif text-3xl font-light group-hover:italic transition-all duration-300">
            {project.title}
          </h3>
          <p className="text-black/60 mt-3 max-w-md leading-relaxed text-sm">
            {project.description}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {project.tags.map(tag => (
              <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-1 border border-black/10 rounded-full text-black/40">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
