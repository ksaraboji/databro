'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, Sparkles, X, MessageSquare, ChevronDown, AlertTriangle } from 'lucide-react';


// The context is a prioritized Knowledge Base.
// The Worker will mathematically select the best chunk before sending to the AI.
const TECH_STACK_CONTEXT = JSON.stringify([
  { 
    id: "about",
    keywords: ["databro", "site", "about", "portfolio", "what is this", "purpose", "goal", "website", "author", "creator", "developer", "engineer", "who built", "who made", "created by", "kumar", "saraboji", "owner"], 
    text: "This site is a professional Data Engineering portfolio built by Kumar Saraboji. It demonstrates skills in Cloud Automation (AWS), AI Integration (Browser-based), and Data Tools." 
  },
  { 
    id: "repo",
    keywords: ["github", "repo", "repository", "source code", "git", "url", "codebase", "code base", "open source", "link", "where is the code"], 
    text: "The complete source code is available on GitHub at https://github.com/ksaraboji/databro.git." 
  },
  { 
    id: "stack",
    keywords: ["tech stack", "technologies", "framework", "library", "react", "next.js", "typescript", "tailwind", "tech", "css", "frontend", "ui", "vue", "angular", "svelte", "jquery", "bootstrap"], 
    text: "The tech stack uses Next.js v16.1.3 (App Router), React v19.2.3, TypeScript v5, Tailwind CSS v4, and Framer Motion v12." 
  },
  { 
    id: "infra",
    keywords: ["infrastructure", "cloud", "aws", "hosting", "deploy", "s3", "cloudfront", "terraform", "where hosted", "azure", "gcp", "google", "digitalocean", "vps", "server", "docker", "kubernetes"], 
    text: "The infrastructure is Serverless. Hosted on AWS S3 (Storage) and served via AWS CloudFront (CDN). Infrastructure is managed as code using Terraform." 
  },
  { 
    id: "arch",
    keywords: ["architecture", "backend", "database", "api", "security", "serverless", "jamstack", "api", "graphql", "rest", "mysql", "postgres", "mongodb", "oracle", "sql", "sqlite", "auth", "login"], 
    text: "The architecture is purely Jamstack (Static Export). There is NO backend server and NO database. All logic is client-side." 
  },
  { 
    id: "cicd",
    keywords: ["ci", "cd", "ci/cd", "continuous integration", "continuous delivery", "pipeline", "github actions", "build", "automation", "jenkins", "gitlab", "built", "how built", "compilation", "process"], 
    text: "CI/CD is automated via GitHub Actions. It runs Linting, Building, Security Checks, and S3 Deployment." 
  },
  { 
    id: "ai",
    keywords: ["ai", "model", "chatbot", "genai", "llm", "qwen", "transformer", "gpt", "openai", "claude"], 
    text: "The AI is the xenova/qwen1.5-0.5B-Chat model. It runs entirely in the browser using WebAssembly. No data is sent to any server." 
  },
  { 
    id: "tools",
    keywords: ["tools", "utils", "formatter", "calculator", "checksum", "hash", "generator", "available", "list", "feature", "functionality"], 
    text: "Available tools: SQL Formatter, Checksum Calculator, and Hash Generator." 
  }
]);

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm the site assistant. Ask me about the site!" }
  ]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'generating' | 'error'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const worker = useRef<Worker | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        const { status, data, output, error } = e.data;
        
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
                    return newMessages;
                } else {
                    // If last message was user, append a new assistant message
                    return [...prev, { role: 'assistant', content: output }];
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
            className="fixed bottom-24 right-6 z-50 w-[90vw] max-w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 flex flex-col max-h-[600px] h-[70vh]"
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
                    {msg.content}
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
                          <div className="h-full bg-purple-500 transition-all duration-200" style={{ width: `${progress}%` }} />
                      </div>
                    ) : (
                      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div className="h-full w-1/3 animate-loading-bar bg-slate-400 dark:bg-slate-600" />
                      </div>
                    )}
                 </div>
              )}

              {status === 'generating' && (
                 <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 size={12} className="animate-spin" />
                    <span>Thinking...</span>
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
                    className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-10 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    disabled={status === 'loading' || status === 'generating'}
                  />
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
