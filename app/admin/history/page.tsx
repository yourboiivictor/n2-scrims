"use client";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db, googleProvider } from "@/firebase";
import {
  archiveAndResetTournament,
  deleteActiveMatch,
  saveTournamentSettings,
} from "@/lib/tournamentAdmin";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

type MatchResult = {
  squadId: string;
  squadName: string;
  logoUrl?: string;
  placement?: number;
  totalKills?: number;
  totalPoints?: number;
};

type MatchHistoryItem = {
  id: string;
  matchNumber: number;
  status: string;
  squadCount: number;
  winnerName: string;
  winnerLogoUrl: string;
  winnerKills: number;
  winnerPoints: number;
  finalizedAt: Date | null;
};

function getTimestampDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  return null;
}

function formatDate(date: Date | null) {
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function AdminHistoryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [tournamentName, setTournamentName] = useState("New Tournament");
  const [season, setSeason] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [nextTournamentName, setNextTournamentName] = useState("New Tournament");
  const [nextSeason, setNextSeason] = useState("");
  const [resetting, setResetting] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const filteredMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return matches;
    return matches.filter((match) =>
      `match ${match.matchNumber}`.includes(term) ||
      match.winnerName.toLowerCase().includes(term) ||
      match.status.toLowerCase().includes(term),
    );
  }, [matches, search]);

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const unsubscribeMatches = onSnapshot(
      query(collection(db, "matches"), orderBy("matchNumber", "desc")),
      async (snapshot) => {
        try {
          const items = await Promise.all(snapshot.docs.map(async (matchDocument) => {
            const matchData = matchDocument.data();
            const resultsSnapshot = await getDocs(collection(db, "matches", matchDocument.id, "results"));
            const results: MatchResult[] = resultsSnapshot.docs.map((resultDocument) => ({
              squadId: resultDocument.id,
              ...(resultDocument.data() as Omit<MatchResult, "squadId">),
            }));
            results.sort((a, b) => {
              const pointDifference = (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0);
              if (pointDifference !== 0) return pointDifference;
              const placementDifference = (Number(a.placement) || 999) - (Number(b.placement) || 999);
              if (placementDifference !== 0) return placementDifference;
              return (Number(b.totalKills) || 0) - (Number(a.totalKills) || 0);
            });
            const winner = results[0];
            return {
              id: matchDocument.id,
              matchNumber: Number(matchData.matchNumber) || Number(matchDocument.id.replace("match-", "")) || 0,
              status: typeof matchData.status === "string" ? matchData.status : "finalized",
              squadCount: Number(matchData.squadCount) || results.length,
              winnerName: winner?.squadName || "No winner available",
              winnerLogoUrl: winner?.logoUrl || "",
              winnerKills: Number(winner?.totalKills) || 0,
              winnerPoints: Number(winner?.totalPoints) || 0,
              finalizedAt: getTimestampDate(matchData.finalizedAt),
            };
          }));
          setMatches(items.sort((a, b) => b.matchNumber - a.matchNumber));
          setLoading(false);
        } catch (error) {
          console.error(error);
          setMessage("Unable to load match history.");
          setLoading(false);
        }
      },
      (error) => {
        console.error(error);
        setMessage("Unable to load match history.");
        setLoading(false);
      },
    );

    const unsubscribeTournament = onSnapshot(doc(db, "settings", "tournament"), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setTournamentName(typeof data.name === "string" ? data.name : "New Tournament");
      setSeason(typeof data.season === "string" ? data.season : "");
    });

    return () => {
      unsubscribeMatches();
      unsubscribeTournament();
    };
  }, [isAdmin]);

  const signIn = async () => {
    try {
      const provider = googleProvider instanceof GoogleAuthProvider ? googleProvider : new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      setMessage("Unable to sign in with Google.");
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setMessage("");
    try {
      await saveTournamentSettings(tournamentName, season);
      setMessage("Tournament settings saved.");
    } catch (error) {
      console.error(error);
      setMessage("Unable to save tournament settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDelete = async (match: MatchHistoryItem) => {
    if (!window.confirm(`Permanently delete Match ${match.matchNumber}? Tournament standings will be recalculated.`)) return;
    setDeletingId(match.id);
    setMessage("");
    try {
      await deleteActiveMatch(match.id);
      setMessage(`Match ${match.matchNumber} deleted and standings recalculated.`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to delete this match.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchiveReset = async () => {
    if (!window.confirm(`Archive ${tournamentName} and reset the live tournament to Match 1?`)) return;
    setResetting(true);
    setMessage("");
    try {
      const archiveId = await archiveAndResetTournament({ nextTournamentName, nextSeason });
      setShowReset(false);
      setMessage(`Tournament archived successfully. New tournament reset to Match 1. Archive ID: ${archiveId}`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Unable to archive and reset the tournament.");
    } finally {
      setResetting(false);
    }
  };

  if (authLoading) return <main className="min-h-screen bg-slate-950 p-6 text-white">Checking admin account...</main>;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-black">Match History</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in with the administrator account.</p>
          <button onClick={signIn} className="mt-6 w-full rounded-lg bg-white px-4 py-3 font-black text-black">Sign in with Google</button>
          {message && <p className="mt-3 text-sm text-red-400">{message}</p>}
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-black text-red-400">Access denied</h1>
          <button onClick={() => void signOut(auth)} className="mt-5 rounded-lg bg-white px-4 py-2 font-black text-black">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">N² Scrims Admin</p>
              <h1 className="mt-1 text-3xl font-black">Match History</h1>
              <p className="mt-1 text-sm text-slate-400">Delete matches, archive tournaments, and reset to Match 1.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/matches" className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-black">Live Score Dashboard</Link>
              <Link href="/admin/tournament" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black">Tournament Standings</Link>
              <Link href="/admin/archive" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black">Archive</Link>
              <button onClick={() => void signOut(auth)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black">Sign out</button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1fr_180px_auto_auto]">
            <input value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} placeholder="Tournament name" className="h-11 rounded-lg border border-white/10 bg-slate-950 px-4 text-sm outline-none focus:border-violet-400" />
            <input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="Season" className="h-11 rounded-lg border border-white/10 bg-slate-950 px-4 text-sm outline-none focus:border-violet-400" />
            <button onClick={() => void handleSaveSettings()} disabled={savingSettings} className="rounded-lg bg-white px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{savingSettings ? "Saving..." : "Save Settings"}</button>
            <button onClick={() => { setNextTournamentName("New Tournament"); setNextSeason(""); setShowReset(true); }} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-black">Archive & Reset</button>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Completed Matches" value={matches.length} />
              <Stat label="Latest Match" value={matches.length ? `#${matches[0].matchNumber}` : "-"} />
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search match or winner..." className="h-11 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-sm outline-none focus:border-violet-400 sm:max-w-sm" />
          </div>

          {message && <div className="mt-4 rounded-lg border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-100">{message}</div>}
        </header>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center text-slate-400">Loading match history...</div>
        ) : filteredMatches.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <h2 className="text-xl font-black">No finalized matches</h2>
            <p className="mt-2 text-sm text-slate-400">Finalized matches will appear here automatically.</p>
          </div>
        ) : (
          <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredMatches.map((match) => (
              <article key={match.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-3">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-violet-400">Match</p><h2 className="text-2xl font-black">Match {match.matchNumber}</h2></div>
                  <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-[10px] font-black uppercase text-green-300">{match.status}</span>
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Winner</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">{match.winnerLogoUrl ? <img src={match.winnerLogoUrl} alt={`${match.winnerName} logo`} className="h-full w-full object-contain p-1" /> : <span className="text-xl">🏆</span>}</div>
                    <div className="min-w-0"><p className="truncate text-lg font-black">{match.winnerName}</p><p className="text-xs text-slate-400">{match.winnerKills} kills · {match.winnerPoints} points</p></div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">Finalized {formatDate(match.finalizedAt)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link href={`/admin/history/${match.id}`} className="rounded-lg bg-violet-600 px-4 py-2.5 text-center text-sm font-black">View Results</Link>
                    <button onClick={() => void handleDelete(match)} disabled={deletingId === match.id} className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-black text-red-300 disabled:opacity-50">{deletingId === match.id ? "Deleting..." : "Delete Match"}</button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-2xl font-black">Archive & Reset Tournament</h2>
            <p className="mt-2 text-sm text-slate-400">The current tournament will be preserved in the archive. Active matches, live data, and standings will then reset to Match 1.</p>
            <div className="mt-5 space-y-3">
              <input value={nextTournamentName} onChange={(event) => setNextTournamentName(event.target.value)} placeholder="New tournament name" className="h-11 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-sm outline-none focus:border-violet-400" />
              <input value={nextSeason} onChange={(event) => setNextSeason(event.target.value)} placeholder="New season" className="h-11 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-sm outline-none focus:border-violet-400" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => setShowReset(false)} disabled={resetting} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-black">Cancel</button>
              <button onClick={() => void handleArchiveReset()} disabled={resetting || !nextTournamentName.trim()} className="rounded-lg bg-red-600 px-4 py-3 font-black disabled:opacity-50">{resetting ? "Archiving..." : "Archive & Reset"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}
