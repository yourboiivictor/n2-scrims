"use client";

import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";
import { defaultTournamentSettings, loadTournamentStats, rankTournamentStandings, TournamentSettings, TournamentStanding } from "@/lib/tournamentClient";

export default function PublicTournamentPage() {
  const [settings, setSettings] = useState<TournamentSettings>(defaultTournamentSettings);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStandings(await loadTournamentStats());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const unsubscribe = onSnapshot(doc(db, "settings", "tournament"), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setSettings({
        ...defaultTournamentSettings,
        name: typeof data.name === "string" ? data.name : "N² Scrims",
        season: typeof data.season === "string" ? data.season : "",
        streamUrl: typeof data.streamUrl === "string" ? data.streamUrl : "",
        prizeFirst: typeof data.prizeFirst === "string" ? data.prizeFirst : "",
        prizeSecond: typeof data.prizeSecond === "string" ? data.prizeSecond : "",
        prizeThird: typeof data.prizeThird === "string" ? data.prizeThird : "",
        prizeMvp: typeof data.prizeMvp === "string" ? data.prizeMvp : "",
      });
    });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [refresh]);

  const ranked = useMemo(() => rankTournamentStandings(standings), [standings]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? ranked.filter((item) => item.squadName.toLowerCase().includes(term)) : ranked;
  }, [ranked, search]);
  const live = ranked.some((item) => item.isLive);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">N² Scrims</p><h1 className="mt-1 text-3xl font-black">{settings.name}</h1><p className="mt-1 text-sm text-slate-400">{settings.season ? `Season ${settings.season} · ` : ""}{live ? "Live standings" : "Tournament standings"}</p></div>
            <div className="flex flex-wrap gap-2">{settings.streamUrl && <a href={settings.streamUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-black">Watch Live</a>}<Link href="/standings" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black">Simple Standings</Link></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4"><Stat label="Leader" value={ranked[0]?.squadName || "-"} /><Stat label="Leader Points" value={ranked[0]?.totalPoints || 0} /><Stat label="Squads" value={ranked.length} /><Stat label="Status" value={live ? "LIVE" : "FINAL"} /></div>
          {(settings.prizeFirst || settings.prizeSecond || settings.prizeThird || settings.prizeMvp) && <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Prize label="1st" value={settings.prizeFirst} /><Prize label="2nd" value={settings.prizeSecond} /><Prize label="3rd" value={settings.prizeThird} /><Prize label="MVP" value={settings.prizeMvp} /></div>}
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search squad..." className="mt-4 h-11 w-full max-w-sm rounded-lg border border-white/10 bg-slate-950 px-4 outline-none focus:border-violet-400" />
        </header>

        {loading ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center text-slate-400">Loading standings...</div> : filtered.length === 0 ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center"><h2 className="text-xl font-black">No standings yet</h2></div> : <StandingsTable ranked={ranked} rows={filtered} />}
      </div>
    </main>
  );
}

function StandingsTable({ ranked, rows }: { ranked: TournamentStanding[]; rows: TournamentStanding[] }) {
  return <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"><div className="hidden grid-cols-[75px_70px_minmax(220px,1fr)_95px_110px_105px_120px_105px_125px] border-b border-white/10 bg-black/30 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 lg:grid"><div>Rank</div><div>Logo</div><div>Squad</div><div>Matches</div><div>Wins</div><div>Kills</div><div>Avg Place</div><div>Place Pts</div><div>Total</div></div>{rows.map((standing) => { const rank = ranked.findIndex((item) => item.squadId === standing.squadId) + 1; return <Link href={`/team/${standing.squadId}`} key={standing.squadId} className="grid gap-3 border-b border-white/5 p-4 transition hover:bg-white/[0.03] last:border-b-0 lg:grid-cols-[75px_70px_minmax(220px,1fr)_95px_110px_105px_120px_105px_125px] lg:items-center"><div className="text-xl font-black text-violet-400">{rank <= 3 ? ["🥇","🥈","🥉"][rank - 1] : `#${rank}`}</div><Logo standing={standing} /><div><p className="font-black">{standing.squadName}</p><p className="text-xs text-slate-500">Best #{standing.bestPlacement || "-"}{standing.isLive ? " · LIVE" : ""}</p></div><Metric label="Matches" value={standing.matchesPlayed} /><Metric label="Wins" value={standing.chickenDinners} /><Metric label="Kills" value={standing.totalKills} /><Metric label="Avg Place" value={standing.averagePlacement ? standing.averagePlacement.toFixed(1) : "-"} /><Metric label="Place Pts" value={standing.placementPoints} /><div><p className="text-[9px] font-bold uppercase text-slate-500 lg:hidden">Total</p><p className="text-2xl font-black text-violet-400">{standing.totalPoints}</p></div></Link>; })}</section>;
}
function Logo({ standing }: { standing: TournamentStanding }) { return <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">{standing.logoUrl ? <img src={standing.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : <span className="text-[8px] text-slate-600">LOGO</span>}</div>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-black">{value}</p></div>; }
function Prize({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3"><p className="text-[10px] font-bold uppercase text-yellow-500">{label}</p><p className="mt-1 text-lg font-black text-yellow-100">{value || "-"}</p></div>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div><p className="text-[9px] font-bold uppercase text-slate-500 lg:hidden">{label}</p><p className="text-lg font-black">{value}</p></div>; }
