"use client";

import { useState, useRef, useEffect } from "react";
import { 
    Loader2, Send, CheckCircle, AlertCircle, FileText, Video, 
    Twitter, Instagram, LayoutTemplate, Sparkles, RefreshCw, 
    Smartphone, Monitor, Tablet, Copy
} from "lucide-react";

type LogEntry = {
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'error';
};

export default function MarketingAdminPage() {
    const [topic, setTopic] = useState("");
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [result, setResult] = useState<any>(null);
    const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('mobile');
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [publishConfig, setPublishConfig] = useState({
        devto: true,
        twitter: false,
        instagram: false,
        youtube: false
    });

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
        setLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            message,
            type
        }]);
    };

    const generateCampaign = async () => {
        if (!topic) return;
        setLoading(true);
        setLogs([]);
        addLog("Initiating marketing workflow...", 'info');
        setResult(null);
        
        try {
            const gatewayUrl = "/api/marketing-proxy"; // We'll need a proxy or direct URL
            const directUrl = "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io"; // Fallback
            
            // For now using direct URL, in production use proper env var or proxy
            const targetUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || directUrl;

            addLog(`Connecting to Agent Gateway at ${targetUrl}...`, 'info');

            const res = await fetch(`${targetUrl}/marketing/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    topic, 
                    admin_id: "admin_secret_123",
                    publish_config: publishConfig 
                })
            });
            
            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
            
            const data = await res.json();
            const newJobId = data.job_id;
            addLog(`Job started: ${newJobId}`, 'success');
            
            // Poll for status
            pollStatus(newJobId, targetUrl);
            
        } catch (e: any) {
            console.error(e);
            addLog(`Error: ${e.message}`, 'error');
            setLoading(false);
        }
    };

    const pollStatus = async (id: string, url: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${url}/marketing/status/${id}`);
                const data = await res.json();
                
                // Update logs if new ones exist (mocking log diffing for now)
                if (data.logs && data.logs.length > logs.length) {
                   // Filter and format logs for frontend
                   const newLogs = data.logs.slice(logs.length).map((msg: string) => {
                       let type: 'info' | 'success' | 'error' = 'info';
                       if (msg.startsWith("Error:")) type = 'error';
                       else if (msg.startsWith("Success:")) type = 'success';
                       else if (msg.startsWith("Warning:")) type = 'info';
                       
                       return {
                           timestamp: new Date().toLocaleTimeString(),
                           message: msg,
                           type: type
                       };
                   });
                   
                   setLogs(prev => {
                        // Avoid duplicates if polling is fast
                        const existingMsgs = new Set(prev.map(l => l.message));
                        const uniqueNewLogs = newLogs.filter(l => !existingMsgs.has(l.message));
                        return [...prev, ...uniqueNewLogs];
                   });
                }
                
                if (data.status === "finished") {
                    clearInterval(interval);
                    setResult(data.result || { 
                        headline: "Campaign Ready", 
                        summary: "Processing complete.",
                        social: { twitter: "TBD", instagram: "TBD" }
                    }); 
                    addLog("Workflow completed successfully!", 'success');
                    setLoading(false);
                } else if (data.status === "failed") {
                    clearInterval(interval);
                    addLog("Job Failed.", 'error');
                    setLoading(false);
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                            <Sparkles className="w-6 h-6 text-indigo-600" />
                            AI Content Studio
                        </h1>
                        <p className="text-slate-500 mt-1">Autonomous Multi-Agent Marketing Generator</p>
                    </div>
                    <div className="bg-white p-1 rounded-lg border border-slate-200 flex items-center gap-1 w-fit">
                        <button 
                            onClick={() => setViewMode('mobile')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'mobile' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setViewMode('desktop')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'desktop' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <Monitor className="w-4 h-4" />
                        </button>
                    </div>
                </header>

                <div className="w-full grid grid-cols-12 gap-6">
                    
                    {/* Input & Controls Panel */}
                    <div className="col-span-12 lg:col-span-4 space-y-6 min-w-0">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <label className="block text-sm font-semibold text-slate-700 mb-3">
                                Campaign Topic / Keyword
                            </label>
                            <div className="space-y-4">
                                <textarea 
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="Describe your campaign topic... (e.g., 'The Future of AI in Healthcare')"
                                    className="w-full h-32 px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-slate-600 bg-slate-50"
                                />
                                <button 
                                    onClick={generateCampaign}
                                    disabled={loading || !topic}
                                    className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="animate-spin w-5 h-5" />
                                            Generating Assets...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-5 h-5" />
                                            Generate Campaign
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Publishing Configuration */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <label className="block text-sm font-semibold text-slate-700 mb-3">
                                Publishing Channels
                            </label>
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={publishConfig.devto}
                                        onChange={(e) => setPublishConfig({...publishConfig, devto: e.target.checked})}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                    />
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm font-medium text-slate-700">Dev.to (Article)</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={publishConfig.twitter}
                                        onChange={(e) => setPublishConfig({...publishConfig, twitter: e.target.checked})}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Twitter className="w-4 h-4 text-sky-500" />
                                        <span className="text-sm font-medium text-slate-700">Twitter (Summary)</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={publishConfig.instagram}
                                        onChange={(e) => setPublishConfig({...publishConfig, instagram: e.target.checked})}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Instagram className="w-4 h-4 text-pink-500" />
                                        <span className="text-sm font-medium text-slate-700">Instagram (Reel)</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={publishConfig.youtube}
                                        onChange={(e) => setPublishConfig({...publishConfig, youtube: e.target.checked})}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Video className="w-4 h-4 text-red-500" />
                                        <span className="text-sm font-medium text-slate-700">YouTube (Shorts)</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Recent Activity / Logs */}
                        <div className="bg-slate-900 text-slate-300 rounded-xl overflow-hidden shadow-lg border border-slate-800 flex flex-col h-[400px]">
                            <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                                    <div className={`w-2 h-2 rounded-full ${loading ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                                    Agent Terminal
                                </div>
                                <span className="text-xs bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-500">v1.2.0</span>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                                {logs.length === 0 && (
                                    <div className="text-slate-600 italic text-center mt-10">Waiting for command...</div>
                                )}
                                {logs.map((log, i) => (
                                    <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                        <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                                        <span className={`${
                                            log.type === 'error' ? 'text-red-400' : 
                                            log.type === 'success' ? 'text-green-400' : 'text-slate-300'
                                        }`}>
                                            {log.type === 'success' && '✓ '}
                                            {log.type === 'error' && '✗ '}
                                            {log.message}
                                        </span>
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>
                        </div>
                    </div>

                    {/* Preview / Results Area */}
                    <div className="col-span-12 lg:col-span-8 space-y-6 min-w-0">
                        <div className={`transition-all duration-500 ${loading ? 'opacity-50 grayscale' : 'opacity-100'}`}>
                            {result ? (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    
                                    {/* Main Article Card */}
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="bg-indigo-50/50 p-4 border-b border-indigo-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-indigo-700 font-semibold">
                                                <FileText className="w-5 h-5" /> Generated Article Strategy
                                            </div>
                                            <button className="text-xs flex items-center gap-1 text-slate-500 hover:text-indigo-600">
                                                <Copy className="w-3 h-3" /> Copy
                                            </button>
                                        </div>
                                        <div className="p-6">
                                            <h2 className="text-2xl font-bold text-slate-900 mb-3">{result.headline || "Untitled Campaign"}</h2>
                                            <div className="prose prose-slate max-w-none text-slate-600">
                                                <p>{result.summary || "No summary available."}</p>
                                            </div>
                                            <div className="mt-6 flex flex-wrap gap-2">
                                                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full border border-slate-200">#AI</span>
                                                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full border border-slate-200">#Marketing</span>
                                                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full border border-slate-200">#Strategy</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Social Assets Grid */}
                                    <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mt-8">
                                        <Video className="w-5 h-5 text-pink-500" /> 
                                        Social Media Derivatives
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Twitter Card */}
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-all">
                                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <Twitter className="w-24 h-24 text-blue-400 transform rotate-12" />
                                            </div>
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="bg-blue-50 p-2 rounded-lg">
                                                        <Twitter className="w-5 h-5 text-blue-500" />
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-700">X / Twitter Thread</span>
                                                </div>
                                                <p className="text-sm text-slate-600 mb-4 line-clamp-4">
                                                    {result.social?.twitter || "Waiting for social media manager agent..."}
                                                </p>
                                                <button className="w-full py-2 bg-slate-50 text-slate-600 text-sm font-medium rounded-lg hover:bg-blue-50 hover:text-blue-600 border border-slate-200 hover:border-blue-200 transition-colors">
                                                    Post Thread
                                                </button>
                                            </div>
                                        </div>

                                        {/* Instagram Card */}
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-pink-300 transition-all">
                                             <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <Instagram className="w-24 h-24 text-pink-500 transform -rotate-12" />
                                            </div>
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="bg-pink-50 p-2 rounded-lg">
                                                        <Instagram className="w-5 h-5 text-pink-600" />
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-700">Instagram Reel</span>
                                                </div>
                                                <p className="text-sm text-slate-600 mb-4 line-clamp-4">
                                                    {result.social?.instagram || "Waiting for visual director agent..."}
                                                </p>
                                                <button className="w-full py-2 bg-slate-50 text-slate-600 text-sm font-medium rounded-lg hover:bg-pink-50 hover:text-pink-600 border border-slate-200 hover:border-pink-200 transition-colors">
                                                    Download Assets
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            ) : (
                                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200/60 rounded-xl bg-slate-50/30 p-8 text-center">
                                    <div className="w-16 h-16 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                                        <LayoutTemplate className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <h3 className="text-lg font-medium text-slate-900 mb-2">Ready to Design</h3>
                                    <p className="max-w-xs mx-auto mb-6">Enter a topic on the left to activate the Strategist Agent and begin your campaign.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
