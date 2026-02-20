"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminVisitorStats from '@/components/admin-visitor-stats';

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

        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Quick Actions</h2>
            <div className="h-px bg-slate-200 grow"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Admin Tool Card 1 */}
            <div className="group bg-white border border-slate-200 hover:border-indigo-300 p-6 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/50 transition-all duration-300">
              <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">Users</h2>
              <p className="text-slate-500 line-clamp-2 mb-4">Manage user roles, permissions and access controls.</p>
              <button className="text-sm font-bold text-indigo-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Access Tool <span>&rarr;</span>
              </button>
            </div>
          
            {/* Admin Tool Card 2 */}
            <div className="group bg-white border border-slate-200 hover:border-indigo-300 p-6 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/50 transition-all duration-300">
              <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-amber-600 transition-colors">Content CMS</h2>
              <p className="text-slate-500 line-clamp-2 mb-4">Create and edit blog posts, tutorials and page content.</p>
              <button className="text-sm font-bold text-amber-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Access Tool <span>&rarr;</span>
              </button>
            </div>

            {/* Admin Tool Card 3 */}
            <div className="group bg-white border border-slate-200 hover:border-indigo-300 p-6 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/50 transition-all duration-300">
              <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors">System Logs</h2>
              <p className="text-slate-500 line-clamp-2 mb-4">Monitor system health, error logs and performance metrics.</p>
              <button className="text-sm font-bold text-emerald-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Access Tool <span>&rarr;</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
