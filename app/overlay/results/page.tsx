"use client";

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";

type LiveMatchSettings = {
  matchNumber: number;
  status: "not-started" | "live" | "finalized";
  map?: string;
  duration?: string;
};

type TournamentSettings = {
  name: string;
  season?: string;
  eventName?: string;
  matchesPlanned: number;
  prizeFirst?: string;
  prizeSecond?: string;
  prizeThird?: string;
  prizeMvp?: string;
  matchSchedule?: Array<{
    id: string;
    map: string;
    startTime: string;
  }>;
};

type ResultPlayer = {
  name: string;
  kills: number;
};

type MatchResult = {
  squadId: string;
  squadName: string;
  logoUrl: string;
  placement: number;
  totalKills: number;
  totalPoints: number;
  players: ResultPlayer[];
};

type Standing = {
  squadId: string;
  squadName: string;
  logoUrl: string;
  totalKills: number;
  totalPoints: number;
};

const defaultTournament: TournamentSettings = {
  name: "N² Scrims",
  season: "Season 1",
  eventName: "Event 1",
  matchesPlanned: 1,
  prizeFirst: "",
  prizeSecond: "",
  prizeThird: "",
  prizeMvp: "",
  matchSchedule: [],
};

export default function ResultsOverlayPage() {
  const [liveMatch, setLiveMatch] = useState<LiveMatchSettings>({
    matchNumber: 1,
    status: "not-started",
  });

  const [tournament, setTournament] =
    useState<TournamentSettings>(defaultTournament);

  const [results, setResults] = useState<MatchResult[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "liveMatch"),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setLiveMatch({
          matchNumber: Number(data.matchNumber) || 1,
          status:
            data.status === "live" || data.status === "finalized"
              ? data.status
              : "not-started",
          map: typeof data.map === "string" ? data.map : "",
          duration:
            typeof data.duration === "string" ? data.duration : "",
        });
      },
      (error) => {
        console.error("Unable to load live match:", error);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "tournament"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setTournament(defaultTournament);
          return;
        }

        const data = snapshot.data();

        setTournament({
          ...defaultTournament,
          ...(data as Partial<TournamentSettings>),
          matchSchedule: Array.isArray(data.matchSchedule)
            ? data.matchSchedule
            : [],
        });
      },
      (error) => {
        console.error("Unable to load tournament settings:", error);
      },
    );
  }, []);

  useEffect(() => {
    const matchId = `match-${liveMatch.matchNumber}`;

    return onSnapshot(
      collection(db, "matches", matchId, "results"),
      (snapshot) => {
        const loaded: MatchResult[] = snapshot.docs.map((resultDocument) => {
          const data = resultDocument.data();

          const players: ResultPlayer[] = Array.isArray(data.players)
            ? data.players.map((player: unknown, index: number) => {
                const value =
                  player && typeof player === "object"
                    ? (player as Record<string, unknown>)
                    : {};

                return {
                  name:
                    typeof value.name === "string"
                      ? value.name
                      : `Player ${index + 1}`,
                  kills: Number(value.kills) || 0,
                };
              })
            : [];

          return {
            squadId: resultDocument.id,
            squadName:
              typeof data.squadName === "string"
                ? data.squadName
                : "Unnamed Squad",
            logoUrl:
              typeof data.logoUrl === "string" ? data.logoUrl : "",
            placement: Number(data.placement) || 0,
            totalKills: Number(data.totalKills) || 0,
            totalPoints: Number(data.totalPoints) || 0,
            players,
          };
        });

        loaded.sort((a, b) => {
          if (a.placement && b.placement) {
            return a.placement - b.placement;
          }

          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }

          return b.totalKills - a.totalKills;
        });

        setResults(loaded);
      },
      (error) => {
        console.error("Unable to load match results:", error);
      },
    );
  }, [liveMatch.matchNumber]);

  useEffect(() => {
    const standingsQuery = query(
      collection(db, "standings"),
      orderBy("totalPoints", "desc"),
    );

    return onSnapshot(
      standingsQuery,
      (snapshot) => {
        const loaded: Standing[] = snapshot.docs.map((standingDocument) => {
          const data = standingDocument.data();

          return {
            squadId: standingDocument.id,
            squadName:
              typeof data.squadName === "string"
                ? data.squadName
                : "Unnamed Squad",
            logoUrl:
              typeof data.logoUrl === "string" ? data.logoUrl : "",
            totalKills: Number(data.totalKills) || 0,
            totalPoints: Number(data.totalPoints) || 0,
          };
        });

        loaded.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }

          if (b.totalKills !== a.totalKills) {
            return b.totalKills - a.totalKills;
          }

          return a.squadName.localeCompare(b.squadName);
        });

        setStandings(loaded);
      },
      (error) => {
        console.error("Unable to load standings:", error);
      },
    );
  }, []);

  const currentMap =
    liveMatch.map ||
    tournament.matchSchedule?.[liveMatch.matchNumber - 1]?.map ||
    "Map not set";

  const podium = results.slice(0, 3);
  const topTen = standings.slice(0, 10);

  const highestKillTeam = useMemo(() => {
    if (!results.length) return null;

    return [...results].sort((a, b) => {
      if (b.totalKills !== a.totalKills) {
        return b.totalKills - a.totalKills;
      }

      return b.totalPoints - a.totalPoints;
    })[0];
  }, [results]);

  const mvp = useMemo(() => {
    const allPlayers = results.flatMap((team) =>
      team.players.map((player) => ({
        ...player,
        squadName: team.squadName,
        logoUrl: team.logoUrl,
      })),
    );

    if (!allPlayers.length) return null;

    return allPlayers.sort((a, b) => b.kills - a.kills)[0];
  }, [results]);

  const totalKills = useMemo(
    () =>
      results.reduce(
        (sum, result) => sum + result.totalKills,
        0,
      ),
    [results],
  );

  const prizeItems = [
    { label: "1ST", value: tournament.prizeFirst },
    { label: "2ND", value: tournament.prizeSecond },
    { label: "3RD", value: tournament.prizeThird },
    { label: "MVP", value: tournament.prizeMvp },
  ].filter((item) => item.value?.trim());

  return (
    <main className="min-h-screen overflow-hidden bg-[#02050b] p-6 text-white">
      <style jsx global>{`
        @keyframes results-enter {
          from {
            opacity: 0;
            transform: scale(0.97);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes podium-rise {
          from {
            opacity: 0;
            transform: translateY(35px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .results-enter {
          animation: results-enter 0.55s ease-out both;
        }

        .podium-rise {
          animation: podium-rise 0.7s ease-out both;
        }
      `}</style>

      <div className="results-enter mx-auto max-w-[1900px]">
        <header className="relative overflow-hidden border border-cyan-400/20 bg-[#07101d] px-7 py-6 shadow-[0_0_65px_rgba(0,174,255,0.16)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,174,255,0.22),transparent_40%)]" />
          <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-yellow-400 via-cyan-400 to-blue-700" />

          <div className="relative flex items-end justify-between gap-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.34em] text-yellow-400">
                {tournament.name}
              </p>

              <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
                {[tournament.season, tournament.eventName]
                  .filter(Boolean)
                  .join(" • ")}
              </p>

              <h1 className="mt-3 text-6xl font-black uppercase italic leading-none">
                Match {liveMatch.matchNumber} Results
              </h1>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <HeaderStat label="Map" value={currentMap} />
              <HeaderStat
                label="Match Kills"
                value={String(totalKills)}
              />
              <HeaderStat
                label="Duration"
                value={liveMatch.duration || "—"}
              />
            </div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-[minmax(0,1.25fr)_minmax(520px,0.75fr)] gap-5">
          <div className="space-y-5">
            <section className="border border-white/10 bg-[#07101d] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">
                    Match Podium
                  </p>
                  <h2 className="mt-1 text-3xl font-black uppercase italic">
                    Top 3 Teams
                  </h2>
                </div>

                <span className="text-4xl">🏆</span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-4">
                {podium.length === 0 ? (
                  <div className="col-span-3 border border-white/10 bg-white/5 p-12 text-center text-lg font-bold text-slate-400">
                    Waiting for finalized match results...
                  </div>
                ) : (
                  podium.map((result, index) => (
                    <PodiumCard
                      key={result.squadId}
                      result={result}
                      rank={index + 1}
                      delay={index * 120}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="grid grid-cols-3 gap-4">
              <HighlightCard
                icon="🔥"
                title="Highest Kill Team"
                primary={highestKillTeam?.squadName || "—"}
                secondary={
                  highestKillTeam
                    ? `${highestKillTeam.totalKills} KILLS`
                    : "NO DATA"
                }
                logoUrl={highestKillTeam?.logoUrl}
              />

              <HighlightCard
                icon="👑"
                title="Match MVP"
                primary={mvp?.name || "—"}
                secondary={
                  mvp
                    ? `${mvp.kills} KILLS • ${mvp.squadName}`
                    : "NO PLAYER DATA"
                }
                logoUrl={mvp?.logoUrl}
              />

              <HighlightCard
                icon="💀"
                title="Match Statistics"
                primary={`${totalKills} KILLS`}
                secondary={`${results.length} SQUADS`}
              />
            </section>

            {prizeItems.length > 0 && (
              <section className="border border-white/10 bg-[#07101d] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.26em] text-yellow-400">
                  Prize Pool
                </p>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  {prizeItems.map((item) => (
                    <div
                      key={item.label}
                      className="border border-white/10 bg-white/5 px-4 py-4 text-center"
                    >
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 truncate text-2xl font-black text-yellow-300">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="border border-white/10 bg-[#07101d] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">
              Overall Tournament
            </p>
            <h2 className="mt-1 text-3xl font-black uppercase italic">
              Top 10 Standings
            </h2>

            <div className="mt-5 grid grid-cols-[42px_42px_minmax(0,1fr)_58px_64px] gap-2 border-b border-white/10 px-2 pb-2 text-[8px] font-black uppercase tracking-[0.14em] text-yellow-300">
              <span>Rank</span>
              <span />
              <span>Team</span>
              <span className="text-center">Kills</span>
              <span className="text-center">Total</span>
            </div>

            <div className="mt-2 space-y-2">
              {topTen.length === 0 ? (
                <div className="border border-white/10 bg-white/5 p-10 text-center font-bold text-slate-400">
                  Waiting for standings...
                </div>
              ) : (
                topTen.map((standing, index) => (
                  <StandingRow
                    key={standing.squadId}
                    standing={standing}
                    rank={index + 1}
                  />
                ))
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function HeaderStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[130px] border border-white/10 bg-black/20 px-4 py-3 text-right">
      <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-black uppercase text-cyan-300">
        {value}
      </p>
    </div>
  );
}

function PodiumCard({
  result,
  rank,
  delay,
}: {
  result: MatchResult;
  rank: number;
  delay: number;
}) {
  const style =
    rank === 1
      ? "border-yellow-400/45 bg-yellow-400/10 shadow-[0_0_30px_rgba(250,204,21,0.12)]"
      : rank === 2
        ? "border-slate-300/30 bg-slate-300/5"
        : "border-amber-700/30 bg-amber-700/5";

  return (
    <article
      className={`podium-rise border p-5 text-center ${style}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden border border-white/10 bg-black/30">
        {result.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.logoUrl}
            alt=""
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="text-[9px] font-black text-slate-600">
            LOGO
          </span>
        )}
      </div>

      <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
        #{rank}
      </p>

      <h3 className="mt-1 truncate text-2xl font-black uppercase">
        {result.squadName}
      </h3>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="bg-black/25 p-3">
          <p className="text-[8px] font-black uppercase text-slate-500">
            Kills
          </p>
          <p className="mt-1 text-3xl font-black">
            {result.totalKills}
          </p>
        </div>

        <div className="bg-black/25 p-3">
          <p className="text-[8px] font-black uppercase text-slate-500">
            Points
          </p>
          <p className="mt-1 text-3xl font-black text-yellow-300">
            {result.totalPoints}
          </p>
        </div>
      </div>
    </article>
  );
}

function HighlightCard({
  icon,
  title,
  primary,
  secondary,
  logoUrl,
}: {
  icon: string;
  title: string;
  primary: string;
  secondary: string;
  logoUrl?: string;
}) {
  return (
    <article className="border border-white/10 bg-[#07101d] p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-4xl">{icon}</span>

        {logoUrl && (
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden border border-white/10 bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt=""
              className="h-full w-full object-contain p-1"
            />
          </div>
        )}
      </div>

      <p className="mt-5 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
        {title}
      </p>
      <p className="mt-1 truncate text-2xl font-black uppercase">
        {primary}
      </p>
      <p className="mt-1 truncate text-sm font-black uppercase text-yellow-300">
        {secondary}
      </p>
    </article>
  );
}

function StandingRow({
  standing,
  rank,
}: {
  standing: Standing;
  rank: number;
}) {
  const rankStyle =
    rank === 1
      ? "bg-yellow-400 text-black"
      : rank === 2
        ? "bg-slate-200 text-black"
        : rank === 3
          ? "bg-amber-700 text-white"
          : "bg-cyan-600/20 text-cyan-300";

  return (
    <div
      className={`grid grid-cols-[42px_42px_minmax(0,1fr)_58px_64px] items-center gap-2 border px-2 py-2.5 ${
        rank === 1
          ? "border-yellow-400/35 bg-yellow-400/10"
          : "border-white/5 bg-[#0a1220]"
      }`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center text-sm font-black ${rankStyle}`}
      >
        {rank}
      </div>

      <div className="flex h-9 w-9 items-center justify-center overflow-hidden border border-white/10 bg-black/30">
        {standing.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={standing.logoUrl}
            alt=""
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <span className="text-[6px] font-black text-slate-600">
            LOGO
          </span>
        )}
      </div>

      <p className="truncate text-sm font-black uppercase">
        {standing.squadName}
      </p>

      <p className="text-center text-sm font-black">
        {standing.totalKills}
      </p>

      <p className="text-center text-lg font-black text-yellow-300">
        {standing.totalPoints}
      </p>
    </div>
  );
}
