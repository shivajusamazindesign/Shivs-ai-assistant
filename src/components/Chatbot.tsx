import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send, X, Minimize2, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Message } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper: Convert PCM Float32 to Base64 Int16
function pcmToBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Namaskara! I'm Shiv. I lead brand design at Jus Amazin and run Sivnco Studio. How can I help you explore my work or practice today?",
      timestamp: Date.now(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [liveCaption, setLiveCaption] = useState('');
  const [userCaption, setUserCaption] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [volume, setVolume] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isMinimized]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      audioCtxRef.current?.close();
    };
  }, []);

  const playAudioChunk = useCallback((base64: string) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const float32 = new Float32Array(bytes.length / 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 16000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now + 0.05; // small buffer
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
    audioQueueRef.current.push(source);
  }, []);

  const toggleVoiceMode = async () => {
    if (isVoiceMode) {
      setIsVoiceMode(false);
      setIsListening(false);
      wsRef.current?.close();
      return;
    }

    try {
      setIsConnecting(true);
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      await audioCtxRef.current.resume();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsVoiceMode(true);
        setIsListening(true);
        setIsConnecting(false);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'audio') {
          playAudioChunk(msg.data);
        } else if (msg.type === 'transcription') {
          if (msg.role === 'user') {
            setUserCaption(msg.text);
            // Clear user caption after some time
            setTimeout(() => setUserCaption(''), 3000);
          } else {
            setLiveCaption(msg.text);
          }
        } else if (msg.type === 'interrupted') {
          audioQueueRef.current.forEach(s => s.stop());
          audioQueueRef.current = [];
          nextStartTimeRef.current = 0;
          setLiveCaption('');
        }
      };

      ws.onclose = () => {
        setIsVoiceMode(false);
        setIsListening(false);
        stream.getTracks().forEach(track => track.stop());
      };

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && isListening) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Calculate volume for UI
          let sum = 0;
          for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
          setVolume(Math.sqrt(sum / inputData.length));

          const base64 = pcmToBase64(inputData);
          ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      };

      source.connect(processor);
      processor.connect(audioCtxRef.current.destination);
    } catch (err) {
      console.error('Failed to start voice mode:', err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="chatbot-container" className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-[420px] h-[600px] glass rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/30"
          >
            {/* Header */}
            <div className="p-4 border-b border-black/5 flex items-center justify-between bg-white/10">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isConnecting ? "bg-amber-500 animate-pulse" : 
                  isVoiceMode ? "bg-red-500 animate-pulse" : "bg-green-500"
                )} />
                <div className="flex flex-col">
                  <span className="font-medium text-sm tracking-tight">
                    {isConnecting ? "Connecting to AI..." : isVoiceMode ? "Shiv is Listening" : "Studio Assistant"}
                  </span>
                  {isVoiceMode && (
                    <div className="h-1 w-20 bg-black/5 rounded-full mt-1 overflow-hidden">
                      <motion.div 
                        animate={{ width: `${Math.min(100, volume * 1000)}%` }}
                        className="h-full bg-red-400"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={toggleVoiceMode}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isVoiceMode ? "bg-red-50 text-red-600" : "hover:bg-black/5 text-black/60"
                  )}
                >
                  {isVoiceMode ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button 
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 hover:bg-black/5 rounded-lg transition-colors"
                >
                  <Minimize2 size={16} className="text-black/60" />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-black/5 rounded-lg transition-colors"
                >
                  <X size={16} className="text-black/60" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth bg-gradient-to-b from-transparent to-black/5"
            >
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex flex-col",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-black text-white rounded-tr-none shadow-lg" 
                      : "bg-white/90 text-black shadow-sm rounded-tl-none border border-black/5"
                  )}>
                    <div className={cn(
                      "prose prose-sm max-w-none",
                      msg.role === 'user' ? "prose-invert" : "prose-neutral"
                    )}>
                      <Markdown
                        components={{
                          img: ({ node, ...props }) => {
                            const { src, alt, title } = props;
                            return (
                              <motion.img 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl mt-3 mb-1 shadow-md border border-black/5" 
                                src={src}
                                alt={alt}
                                title={title}
                              />
                            );
                          },
                          a: ({ node, ...props }) => (
                            <a 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 underline font-medium" 
                              {...props} 
                            />
                          )
                        }}
                      >
                        {msg.content}
                      </Markdown>
                    </div>
                  </div>
                </div>
              ))}
              {userCaption && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-black/5 border border-black/10 text-black/40 rounded-2xl p-3 text-xs italic">
                    Shiv heard: "{userCaption}"
                  </div>
                </div>
              )}
              {liveCaption && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] bg-zinc-100 rounded-2xl rounded-tl-none p-4 text-sm italic text-black/60 shadow-sm border border-black/5 animate-in fade-in slide-in-from-left-2 transition-all">
                    {liveCaption}
                  </div>
                </div>
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/80 rounded-2xl p-3 shadow-sm flex gap-1 items-center border border-black/5">
                    <span className="w-1.5 h-1.5 bg-black/20 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-black/20 rounded-full animate-bounce delay-100" />
                    <span className="w-1.5 h-1.5 bg-black/20 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-black/5 bg-white/20">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isVoiceMode ? "I'm listening..." : "Ask about our projects..."}
                    className="w-full bg-white/70 border border-black/10 rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 placeholder:text-black/30 transition-all"
                  />
                  {isVoiceMode && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                      <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce" />
                      <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce delay-75" />
                      <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce delay-150" />
                    </div>
                  )}
                </div>
                <button 
                  type="button"
                  onClick={toggleVoiceMode}
                  className={cn(
                    "p-3 rounded-xl transition-all duration-300",
                    isVoiceMode ? "bg-red-500 text-white shadow-red-200" : "bg-black/5 text-black/60 hover:bg-black/10"
                  )}
                >
                  {isListening ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-3 bg-black text-white rounded-xl hover:bg-black/80 transition-all disabled:opacity-20 shadow-lg"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
        className={cn(
          "flex items-center gap-3 px-6 py-4 rounded-full shadow-2xl transition-all duration-500 relative",
          isOpen && !isMinimized ? "opacity-0 pointer-events-none scale-0" : "opacity-100 scale-100",
          "bg-black text-white"
        )}
      >
        {isVoiceMode && (
          <motion.div 
            animate={{ scale: [1, 1 + volume * 5, 1] }}
            transition={{ duration: 0.2, repeat: Infinity }}
            className="absolute inset-0 bg-red-500/20 rounded-full -z-10"
          />
        )}
        <div className="relative">
          <MessageSquare size={20} />
          {isVoiceMode && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
        </div>
        <span className="font-medium tracking-tight">Talk to Shiv</span>
      </motion.button>

      {isOpen && isMinimized && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setIsMinimized(false)}
          className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform"
        >
          <MessageSquare size={24} />
        </motion.button>
      )}
    </div>
  );
}

