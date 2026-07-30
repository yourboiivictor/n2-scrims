"use client";

import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

type Standing = { squadId: string; rank: number; squadName: string; logoUrl: string; matchesPlayed: number; chickenDinners: number; totalKills: number; placementPoints: number; totalPoints: number; };
type ArchivedMatch = { id: string; matchNumber: number; status: string; squadCount: number; };

export default function ArchiveDetailsPage() {
  const params = useParams<{ archiveId: string }>();
  const archiveId = params.archiveId;
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Tournament Archive");
  const [season, setSeason] = useState("");
  const [champion, setChampion] = useState("No champion");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<ArchivedMatch[]>([]);
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setAuthLoading(false); }), []);
  useEffect(() => {
    if (!isAdmin || !archiveId) { setLoading(false); return; }
    void (async () => {
      const archiveSnapshot = await getDoc(doc(db, "tournamentArchives", archiveId));
      if (archiveSnapshot.exists()) {
        const data = archiveSnapshot.data();
        setTitle(typeof data.tournamentName === "string" ? data.tournamentName : "Tournament Archive");
        setSeason(typeof data.season === "string" ? data.season : "");
        setChampion(typeof data.championName === "string" ? data.championName : "No champion");
      }
      const [standingsSnapshot, matchesSnapshot] = await Promise.all([
        getDocs(query(collection(db, "tournamentArchives", archiveId, "standings"), orderBy("rank", "asc"))),
        getDocs(query(collection(db, "tournamentArchives", archiveId, "matches"), orderBy("matchNumber", "asc"))),
      ]);
      setStandings(standingsSnapshot.docs.map((standingDocument) => ({ squadId: standingDocument.id, ...(standingDocument.data() as Omit<Standing, "squadId">) })));
      setMatches(matchesSnapshot.docs.map((matchDocument) => ({ id: matchDocument.id, matchNumber: Number(matchDocument.data().matchNumber) || 0, status: typeof matchDocument.data().status === "string" ? matchDocument.data().status : "finalized", squadCount: Number(matchDocument.data().squadCount) || 0 })));
      setLoading(false);
    })();
  }, [isAdmin, archiveId]);

  if (authLoading) return <main className="min-h-screen bg-slate-950 p-6 text-white">Checking admin account...</main>;
  if (!user || !isAdmin) return <main className="min-h-screen bg-slate-950 p-6 text-white">Admin access required.</main>;

  return <main className="min-h-screen bg-slate-950 px-4 py-5 text-white"><div className="mx-auto max-w-[1500px]"><header className="rounded-2xl border border-white/10 bg-slate-900 p-5"><Link href="/admin/archive" className="text-sm font-black text-violet-400">← Tournament Archive</Link><h1 className="mt-3 text-3xl font-black">{title}</h1><p className="mt-1 text-sm text-slate-400">{season ? `Season ${season} · ` : ""}Champion: <strong className="text-white">{champion}</strong></p></header>{loading ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">Loading archive...</div> : <><section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900"><div className="grid grid-cols-[70px_minmax(200px,1fr)_100px_130px_110px_140px_120px] border-b border-white/10 bg-black/30 px-4 py-3 text-[10px] font-black uppercase text-slate-500"><div>Rank</div><div>Squad</div><div>Matches</div><div>Chicken Dinners</div><div>Kills</div><div>Placement Pts</div><div>Total</div></div>{standings.map((standing) => <div key={standing.squadId} className="grid grid-cols-[70px_minmax(200px,1fr)_100px_130px_110px_140px_120px] items-center border-b border-white/5 px-4 py-3 last:border-b-0"><div className="font-black text-violet-400">#{standing.rank}</div><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">{standing.logoUrl ? <img src={standing.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : "🏆"}</div><span className="font-black">{standing.squadName}</span></div><div>{standing.matchesPlayed}</div><div>{standing.chickenDinners}</div><div>{standing.totalKills}</div><div>{standing.placementPoints}</div><div className="text-xl font-black text-violet-400">{standing.totalPoints}</div></div>)}</section><section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{matches.map((match) => <article key={match.id} className="rounded-2xl border border-white/10 bg-slate-900 p-5"><p className="text-xs font-black uppercase text-violet-400">Archived Match</p><h2 className="mt-1 text-2xl font-black">Match {match.matchNumber}</h2><p className="mt-1 text-sm text-slate-400">{match.squadCount} squads · {match.status}</p><Link href={`/admin/archive/${archiveId}/matches/${match.id}`} className="mt-4 block rounded-lg bg-violet-600 px-4 py-2.5 text-center text-sm font-black">View Results</Link></article>)}</section></>}</div></main>;
}
