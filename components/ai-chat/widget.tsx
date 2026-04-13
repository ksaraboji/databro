'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Sparkles, X, MessageSquare, ChevronDown, AlertTriangle, Mic } from 'lucide-react';
import {
  buildCitationPreviewMap,
  buildRAGContextFromMarkdown,
  FALLBACK_RAG_CHUNKS,
  KB_EMBEDDING_MODEL,
  KB_VERSION,
  KBVectorArtifact,
} from './rag-kb';


const FALLBACK_CONTEXT_JSON = JSON.stringify(FALLBACK_RAG_CHUNKS);
const FALLBACK_CITATION_PREVIEW_BY_ID = buildCitationPreviewMap(FALLBACK_RAG_CHUNKS);

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
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your portfolio assistant — ask me anything about this site's USP, architecture, or tech stack. Your first message may take a moment while local AI models load." }
  ]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'generating' | 'error'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [embedderStatusText, setEmbedderStatusText] = useState<string | null>(null);
  const [ragContextJSON, setRagContextJSON] = useState(FALLBACK_CONTEXT_JSON);
  const [citationPreviewById, setCitationPreviewById] = useState<Record<string, string>>(FALLBACK_CITATION_PREVIEW_BY_ID);
  const [isListening, setIsListening] = useState(false);
  const worker = useRef<Worker | null>(null);
  const retrievalModeNoticeShown = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pendingAssistantOutputRef = useRef<string | null>(null);
  const streamRafRef = useRef<number | null>(null);

  const flushStreamToUI = useCallback(() => {
    const output = pendingAssistantOutputRef.current;
    if (output == null) return;

    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg?.role === 'assistant') {
        lastMsg.content = output;
        lastMsg.citations = undefined;
        return newMessages;
      }
      return [...prev, { role: 'assistant', content: output, citations: undefined }];
    });
  }, []);

  const scheduleStreamFlush = useCallback(() => {
    if (streamRafRef.current != null) return;
    streamRafRef.current = window.requestAnimationFrame(() => {
      streamRafRef.current = null;
      flushStreamToUI();
    });
  }, [flushStreamToUI]);

  useEffect(() => {
    if (searchParams.get('chat') === 'open') {
      setIsOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadKnowledgeBaseContext = async () => {
      try {
        const vectorResponse = await fetch('/ai-chat/knowledge-base-vectors.json', { cache: 'no-store' });
        if (vectorResponse.ok) {
          const vectorArtifact = (await vectorResponse.json()) as KBVectorArtifact;
          const artifactKbVersion = vectorArtifact?.header?.kbVersion;
          const artifactEmbeddingModel = vectorArtifact?.header?.embeddingModel;
          const artifactChunks = Array.isArray(vectorArtifact?.chunks) ? vectorArtifact.chunks : [];

          const isVectorArtifactCompatible = artifactKbVersion === KB_VERSION && artifactEmbeddingModel === KB_EMBEDDING_MODEL;
          if (isVectorArtifactCompatible && artifactChunks.length > 0 && !cancelled) {
            setRagContextJSON(JSON.stringify(vectorArtifact));
            setCitationPreviewById(buildCitationPreviewMap(artifactChunks));
            return;
          }
        }

        const response = await fetch('/ai-chat/knowledge-base.md', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`KB fetch failed: ${response.status}`);
        }

        const markdown = await response.text();
        const ragChunks = buildRAGContextFromMarkdown(markdown, {
          source: 'public/ai-chat/knowledge-base.md',
          chunkSize: 520,
          overlap: 100,
          kbVersion: KB_VERSION,
        });

        if (!cancelled && ragChunks.length > 0) {
          setRagContextJSON(JSON.stringify(ragChunks));
          setCitationPreviewById(buildCitationPreviewMap(ragChunks));
        }
      } catch (error) {
        console.warn('Using fallback AI knowledge base due to markdown load failure:', error);
      }
    };

    loadKnowledgeBaseContext();

    return () => {
      cancelled = true;
    };
  }, []);

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
          case 'embedder-status':
            if (typeof data?.text === 'string') {
              setEmbedderStatusText(data.text);
            }
            break;
          case 'retrieval-mode':
            if (e.data?.mode === 'sparse-only' && !retrievalModeNoticeShown.current) {
              retrievalModeNoticeShown.current = true;
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: 'Semantic retrieval is temporarily unavailable, so I am using sparse BM25 grounding for now.',
                },
              ]);
            }
            break;
          case 'update':
            pendingAssistantOutputRef.current = typeof output === 'string' ? output : null;
            scheduleStreamFlush();
            break;
          case 'complete':
            // Ensure any queued streaming update is flushed before final state.
            if (streamRafRef.current != null) {
              window.cancelAnimationFrame(streamRafRef.current);
              streamRafRef.current = null;
            }
            flushStreamToUI();
            // Final update to ensure we have everything
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = output;
                    lastMsg.citations = Array.isArray(citations)
                      ? citations.filter((c: unknown) => typeof c === 'string')
                      : undefined;
                } else {
                    // Canonical/fallback paths may return complete without streaming updates.
                    newMessages.push({
                      role: 'assistant',
                      content: typeof output === 'string' ? output : '',
                      citations: Array.isArray(citations)
                        ? citations.filter((c: unknown) => typeof c === 'string')
                        : undefined,
                    });
                }
                return newMessages;
            });
              pendingAssistantOutputRef.current = null;
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
        if (streamRafRef.current != null) {
          window.cancelAnimationFrame(streamRafRef.current);
          streamRafRef.current = null;
        }
    };
  }, [flushStreamToUI, isOpen, scheduleStreamFlush]);
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
      context: ragContextJSON,
    });
  }, [input, status, ragContextJSON]);

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

    const renderBoldSegments = (input: string, keyPrefix: string) => {
      const boldRegex = /(\*\*[^*]+\*\*)/g;
      return input.split(boldRegex).map((segment, idx) => {
        if (/^\*\*[^*]+\*\*$/.test(segment)) {
          return <strong key={`${keyPrefix}-b-${idx}`}>{segment.slice(2, -2)}</strong>;
        }
        return <span key={`${keyPrefix}-t-${idx}`}>{segment}</span>;
      });
    };

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
      return <span key={i}>{renderBoldSegments(part, `chunk-${i}`)}</span>;
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
                    <div className="whitespace-pre-line wrap-break-word">{renderContent(msg.content)}</div>
                    {msg.role === 'assistant' && Array.isArray(msg.citations) && msg.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.citations.map((citation) => (
                          <span
                            key={`${idx}-${citation}`}
                            className="rounded-full border border-slate-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            title={citationPreviewById[citation] || `Source chunk: ${citation}`}
                            aria-label={citationPreviewById[citation] || `Source chunk: ${citation}`}
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
                        <span>
                          {progress === null
                            ? (embedderStatusText || 'Initiating engine...')
                            : 'Downloading model...'}
                        </span>
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

              {status === 'generating' && (
                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30">
                    <Bot size={12} />
                  </div>
                  <div className="rounded-2xl px-3 py-2 text-sm bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 rounded-tl-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Thinking</span>
                      <span className="inline-flex items-center gap-1" aria-label="Generating response">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-bounce" />
                      </span>
                    </div>
                  </div>
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
