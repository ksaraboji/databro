import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full py-6 mt-12 border-t border-slate-100 bg-white/50 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4 text-center text-slate-400 text-sm">
        <p>&copy; {new Date().getFullYear()} Databro.</p>
        <p className="text-xs mt-1">Powered by coffee & commits.</p>
        <div className="flex justify-center gap-4 mt-2">
            <Link href="https://github.com/ksaraboji" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 transition-colors">GitHub</Link>
            <Link href="https://linkedin.com/in/ksaraboji" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 transition-colors">LinkedIn</Link>
        </div>
      </div>
    </footer>
  );
}
