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
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}


const INITIAL_MESSAGES: Message[] = [
  {
    role: 'assistant',
    content: "Namaskara! I'm Maya, the creative assistant for Shiv at Sivnco Studio. How can I help you explore his work or practice today?",
    timestamp: Date.now(),
  },
];

export default function Chatbot({ isProminent = false }: { isProminent?: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
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
  const liveCaptionRef = useRef('');
  const userCaptionRef = useRef('');

  const userCaptionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveCaptionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const commitUserCaption = () => {
    const text = userCaptionRef.current.trim();
    if (text) {
      setMessages(prev => {
        // Prevent duplicate consecutive user messages with same text if possible
        const last = prev[prev.length - 1];
        if (last && last.role === 'user' && last.content === text) return prev;
        return [...prev, { role: 'user', content: text, timestamp: Date.now() }];
      });
      userCaptionRef.current = '';
      setUserCaption('');
    }
  };

  const commitLiveCaption = () => {
    const text = liveCaptionRef.current.trim();
    if (text) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === text) return prev;
        return [...prev, { role: 'assistant', content: text, timestamp: Date.now() }];
      });
      liveCaptionRef.current = '';
      setLiveCaption('');
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isMinimized, liveCaption, userCaption]);

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

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now + 0.05; // small buffer
    }

    source.onended = () => {
      audioQueueRef.current = audioQueueRef.current.filter(q => q !== source);
    };
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
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
          sampleRate: 16000,
          latencyHint: 'interactive'
        });
      }
      await audioCtxRef.current.resume();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      console.log("Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsVoiceMode(true);
        setIsListening(true);
        setIsConnecting(false);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'audio') {
            playAudioChunk(msg.data);
          } else if (msg.type === 'transcription') {
            if (msg.role === 'user') {
              userCaptionRef.current = msg.text;
              setUserCaption(msg.text); // User transcription is usually full text updates
              
              if (userCaptionTimerRef.current) clearTimeout(userCaptionTimerRef.current);
              userCaptionTimerRef.current = setTimeout(commitUserCaption, 2000);
            } else {
              liveCaptionRef.current += msg.text;
              setLiveCaption(liveCaptionRef.current);
              
              if (liveCaptionTimerRef.current) clearTimeout(liveCaptionTimerRef.current);
              liveCaptionTimerRef.current = setTimeout(commitLiveCaption, 3000); // Maya speaks a bit longer sometimes
            }
          } else if (msg.type === 'turnComplete') {
            // we can just optionally commit everything immediately, but let's let the timers or immediate commit handle it
            commitUserCaption();
            // Let liveCaption commit by itself on timer, because outputTranscription may arrive AFTER turnComplete
            // but we can commit it if it exists
            // commitLiveCaption(); 
          } else if (msg.type === 'error') {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Voice error: ${msg.text}`,
              timestamp: Date.now()
            }]);
          } else if (msg.type === 'interrupted') {
            audioQueueRef.current.forEach(s => s.stop());
            audioQueueRef.current = [];
            nextStartTimeRef.current = 0;
            setLiveCaption('');
          }
        } catch (e) {
          console.error("Failed to parse WS message:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
        setIsConnecting(false);
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        setIsVoiceMode(false);
        setIsListening(false);
        setIsConnecting(false);
        setLiveCaption('');
        setUserCaption('');
        stream.getTracks().forEach(track => track.stop());
      };

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          let sum = 0;
          for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
          const vol = Math.sqrt(sum / inputData.length);
          setVolume(vol);

          // Let Gemini 3 Live handle VAD; send raw chunks continuously
          const base64 = pcmToBase64(inputData);
          wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      };

      source.connect(processor);
      processor.connect(audioCtxRef.current.destination);
    } catch (err: any) {
      console.error('Failed to start voice mode:', err);
      setIsConnecting(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I couldn't start the voice connection. Please make sure your microphone is enabled. Error: ${err.message}`,
        timestamp: Date.now()
      }]);
    }
  };

  const clearChat = () => {
    setMessages(INITIAL_MESSAGES);
    wsRef.current?.close();
    setLiveCaption('');
    setUserCaption('');
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.text || "I'm sorry, I couldn't generate a response. Please try again.",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat failed:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: `I'm having trouble connecting to my creative circuits. Error: ${error.message}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="chatbot-container" className={cn(
      "z-50 transition-all duration-500",
      isProminent ? "w-full max-w-4xl h-screen md:h-[90vh] flex flex-col p-4" : "fixed bottom-6 right-6"
    )}>
      <AnimatePresence mode="wait">
        {isOpen && !isMinimized && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className={cn(
                "w-full bg-[#f5f2ed] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-black/10 transition-all duration-500",
                isProminent ? "h-full" : "mb-4 w-[420px] h-[600px] absolute bottom-full right-0"
              )}
            >
            {/* Header */}
            <div className="p-5 border-b border-black/5 flex items-center justify-between bg-black/[0.03]">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.4)]",
                  isConnecting ? "bg-amber-500 animate-pulse shadow-amber-400/40" : 
                  isVoiceMode ? "bg-red-500 animate-pulse shadow-red-400/40" : "bg-green-500"
                )} />
                <div className="flex flex-col">
                  <span className="serif font-semibold text-xl tracking-tight text-[#1a1a1a]">
                    {isConnecting ? "Connecting..." : isVoiceMode ? "Maya is Listening" : "Sivnco Studio"}
                  </span>
                  {isVoiceMode && (
                    <div className="h-1 w-24 bg-black/5 rounded-full mt-1.5 overflow-hidden">
                      <motion.div 
                        animate={{ width: `${Math.min(100, volume * 1200)}%` }}
                        className="h-full bg-red-400 transition-all duration-75"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={clearChat}
                  title="Clear Chat"
                  className="p-2 hover:bg-black/5 rounded-lg transition-colors group flex items-center gap-2"
                >
                  <Minimize2 size={16} className="text-black/40 group-hover:text-black/60 rotate-45" />
                </button>
                <button 
                  onClick={toggleVoiceMode}
                  title={isVoiceMode ? "Stop Voice Mode" : "Start Voice Mode"}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    isVoiceMode ? "bg-red-50 text-red-600 scale-105" : "hover:bg-black/5 text-black/40"
                  )}
                >
                  {isVoiceMode ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                {!isProminent && (
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-black/5 rounded-lg transition-colors ml-1"
                  >
                    <X size={18} className="text-black/40 hover:text-black/60" />
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-10 scroll-smooth bg-[#fcfaf7]"
            >
              <div className="text-center py-4 opacity-20">
                <span className="serif text-xs tracking-[0.2em] uppercase">Visual Language & Trust</span>
              </div>
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[85%] px-5 py-4 text-sm leading-loose",
                    msg.role === 'user' 
                      ? "bg-[#1a1a1a] text-white rounded-2xl rounded-tr-none shadow-sm" 
                      : "bg-white text-[#1a1a1a] shadow-sm rounded-2xl rounded-tl-none border border-black/[0.03]"
                  )}>
                    <div className={cn(
                      "prose prose-sm max-w-none prose-p:my-0",
                      msg.role === 'user' ? "prose-invert" : "prose-neutral"
                    )}>
                      <Markdown
                        components={{
                          img: ({ ...props }) => (
                            <motion.img 
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="rounded-lg mt-4 mb-2 shadow-sm border border-black/5" 
                              src={props.src}
                              alt={props.alt}
                            />
                          ),
                          p: ({ children }) => <p className={cn(msg.role === 'assistant' && "serif text-[18px] font-medium leading-[1.6] text-[#1a1a1a]")}>{children}</p>,
                          a: ({ ...props }) => (
                            <a 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-black underline underline-offset-4 decoration-black/20 hover:decoration-black font-medium transition-all" 
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
                    Maya heard: "{userCaption}"
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

      {!isProminent && (
        <motion.button
          animate={!isOpen ? { y: [0, -5, 0] } : {}}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className={cn(
            "flex items-center gap-5 px-10 py-5 rounded-full shadow-xl transition-all duration-500 relative ring-1 ring-black/5",
            isOpen && !isMinimized ? "opacity-0 pointer-events-none scale-0" : "opacity-100 scale-100",
            "bg-[#1a1a1a] text-[#f5f2ed]"
          )}
        >
          {isVoiceMode && (
            <motion.div 
              animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-white rounded-full -z-10"
            />
          )}
          <div className="relative">
            <MessageSquare size={22} strokeWidth={1.5} />
            {isVoiceMode && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-[#1a1a1a]" />}
          </div>
          <span className="serif font-medium tracking-wide text-lg">Leave a note</span>
        </motion.button>
      )}

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

