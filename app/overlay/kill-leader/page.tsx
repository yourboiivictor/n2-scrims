"use client";
import { useCallback, useEffect, useState } from "react";
import { loadTournamentStats, TournamentStanding } from "@/lib/tournamentClient";
export default function KillLeaderOverlay() {
  const [leader, setLeader] = useState<TournamentStanding | null>(null);
  const refresh = useCallback(async () => { const rows = await loadTournamentStats(); setLeader([...rows].sort((a,b) => b.totalKills - a.totalKills)[0] || null); }, []);
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(), 3000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [refresh]);
  if (!leader) return null;
  return <main className="min-h-screen bg-transparent p-4 text-white"><section className="flex w-[560px] items-center gap-4 rounded-2xl border border-white/40 bg-transparent p-4 shadow-2xl"><div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-white bg-white">{leader.logoUrl ? <img src={leader.logoUrl} alt="" className="h-full w-full object-contain p-2" /> : "💀"}</div><div className="flex-1"><p className="text-xs font-black uppercase tracking-[0.2em] text-white">Tournament Kill Leader</p><p className="mt-1 text-2xl font-black">{leader.squadName}</p></div><div className="text-right"><p className="text-4xl font-black text-white">{leader.totalKills}</p><p className="text-xs font-bold uppercase text-white/70">Kills</p></div></section></main>;
}
