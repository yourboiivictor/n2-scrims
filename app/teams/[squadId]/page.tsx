"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadTournamentStats, TournamentStanding } from "@/lib/tournamentClient";

export default function TeamStatsPage() {
  const params = useParams<{ squadId: string }>();
  const [standing, setStanding] = useState<TournamentStanding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadTournamentStats().then((items) => {
      setStanding(items.find((item) => item.squadId === params.squadId) || null);
      setLoading(false);
    });
  }, [params.squadId]);

  const killAverage = useMemo(() => standing?.matchesPlayed ? standing.totalKills / standing.matchesPlayed : 0, [standing]);
  if (loading) return <main className="min-h-screen bg-slate-950 p-6 text-white">Loading team stats...</main>;
  if (!standing) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white"><div className="text-center"><h1 className="text-2xl font-black">Team not found</h1><Link href="/tournament" className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2 font-black">Tournament</Link></div></main>;

  return <main className="min-h-screen bg-slate-950 px-4 py-5 text-white"><div className="mx-auto max-w-5xl"><header className="rounded-2xl border border-white/10 bg-slate-900 p-6"><Link href="/tournament" className="text-sm font-black text-violet-400">← Tournament</Link><div className="mt-5 flex items-center gap-4"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">{standing.logoUrl ? <img src={standing.logoUrl} alt="" className="h-full w-full object-contain p-2" /> : "LOGO"}</div><div><h1 className="text-3xl font-black">{standing.squadName}</h1><p className="text-sm text-slate-400">Slot #{standing.slot || "-"}</p></div></div></header><section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Card label="Total Points" value={standing.totalPoints} /><Card label="Total Kills" value={standing.totalKills} /><Card label="Chicken Dinners" value={standing.chickenDinners} /><Card label="Matches" value={standing.matchesPlayed} /><Card label="Average Placement" value={standing.averagePlacement ? standing.averagePlacement.toFixed(2) : "-"} /><Card label="Best Placement" value={standing.bestPlacement ? `#${standing.bestPlacement}` : "-"} /><Card label="Highest Kill Game" value={standing.highestKillGame} /><Card label="Kills Per Match" value={killAverage.toFixed(2)} /></section><section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="text-xl font-black">Players</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{standing.playerNames.length ? standing.playerNames.map((name) => <div key={name} className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 font-bold">{name}</div>) : <p className="text-sm text-slate-400">No player names available.</p>}</div></section></div></main>;
}
function Card({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-white/10 bg-slate-900 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-violet-400">{value}</p></div>; }
