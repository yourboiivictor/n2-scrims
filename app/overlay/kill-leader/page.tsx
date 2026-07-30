"use client";
import { useCallback, useEffect, useState } from "react";
import { loadTournamentStats, TournamentStanding } from "@/lib/tournamentClient";
export default function KillLeaderOverlay() {
  const [leader, setLeader] = useState<TournamentStanding | null>(null);
  const refresh = useCallback(async () => { const rows = await loadTournamentStats(); setLeader([...rows].sort((a,b) => b.totalKills - a.totalKills)[0] || null); }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(timer); }, [refresh]);
  if (!leader) return null;
  return <main className="min-h-screen bg-transparent p-4 text-white"><section className="flex w-[560px] items-center gap-4 rounded-2xl border border-yellow-400/30 bg-slate-950/95 p-4 shadow-2xl"><div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-yellow-400/10">{leader.logoUrl ? <img src={leader.logoUrl} alt="" className="h-full w-full object-contain p-2" /> : "💀"}</div><div className="flex-1"><p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-400">Tournament Kill Leader</p><p className="mt-1 text-2xl font-black">{leader.squadName}</p></div><div className="text-right"><p className="text-4xl font-black text-yellow-400">{leader.totalKills}</p><p className="text-xs font-bold uppercase text-slate-400">Kills</p></div></section></main>;
}
