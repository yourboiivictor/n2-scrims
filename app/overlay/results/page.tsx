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
  countryCode?: string;
  countryName?: string;
  flagUrl?: string;
  totalKills: number;
  totalPoints: number;
};

const defaultTournament: TournamentSettings = {
  name: "N² Scrims",
  season: "Season 1",
  eventName: "Event 1",
  matchesPlanned: 1,
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
  const [squadCountries, setSquadCountries] = useState<
    Record<string, { countryCode: string; countryName: string; flagUrl: string }>
  >({});

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
    return onSnapshot(collection(db, "squads"), (snapshot) => {
      const countries: Record<
        string,
        { countryCode: string; countryName: string; flagUrl: string }
      > = {};

      snapshot.docs.forEach((squadDocument) => {
        const data = squadDocument.data();

        const country = {
          countryCode:
            typeof data.countryCode === "string" ? data.countryCode : "",
          countryName:
            typeof data.countryName === "string" ? data.countryName : "",
          flagUrl:
            typeof data.flagUrl === "string" ? data.flagUrl : "",
        };

        countries[squadDocument.id] = country;

        if (typeof data.squadName === "string" && data.squadName.trim()) {
          countries[`name:${normalizeSquadName(data.squadName)}`] = country;
        }
      });

      setSquadCountries(countries);
    });
  }, []);

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
            countryCode:
              typeof data.countryCode === "string" ? data.countryCode : "",
            countryName:
              typeof data.countryName === "string" ? data.countryName : "",
            flagUrl:
              typeof data.flagUrl === "string" ? data.flagUrl : "",
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

  return (
    <main className="h-screen overflow-hidden bg-white p-3 text-black">
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

      <div className="results-enter mx-auto grid h-full max-w-[1900px] grid-rows-[auto_minmax(0,1fr)]">
        <header
          className="relative overflow-hidden border border-black/20 bg-black px-6 py-4 shadow-[0_0_45px_rgba(0,0,0,0.08)]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.38), rgba(0,0,0,0.38)), url('/poly.png')",
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_40%)]" />
          <div className="absolute bottom-0 left-0 h-1 w-full bg-white" />

          <div className="relative flex items-end justify-between gap-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.34em] text-white">
                {tournament.name}
              </p>

              <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-neutral-300">
                {[tournament.season, tournament.eventName]
                  .filter(Boolean)
                  .join(" • ")}
              </p>

              <h1 className="mt-3 text-[clamp(2.35rem,3.1vw,4.5rem)] font-black uppercase italic leading-none text-white">
                Match {liveMatch.matchNumber} Results
              </h1>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <HeaderStat label="Map" value={currentMap} />
              <HeaderStat
                label="Match Kills"
                value={String(totalKills)}
              />
              <HeaderStat
                label="Duration"
                value={liveMatch.duration || "—"}
              />
              <HeaderStat
                label="Status"
                value={
                  liveMatch.status === "finalized"
                    ? "FINAL"
                    : liveMatch.status === "live"
                      ? "LIVE"
                      : "READY"
                }
              />
            </div>
          </div>
        </header>

        <section className="mt-3 grid min-h-0 grid-cols-[minmax(0,0.95fr)_minmax(560px,1.05fr)] gap-3">
          <div className="grid min-h-0 grid-rows-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3">
            <section className="min-h-0 overflow-hidden border border-black/15 bg-white p-4 text-black">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.26em] text-neutral-700">
                    Match Podium
                  </p>
                  <h2 className="mt-1 text-2xl font-black uppercase italic">
                    Top 3 Teams
                  </h2>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-neutral-500">
                    Final placement • kills • points
                  </p>
                </div>

                <span className="text-4xl">🏆</span>
              </div>

              <div className="mt-3 grid min-h-0 grid-cols-3 gap-3">
                {podium.length === 0 ? (
                  <div className="col-span-3 border border-black/10 bg-neutral-100 p-8 text-center text-base font-bold text-neutral-600">
                    Results will appear when the match is finalized.
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

            <section className="grid min-h-0 grid-cols-3 gap-3">
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

          </div>

          <aside className="min-h-0 overflow-hidden border border-black/15 bg-white p-4 text-black">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-neutral-700">
              Overall Tournament
            </p>
            <h2 className="mt-1 text-2xl font-black uppercase italic">
              Top 10 Standings
            </h2>

            <div className="mt-5 grid grid-cols-[42px_34px_42px_minmax(0,1fr)_58px_64px] gap-2 border-b border-black/10 px-2 pb-2 text-[8px] font-black uppercase tracking-[0.14em] text-black">
              <span>Rank</span>
              <span />
              <span />
              <span>Team</span>
              <span className="text-center">Kills</span>
              <span className="text-center">Total</span>
            </div>

            <div className="mt-2 space-y-1.5">
              {topTen.length === 0 ? (
                <div className="border border-black/10 bg-neutral-100 p-10 text-center font-bold text-neutral-600">
                  Waiting for standings...
                </div>
              ) : (
                topTen.map((standing, index) => (
                  <StandingRow
                    key={standing.squadId}
                    standing={{
                      ...standing,
                      countryCode:
                        standing.countryCode ||
                        squadCountries[standing.squadId]?.countryCode ||
                        squadCountries[
                          `name:${normalizeSquadName(standing.squadName)}`
                        ]?.countryCode ||
                        "",
                      countryName:
                        standing.countryName ||
                        squadCountries[standing.squadId]?.countryName ||
                        squadCountries[
                          `name:${normalizeSquadName(standing.squadName)}`
                        ]?.countryName ||
                        "",
                      flagUrl:
                        standing.flagUrl ||
                        squadCountries[standing.squadId]?.flagUrl ||
                        squadCountries[
                          `name:${normalizeSquadName(standing.squadName)}`
                        ]?.flagUrl ||
                        "",
                    }}
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

function normalizeSquadName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function HeaderStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[100px] border border-white/20 bg-black/35 px-4 py-3 text-right">
      <p className="text-[8px] font-black uppercase tracking-wider text-neutral-300">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-black uppercase text-white">
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
      ? "border-black/35 bg-neutral-100 shadow-[0_0_24px_rgba(0,0,0,0.08)]"
      : rank === 2
        ? "border-neutral-400/40 bg-neutral-50"
        : "border-neutral-500/35 bg-neutral-100";

  return (
    <article
      className={`podium-rise border p-3 text-center ${style}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden border border-black bg-white">
        {result.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.logoUrl}
            alt=""
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="text-[9px] font-black text-black">
            LOGO
          </span>
        )}
      </div>

      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">
        #{rank}
      </p>

      <h3 className="mt-1 truncate text-2xl font-black uppercase">
        {result.squadName}
      </h3>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="bg-neutral-100 p-2">
          <p className="text-[8px] font-black uppercase text-neutral-500">
            Kills
          </p>
          <p className="mt-1 text-2xl font-black">
            {result.totalKills}
          </p>
        </div>

        <div className="bg-neutral-100 p-2">
          <p className="text-[8px] font-black uppercase text-neutral-500">
            Points
          </p>
          <p className="mt-1 text-2xl font-black text-black">
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
    <article className="min-h-0 overflow-hidden border border-black/15 bg-white p-4 text-black">
      <div className="flex items-center justify-between gap-3">
        <span className="text-3xl">{icon}</span>

        {logoUrl && (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden border border-black bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt=""
              className="h-full w-full object-contain p-1"
            />
          </div>
        )}
      </div>

      <p className="mt-3 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-700">
        {title}
      </p>
      <p className="mt-1 truncate text-2xl font-black uppercase">
        {primary}
      </p>
      <p className="mt-2 truncate text-sm font-black uppercase text-black">
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
      ? "bg-white text-black"
      : rank === 2
        ? "bg-neutral-300 text-black"
        : rank === 3
          ? "bg-neutral-600 text-white"
          : "bg-neutral-200 text-black";

  return (
    <div
      className={`grid grid-cols-[42px_34px_42px_minmax(0,1fr)_58px_64px] items-center gap-2 border px-2 py-1.5 ${
        rank === 1
          ? "border-black/25 bg-neutral-100"
          : "border-black/10 bg-white"
      }`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center text-sm font-black ${rankStyle}`}
      >
        {rank}
      </div>

      <div className="flex h-8 w-8 items-center justify-center overflow-hidden border border-black bg-white">
        {standing.countryCode ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/country-flag/${encodeURIComponent(
              (standing.countryCode || "").toLowerCase(),
            )}`}
            alt=""
            title={standing.countryName || standing.countryCode}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <span className="text-[5px] font-black text-black">
            FLAG
          </span>
        )}
      </div>

      <div className="flex h-8 w-8 items-center justify-center overflow-hidden border border-black bg-white">
        {standing.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={standing.logoUrl}
            alt=""
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <span className="text-[6px] font-black text-black">
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

      <p className="text-center text-base font-black text-black">
        {standing.totalPoints}
      </p>
    </div>
  );
}
