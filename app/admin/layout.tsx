"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLogin from '@/components/admin-login';
import { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const getSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setLoading(false);
    };
    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-slate-500 font-medium animate-pulse">Checking credentials...</p>
      </div>
    );
  }

  if (!session) {
    return <AdminLogin />;
  }

  const allowedEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (allowedEmail && session.user.email !== allowedEmail) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 px-4 text-center">
        <div className="w-full max-w-md bg-white/80 backdrop-blur-md border border-red-100 rounded-2xl shadow-xl shadow-red-100/50 p-8">
            <h1 className="text-2xl font-black text-slate-900 mb-2">Access <span className="text-red-500">Denied</span></h1>
            <p className="text-slate-600 mb-6 leading-relaxed">
              You are signed in as <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{session.user.email}</span>, 
              but you do not have permission to access the admin dashboard.
            </p>
            <button 
              onClick={handleSignOut}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors mb-4"
            >
              Sign Out
            </button>
            <div className="pt-4 border-t border-slate-100">
               <Link href="/" className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-2 group">
                 <span>&larr;</span> <span className="group-hover:translate-x-1 transition-transform">Back to Home</span>
               </Link>
            </div>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-slate-50/50">
        {children}
      </div>
  );
}
