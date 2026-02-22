"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminVisitorStats from '@/components/admin-visitor-stats';
import SystemHealth from '@/components/admin/system-health';
import RagManagement from '@/components/admin/rag-management';

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const router = useRouter();

  // We can fetch the session again or assume context, but layout handles protection.
  // Ideally, context would provide the user, but for now we can just refetch solely for display details 
  // without the loading/auth check overhead since layout guarantees it.
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Layout will detect change and redirect to login
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
           <Link href="/" className="font-black tracking-tighter text-xl group transition-all">
             Data<span className="text-indigo-600 group-hover:text-amber-500 transition-colors">bro</span>. <span className="text-slate-400 font-normal">Admin</span>
           </Link>
           <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-500 hidden sm:inline">
              {session?.user?.email}
            </span>
            <button 
              onClick={handleSignOut}
              className="text-xs sm:text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-full transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="w-full max-w-7xl mx-auto px-6 py-12 space-y-12 grow">
        <header>
           <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-2">Dashboard</h1>
           <p className="text-slate-500 text-lg">Manage content, users, and system health.</p>
        </header>

        {/* Visitor Stats */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Analytics</h2>
            <div className="h-px bg-slate-200 grow"></div>
          </div>
          <AdminVisitorStats />
        </section>

        {/* System Health */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">System Status</h2>
            <div className="h-px bg-slate-200 grow"></div>
          </div>
           <SystemHealth />
        </section>

        {/* RAG Management */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Knowledge Base</h2>
            <div className="h-px bg-slate-200 grow"></div>
          </div>
           <RagManagement />
        </section>

        {/* Marketing / AI Studio */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">AI Content Studio</h2>
            <div className="h-px bg-slate-200 grow"></div>
          </div>
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 text-white relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/10 mix-blend-overlay group-hover:scale-105 transition-transform duration-700 pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                      <h3 className="text-2xl font-bold mb-2">Automated Marketing Agent</h3>
                      <p className="text-indigo-100 max-w-xl text-lg">
                          Generate articles, tweets, video scripts, and image assets about any data engineering topic instantly using autonomous agents.
                      </p>
                  </div>
                  <Link 
                      href="/admin/marketing"
                      className="px-8 py-3 bg-white text-indigo-600 rounded-full font-bold hover:bg-indigo-50 transition-all shadow-lg hover:shadow-xl active:scale-95 shrink-0"
                  >
                      Launch Studio
                  </Link>
              </div>
          </div>
        </section>
      </main>
    </div>
  );
}
