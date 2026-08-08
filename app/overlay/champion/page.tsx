"use client";
import { useCallback, useEffect, useState } from "react";
import { loadTournamentStats, TournamentStanding } from "@/lib/tournamentClient";
export default function ChampionOverlay() {
  const [champion, setChampion] = useState<TournamentStanding | null>(null);
  const refresh = useCallback(async () => setChampion((await loadTournamentStats())[0] || null), []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, [refresh]);
  if (!champion) return null;
  return <main className="flex min-h-screen items-center justify-center bg-transparent p-6 text-white"><section className="w-[900px] rounded-[32px] border border-white/40 bg-transparent p-10 text-center shadow-2xl"><p className="text-2xl font-black uppercase tracking-[0.35em] text-white">Tournament Champion</p><div className="mx-auto mt-6 flex h-36 w-36 items-center justify-center overflow-hidden rounded-3xl border border-white bg-white">{champion.logoUrl ? <img src={champion.logoUrl} alt="" className="h-full w-full object-contain p-4" /> : "🏆"}</div><h1 className="mt-6 text-6xl font-black">{champion.squadName}</h1><p className="mt-4 text-2xl text-white/80">{champion.totalPoints} points · {champion.totalKills} kills · {champion.chickenDinners} wins</p></section></main>;
}
