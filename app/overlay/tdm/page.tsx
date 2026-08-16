"use client";

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { db } from "@/firebase";

type MatchStatus = "upcoming" | "live" | "finished";

type TdmMatch = {
  matchNumber: number;
  round: "Play-In Round" | "Round of 16";
  player1: string;
  player2: string;
  status: MatchStatus;
  score1: number | null;
  score2: number | null;
  winner: string;
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
    .filter((match) => match.status === "finished" && match.score1 !== null && match.score2 !== null)
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

  return [...stats.values()].map((row) => ({
    ...row,
    diff: row.pointsFor - row.pointsAgainst,
  }));
}

export default function TdmOverlayPage() {
  const [matches, setMatches] = useState<TdmMatch[]>([]);
  const [activeMatch, setActiveMatch] = useState<number | null>(null);
  const [finalMatch, setFinalMatch] = useState<number | null>(null);
  const [showFinalMatch, setShowFinalMatch] = useState<number | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "tdmMatches"), orderBy("matchNumber", "asc")),
      (snapshot) => {
        setMatches(
          snapshot.docs.map((matchDocument) => {
            const data = matchDocument.data();
            return {
              matchNumber: Number(data.matchNumber) || 0,
              round: data.round === "Play-In Round" ? "Play-In Round" : "Round of 16",
              player1: typeof data.player1 === "string" ? data.player1 : "TBD",
              player2: typeof data.player2 === "string" ? data.player2 : "TBD",
              status: data.status === "live" || data.status === "finished" ? data.status : "upcoming",
              score1: typeof data.score1 === "number" ? data.score1 : null,
              score2: typeof data.score2 === "number" ? data.score2 : null,
              winner: typeof data.winner === "string" ? data.winner : "",
            } satisfies TdmMatch;
          }),
        );
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, "tdmOverlay", "state"), (snapshot) => {
      const data = snapshot.data();
      setActiveMatch(typeof data?.activeMatch === "number" ? data.activeMatch : null);
      setFinalMatch(typeof data?.finalMatch === "number" ? data.finalMatch : null);
    });
  }, []);

  useEffect(() => {
    if (finalMatch === null || activeMatch !== null) {
      setShowFinalMatch(null);
      return;
    }

    setShowFinalMatch(finalMatch);
    const timer = window.setTimeout(() => setShowFinalMatch(null), 8000);
    return () => window.clearTimeout(timer);
  }, [finalMatch, activeMatch]);

  const liveMatch = useMemo(
    () => matches.find((match) => match.matchNumber === activeMatch) || null,
    [matches, activeMatch],
  );
  const finalResult = useMemo(
    () => matches.find((match) => match.matchNumber === showFinalMatch) || null,
    [matches, showFinalMatch],
  );
  const overall = useMemo(() => buildOverallStats(matches), [matches]);

  const finalPlayer1Stats = finalResult
    ? overall.find((row) => row.player === finalResult.player1) || null
    : null;
  const finalPlayer2Stats = finalResult
    ? overall.find((row) => row.player === finalResult.player2) || null
    : null;

  const overviewVisible = !liveMatch && !finalResult;

  return (
    <main className="tdm-stage">
      <style jsx global>{`
        html,
        body {
          margin: 0 !important;
          width: 1080px !important;
          height: 1920px !important;
          background: transparent !important;
          overflow: hidden !important;
        }

        .tdm-stage {
          width: 1080px;
          height: 1920px;
          position: relative;
          overflow: hidden;
          background: transparent;
          color: white;
          font-family: Arial, Helvetica, sans-serif;
        }

        .tdm-panel {
          background: rgba(0, 0, 0, 0.50);
          border: 2px solid rgba(255, 255, 255, 0.92);
          box-shadow: 0 14px 44px rgba(0, 0, 0, 0.28);
        }

        .tdm-card {
          background: rgba(0, 0, 0, 0.50);
          border: 1px solid rgba(255, 255, 255, 0.50);
        }
      `}</style>

      <div
        className={`absolute inset-0 transition-all duration-700 ease-in-out ${
          overviewVisible
            ? "scale-100 opacity-100"
            : "scale-[1.55] opacity-0 pointer-events-none"
        }`}
      >
        <header className="mx-10 mt-12 rounded-3xl tdm-panel px-8 py-6 text-center">
          <p className="text-lg font-black uppercase tracking-[0.42em] text-white/60">N² Scrims</p>
          <h1 className="mt-2 text-6xl font-black uppercase italic">TDM Tournament</h1>
          <p className="mt-2 text-base font-black uppercase tracking-[0.28em] text-white/50">Live Bracket</p>
        </header>

        <div className="mx-10 mt-7 space-y-6">
          <BracketGroup title="Play-In Round" matches={matches.filter((match) => match.round === "Play-In Round")} />
          <BracketGroup title="Round of 16" matches={matches.filter((match) => match.round === "Round of 16")} />
        </div>
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${
          liveMatch
            ? "scale-100 opacity-100"
            : "scale-75 opacity-0 pointer-events-none"
        }`}
      >
        {liveMatch && (
          <section className="mx-10 w-[1000px] rounded-[40px] tdm-panel px-12 py-16 text-center">
            <p className="text-xl font-black uppercase tracking-[0.42em] text-white/55">N² Scrims · TDM</p>
            <div className="mx-auto mt-7 inline-block border-y-2 border-white px-10 py-3 text-4xl font-black uppercase">Match {liveMatch.matchNumber}</div>

            <div className="mt-20 grid grid-cols-[1fr_120px_1fr] items-center gap-5">
              <div className="tdm-card flex min-h-[270px] items-center justify-center rounded-3xl p-8 text-5xl font-black uppercase leading-tight">{liveMatch.player1}</div>
              <div className="text-6xl font-black italic">VS</div>
              <div className="tdm-card flex min-h-[270px] items-center justify-center rounded-3xl p-8 text-5xl font-black uppercase leading-tight">{liveMatch.player2}</div>
            </div>

            <div className="mt-16 border-t border-white/50 pt-8 text-2xl font-black uppercase tracking-[0.3em] text-white/75">Match In Progress</div>
            <p className="mt-4 text-sm font-bold uppercase tracking-[0.2em] text-white/40">Live score shown on spectator screen</p>
          </section>
        )}
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
          finalResult
            ? "scale-100 opacity-100"
            : "scale-90 opacity-0 pointer-events-none"
        }`}
      >
        {finalResult && (
          <section className="mx-10 w-[1000px] rounded-[40px] tdm-panel px-12 py-14 text-center">
            <p className="text-xl font-black uppercase tracking-[0.42em] text-white/55">N² Scrims · TDM</p>
            <p className="mt-6 text-3xl font-black uppercase tracking-[0.18em]">Match {finalResult.matchNumber} · Final</p>

            <div className="mt-14 grid grid-cols-[1fr_110px_1fr] items-center gap-5">
              <FinalPlayerCard
                name={finalResult.player1}
                score={finalResult.score1}
                winner={finalResult.winner === finalResult.player1}
                stats={finalPlayer1Stats}
              />
              <div className="text-4xl font-black text-white/45">FINAL</div>
              <FinalPlayerCard
                name={finalResult.player2}
                score={finalResult.score2}
                winner={finalResult.winner === finalResult.player2}
                stats={finalPlayer2Stats}
              />
            </div>

            <div className="mt-12 rounded-2xl border border-white/35 bg-black/50 px-8 py-6">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-white/45">Winner</p>
              <p className="mt-2 text-5xl font-black uppercase">{finalResult.winner}</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function FinalPlayerCard({
  name,
  score,
  winner,
  stats,
}: {
  name: string;
  score: number | null;
  winner: boolean;
  stats: PlayerStats | null;
}) {
  return (
    <div className={`tdm-card rounded-3xl p-8 ${winner ? "opacity-100" : "opacity-60"}`}>
      <p className="min-h-[110px] text-4xl font-black uppercase leading-tight">{name}</p>
      <p className="mt-5 text-8xl font-black">{score ?? 0}</p>
      <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-white/50">
        {winner ? "Winner" : "Final"}
      </p>
      {stats && (
        <p className="mt-4 text-sm font-bold uppercase text-white/45">
          Overall {stats.wins}-{stats.losses} · PF {stats.pointsFor} · PA {stats.pointsAgainst}
        </p>
      )}
    </div>
  );
}

function BracketGroup({
  title,
  matches,
}: {
  title: string;
  matches: TdmMatch[];
}) {
  return (
    <section className="rounded-3xl tdm-panel p-5">
      <div className="mb-4 flex items-center justify-between border-b border-white/35 pb-3">
        <h2 className="text-3xl font-black uppercase italic">{title}</h2>
        <span className="text-xs font-black uppercase tracking-[0.28em] text-white/45">TDM</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {matches.map((match) => (
          <div
            key={match.matchNumber}
            className={`tdm-card rounded-2xl p-4 ${match.status === "finished" ? "opacity-55" : "opacity-100"}`}
          >
            <div className="mb-3 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.16em] text-white/50">
              <span>Match {match.matchNumber}</span>
              <span>{match.status}</span>
            </div>
            <div className="grid grid-cols-[1fr_34px_1fr] items-center gap-2 text-center text-sm font-black">
              <span className={match.winner === match.player1 ? "text-white" : ""}>{match.player1}</span>
              <span className="text-white/35">VS</span>
              <span className={match.winner === match.player2 ? "text-white" : ""}>{match.player2}</span>
            </div>
            {match.status === "finished" && match.score1 !== null && match.score2 !== null && (
              <div className="mt-3 border-t border-white/15 pt-2 text-center text-sm font-black">FINAL {match.score1} - {match.score2}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
