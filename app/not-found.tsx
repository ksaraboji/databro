import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="mx-auto w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center">
          <FileQuestion className="w-12 h-12 text-indigo-500" />
        </div>
        
        <h1 className="text-6xl font-black text-slate-900">404</h1>
        <h2 className="text-2xl font-bold text-slate-800">Page Not Found</h2>
        
        <p className="text-slate-600">
          The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>

        <Link 
          href="/" 
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
