"use client";

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/firebase";

type LiveMatchSettings = {
  matchNumber: number;
  status: "not-started" | "live" | "finalized";
  map?: string;
  aliveSquads?: number;
  alivePlayers?: number;
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

export default function LiveOverlayPage() {
  const [liveMatch, setLiveMatch] = useState<LiveMatchSettings>({
    matchNumber: 1,
    status: "not-started",
    aliveSquads: 0,
    alivePlayers: 0,
  });

  const [tournament, setTournament] =
    useState<TournamentSettings>(defaultTournament);

  const [standings, setStandings] = useState<Standing[]>([]);
  const [squadCountries, setSquadCountries] = useState<
    Record<string, { countryCode: string; countryName: string }>
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
          aliveSquads: Number(data.aliveSquads) || 0,
          alivePlayers: Number(data.alivePlayers) || 0,
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
    return onSnapshot(
      collection(db, "squads"),
      (snapshot) => {
        const countries: Record<
          string,
          { countryCode: string; countryName: string }
        > = {};

        snapshot.docs.forEach((squadDocument) => {
          const data = squadDocument.data();

          countries[squadDocument.id] = {
            countryCode:
              typeof data.countryCode === "string" ? data.countryCode : "",
            countryName:
              typeof data.countryName === "string" ? data.countryName : "",
          };
        });

        setSquadCountries(countries);
      },
      (error) => {
        console.error("Unable to load squad countries:", error);
      },
    );
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
            squadId:
              typeof data.squadId === "string" && data.squadId
                ? data.squadId
                : standingDocument.id,
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

  const scheduledMatch =
    tournament.matchSchedule?.[liveMatch.matchNumber - 1];

  const currentMap =
    liveMatch.map || scheduledMatch?.map || "Map not set";

  const plannedMatches = Math.max(
    1,
    tournament.matchSchedule?.length ||
      Number(tournament.matchesPlanned) ||
      1,
  );

  const visibleStandings = standings.slice(0, 10);

  return (
    <main className="pointer-events-none min-h-screen bg-transparent text-white antialiased">
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }

        body {
          margin: 0;
          overflow: hidden;
        }

        @keyframes overlay-enter {
          from {
            opacity: 0;
            transform: translateX(55px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes live-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }

        .overlay-enter {
          animation: overlay-enter 0.55s ease-out both;
        }

        .live-pulse {
          animation: live-pulse 1.3s ease-in-out infinite;
        }

        @media (max-width: 900px) {
          .overlay-enter {
            width: min(92vw, 520px) !important;
            min-width: 0 !important;
            height: 94vh !important;
          }
        }
      `}</style>

      <div className="flex min-h-screen items-center justify-end px-6 py-4">
        <aside className="overlay-enter flex h-[94vh] w-[min(32vw,520px)] min-w-[440px] flex-col overflow-hidden border border-white/20 bg-transparent">
          <div className="h-px bg-white/40" />

          <header className="relative overflow-hidden border-b border-white bg-white px-6 py-5 text-black">
            <div className="absolute inset-0 bg-transparent" />

            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-black/20 bg-transparent">
                    {/* Place your logo at: public/n2-logo.png */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/n2-logo.png"
                      alt="N² logo"
                      className="h-full w-full object-contain p-1.5"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                        const fallback =
                          event.currentTarget.nextElementSibling as HTMLElement | null;

                        if (fallback) {
                          fallback.style.display = "flex";
                        }
                      }}
                    />

                    <span className="hidden h-full w-full items-center justify-center text-xl font-black italic text-black">
                      N²
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black uppercase tracking-[0.28em] text-black">
                      {tournament.name}
                    </p>

                    <p className="mt-1 truncate text-[12px] font-bold uppercase tracking-[0.16em] text-neutral-700">
                      {[tournament.season, tournament.eventName]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 rounded-full border border-black/30 bg-transparent px-3 py-1.5">
                  <span className="live-pulse h-2 w-2 rounded-full bg-black" />
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-black">
                    {liveMatch.status === "live" ? "Live" : liveMatch.status}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-black">
                    Live Tournament
                  </p>
                  <h1 className="mt-1 text-4xl font-black uppercase italic leading-none">
                    Standings
                  </h1>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
                    Match
                  </p>
                  <p className="text-2xl font-black text-black">
                    {liveMatch.matchNumber}/{plannedMatches}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <InfoBox label="Map" value={currentMap} />
                <InfoBox
                  label="Alive"
                  value={
                    liveMatch.aliveSquads
                      ? `${liveMatch.aliveSquads} SQ`
                      : "—"
                  }
                />
                <InfoBox
                  label="Players"
                  value={
                    liveMatch.alivePlayers
                      ? String(liveMatch.alivePlayers)
                      : "—"
                  }
                />
              </div>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-hidden bg-black/[0.85] px-4 py-4">
            <div className="grid grid-cols-[42px_46px_46px_minmax(0,1fr)_54px_60px] items-center gap-2 border-b border-white/10 px-2 pb-2 text-[9px] font-black uppercase tracking-[0.16em] text-white">
              <span>Rank</span>
              <span />
              <span />
              <span>Team</span>
              <span className="text-center">Kills</span>
              <span className="text-center">Total</span>
            </div>

            <div className="mt-3 space-y-2">
              {visibleStandings.length === 0 ? (
                <div className="border border-white/20 bg-black/20 p-8 text-center text-sm font-bold text-neutral-300">
                  Waiting for standings...
                </div>
              ) : (
                visibleStandings.map((standing, index) => (
                  <StandingRow
                    key={`${standing.squadId}-${index}`}
                    standing={{
                      ...standing,
                      countryCode:
                        standing.countryCode ||
                        squadCountries[standing.squadId]?.countryCode ||
                        "",
                      countryName:
                        standing.countryName ||
                        squadCountries[standing.squadId]?.countryName ||
                        "",
                    }}
                    rank={index + 1}
                  />
                ))
              )}
            </div>
          </section>

        </aside>
      </div>
    </main>
  );
}

function normalizeSquadName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}


function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border border-black/20 bg-white px-3 py-3">
      <p className="truncate text-[8px] font-black uppercase tracking-wider text-neutral-600">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-black uppercase text-black">
        {value}
      </p>
    </div>
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
      ? "bg-yellow-400 text-yellow-950 shadow-[0_0_18px_rgba(250,204,21,0.55)]"
      : rank === 2
        ? "bg-slate-200 text-black"
        : rank === 3
          ? " text-white"
          : " text-white";

  return (
    <div
      className="grid grid-cols-[42px_46px_46px_minmax(0,1fr)_54px_60px] items-center gap-2 border border-white/15 bg-black/20 px-3 py-3"
    >
      <div
        className={`flex h-9 w-9 items-center justify-center text-sm font-black ${rankStyle}`}
      >
        {rank}
      </div>

      <div className="flex h-10 w-10 items-center justify-center overflow-hidden bg-transparent">
        {standing.countryCode ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/country-flag/${encodeURIComponent(standing.countryCode.trim().toLowerCase())}`}
            alt={standing.countryName || `${standing.countryCode} flag`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-[6px] font-black text-black">
            FLAG
          </span>
        )}
      </div>

      <div className="flex h-10 w-10 items-center justify-center overflow-hidden border border-white bg-white">
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

      <p className="truncate text-[14px] font-black uppercase">
        {standing.squadName}
      </p>

      <p className="text-center text-base font-black text-white">
        {standing.totalKills}
      </p>

      <p className="text-center text-lg font-black text-white">
        {standing.totalPoints}
      </p>
    </div>
  );
}
