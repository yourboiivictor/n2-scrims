"use client";

import { collection, onSnapshot, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";

type PlayerStat = {
  name: string;
  kills?: number;
};

type Standing = {
  id: string;
  squadId?: string;
  squadName: string;
  logoUrl?: string;
  slot?: number;
  playerNames?: string[];
  playerKills?: number[];
  playerStats?: PlayerStat[];
  totalKills?: number;
  placementPoints?: number;
  totalPoints?: number;
  matchesPlayed?: number;
  wins?: number;
  isEliminated?: boolean;
  isLive?: boolean;
};

export default function StandingsPage() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSquadId, setExpandedSquadId] = useState<string | null>(null);

  useEffect(() => {
    const standingsQuery = query(collection(db, "standings"));

    const unsubscribe = onSnapshot(
      standingsQuery,
      (snapshot) => {
        const loaded = snapshot.docs.map((standingDocument) => ({
          id: standingDocument.id,
          ...(standingDocument.data() as Omit<Standing, "id">),
        }));

        setStandings(loaded);
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load standings:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const rankedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      const pointsDifference =
        (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0);

      if (pointsDifference !== 0) return pointsDifference;

      const killsDifference =
        (Number(b.totalKills) || 0) - (Number(a.totalKills) || 0);

      if (killsDifference !== 0) return killsDifference;

      return (a.squadName || "").localeCompare(b.squadName || "");
    });
  }, [standings]);

  function toggleStats(squadId: string) {
    setExpandedSquadId((current) => (current === squadId ? null : squadId));
  }

  return (
    <main
      className={`bg-slate-950 px-3 py-3 text-white md:px-5 ${
        expandedSquadId ? "min-h-screen overflow-y-auto" : "h-screen overflow-hidden"
      }`}
    >
      <div className="mx-auto flex min-h-full max-w-[1800px] flex-col">
        <header className="shrink-0 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-400 sm:text-xs">
            N² Scrims
          </p>

          <h1 className="mt-1 text-2xl font-black sm:text-3xl lg:text-4xl">
            Tournament Standings
          </h1>

          <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">
            Live standings update automatically.
          </p>
        </header>

        {loading ? (
          <div className="mt-3 flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-sm font-bold text-slate-300">
            Loading standings...
          </div>
        ) : rankedStandings.length === 0 ? (
          <div className="mt-3 flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-sm text-slate-400">
            Standings have not been published yet.
          </div>
        ) : (
          <section className="mt-3 grid min-h-0 flex-1 grid-cols-2 items-start gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {rankedStandings.map((standing, index) => {
              const rank = index + 1;
              const isExpanded = expandedSquadId === standing.id;
              const playerStats = getPlayerStats(standing);
              const totalKills = Number(standing.totalKills) || 0;
              const matchesPlayed = Number(standing.matchesPlayed) || 0;
              const wins = Number(standing.wins) || 0;
              const winPercentage =
                matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;

              return (
                <article
                  key={standing.id}
                  className={`relative overflow-hidden rounded-xl border p-2 shadow-lg transition ${
                    rank === 1
                      ? "border-yellow-500/70 bg-yellow-950/25"
                      : rank === 2
                        ? "border-slate-300/50 bg-slate-800/80"
                        : rank === 3
                          ? "border-amber-700/70 bg-amber-950/25"
                          : "border-white/10 bg-slate-900/95"
                  } ${
                    standing.isLive && standing.isEliminated
                      ? "opacity-45"
                      : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                        rank === 1
                          ? "bg-yellow-500 text-black"
                          : rank === 2
                            ? "bg-slate-300 text-black"
                            : rank === 3
                              ? "bg-amber-700 text-white"
                              : "bg-violet-700 text-white"
                      }`}
                    >
                      {rank}
                    </div>

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      {standing.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={standing.logoUrl}
                          alt={`${standing.squadName} logo`}
                          className="h-full w-full object-contain p-0.5"
                        />
                      ) : (
                        <span className="text-[7px] font-bold text-slate-500">
                          LOGO
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[11px] font-black leading-tight sm:text-xs"
                        title={standing.squadName}
                      >
                        {standing.squadName}
                      </p>

                      <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
                        Slot {standing.slot || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                    <ScoreBox label="Kills" value={totalKills} />
                    <ScoreBox
                      label="Place"
                      value={Number(standing.placementPoints) || 0}
                    />
                    <ScoreBox
                      label="Points"
                      value={Number(standing.totalPoints) || 0}
                      highlight
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleStats(standing.id)}
                    aria-expanded={isExpanded}
                    className="mt-2 w-full rounded-md border border-violet-500/30 bg-violet-950/30 px-2 py-1.5 text-[9px] font-black uppercase tracking-wide text-violet-300 transition hover:bg-violet-700 hover:text-white"
                  >
                    {isExpanded ? "Hide Stats ▲" : "Show Stats ▼"}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 border-t border-white/10 pt-2">
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <PercentBox
                          label="Kill %"
                          value={totalKills > 0 ? 100 : 0}
                        />
                        <PercentBox label="Win %" value={winPercentage} />
                        <ScoreBox label="Wins" value={wins} />
                      </div>

                      <div className="mt-2 space-y-1">
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">
                          Individual Kills
                        </p>

                        {playerStats.length > 0 ? (
                          playerStats.map((player, playerIndex) => {
                            const killPercentage =
                              totalKills > 0
                                ? (player.kills / totalKills) * 100
                                : 0;

                            return (
                              <div
                                key={`${standing.id}-${playerIndex}`}
                                className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-black/25 px-2 py-1.5"
                              >
                                <span
                                  className="min-w-0 truncate text-[9px] font-bold text-slate-200"
                                  title={player.name}
                                >
                                  {player.name}
                                </span>

                                <div className="shrink-0 text-right">
                                  <span className="text-[10px] font-black text-white">
                                    {player.kills}
                                  </span>
                                  <span className="ml-1 text-[8px] text-violet-300">
                                    {killPercentage.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="rounded-md bg-black/20 px-2 py-2 text-center text-[9px] text-slate-500">
                            Individual kill data unavailable.
                          </p>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1">
                        <MiniStat label="Matches" value={matchesPlayed} />
                        <MiniStat label="Total Kills" value={totalKills} />
                      </div>
                    </div>
                  )}

                  {standing.isLive && standing.isEliminated && (
                    <p className="mt-1 text-center text-[8px] font-black uppercase tracking-widest text-red-400">
                      Eliminated
                    </p>
                  )}

                  {rank <= 3 && (
                    <div className="pointer-events-none absolute right-1 top-0.5 text-sm">
                      {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function getPlayerStats(standing: Standing): { name: string; kills: number }[] {
  if (Array.isArray(standing.playerStats) && standing.playerStats.length > 0) {
    return standing.playerStats.map((player, index) => ({
      name: player?.name || `Player ${index + 1}`,
      kills: Number(player?.kills) || 0,
    }));
  }

  if (Array.isArray(standing.playerNames)) {
    return standing.playerNames.map((name, index) => ({
      name: name || `Player ${index + 1}`,
      kills: Number(standing.playerKills?.[index]) || 0,
    }));
  }

  return [];
}

function ScoreBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-white/5 bg-black/25 px-1 py-1">
      <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p
        className={`mt-0.5 text-xs font-black leading-none ${
          highlight ? "text-violet-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PercentBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/25 px-1 py-1">
      <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] font-black leading-none text-violet-300">
        {value.toFixed(1)}%
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/20 px-2 py-1.5 text-center">
      <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-[10px] font-black text-white">{value}</p>
    </div>
  );
}
