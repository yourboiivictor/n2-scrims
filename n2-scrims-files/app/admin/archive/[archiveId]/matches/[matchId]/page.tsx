"use client";

import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/firebase";

const ADMIN_EMAIL = "victornicetry2@gmail.com";
type Result = { squadId: string; squadName: string; logoUrl: string; slot: number; placement: number | null; totalKills: number; placementPoints: number; totalPoints: number; players: Array<{ name: string; kills: number }>; };

export default function ArchivedMatchPage() {
  const params = useParams<{ archiveId: string; matchId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [matchNumber, setMatchNumber] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const ranked = useMemo(() => [...results].sort((a, b) => b.totalPoints - a.totalPoints || (a.placement || 999) - (b.placement || 999) || b.totalKills - a.totalKills), [results]);

  useEffect(() => onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setAuthLoading(false); }), []);
  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    void (async () => {
      const matchSnapshot = await getDoc(doc(db, "tournamentArchives", params.archiveId, "matches", params.matchId));
      if (matchSnapshot.exists()) setMatchNumber(Number(matchSnapshot.data().matchNumber) || 0);
      const snapshot = await getDocs(query(collection(db, "tournamentArchives", params.archiveId, "matches", params.matchId, "results"), orderBy("slot", "asc")));
      setResults(snapshot.docs.map((resultDocument) => { const data = resultDocument.data(); return { squadId: resultDocument.id, squadName: typeof data.squadName === "string" ? data.squadName : "Unnamed Squad", logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : "", slot: Number(data.slot) || 0, placement: Number(data.placement) || null, totalKills: Number(data.totalKills) || 0, placementPoints: Number(data.placementPoints) || 0, totalPoints: Number(data.totalPoints) || 0, players: Array.isArray(data.players) ? data.players : [] }; }));
      setLoading(false);
    })();
  }, [isAdmin, params.archiveId, params.matchId]);

  if (authLoading) return <main className="min-h-screen bg-slate-950 p-6 text-white">Checking admin account...</main>;
  if (!user || !isAdmin) return <main className="min-h-screen bg-slate-950 p-6 text-white">Admin access required.</main>;
  return <main className="min-h-screen bg-slate-950 px-4 py-5 text-white"><div className="mx-auto max-w-[1600px]"><header className="rounded-2xl border border-white/10 bg-slate-900 p-5"><Link href={`/admin/archive/${params.archiveId}`} className="text-sm font-black text-violet-400">← Back to Archive</Link><h1 className="mt-3 text-3xl font-black">Archived Match {matchNumber} Results</h1></header>{loading ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">Loading results...</div> : <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900"><div className="grid grid-cols-[70px_90px_220px_500px_110px_120px_140px_120px] border-b border-white/10 bg-black/30 px-4 py-3 text-[10px] font-black uppercase text-slate-500"><div>Rank</div><div>Slot</div><div>Squad</div><div>Players</div><div>Kills</div><div>Placement</div><div>Placement Pts</div><div>Total</div></div>{ranked.map((result, index) => <div key={result.squadId} className="grid grid-cols-[70px_90px_220px_500px_110px_120px_140px_120px] items-center border-b border-white/5 px-4 py-3 last:border-b-0"><div className="font-black text-violet-400">#{index + 1}</div><div>#{result.slot}</div><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">{result.logoUrl ? <img src={result.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : "LOGO"}</div><span className="truncate font-black">{result.squadName}</span></div><div className="grid grid-cols-2 gap-2">{result.players.slice(0, 4).map((player, playerIndex) => <div key={playerIndex} className="flex justify-between rounded-lg bg-black/20 px-3 py-2 text-xs"><span>{player.name}</span><strong>{player.kills}</strong></div>)}</div><div className="font-black text-yellow-400">{result.totalKills}</div><div>{result.placement ? `#${result.placement}` : "-"}</div><div>{result.placementPoints}</div><div className="text-xl font-black text-violet-400">{result.totalPoints}</div></div>)}</section>}</div></main>;
}
