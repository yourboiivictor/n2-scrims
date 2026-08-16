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
  round: string;
  roundIndex: number;
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
    .filter((match) => match.status === "finished")
    .forEach((match) => {
      const p1 = getPlayer(match.player1);
      const p2 = getPlayer(match.player2);
      const score1 = match.score1 || 0;
      const score2 = match.score2 || 0;

      p1.played += 1;
      p2.played += 1;
      if (match.score1 !== null && match.score2 !== null) {
        p1.pointsFor += score1;
        p1.pointsAgainst += score2;
        p2.pointsFor += score2;
        p2.pointsAgainst += score1;
      }

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
              round:
                typeof data.round === "string" && data.round !== "TDM"
                  ? data.round
                  : "Round 1",
              roundIndex:
                typeof data.roundIndex === "number"
                  ? data.roundIndex
                  : 1,
              player1:
                typeof data.player1 === "string"
                  ? data.player1
                  : "TBD",
              player2:
                typeof data.player2 === "string"
                  ? data.player2
                  : "TBD",
              status:
                data.status === "live" || data.status === "finished"
                  ? data.status
                  : "upcoming",
              score1:
                typeof data.score1 === "number"
                  ? data.score1
                  : null,
              score2:
                typeof data.score2 === "number"
                  ? data.score2
                  : null,
              winner:
                typeof data.winner === "string"
                  ? data.winner
                  : "",
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
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      doc(db, "tdmOverlay", "state"),
      (snapshot) => {
        const data = snapshot.data();

        setActiveMatch(
          typeof data?.activeMatch === "number"
            ? data.activeMatch
            : null,
        );

        setFinalMatch(
          typeof data?.finalMatch === "number"
            ? data.finalMatch
            : null,
        );
      },
      (error) => {
        console.error("Unable to load TDM overlay state:", error);
      },
    );
  }, []);

  useEffect(() => {
    if (finalMatch === null || activeMatch !== null) {
      setShowFinalMatch(null);
      return;
    }

    setShowFinalMatch(finalMatch);

    const timer = window.setTimeout(() => {
      setShowFinalMatch(null);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [finalMatch, activeMatch]);

  const liveMatch = useMemo(
    () =>
      matches.find(
        (match) => match.matchNumber === activeMatch,
      ) || null,
    [matches, activeMatch],
  );

  const finalResult = useMemo(
    () =>
      matches.find(
        (match) => match.matchNumber === showFinalMatch,
      ) || null,
    [matches, showFinalMatch],
  );

  const overall = useMemo(
    () => buildOverallStats(matches),
    [matches],
  );

  const finalPlayer1Stats = finalResult
    ? overall.find(
        (row) => row.player === finalResult.player1,
      ) || null
    : null;

  const finalPlayer2Stats = finalResult
    ? overall.find(
        (row) => row.player === finalResult.player2,
      ) || null
    : null;

  const overviewVisible = !liveMatch && !finalResult;

  const roundGroups = useMemo(() => {
    const grouped = new Map<number, TdmMatch[]>();
    matches.forEach((match) => {
      const key = match.roundIndex || 1;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(match);
    });
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([roundIndex, roundMatches]) => ({
        roundIndex,
        title: roundMatches[0]?.round || `Round ${roundIndex}`,
        matches: roundMatches.sort((a, b) => a.matchNumber - b.matchNumber),
      }));
  }, [matches]);

  const champion = useMemo(() => {
    if (roundGroups.length === 0) return "";
    const latest = roundGroups[roundGroups.length - 1];
    if (latest.matches.length === 1 && latest.matches[0].status === "finished") {
      return latest.matches[0].winner;
    }
    return "";
  }, [roundGroups]);

  return (
    <main className="tdm-stage">
      <style jsx global>{`
        html,
        body,
        #__next {
          margin: 0 !important;
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          background: transparent !important;
          overflow: hidden !important;
        }

        body {
          position: relative;
        }

        .tdm-stage {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: transparent;
          color: white;
          font-family: Arial, Helvetica, sans-serif;
          pointer-events: none;
        }

        .tdm-safe {
          position: absolute;
          inset: 2.5vh 2.5vw;
        }

        .tdm-panel {
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 18px 52px rgba(0, 0, 0, 0.32);
          backdrop-filter: blur(2px);
        }

        .tdm-card {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.42);
        }

        .tdm-dim {
          color: rgba(255, 255, 255, 0.52);
        }
      `}</style>

      <div
        className={`tdm-safe transition-all duration-700 ease-in-out ${
          overviewVisible
            ? "scale-100 opacity-100"
            : "scale-[1.08] opacity-0"
        }`}
      >
        <div className="mx-auto flex h-full max-w-[1840px] flex-col justify-center gap-3">
          <header className="tdm-panel rounded-[24px] px-6 py-3 text-center">
            <p className="text-[13px] font-black uppercase tracking-[0.42em] text-white/55">
              N² Scrims
            </p>
            <h1 className="mt-1 text-[32px] font-black uppercase italic leading-none">
              TDM Tournament
            </h1>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.32em] text-white/45">
              Live Bracket
            </p>
          </header>

          <div
            className="grid min-h-0 flex-1 gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, Math.min(roundGroups.length, 4))}, minmax(0, 1fr))`,
            }}
          >
            {roundGroups.map((group) => (
              <BracketGroup
                key={group.roundIndex}
                title={group.title}
                matches={group.matches}
              />
            ))}
          </div>

          {champion && (
            <div className="tdm-panel rounded-[24px] px-8 py-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">TDM Champion</p>
              <p className="mt-1 text-[28px] font-black uppercase">{champion}</p>
            </div>
          )}
        </div>
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${
          liveMatch
            ? "scale-100 opacity-100"
            : "scale-[0.88] opacity-0"
        }`}
      >
        {liveMatch && (
          <section className="tdm-panel w-[min(72vw,1080px)] rounded-[34px] px-[clamp(28px,3vw,54px)] py-[clamp(28px,4vh,50px)] text-center">
            <p className="text-[clamp(11px,0.8vw,16px)] font-black uppercase tracking-[0.42em] text-white/55">
              N² Scrims · TDM
            </p>

            <div className="mx-auto mt-5 inline-block border-y-2 border-white px-10 py-2 text-[clamp(24px,2vw,36px)] font-black uppercase">
              Match {liveMatch.matchNumber}
            </div>

            <div className="mt-10 grid grid-cols-[1fr_90px_1fr] items-center gap-4">
              <div className="tdm-card flex min-h-[170px] items-center justify-center rounded-3xl p-6 text-[clamp(24px,2.2vw,40px)] font-black uppercase leading-tight">
                {liveMatch.player1}
              </div>

              <div className="text-[clamp(34px,3vw,54px)] font-black italic">
                VS
              </div>

              <div className="tdm-card flex min-h-[170px] items-center justify-center rounded-3xl p-6 text-[clamp(24px,2.2vw,40px)] font-black uppercase leading-tight">
                {liveMatch.player2}
              </div>
            </div>

            <div className="mt-9 border-t border-white/45 pt-6 text-[clamp(15px,1.2vw,22px)] font-black uppercase tracking-[0.3em] text-white/75">
              Match In Progress
            </div>

            <p className="mt-3 text-[clamp(9px,0.65vw,12px)] font-bold uppercase tracking-[0.2em] text-white/40">
              Live score shown on spectator screen
            </p>
          </section>
        )}
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
          finalResult
            ? "scale-100 opacity-100"
            : "scale-[0.92] opacity-0"
        }`}
      >
        {finalResult && (
          <section className="tdm-panel w-[min(76vw,1160px)] rounded-[34px] px-[clamp(28px,3vw,54px)] py-[clamp(28px,4vh,48px)] text-center">
            <p className="text-[clamp(11px,0.8vw,16px)] font-black uppercase tracking-[0.42em] text-white/55">
              N² Scrims · TDM
            </p>

            <p className="mt-4 text-[clamp(22px,1.8vw,32px)] font-black uppercase tracking-[0.18em]">
              Match {finalResult.matchNumber} · Final
            </p>

            <div className="mt-9 grid grid-cols-[1fr_110px_1fr] items-center gap-4">
              <FinalPlayerCard
                name={finalResult.player1}
                score={finalResult.score1}
                winner={
                  finalResult.winner === finalResult.player1
                }
                stats={finalPlayer1Stats}
                forfeited={finalResult.forfeitedBy === finalResult.player1}
              />

              <div className="text-[clamp(22px,1.6vw,30px)] font-black text-white/45">
                {finalResult.forfeitedBy ? "FORFEIT" : "FINAL"}
              </div>

              <FinalPlayerCard
                name={finalResult.player2}
                score={finalResult.score2}
                winner={
                  finalResult.winner === finalResult.player2
                }
                stats={finalPlayer2Stats}
                forfeited={finalResult.forfeitedBy === finalResult.player2}
              />
            </div>

            <div className="mt-8 rounded-2xl border border-white/35 bg-black/50 px-8 py-5">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45">
                Winner
              </p>
              <p className="mt-2 text-[clamp(30px,2.7vw,48px)] font-black uppercase">
                {finalResult.winner}
              </p>
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
  forfeited,
}: {
  name: string;
  score: number | null;
  winner: boolean;
  stats: PlayerStats | null;
  forfeited: boolean;
}) {
  return (
    <div
      className={`tdm-card rounded-3xl p-6 ${
        winner ? "opacity-100" : "opacity-60"
      }`}
    >
      <p className="min-h-[72px] text-[clamp(22px,1.8vw,32px)] font-black uppercase leading-tight">
        {name}
      </p>

      <p className="mt-3 text-[clamp(58px,5vw,88px)] font-black leading-none">
        {forfeited ? "—" : score ?? 0}
      </p>

      <p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
        {forfeited ? "Forfeit" : winner ? "Winner" : "Final"}
      </p>

      {stats && (
        <p className="mt-3 text-[10px] font-bold uppercase text-white/45">
          Overall {stats.wins}-{stats.losses} · PF{" "}
          {stats.pointsFor} · PA {stats.pointsAgainst}
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
    <section className="tdm-panel min-h-0 rounded-[22px] p-3">
      <div className="mb-2 flex items-center justify-between border-b border-white/35 pb-2">
        <h2 className="text-[20px] font-black uppercase italic">
          {title}
        </h2>
        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">
          TDM
        </span>
      </div>

      <div className="grid gap-2">
        {matches.map((match) => (
          <div
            key={match.matchNumber}
            className={`tdm-card rounded-xl p-2.5 ${
              match.status === "finished"
                ? "opacity-55"
                : "opacity-100"
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.16em] text-white/50">
              <span>Match {match.matchNumber}</span>
              <span>{match.status}</span>
            </div>

            <div className="grid grid-cols-[1fr_42px_1fr] items-center gap-1.5 text-center text-[12px] font-black">
              <span
                className={
                  match.winner === match.player1
                    ? "text-white"
                    : ""
                }
              >
                {match.player1}
              </span>

              <span className="text-white/35">VS</span>

              <span
                className={
                  match.winner === match.player2
                    ? "text-white"
                    : ""
                }
              >
                {match.player2}
              </span>
            </div>

            {match.status === "finished" && (
              <div className="mt-1.5 border-t border-white/15 pt-1.5 text-center text-[10px] font-black">
                {match.forfeitedBy
                  ? `FORFEIT · ${match.forfeitedBy}`
                  : match.score1 !== null && match.score2 !== null
                    ? `FINAL ${match.score1} - ${match.score2}`
                    : "FINAL"}
              </div>
            )}
          </div>
        ))}

        {matches.length === 0 && (
          <div className="tdm-card rounded-2xl p-8 text-center text-sm font-bold text-white/40">
            Waiting for bracket data...
          </div>
        )}
      </div>
    </section>
  );
}
