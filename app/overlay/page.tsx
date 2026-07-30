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
    <main className="pointer-events-none min-h-screen bg-transparent text-white">
      <style jsx global>{`
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
      `}</style>

      <div className="flex min-h-screen items-center justify-end p-4">
        <aside className="overlay-enter flex max-h-[96vh] w-[min(23vw,360px)] min-w-[315px] flex-col overflow-hidden border border-cyan-400/30 bg-[#030712]/95 shadow-[0_0_45px_rgba(0,174,255,0.22)] backdrop-blur-xl">
          <div className="h-1 bg-gradient-to-r from-yellow-400 via-cyan-400 to-blue-700" />

          <header className="relative overflow-hidden border-b border-white/10 px-5 py-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,174,255,0.18),transparent_45%)]" />

            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-cyan-400/30 bg-black/40 shadow-[0_0_18px_rgba(0,174,255,0.18)]">
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

                    <span className="hidden h-full w-full items-center justify-center text-xl font-black italic text-white">
                      N²
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black uppercase tracking-[0.28em] text-yellow-400">
                      {tournament.name}
                    </p>

                    <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {[tournament.season, tournament.eventName]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5">
                  <span className="live-pulse h-2 w-2 rounded-full bg-red-400" />
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-red-300">
                    {liveMatch.status === "live" ? "Live" : liveMatch.status}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
                    Live Tournament
                  </p>
                  <h1 className="mt-1 text-3xl font-black uppercase italic leading-none">
                    Standings
                  </h1>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Match
                  </p>
                  <p className="text-xl font-black text-yellow-300">
                    {liveMatch.matchNumber}/{plannedMatches}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
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

          <section className="min-h-0 flex-1 overflow-hidden px-2.5 py-3">
            <div className="grid grid-cols-[34px_36px_minmax(0,1fr)_42px_48px] items-center gap-2 border-b border-white/10 px-2 pb-2 text-[8px] font-black uppercase tracking-[0.16em] text-yellow-300">
              <span>Rank</span>
              <span />
              <span>Team</span>
              <span className="text-center">Kills</span>
              <span className="text-center">Total</span>
            </div>

            <div className="mt-2 space-y-1.5">
              {visibleStandings.length === 0 ? (
                <div className="border border-white/10 bg-white/5 p-8 text-center text-sm font-bold text-slate-400">
                  Waiting for standings...
                </div>
              ) : (
                visibleStandings.map((standing, index) => (
                  <StandingRow
                    key={standing.squadId}
                    standing={standing}
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

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border border-white/10 bg-white/5 px-2 py-2">
      <p className="truncate text-[7px] font-black uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-black uppercase text-white">
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
      ? "bg-yellow-400 text-black shadow-[0_0_18px_rgba(250,204,21,0.35)]"
      : rank === 2
        ? "bg-slate-200 text-black"
        : rank === 3
          ? "bg-amber-700 text-white"
          : "bg-cyan-600/20 text-cyan-300";

  return (
    <div
      className={`grid grid-cols-[34px_36px_minmax(0,1fr)_42px_48px] items-center gap-2 border px-2 py-2 ${
        rank === 1
          ? "border-yellow-400/40 bg-yellow-400/10"
          : "border-white/5 bg-[#0a1220]/95"
      }`}
    >
      <div
        className={`flex h-7 w-7 items-center justify-center text-xs font-black ${rankStyle}`}
      >
        {rank}
      </div>

      <div className="flex h-8 w-8 items-center justify-center overflow-hidden border border-white/10 bg-black/30">
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

      <p className="truncate text-[12px] font-black uppercase">
        {standing.squadName}
      </p>

      <p className="text-center text-sm font-black text-slate-200">
        {standing.totalKills}
      </p>

      <p className="text-center text-base font-black text-yellow-300">
        {standing.totalPoints}
      </p>
    </div>
  );
}
