"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowRight } from "lucide-react";

export default function AdminLogin() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/admin`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error logging in:', error);
      alert('Error logging in!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 px-4">
      <div className="w-full max-w-md bg-white/80 backdrop-blur-md border border-indigo-100 rounded-2xl shadow-xl shadow-indigo-100/50 p-8 text-center">
        <h1 className="text-3xl font-black tracking-tighter text-slate-950 mb-2">
            Data<span className="text-indigo-600">bro</span>. <span className="text-slate-400 font-normal">Admin</span>
        </h1>
        <p className="text-slate-600 mb-8">Sign in to access the control center</p>
        
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-indigo-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
             <span>Loading...</span>
           ) : (
            <>
              <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <div className="mt-8 pt-6 border-t border-indigo-50">
           <a href="/" className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-2 group transition-colors">
             <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
             Back to Home
           </a>
        </div>
      </div>
    </div>
  );
}
