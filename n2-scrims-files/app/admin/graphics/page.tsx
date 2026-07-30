"use client";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { db } from "@/firebase";
import { defaultTournamentSettings, loadTournamentStats, TournamentSettings, TournamentStanding } from "@/lib/tournamentClient";

export default function ResultsGraphicsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [settings, setSettings] = useState<TournamentSettings>(defaultTournamentSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => { void Promise.all([loadTournamentStats(), getDoc(doc(db, "settings", "tournament"))]).then(([rows, snapshot]) => { setStandings(rows); if (snapshot.exists()) setSettings({ ...defaultTournamentSettings, ...(snapshot.data() as Partial<TournamentSettings>) }); setReady(true); }); }, []);

  const generate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 1080; canvas.height = 1920;
    ctx.fillStyle = "#020617"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, 1080, 500); gradient.addColorStop(0, "#7c3aed"); gradient.addColorStop(1, "#111827"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 500);
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.font = "900 76px Arial"; ctx.fillText(settings.name || "N² Scrims", 540, 165); ctx.font = "700 34px Arial"; ctx.fillStyle = "#ddd6fe"; ctx.fillText(`${settings.season ? `Season ${settings.season} · ` : ""}Overall Standings`, 540, 225);
    ctx.font = "900 46px Arial"; ctx.fillStyle = "#facc15"; ctx.fillText("TOURNAMENT RESULTS", 540, 340);
    standings.slice(0, 10).forEach((row, index) => { const y = 560 + index * 118; ctx.fillStyle = index < 3 ? "#1e1b4b" : "#0f172a"; roundRect(ctx, 70, y, 940, 92, 18); ctx.fill(); ctx.textAlign = "left"; ctx.fillStyle = "#a78bfa"; ctx.font = "900 34px Arial"; ctx.fillText(`#${index + 1}`, 100, y + 58); ctx.fillStyle = "#ffffff"; ctx.font = "900 32px Arial"; ctx.fillText(row.squadName.slice(0, 24), 210, y + 57); ctx.textAlign = "right"; ctx.fillStyle = "#facc15"; ctx.font = "900 34px Arial"; ctx.fillText(String(row.totalPoints), 940, y + 57); });
    ctx.textAlign = "center"; ctx.fillStyle = "#94a3b8"; ctx.font = "700 24px Arial"; ctx.fillText("N² SCRIMS", 540, 1810);
  };

  const download = () => { generate(); const canvas = canvasRef.current; if (!canvas) return; const link = document.createElement("a"); link.download = "n2-tournament-results.png"; link.href = canvas.toDataURL("image/png"); link.click(); };

  return <main className="min-h-screen bg-slate-950 px-4 py-5 text-white"><div className="mx-auto max-w-6xl"><header className="rounded-2xl border border-white/10 bg-slate-900 p-5"><p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">N² Scrims Admin</p><div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-black">Results Graphics</h1><p className="text-sm text-slate-400">Generate a 1080 × 1920 tournament-results image.</p></div><Link href="/admin/tournament" className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-black">Standings</Link></div></header><section className="mt-4 grid gap-4 lg:grid-cols-[1fr_420px]"><div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="text-xl font-black">Top 10 Preview</h2><div className="mt-4 space-y-2">{standings.slice(0,10).map((row,index) => <div key={row.squadId} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-4 py-3"><span className="font-black">#{index + 1} {row.squadName}</span><span className="font-black text-violet-400">{row.totalPoints}</span></div>)}</div><button onClick={download} disabled={!ready} className="mt-5 w-full rounded-lg bg-violet-600 px-5 py-3 font-black disabled:opacity-50">Download 1080 × 1920 PNG</button></div><div className="rounded-2xl border border-white/10 bg-slate-900 p-4"><canvas ref={canvasRef} className="h-auto w-full rounded-xl border border-white/10" /><button onClick={generate} className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-black">Refresh Preview</button></div></section></div></main>;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }
