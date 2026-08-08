"use client";
import { useCallback, useEffect, useState } from "react";
import { loadTournamentStats, TournamentStanding } from "@/lib/tournamentClient";
export default function TopFiveOverlay() {
  const [rows, setRows] = useState<TournamentStanding[]>([]);
  const refresh = useCallback(async () => setRows((await loadTournamentStats()).slice(0, 5)), []);
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(), 3000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [refresh]);
  return <main className="min-h-screen bg-transparent p-4 text-white"><section className="w-[620px] overflow-hidden rounded-2xl border border-white/40 bg-transparent shadow-2xl"><div className="border-b border-white/40 bg-transparent px-5 py-3 text-xl font-black">🏆 TOP 5 OVERALL</div>{rows.map((row, index) => <div key={row.squadId} className="grid grid-cols-[55px_55px_1fr_90px] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"><div className="text-xl font-black text-white">#{index + 1}</div><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white bg-white">{row.logoUrl ? <img src={row.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : ""}</div><div><p className="truncate font-black">{row.squadName}</p><p className="text-xs text-white/70">{row.totalKills} kills · {row.chickenDinners} wins</p></div><div className="text-right text-2xl font-black">{row.totalPoints}</div></div>)}</section></main>;
}
