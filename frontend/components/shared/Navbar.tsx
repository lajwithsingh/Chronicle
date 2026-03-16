import Link from "next/link";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-chronicle-border/50 bg-chronicle-bg/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative w-5 h-5 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-chronicle-amber to-white/80 rounded-[4px] rotate-45 group-hover:rotate-90 transition-[transform,shadow] duration-700 ease-in-out opacity-90 shadow-[0_0_12px_rgba(217,119,87,0.4)] group-hover:shadow-[0_0_18px_rgba(217,119,87,0.8)]"></div>
            <div className="absolute inset-[1.5px] bg-chronicle-bg rounded-[3px] rotate-45 group-hover:rotate-90 transition-transform duration-700 ease-in-out z-10"></div>
            <div className="absolute w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,1)] z-20 group-hover:scale-110 transition-transform duration-700"></div>
          </div>
          <span className="text-white/95 font-sans text-xl font-light tracking-[0.25em] uppercase">CHRONICLE</span>
        </Link>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-chronicle-muted/50 uppercase tracking-widest">
          <span>Gemini 2.5</span>
          <span className="text-chronicle-border">·</span>
          <span>Veo 3.1</span>
          <span className="text-chronicle-border">·</span>
          <span>Cloud TTS</span>
        </div>
      </div>
    </nav>
  );
}
