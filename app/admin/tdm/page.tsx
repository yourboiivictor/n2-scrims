"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { auth, db, googleProvider } from "@/firebase";

const OWNER_EMAIL = "victornicetry2@gmail.com";

type TdmPlayer = {
  id: string;
  name: string;
  createdAt?: Timestamp | null;
};

type MatchStatus = "upcoming" | "live" | "finished";

type TdmMatch = {
  matchNumber: number;
  round: "TDM";
  player1: string;
  player2: string;
  status: MatchStatus;
  score1: number | null;
  score2: number | null;
  winner: string;
  forfeitedBy?: string;
};

type PlayerStats = {
  player: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildAutomaticMatches(players: TdmPlayer[], existing: TdmMatch[]) {
  const finishedOrLive = existing.filter(
    (match) => match.status === "finished" || match.status === "live",
  );

  const lockedNames = new Set(
    finishedOrLive.flatMap((match) => [
      normalizeName(match.player1),
      normalizeName(match.player2),
    ]),
  );

  const availablePlayers = players.filter(
    (player) => !lockedNames.has(normalizeName(player.name)),
  );

  const upcomingExisting = existing
    .filter((match) => match.status === "upcoming")
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const nextMatches: TdmMatch[] = [...finishedOrLive];

  let nextMatchNumber =
    Math.max(0, ...finishedOrLive.map((match) => match.matchNumber)) + 1;

  for (let index = 0; index + 1 < availablePlayers.length; index += 2) {
    const previous = upcomingExisting[Math.floor(index / 2)];

    nextMatches.push({
      matchNumber: previous?.matchNumber || nextMatchNumber,
      round: "TDM",
      player1: availablePlayers[index].name,
      player2: availablePlayers[index + 1].name,
      status: "upcoming",
      score1: null,
      score2: null,
      winner: "",
      forfeitedBy: "",
    });

    if (!previous) nextMatchNumber += 1;
  }

  return nextMatches.sort((a, b) => a.matchNumber - b.matchNumber);
}

function matchDocId(matchNumber: number) {
  return `match-${String(matchNumber).padStart(2, "0")}`;
}

function isPlaceholder(name: string) {
  return name.toLowerCase().startsWith("winner match");
}

function buildOverallStats(matches: TdmMatch[]) {
  const stats = new Map<string, PlayerStats>();

  function getPlayer(name: string) {
    if (!stats.has(name)) {
      stats.set(name, {
        player: name,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
      });
    }
    return stats.get(name)!;
  }

  matches
    .filter(
      (match) =>
        match.status === "finished" &&
        match.score1 !== null &&
        match.score2 !== null,
    )
    .forEach((match) => {
      const p1 = getPlayer(match.player1);
      const p2 = getPlayer(match.player2);
      const score1 = match.score1 || 0;
      const score2 = match.score2 || 0;

      p1.played += 1;
      p2.played += 1;
      p1.pointsFor += score1;
      p1.pointsAgainst += score2;
      p2.pointsFor += score2;
      p2.pointsAgainst += score1;

      if (match.winner === match.player1) {
        p1.wins += 1;
        p2.losses += 1;
      } else if (match.winner === match.player2) {
        p2.wins += 1;
        p1.losses += 1;
      }
    });

  return [...stats.values()]
    .map((row) => ({
      ...row,
      diff: row.pointsFor - row.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.diff !== a.diff) return b.diff - a.diff;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.player.localeCompare(b.player);
    });
}

export default function TdmAdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [players, setPlayers] = useState<TdmPlayer[]>([]);
  const [matches, setMatches] = useState<TdmMatch[]>([]);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<TdmPlayer | null>(null);
  const [editingPlayerName, setEditingPlayerName] = useState("");
  const [savingPlayerEdit, setSavingPlayerEdit] = useState(false);
  const [message, setMessage] = useState("");
  const [activeMatch, setActiveMatch] = useState<number | null>(null);
  const [score1, setScore1] = useState("");
  const [score2, setScore2] = useState("");
  const [savingResult, setSavingResult] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  const isAdmin = isOwner || hasAdminAccess;

  const liveMatch = useMemo(
    () => matches.find((match) => match.matchNumber === activeMatch) || null,
    [matches, activeMatch],
  );
  const nextMatch = useMemo(
    () => matches.find((match) => match.status !== "finished") || null,
    [matches],
  );
  const overallStats = useMemo(() => buildOverallStats(matches), [matches]);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkStaffAccess() {
      if (!user?.email) {
        setHasAdminAccess(false);
        setStaffLoading(false);
        return;
      }

      if (user.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
        setHasAdminAccess(true);
        setStaffLoading(false);
        return;
      }

      try {
        setStaffLoading(true);
        const snapshot = await getDoc(doc(db, "staff", user.email.toLowerCase()));
        if (!cancelled) {
          const data = snapshot.data();
          setHasAdminAccess(
            snapshot.exists() && data?.active === true && data?.role === "admin",
          );
        }
      } catch (error) {
        console.error("Unable to verify staff access:", error);
        if (!cancelled) setHasAdminAccess(false);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    }

    void checkStaffAccess();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;

    return onSnapshot(
      query(collection(db, "tdmMatches"), orderBy("matchNumber", "asc")),
      (snapshot) => {
        if (snapshot.empty) {
          setMatches([]);
          return;
        }

        setMatches(
          snapshot.docs.map((matchDocument) => {
            const data = matchDocument.data();
            return {
              matchNumber: Number(data.matchNumber) || 0,
              round: "TDM",
              player1: typeof data.player1 === "string" ? data.player1 : "TBD",
              player2: typeof data.player2 === "string" ? data.player2 : "TBD",
              status:
                data.status === "live" || data.status === "finished"
                  ? data.status
                  : "upcoming",
              score1: typeof data.score1 === "number" ? data.score1 : null,
              score2: typeof data.score2 === "number" ? data.score2 : null,
              winner: typeof data.winner === "string" ? data.winner : "",
              forfeitedBy:
                typeof data.forfeitedBy === "string"
                  ? data.forfeitedBy
                  : "",
            } satisfies TdmMatch;
          }),
        );
      },
      (error) => {
        console.error("Unable to load TDM matches:", error);
        setMatches([]);
        setMessage(
          "Unable to load TDM matches. Check the TDM Firestore rules.",
        );
      },
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    return onSnapshot(doc(db, "tdmOverlay", "state"), (snapshot) => {
      const data = snapshot.data();
      setActiveMatch(typeof data?.activeMatch === "number" ? data.activeMatch : null);
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    return onSnapshot(
      query(collection(db, "tdmPlayers"), orderBy("createdAt", "asc")),
      (snapshot) => {
        setPlayers(
          snapshot.docs.map((playerDocument) => {
            const data = playerDocument.data();
            return {
              id: playerDocument.id,
              name: typeof data.name === "string" ? data.name : "Unnamed Player",
              createdAt: data.createdAt || null,
            };
          }),
        );
      },
      (error) => {
        console.error("Unable to load TDM players:", error);
        setMessage("Unable to load TDM players.");
      },
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeMatch !== null) return;

    const desired = buildAutomaticMatches(players, matches);

    const currentSignature = JSON.stringify(
      matches.map((match) => ({
        n: match.matchNumber,
        p1: match.player1,
        p2: match.player2,
        s: match.status,
        w: match.winner,
        f: match.forfeitedBy || "",
      })),
    );

    const desiredSignature = JSON.stringify(
      desired.map((match) => ({
        n: match.matchNumber,
        p1: match.player1,
        p2: match.player2,
        s: match.status,
        w: match.winner,
        f: match.forfeitedBy || "",
      })),
    );

    if (currentSignature === desiredSignature) return;

    async function syncAutomaticMatches() {
      try {
        const snapshot = await getDocs(collection(db, "tdmMatches"));
        const batch = writeBatch(db);

        snapshot.docs.forEach((matchDocument) => {
          const data = matchDocument.data();
          if (data.status === "upcoming") {
            batch.delete(matchDocument.ref);
          }
        });

        desired
          .filter((match) => match.status === "upcoming")
          .forEach((match) => {
            batch.set(
              doc(db, "tdmMatches", matchDocId(match.matchNumber)),
              match,
              { merge: true },
            );
          });

        await batch.commit();
      } catch (error) {
        console.error("Unable to sync automatic TDM matches:", error);
      }
    }

    void syncAutomaticMatches();
  }, [isAdmin, players, matches, activeMatch]);

  async function startNextMatch() {
    if (!nextMatch || activeMatch !== null) return;


    setMessage("");
    setScore1("");
    setScore2("");

    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, "tdmMatches", matchDocId(nextMatch.matchNumber)),
        { status: "live", startedAt: serverTimestamp() },
        { merge: true },
      );
      batch.set(
        doc(db, "tdmOverlay", "state"),
        {
          activeMatch: nextMatch.matchNumber,
          finalMatch: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
      setMessage(`Match ${nextMatch.matchNumber} is live on the TDM overlay.`);
    } catch (error) {
      console.error("Unable to start match:", error);
      setMessage("Unable to start the next match.");
    }
  }

  async function saveFinalResult() {
    if (!liveMatch || savingResult) return;

    const first = Number.parseInt(score1, 10);
    const second = Number.parseInt(score2, 10);

    if (!Number.isInteger(first) || !Number.isInteger(second) || first < 0 || second < 0) {
      setMessage("Enter valid final scores for both players.");
      return;
    }

    if (first === second) {
      setMessage("A TDM match cannot be finalized as a tie. Enter the final winning score.");
      return;
    }

    const winner = first > second ? liveMatch.player1 : liveMatch.player2;
    const completed = matches
      .filter((match) => match.status === "finished")
      .map((match) => match.matchNumber);
    const completedMatches = Array.from(new Set([...completed, liveMatch.matchNumber])).sort((a, b) => a - b);

    setSavingResult(true);
    setMessage("");

    try {
      const batch = writeBatch(db);

      batch.set(
        doc(db, "tdmMatches", matchDocId(liveMatch.matchNumber)),
        {
          status: "finished",
          score1: first,
          score2: second,
          winner,
          finishedAt: serverTimestamp(),
        },
        { merge: true },
      );


      batch.set(
        doc(db, "tdmOverlay", "state"),
        {
          activeMatch: null,
          finalMatch: liveMatch.matchNumber,
          completedMatches,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await batch.commit();
      setScore1("");
      setScore2("");
      setMessage(
        `Match ${liveMatch.matchNumber} final saved: ${liveMatch.player1} ${first} - ${second} ${liveMatch.player2}. Winner: ${winner}.`,
      );
    } catch (error) {
      console.error("Unable to save final result:", error);
      setMessage("Unable to save the final result.");
    } finally {
      setSavingResult(false);
    }
  }

  async function resetTournament() {
    if (resetting) return;
    if (!window.confirm("Reset all TDM match results and automatic match progress?")) return;
    if (!window.confirm("FINAL WARNING: This clears every saved TDM score and winner. The match queue will rebuild from the current player list. Continue?")) return;

    setResetting(true);
    setMessage("");

    try {
      const snapshot = await getDocs(collection(db, "tdmMatches"));
      const batch = writeBatch(db);

      snapshot.docs.forEach((matchDocument) => {
        batch.delete(matchDocument.ref);
      });

      batch.set(
        doc(db, "tdmOverlay", "state"),
        {
          activeMatch: null,
          finalMatch: null,
          completedMatches: [],
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await batch.commit();
      setMessage("TDM match history was reset. Upcoming matches will rebuild automatically from the current player list.");
    } catch (error) {
      console.error("Unable to reset TDM:", error);
      setMessage("Unable to reset the TDM tournament.");
    } finally {
      setResetting(false);
    }
  }

  async function addPlayer(event: FormEvent) {
    event.preventDefault();
    const cleanName = playerName.trim();
    if (!cleanName || saving) return;

    if (players.some((player) => player.name.toLowerCase() === cleanName.toLowerCase())) {
      setMessage("That player is already in the TDM player list.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await addDoc(collection(db, "tdmPlayers"), {
        name: cleanName,
        createdAt: serverTimestamp(),
        createdBy: user?.email || "admin",
      });
      setPlayerName("");
      setShowAddPlayer(false);
      setMessage(`${cleanName} added to TDM.`);
    } catch (error) {
      console.error("Unable to add TDM player:", error);
      setMessage(
        "Unable to add player. Firestore is blocking writes to tdmPlayers. Update the TDM Firestore rules, then try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openEditPlayer(player: TdmPlayer) {
    setEditingPlayer(player);
    setEditingPlayerName(player.name);
    setMessage("");
  }

  async function savePlayerEdit(event: FormEvent) {
    event.preventDefault();

    if (!editingPlayer || savingPlayerEdit) return;

    const cleanName = editingPlayerName.trim();

    if (!cleanName) {
      setMessage("Player name cannot be empty.");
      return;
    }

    if (
      players.some(
        (player) =>
          player.id !== editingPlayer.id &&
          player.name.toLowerCase() === cleanName.toLowerCase(),
      )
    ) {
      setMessage("That player name is already in the TDM roster.");
      return;
    }

    const oldName = editingPlayer.name;
    setSavingPlayerEdit(true);
    setMessage("");

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "tdmPlayers", editingPlayer.id), {
        name: cleanName,
        updatedAt: serverTimestamp(),
      });

      matches.forEach((match) => {
        const updates: Record<string, unknown> = {};

        if (match.player1 === oldName) updates.player1 = cleanName;
        if (match.player2 === oldName) updates.player2 = cleanName;
        if (match.winner === oldName) updates.winner = cleanName;

        if (Object.keys(updates).length > 0) {
          batch.set(
            doc(db, "tdmMatches", matchDocId(match.matchNumber)),
            updates,
            { merge: true },
          );
        }
      });

      await batch.commit();

      setEditingPlayer(null);
      setEditingPlayerName("");
      setMessage(`${oldName} was updated to ${cleanName}.`);
    } catch (error) {
      console.error("Unable to edit TDM player:", error);
      setMessage(
        "Unable to edit player. Check Firestore write access for tdmPlayers and tdmMatches.",
      );
    } finally {
      setSavingPlayerEdit(false);
    }
  }

  async function removePlayer(player: TdmPlayer) {
    if (!window.confirm(`Remove ${player.name} from the TDM player list?`)) return;

    setDeletingId(player.id);
    setMessage("");

    try {
      await deleteDoc(doc(db, "tdmPlayers", player.id));
      setMessage(`${player.name} removed from TDM.`);
    } catch (error) {
      console.error("Unable to remove TDM player:", error);
      setMessage("Unable to remove player.");
    } finally {
      setDeletingId(null);
    }
  }

  if (authLoading || staffLoading) {
    return <main className="min-h-screen bg-black p-6 text-white">Checking admin access...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50">N² Scrims</p>
          <h1 className="mt-3 text-3xl font-black uppercase">TDM Admin</h1>
          <button
            type="button"
            onClick={() => void signInWithPopup(auth, googleProvider)}
            className="mt-7 w-full rounded-xl bg-white px-5 py-3 font-black text-black"
          >
            Sign In With Google
          </button>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-red-500/30 bg-neutral-950 p-8 text-center">
          <h1 className="text-3xl font-black text-red-400">Access Denied</h1>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="mt-6 rounded-xl bg-white px-5 py-3 font-black text-black"
          >
            Sign Out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-3xl border border-white/10 bg-neutral-950 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link href="/admin" className="text-sm font-black text-white/60 hover:text-white">
                ← Admin Dashboard
              </Link>
              <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-white/45">N² Scrims</p>
              <h1 className="mt-2 text-4xl font-black uppercase">TDM Tournament</h1>
              <p className="mt-2 text-sm text-white/55">Automatic match control, final results, player management, and overall TDM records.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/overlay/tdm"
                target="_blank"
                className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-black uppercase text-white hover:bg-white/15"
              >
                Open Overlay
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowAddPlayer(true);
                  setMessage("");
                }}
                className="rounded-xl bg-white px-6 py-3 text-sm font-black uppercase text-black hover:bg-neutral-200"
              >
                + Add Player
              </button>
              <button
                type="button"
                onClick={() => void resetTournament()}
                disabled={resetting}
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-6 py-3 text-sm font-black uppercase text-red-200 disabled:opacity-40"
              >
                {resetting ? "Resetting..." : "Reset Tournament"}
              </button>
            </div>
          </div>

          {message && (
            <div className="mt-5 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
              {message}
            </div>
          )}
        </header>

        <section className="mt-6 rounded-3xl border border-white/10 bg-neutral-950 p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">Live Match Control</p>

          {liveMatch ? (
            <div className="mt-4 grid gap-5 xl:grid-cols-[1fr_420px]">
              <div className="rounded-2xl border border-white/10 bg-black p-6">
                <p className="text-sm font-black uppercase tracking-widest text-white/45">Match {liveMatch.matchNumber} · Live</p>
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-2xl font-black">{liveMatch.player1}</div>
                  <span className="font-black text-white/40">VS</span>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-2xl font-black">{liveMatch.player2}</div>
                </div>
                <p className="mt-4 text-center text-sm text-white/45">Watch the live score on the spectator screen. Enter only the final score here.</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black p-5">
                <h2 className="text-xl font-black uppercase">Enter Final Result</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-black text-white/55">{liveMatch.player1}</span>
                    <input
                      type="number"
                      min={0}
                      value={score1}
                      onChange={(event) => setScore1(event.target.value)}
                      className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-neutral-950 px-4 text-center text-2xl font-black outline-none focus:border-white"
                      placeholder="0"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-white/55">{liveMatch.player2}</span>
                    <input
                      type="number"
                      min={0}
                      value={score2}
                      onChange={(event) => setScore2(event.target.value)}
                      className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-neutral-950 px-4 text-center text-2xl font-black outline-none focus:border-white"
                      placeholder="0"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void saveFinalResult()}
                  disabled={savingResult || !score1 || !score2}
                  className="mt-4 w-full rounded-xl bg-white px-5 py-3 font-black uppercase text-black disabled:opacity-40"
                >
                  {savingResult ? "Saving Final..." : "Confirm Final Result"}
                </button>
              </div>
            </div>
          ) : nextMatch ? (
            <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-white/45">Up Next · Match {nextMatch.matchNumber}</p>
                <h2 className="mt-2 text-2xl font-black">{nextMatch.player1} <span className="text-white/35">vs</span> {nextMatch.player2}</h2>
              </div>
              <button
                type="button"
                onClick={() => void startNextMatch()}
                className="rounded-xl bg-white px-7 py-4 text-sm font-black uppercase text-black"
              >
                Start Match {nextMatch.matchNumber}
              </button>
            </div>
          ) : players.length < 2 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black p-6 text-center">
              <h2 className="text-2xl font-black uppercase">Add Players</h2>
              <p className="mt-2 text-sm text-white/45">
                Add at least 2 players. Matches are created automatically in roster order.
              </p>
            </div>
          ) : matches.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black p-6 text-center">
              <h2 className="text-2xl font-black uppercase">Building Match Queue</h2>
              <p className="mt-2 text-sm text-white/45">
                The next matchup is being created automatically.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black p-6 text-center">
              <h2 className="text-2xl font-black uppercase">No Match Waiting</h2>
              <p className="mt-2 text-sm text-white/45">
                Add more players and the next matchup will be created automatically.
              </p>
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-neutral-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/45">Roster</p>
                  <h2 className="mt-1 text-2xl font-black">TDM Players</h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-black">{players.length}</span>
              </div>

              <div className="mt-4 space-y-2">
                {players.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/45">
                    No added players yet. Use Add Player.
                  </div>
                ) : (
                  players.map((player, index) => (
                    <div key={player.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white font-black text-black">{index + 1}</div>
                      <span className="min-w-0 flex-1 truncate font-black">{player.name}</span>
                      <button
                        type="button"
                        onClick={() => openEditPlayer(player)}
                        disabled={deletingId === player.id}
                        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-white disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removePlayer(player)}
                        disabled={deletingId === player.id}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-red-300 disabled:opacity-40"
                      >
                        {deletingId === player.id ? "..." : "Remove"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-neutral-950 p-5">
              <p className="text-xs font-black uppercase tracking-widest text-white/45">Overall</p>
              <h2 className="mt-1 text-2xl font-black">TDM Stats</h2>
              <div className="mt-4 space-y-2">
                {overallStats.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-white/40">Finalized matches will build the overall records here.</p>
                ) : (
                  overallStats.map((row, index) => (
                    <div key={row.player} className="rounded-xl border border-white/10 bg-black p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-black">#{index + 1} {row.player}</span>
                        <span className="shrink-0 text-sm font-black">{row.wins}-{row.losses}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/45">PF {row.pointsFor} · PA {row.pointsAgainst} · DIFF {row.diff > 0 ? "+" : ""}{row.diff}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-neutral-950 p-5">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
                Automatic Match Queue
              </p>
              <h2 className="mt-1 text-2xl font-black uppercase">
                Matches
              </h2>
              <p className="mt-2 text-sm text-white/45">
                Players are paired automatically in roster order. Add or edit player names and upcoming matches update automatically. Finished match history stays saved.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {matches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/45 md:col-span-2">
                    Add at least 2 players to create the first matchup.
                  </div>
                ) : (
                  matches.map((match) => (
                    <article
                      key={match.matchNumber}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-black"
                    >
                      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-wider text-white/55">
                        <span>Match {match.matchNumber}</span>
                        <span>{match.status}</span>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5">
                        <p className={`text-right font-black ${match.winner === match.player1 ? "text-white" : match.status === "finished" ? "text-white/40" : ""}`}>
                          {match.player1}
                        </p>
                        <span className="rounded-full border border-white/15 px-2 py-1 text-[10px] font-black text-white/45">
                          VS
                        </span>
                        <p className={`font-black ${match.winner === match.player2 ? "text-white" : match.status === "finished" ? "text-white/40" : ""}`}>
                          {match.player2}
                        </p>
                      </div>

                      {match.status === "finished" && (
                        <div className="border-t border-white/10 px-4 py-3 text-center text-sm font-black">
                          {match.forfeitedBy
                            ? `FORFEIT · ${match.forfeitedBy} · Winner: ${match.winner}`
                            : match.score1 !== null && match.score2 !== null
                              ? `FINAL · ${match.score1} - ${match.score2} · Winner: ${match.winner}`
                              : `FINAL · Winner: ${match.winner}`}
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          </section>
        </section>
      </div>

      {editingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <form
            onSubmit={savePlayerEdit}
            className="w-full max-w-lg rounded-3xl border border-white/15 bg-neutral-950 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
                  TDM Roster
                </p>
                <h2 className="mt-2 text-3xl font-black">Edit Player</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!savingPlayerEdit) setEditingPlayer(null);
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-black"
              >
                Close
              </button>
            </div>

            <label className="mt-6 block text-sm font-black text-white/70">
              Player Name
            </label>

            <input
              autoFocus
              value={editingPlayerName}
              onChange={(event) => setEditingPlayerName(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black px-4 font-bold outline-none focus:border-white"
            />

            <p className="mt-3 text-xs text-white/45">
              This keeps saved scores and match history while updating exact name references in the bracket.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEditingPlayer(null)}
                disabled={savingPlayerEdit}
                className="rounded-xl border border-white/10 px-5 py-3 font-black disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingPlayerEdit || !editingPlayerName.trim()}
                className="rounded-xl bg-white px-5 py-3 font-black text-black disabled:opacity-40"
              >
                {savingPlayerEdit ? "Saving..." : "Save Name"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <form onSubmit={addPlayer} className="w-full max-w-lg rounded-3xl border border-white/15 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">TDM Roster</p>
                <h2 className="mt-2 text-3xl font-black">Add Player</h2>
              </div>
              <button type="button" onClick={() => setShowAddPlayer(false)} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-black">Close</button>
            </div>

            <label className="mt-6 block text-sm font-black text-white/70">Player Name</label>
            <input
              autoFocus
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="N² | PLAYER"
              className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black px-4 font-bold outline-none focus:border-white"
            />

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setShowAddPlayer(false)} disabled={saving} className="rounded-xl border border-white/10 px-5 py-3 font-black disabled:opacity-40">Cancel</button>
              <button type="submit" disabled={saving || !playerName.trim()} className="rounded-xl bg-white px-5 py-3 font-black text-black disabled:opacity-40">{saving ? "Adding..." : "Add Player"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
