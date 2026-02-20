"use client";

import { useState } from "react";
import { Activity, Database, CheckCircle, XCircle, Loader2, Server } from "lucide-react";

export default function SystemHealth() {
  const [gatewayStatus, setGatewayStatus] = useState<{ status: string; data?: any } | null>(null);
  const [ragStatus, setRagStatus] = useState<{ status: string; topics?: any[] } | null>(null);
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [loadingRag, setLoadingRag] = useState(false);

  const gatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io";

  const checkGateway = async () => {
    setLoadingGateway(true);
    setGatewayStatus(null);
    try {
      const res = await fetch(`${gatewayUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        setGatewayStatus({ status: "ok", data });
      } else {
        setGatewayStatus({ status: "error", data: `Error: ${res.status}` });
      }
    } catch (error) {
      setGatewayStatus({ status: "error", data: String(error) });
    } finally {
      setLoadingGateway(false);
    }
  };

  const checkRag = async () => {
    setLoadingRag(true);
    setRagStatus(null);
    try {
      const res = await fetch(`${gatewayUrl}/topics`);
      if (res.ok) {
        const data = await res.json();
        setRagStatus({ status: "ok", topics: data.topics || [] });
      } else {
        setRagStatus({ status: "error" });
      }
    } catch (error) {
      setRagStatus({ status: "error" });
    } finally {
      setLoadingRag(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
          <Activity className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">System Health</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gateway Health */}
        <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 flex items-center gap-2">
              <Server className="w-4 h-4" /> API Gateway
            </span>
            {gatewayStatus?.status === "ok" && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Healthy</span>}
            {gatewayStatus?.status === "error" && <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">Error</span>}
          </div>
          
          <button
            onClick={checkGateway}
            disabled={loadingGateway}
            className="w-full py-2 px-4 bg-white border border-slate-200 hover:border-indigo-300 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {loadingGateway ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check Status"}
          </button>

          {gatewayStatus?.status === "ok" && (
            <div className="text-xs font-mono text-slate-500 bg-white p-2 rounded border border-slate-100 overflow-hidden">
              {JSON.stringify(gatewayStatus.data, null, 2)}
            </div>
          )}
          {gatewayStatus?.status === "error" && (
            <p className="text-xs text-red-500">{JSON.stringify(gatewayStatus.data)}</p>
          )}
        </div>

        {/* RAG Health */}
        <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex flex-col gap-3">
          <div className="flex items-center justify-between">
             <span className="font-semibold text-slate-700 flex items-center gap-2">
              <Database className="w-4 h-4" /> RAG Service
            </span>
             {ragStatus?.status === "ok" && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Connected</span>}
             {ragStatus?.status === "error" && <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">Error</span>}
          </div>

          <button
            onClick={checkRag}
            disabled={loadingRag}
            className="w-full py-2 px-4 bg-white border border-slate-200 hover:border-indigo-300 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center justify-center gap-2"
          >
             {loadingRag ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check Topics"}
          </button>

          {ragStatus?.status === "ok" && (
            <div className="text-xs text-slate-600">
              <p>Found <strong>{ragStatus.topics?.length}</strong> topics.</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {ragStatus.topics?.slice(0, 5).map((t, i) => (
                    <span key={i} className="bg-slate-200 px-1.5 rounded text-[10px]">{t}</span>
                ))}
                {(ragStatus.topics?.length || 0) > 5 && <span className="text-[10px] text-slate-400">...</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
