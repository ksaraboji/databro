"use client";

import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Users, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

type VisitorStats = {
  total: number;
  locations: Record<string, number>;
};

type LocationData = {
  name: string;
  count: number;
  color: string;
};

const COLORS = ["#4f46e5", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#64748b"];

export default function AdminVisitorStats() {
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_GATEWAY_URL || "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io"}/visitor-stats`);
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        } else {
             setError(`Failed to fetch stats: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        console.error("Failed to fetch visitor stats", err);
        setError("Network error: Failed to connect to statistics service.");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const chartData: LocationData[] = React.useMemo(() => {
    if (!stats || !stats.locations) return [];
    
    // Convert object to array
    const allLocations = Object.entries(stats.locations).map(([name, count]) => ({
      name,
      count
    }));

    // Sort descending
    allLocations.sort((a, b) => b.count - a.count);

    // Take top 5
    const top5 = allLocations.slice(0, 5);
    const othersCount = allLocations.slice(5).reduce((sum, item) => sum + item.count, 0);

    const data = top5.map((item, index) => ({
      ...item,
      color: COLORS[index % COLORS.length]
    }));

    if (othersCount > 0) {
      data.push({
        name: "Others",
        count: othersCount,
        color: COLORS[5]
      });
    }

    return data;
  }, [stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-white rounded-xl border border-slate-200">
        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mr-2" />
        <span className="text-slate-500 font-medium">Loading stats...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 bg-red-50 rounded-xl border border-red-200 text-red-600">
        <span className="font-medium">{error}</span>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Total Count Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between"
      >
        <div>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Visitors</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-4xl font-bold text-slate-900">{stats.total.toLocaleString()}</h3>
            <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
              Live
            </span>
          </div>
        </div>
        <div className="p-4 bg-indigo-50 rounded-xl text-indigo-600">
          <Users className="w-8 h-8" />
        </div>
      </motion.div>

      {/* Placeholder for future metric */}
      <div className="bg-slate-50/50 p-6 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400">
         More metrics coming soon
      </div>

      {/* Chart Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="col-span-1 lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6"
      >
        <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Geographical Distribution</h3>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Top 5 Regions</span>
        </div>
        
        <div className="h-64 w-full">
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                        <XAxis type="number" hide />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                            width={100}
                        />
                        <Tooltip 
                            cursor={{ fill: "transparent" }}
                            contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={32}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    No location data available yet.
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
}
