"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, BookOpen, GraduationCap, ArrowRight, Mic, Volume2, StopCircle, Check, Loader2, Search, ChevronDown, Sparkles } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  audioUrl?: string;
  isProcessing?: boolean;
}

export default function ProfessorLesson() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [lessonStarted, setLessonStarted] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  // Close the dropdown if clicked outside.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (typeof window !== "undefined") {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [dropdownRef]);
  
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Audio Visualization Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [userId, setUserId] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
        let storedId = localStorage.getItem("professor_user_id");
        if (!storedId) {
            storedId = uuidv4();
            localStorage.setItem("professor_user_id", storedId);
        }
        setUserId(storedId);
    }
  }, []);

  useEffect(() => {
    // Fetch available topics
    fetch(`${process.env.NEXT_PUBLIC_API_GATEWAY_URL || "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io"}/topics`)
        .then(res => res.json())
        .then(data => {
            if (data.topics && Array.isArray(data.topics)) {
                setAvailableTopics(data.topics);
            }
        })
        .catch(err => console.error("Failed to fetch topics:", err));
  }, []);

  const gatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io";

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const startLesson = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`${gatewayUrl}/start_lesson`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, topic }),
      });

      if (res.ok) {
        const data = await res.json();
        setLessonStarted(true);
        setMessages([{ role: "assistant", content: data.content_text }]);
        setLessonPlan(data.plan || []);
      }
    } catch (error) {
       console.error("Lesson Start Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // const speakText ... (removed to fix unused warning)

  const sendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    if (!text) setInput(""); // Only clear input if sent from input field
    
      // Add user message
      const userMsg: Message = { role: "user", content: messageText };
      setMessages(prev => [...prev, userMsg]);
    
      setLoading(true);

    try {
      const res = await fetch(`${gatewayUrl}/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, question_text: messageText }),
      });

      if (res.ok) {
        const data = await res.json();
        
        // Add assistant text immediately
        const assistantMsg: Message = { 
          role: "assistant", 
          content: data.content_text,
          isProcessing: false // No audio for text input
        };
        setMessages(prev => [...prev, assistantMsg]);

        // Note: We don't trigger TTS automatically for text input as per requirements
        // "if text chosen, the response from llm must be text output"
      }
    } catch (error) {
      console.error("Interaction Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const playFeedbackSound = (type: 'start' | 'stop') => {
      try {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContext) return;
          
          const ctx = new AudioContext();
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          
          if (type === 'start') {
              // High-pitched "ding"
              oscillator.type = 'sine';
              oscillator.frequency.setValueAtTime(800, ctx.currentTime);
              oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
              gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
              oscillator.start();
              oscillator.stop(ctx.currentTime + 0.1);
          } else {
              // Lower-pitched "click"
              oscillator.type = 'sine';
              oscillator.frequency.setValueAtTime(400, ctx.currentTime);
              oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
              gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
              oscillator.start();
              oscillator.stop(ctx.currentTime + 0.1);
          }
      } catch (e) {
          console.error("Audio feedback error", e);
      }
  };

  const startRecording = async () => {
    try {
      playFeedbackSound('start');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 1. Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudio(audioBlob);
        
        // Cleanup Audio Context and Animation
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
      
      // (Removed canvas visualization setup)

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  // Effect to handle visualization loop
  // (Removed canvas visualization in favor of CSS animation)


  const stopRecording = () => {
    if (mediaRecorderRef.current && isListening) {
      playFeedbackSound('stop');
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  };

  const sendAudio = async (audioBlob: Blob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("user_id", userId);

      const res = await fetch(`${gatewayUrl}/conversate`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        
        // 1. Add User Message (Transcription)
        if (data.user_text) {
             setMessages(prev => [...prev, { role: "user", content: data.user_text }]);
        }

        // 2. Add Assistant Message & Audio
        if (data.response_text) {
           let audioUrl = data.audio_url;
           // Fix relative URL from backend
           if (audioUrl && typeof audioUrl === 'string' && audioUrl.startsWith("/")) {
               // Remove trailing slash from gateway if present to avoid double slash
               const baseUrl = gatewayUrl.endsWith("/") ? gatewayUrl.slice(0, -1) : gatewayUrl; 
               audioUrl = `${baseUrl}${audioUrl}`;
           }

           const assistantMsg: Message = {
               role: "assistant",
               content: data.response_text,
               audioUrl: audioUrl,
               isProcessing: false
           };
           setMessages(prev => [...prev, assistantMsg]);
        }
      }
    } catch (error) {
       console.error("Voice Interaction Error:", error);
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto h-[750px] md:h-[850px] relative flex shadow-2xl rounded-3xl overflow-hidden border border-slate-200 bg-white">
      
      <AnimatePresence mode="wait">
        {!lessonStarted ? (
            // START SCREEN
            <motion.div 
                key="start-screen"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-8 z-10 relative bg-gradient-to-br from-indigo-50/50 via-white to-slate-50"
            >
                <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-indigo-100 ring-1 ring-slate-100 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-500">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 group-hover:opacity-100 opacity-50 transition-opacity" />
                    <GraduationCap className="w-20 h-20 text-indigo-600 relative z-10 drop-shadow-sm" />
                </div>
                
                <div className="space-y-4 max-w-lg relative z-10">
                    <h2 className="text-5xl font-black text-slate-900 tracking-tight">Professor AI</h2>
                    <p className="text-slate-500 text-xl leading-relaxed font-medium">
                        Your personalized AI tutor. <br/>
                        <span className="text-indigo-600">What do you want to master today?</span>
                    </p>
                </div>

                <div ref={dropdownRef} className="w-full max-w-lg relative z-20">
                     <form onSubmit={startLesson} className="w-full flex flex-col items-center gap-2">
                        
                        <div className="relative w-full group">
                            {/* Input Field with modern styling */}
                            {/* Input Field with modern styling */}
                            <input 
                                type="text"
                                value={topic}
                                onChange={(e) => {
                                    setTopic(e.target.value);
                                    if (!isDropdownOpen) setIsDropdownOpen(true);
                                }}
                                onFocus={() => setIsDropdownOpen(true)}
                                disabled={loading}
                                className="w-full pl-8 pr-16 py-6 bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl text-lg font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 transition-all shadow-sm hover:shadow-md hover:border-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
                                placeholder="What do you want to learn today?..."
                            />
                            
                            {/* Icons on the right */}
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3 text-slate-400 pointer-events-none">
                                {loading ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                ) : (
                                    <>
                                       <Search className="w-6 h-6 group-focus-within:text-indigo-500 transition-colors" />
                                       {/* Optional: Keep chevron small if needed, or remove for cleaner look. Keeping for now as it indicates dropdown */}
                                       <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''} opacity-50`} />
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Dropdown Menu */}
                        <AnimatePresence>
                            {isDropdownOpen && availableTopics.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    transition={{ duration: 0.2 }}
                                    className="absolute top-full left-0 right-0 mt-2 p-2 bg-white/90 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50 flex flex-col gap-1"
                                >
                                    <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        <Sparkles className="w-3 h-3 text-indigo-400" />
                                        Suggested Topics
                                    </div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {availableTopics.filter(t => t.toLowerCase().includes(topic.toLowerCase())).length > 0 ? (
                                            availableTopics.filter(t => t.toLowerCase().includes(topic.toLowerCase())).map((t) => (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    onClick={() => {
                                                        setTopic(t);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded-xl transition-colors flex items-center justify-between group"
                                                >
                                                    <span className="font-medium">{t}</span>
                                                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-indigo-400" />
                                                </button>
                                            ))
                                        ) : (
                                             <div className="px-4 py-3 text-slate-500 text-sm italic text-center">
                                                No matching topics found. Press Enter to search using "{topic}".
                                             </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                     </form>
                </div>
                    
                    {loading ? (
                        <div className="flex flex-col items-center gap-3 mt-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                             <div className="bg-indigo-600 px-6 py-3 rounded-full text-white text-base font-semibold shadow-xl shadow-indigo-500/30 flex items-center gap-3 ring-4 ring-indigo-50/50">
                                <Loader2 className="w-5 h-5 animate-spin text-white/90" />
                                Preparing Lesson...
                             </div>
                             <p className="text-sm text-slate-400 font-medium animate-pulse">This may take a moment</p>
                        </div>
                    ) : (
                        <div className="flex justify-center mt-6">
                            <button 
                                 type="button"
                                 onClick={(e) => startLesson(e)}
                                 disabled={!topic.trim()}
                                 className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-full font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:translate-y-[-2px] active:translate-y-[0px] ring-4 ring-white/20"
                            >
                                Start Learning
                                <ArrowRight className="w-4 h-4 ml-1" />
                            </button>
                        </div>
                    )}
            </motion.div>
        ) : (
            // LESSON INTERFACE
            <motion.div 
                key="lesson-interface"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex w-full h-full bg-slate-50/50"
            >
                {/* SIDEBAR: Lesson Plan */}
                <div className="w-64 border-r border-slate-200 bg-white flex flex-col shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-20 flex-shrink-0">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/30">
                         <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg">Curriculum</h3>
                         </div>
                         <p className="text-xs text-slate-500 font-medium pl-10 uppercase tracking-wider">
                            Topic: <span className="text-indigo-600 font-bold">{topic}</span>
                         </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {lessonPlan.length > 0 ? (
                            lessonPlan.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(`Let's discuss: ${item}`)}
                                    className="w-full text-left p-3 rounded-xl hover:bg-indigo-50 group transition-all border border-transparent hover:border-indigo-100 relative overflow-hidden"
                                >
                                    <div className="flex items-start gap-3 relative z-10">
                                        <span className={cn(
                                            "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold transition-colors",
                                            messages.some(m => m.content.includes(item)) 
                                                ? "bg-emerald-100 text-emerald-600"
                                                : "bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                                        )}>
                                            {messages.some(m => m.content.includes(item)) ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                        </span>
                                        <span className={cn(
                                            "text-sm font-medium leading-snug transition-colors",
                                            messages.some(m => m.content.includes(item)) 
                                                ? "text-emerald-900 line-through opacity-60"
                                                : "text-slate-600 group-hover:text-indigo-900"
                                        )}>
                                            {item}
                                        </span>
                                    </div>
                                    {/* Progress indicator (simulated) */}
                                    {messages.some(m => m.content.includes(item)) && (
                                        <div className="absolute inset-0 bg-emerald-50/30 pointer-events-none" />
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-xl m-2 bg-slate-50/50">
                                Generating your personalized lesson plan...
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-slate-50/30">
                        <button 
                            onClick={() => { setLessonStarted(false); setMessages([]); setTopic(""); setLessonPlan([]); }}
                            className="w-full py-3 text-red-600 hover:bg-red-50 text-sm font-bold rounded-xl transition-colors border border-transparent hover:border-red-100 flex items-center justify-center gap-2 group"
                        >
                            <StopCircle className="w-4 h-4 group-hover:scale-110 transition-transform" /> End Session
                        </button>
                    </div>
                </div>

                {/* MAIN CHAT AREA */}
                <div className="flex-1 flex flex-col h-full relative">
                    {/* Header */}
                    <header className="px-8 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            <span className="text-sm font-bold text-slate-900 uppercase tracking-wide">Live Session</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                             <Volume2 className="w-3.5 h-3.5 text-indigo-500 animate-[pulse_3s_infinite]" /> 
                             <span>Audio Output Active</span>
                        </div>
                    </header>

                    {/* Messages List */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth pb-8 bg-slate-50/30">
                        {messages.map((msg, i) => (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={i} 
                                className={`flex gap-6 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${
                                    msg.role === "user" 
                                        ? "bg-white border-slate-200" 
                                        : "bg-gradient-to-br from-indigo-600 to-indigo-700 border-indigo-600 text-white shadow-indigo-200"
                                }`}>
                                    {msg.role === "user" ? <User className="w-5 h-5 text-slate-600" /> : <Bot className="w-6 h-6" />}
                                </div>
                                
                                <div className="space-y-3 max-w-[85%]">
                                    <div className={`p-5 rounded-[1.25rem] text-[15px] leading-7 shadow-sm relative ${
                                        msg.role === "user" 
                                            ? "bg-white text-slate-800 border border-slate-200 rounded-tr-sm" 
                                            : "bg-white text-slate-800 border-l-4 border-l-indigo-500 shadow-md rounded-tl-sm ring-1 ring-slate-100"
                                    }`}>
                                        {msg.content}
                                    </div>
                                    
                                    {/* Audio Player for Assistant */}
                                    {msg.role === "assistant" && (
                                        <div className="ml-1">
                                            {msg.audioUrl ? (
                                                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                                     <div className="h-8 px-3 bg-indigo-50/80 rounded-full flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase tracking-wider border border-indigo-100 shadow-sm select-none">
                                                        <Volume2 className="w-3.5 h-3.5" /> Listen
                                                     </div>
                                                     <audio 
                                                        controls 
                                                        autoPlay={i === messages.length - 1} // Only autoplay the latest message
                                                        src={msg.audioUrl} 
                                                        className="h-8 w-64 opacity-80 hover:opacity-100 transition-opacity drop-shadow-sm" 
                                                        onPlay={() => {
                                                            // Resume AudioContext if needed for visualizer, though this is output not input.
                                                            if (audioContextRef.current?.state === 'suspended') {
                                                                audioContextRef.current.resume();
                                                            }
                                                        }}
                                                     />
                                                </div>
                                            ) : msg.isProcessing ? (
                                                <div className="flex items-center gap-2 text-xs text-slate-400 pl-2">
                                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                                                    Generating audio...
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                        
                        {loading && (
                            <div className="flex gap-6 animate-pulse">
                                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-indigo-600 ring-2 ring-indigo-100">
                                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                                </div>
                                <div className="bg-white px-6 py-4 rounded-3xl rounded-tl-sm border border-slate-100 shadow-sm flex items-center gap-3">
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></span>
                                    </div>
                                    <span className="text-sm font-medium text-slate-500">Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-4" />
                    </div>

                    {/* Input Area */}
                    <div className="flex-none p-6 bg-white border-t border-slate-100">
                        <div className="max-w-4xl mx-auto relative group">
                            <form 
                                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                                className="flex gap-3 relative z-20 items-end"
                            >
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={loading ? "Waiting for response..." : "Ask a follow-up question..."}
                                        disabled={loading || isListening}
                                        className="w-full pl-6 pr-20 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50 text-base"
                                    />
                                    
                                    {/* Microphone Button */}
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-end">
                                        {isListening ? (
                                            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-sm pr-1 pl-3 py-1 rounded-full shadow-lg border border-indigo-100 animate-in fade-in zoom-in duration-200 ring-4 ring-indigo-50">
                                                <div className="flex gap-1 h-4 items-center">
                                                    <span className="w-1 h-3 bg-indigo-500 rounded-full animate-[bounce_1s_infinite_100ms]"></span>
                                                    <span className="w-1 h-4 bg-purple-500 rounded-full animate-[bounce_1s_infinite_200ms]"></span>
                                                    <span className="w-1 h-2 bg-pink-500 rounded-full animate-[bounce_1s_infinite_300ms]"></span>
                                                    <span className="w-1 h-4 bg-indigo-500 rounded-full animate-[bounce_1s_infinite_400ms]"></span>
                                                    <span className="w-1 h-3 bg-blue-500 rounded-full animate-[bounce_1s_infinite_500ms]"></span>
                                                </div>
                                                <span className="text-xs font-semibold text-indigo-600 tracking-wide uppercase">Listening</span>
                                                <button
                                                    type="button"
                                                    onClick={stopRecording}
                                                    className="h-8 w-8 flex items-center justify-center bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
                                                    title="Stop Recording"
                                                >
                                                    <span className="w-3 h-3 bg-red-500 rounded-sm"></span>
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={startRecording}
                                                className="p-2.5 rounded-xl transition-all flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-50 active:scale-95"
                                                title="Voice Input"
                                            >
                                                <Mic className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                <button
                                    type="submit"
                                    disabled={loading || !input.trim()}
                                    className="h-[60px] w-[60px] flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 disabled:opacity-50 disabled:shadow-none active:scale-95 shrink-0"
                                >
                                    <Send className="w-6 h-6 ml-0.5" />
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
