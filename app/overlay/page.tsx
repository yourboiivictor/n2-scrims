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
    return onSnapshot(collection(db, "squads"), (snapshot) => {
      const countries: Record<
        string,
        { countryCode: string; countryName: string }
      > = {};

      snapshot.docs.forEach((squadDocument) => {
        const data = squadDocument.data();
        const country = {
          countryCode:
            typeof data.countryCode === "string" ? data.countryCode : "",
          countryName:
            typeof data.countryName === "string" ? data.countryName : "",
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
            <div className="grid grid-cols-[42px_34px_46px_minmax(0,1fr)_54px_60px] items-center gap-2 border-b border-white/10 px-2 pb-2 text-[9px] font-black uppercase tracking-[0.16em] text-white">
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
                    key={standing.squadId}
                    standing={{
                      ...standing,
                      countryCode:
                        squadCountries[standing.squadId]?.countryCode ||
                        squadCountries[
                          `name:${normalizeSquadName(standing.squadName)}`
                        ]?.countryCode ||
                        "",
                      countryName:
                        squadCountries[standing.squadId]?.countryName ||
                        squadCountries[
                          `name:${normalizeSquadName(standing.squadName)}`
                        ]?.countryName ||
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


function CountryFlagSvg({ code, label }: { code: string; label: string }) {
  const c = code.trim().toUpperCase();

  const common = {
    width: 32,
    height: 20,
    viewBox: "0 0 32 20",
    role: "img" as const,
    "aria-label": label,
    className: "h-5 w-8 rounded-sm shadow-sm",
  };

  if (c === "KI") {
    return (
      <svg {...common}>
        <rect width="32" height="10" fill="#CE1126" />
        <rect y="10" width="32" height="10" fill="#003F87" />
        <path d="M0 11 C4 9 8 13 12 11 S20 9 24 11 S28 13 32 11 V13 C28 15 24 11 20 13 S12 15 8 13 S4 11 0 13Z" fill="#fff" />
        <path d="M0 15 C4 13 8 17 12 15 S20 13 24 15 S28 17 32 15 V17 C28 19 24 15 20 17 S12 19 8 17 S4 15 0 17Z" fill="#fff" />
        <circle cx="16" cy="7" r="3" fill="#FCD116" />
        <path d="M16 1.8 L16.7 4.3 L19.2 3.6 L17.6 5.6 L20 6.5 L17.4 6.8 L18.6 9 L16.6 7.5 L16 10 L15.4 7.5 L13.4 9 L14.6 6.8 L12 6.5 L14.4 5.6 L12.8 3.6 L15.3 4.3Z" fill="#FCD116" />
      </svg>
    );
  }

  if (c === "TO") {
    return (
      <svg {...common}>
        <rect width="32" height="20" fill="#C10000" />
        <rect width="14" height="9" fill="#fff" />
        <rect x="5.5" y="1" width="3" height="7" fill="#C10000" />
        <rect x="3.5" y="3" width="7" height="3" fill="#C10000" />
      </svg>
    );
  }

  if (c === "SB") {
    return (
      <svg {...common}>
        <polygon points="0,0 32,0 0,20" fill="#0051BA" />
        <polygon points="32,0 32,20 0,20" fill="#215B33" />
        <polygon points="0,17 28,0 32,0 0,20" fill="#FCD116" />
        {[3,7,11,5,9].map((x, i) => (
          <circle key={i} cx={x} cy={i < 3 ? 3 : 7} r="0.8" fill="#fff" />
        ))}
      </svg>
    );
  }

  if (c === "US") {
    return (
      <svg {...common}>
        {Array.from({ length: 13 }).map((_, i) => (
          <rect key={i} y={(20 / 13) * i} width="32" height={20 / 13} fill={i % 2 === 0 ? "#B22234" : "#fff"} />
        ))}
        <rect width="13" height="10.8" fill="#3C3B6E" />
        {Array.from({ length: 12 }).map((_, i) => (
          <circle key={i} cx={1.5 + (i % 4) * 3} cy={1.5 + Math.floor(i / 4) * 3} r="0.45" fill="#fff" />
        ))}
      </svg>
    );
  }

  // Generic inline-SVG fallback so TikTok still receives SVG markup, not an image.
  return (
    <svg {...common}>
      <rect width="32" height="20" fill="#111827" />
      <rect x="1" y="1" width="30" height="18" fill="none" stroke="#fff" strokeOpacity="0.5" />
      <text x="16" y="13" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">
        {c}
      </text>
    </svg>
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
      className="grid grid-cols-[42px_34px_46px_minmax(0,1fr)_54px_60px] items-center gap-2 border border-white/15 bg-black/20 px-3 py-3"
    >
      <div
        className={`flex h-9 w-9 items-center justify-center text-sm font-black ${rankStyle}`}
      >
        {rank}
      </div>

      <div className="flex h-10 w-8 items-center justify-center">
        {standing.countryCode ? (
          <CountryFlagSvg
            code={standing.countryCode}
            label={standing.countryName || standing.countryCode}
          />
        ) : null}
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
