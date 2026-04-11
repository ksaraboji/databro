'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Sparkles, X, MessageSquare, ChevronDown, AlertTriangle, Mic } from 'lucide-react';
import { KNOWLEDGE_BASE } from './knowledge-base';


// The context is a prioritized Knowledge Base.
// The Worker will mathematically select the best chunk before sending to the AI.
const TECH_STACK_CONTEXT = JSON.stringify(KNOWLEDGE_BASE);
const CITATION_PREVIEW_BY_ID = Object.fromEntries(
  KNOWLEDGE_BASE.map((chunk) => [
    chunk.id,
    chunk.text.length > 180 ? `${chunk.text.slice(0, 180)}...` : chunk.text,
  ]),
);

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
}

interface SpeechRecognitionLike {
  stop: () => void;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

export default function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm the portfolio assistant. How can I help you? Please wait a moment while the models are downloaded." }
  ]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'generating' | 'error'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const worker = useRef<Worker | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // Only initialize worker if chat is opened at least once to save resources
    if (isOpen && !worker.current) {
      worker.current = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.current.onerror = (error) => {
        console.error("AI Worker Error:", error);
        setStatus('error');
        setMessages(prev => [...prev, { role: 'assistant', content: "Something went wrong starting the AI engine." }]);
      };

      worker.current.onmessage = (e) => {
        const { status, data, output, error, citations } = e.data;
        
        switch (status) {
          case 'worker-loaded':
             console.log("AI Worker loaded successfully");
             break;
          case 'progress':
            if (data.status === 'progress') {
                setProgress(data.progress);
            }
            if (data.status === 'done') {
                setProgress(null);
            }
            break;
          case 'ready':
            setStatus('generating');
            break;
          case 'update':
            // Streaming update: Update the last message content real-time
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = output; // Update content
                lastMsg.citations = undefined;
                    return newMessages;
                } else {
                    // If last message was user, append a new assistant message
                return [...prev, { role: 'assistant', content: output, citations: undefined }];
                }
            });
            break;
          case 'complete':
            // Final update to ensure we have everything
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = output;
                lastMsg.citations = Array.isArray(citations)
                  ? citations.filter((c: unknown) => typeof c === 'string')
                  : undefined;
                }
                return newMessages;
            });
            setStatus('idle');
            break;
          case 'error':
            console.error(error);
            setStatus('error');
            break;
        }
      };
    }

    /* Note: We don't terminate the worker on close so the model stays loaded 
       if the user re-opens the chat. We only terminate on unmount. */
    return () => {
        // worker.current?.terminate(); // Cleaner might trigger on page nav, let's keep it alive unless component unmounts
    };
  }, [isOpen]);
const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Speech recognition is not supported in this browser.");
        return;
    }

    if (recognitionRef.current) {
        recognitionRef.current.stop();
        // The onend handler will clear the ref and state
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    
    recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
            setInput(prev => prev + (prev ? ' ' : '') + transcript);
        }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        recognitionRef.current = null;
        if (event.error === 'not-allowed') {
             alert("Microphone permission denied. Please allow access to use voice input.");
        } else if (event.error === 'network') {
             alert("Network error: Voice input requires an internet connection.");
        } else if (event.error === 'no-speech') {
             // No speech detected, just stop listening silently
        } else {
             console.log("Detailed speech error:", event);
        }
    };

    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start recognition:", e);
        setIsListening(false);
        recognitionRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        worker.current?.terminate();
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = useCallback(() => {
    if (!input.trim() || status === 'loading' || status === 'generating') return;

    const userEntry = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userEntry }]);
    setInput('');
    setStatus('loading');

    // Post to worker
    worker.current?.postMessage({
      text: userEntry,
      context: TECH_STACK_CONTEXT
    });
  }, [input, status]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderContent = (text: string) => {
    const contentWithoutSources = text.replace(/\n*\s*Sources:\s*(?:\[[^\]]+\](?:,\s*)?)+\s*$/i, '');

    // Patch: Fix known model hallucination where it adds spaces in the domain
    // e.g. "dev databro.dev" or "dev .databro.dev"
    const patchedText = contentWithoutSources
        .replace(/dev\s+databro\.dev/gi, 'dev.databro.dev')
        .replace(/dev\s+\.databro\.dev/gi, 'dev.databro.dev')
        .replace(/devatabro\.dev/gi, 'dev.databro.dev');

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return patchedText.split(urlRegex).map((part, i) => {
      if (part.match(/^https?:\/\//)) {
        let cleanUrl = part;
        let suffix = '';
        // Handle trailing punctuation often captured by [^\s]+
        // Enhanced to catch quotes, brackets, and angle brackets
        while (/[.,;:)\]>"']$/.test(cleanUrl)) {
           suffix = cleanUrl.slice(-1) + suffix;
           cleanUrl = cleanUrl.slice(0, -1);
        }
        return (
          <span key={i}>
            <a 
              href={cleanUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 underline dark:text-blue-400 break-all"
            >
              {cleanUrl}
            </a>
            {suffix}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <>
      {/* Trigger Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 shadow-lg shadow-purple-600/30 text-white transition-colors hover:bg-purple-700"
      >
        {isOpen ? <ChevronDown size={28} /> : <MessageSquare size={26} />}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-[90vw] max-w-95 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 flex flex-col max-h-150 h-[70vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">AI Assistant</h3>
                  <p className="text-xs text-slate-500">Local Browser Model</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30'
                  }`}>
                    {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                  </div>
                  <div className={`rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-sm' 
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 rounded-tl-sm'
                  }`}>
                    {renderContent(msg.content)}
                    {msg.role === 'assistant' && Array.isArray(msg.citations) && msg.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.citations.map((citation) => (
                          <span
                            key={`${idx}-${citation}`}
                            className="rounded-full border border-slate-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            title={CITATION_PREVIEW_BY_ID[citation] || `Source chunk: ${citation}`}
                            aria-label={CITATION_PREVIEW_BY_ID[citation] || `Source chunk: ${citation}`}
                          >
                            [{citation}]
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {status === 'loading' && (
                 <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900/50">
                    <div className="flex justify-between">
                        <span>{progress === null ? 'Initiating engine...' : 'Downloading model...'}</span>
                        {progress !== null && <span>{Math.round(progress)}%</span>}
                    </div>
                    {progress !== null ? (
                      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-300" 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    ) : null}
                 </div>
              )}

              {status === 'error' && (
                 <div className="flex gap-3">
                   <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30">
                     <AlertTriangle size={12} />
                   </div>
                   <div className="rounded-2xl px-3 py-2 text-sm bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200 rounded-tl-sm">
                     I encountered an error. Please try again later.
                   </div>
                 </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
               <div className="relative">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question..."
                    className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-20 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    disabled={status === 'loading' || status === 'generating'}
                  />
                  <button
                    onClick={startListening}
                    disabled={status === 'loading' || status === 'generating'}
                    className={`absolute right-10 top-1.5 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                        isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title="Voice Input"
                  >
                    <Mic size={16} />
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || status === 'loading' || status === 'generating'}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:bg-slate-300 dark:disabled:bg-slate-700"
                  >
                    <Send size={14} />
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
