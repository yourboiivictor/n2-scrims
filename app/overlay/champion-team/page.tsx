"use client";

import { doc, onSnapshot, query, collection, orderBy, limit } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";

type Player = {
  name: string;
  role?: string;
};

type Champion = {
  squadId: string;
  squadName: string;
  logoUrl: string;
  totalKills: number;
  totalPoints: number;
  players: Player[];
};

type LiveMatchSettings = {
  matchNumber: number;
  status: "not-started" | "live" | "finalized";
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

const defaultTournament: TournamentSettings = {
  name: "N² Scrims",
  season: "Season 1",
  eventName: "Event 1",
  matchesPlanned: 3,
  matchSchedule: [],
};

const PLAYER_POSITIONS = [
  { left: "15.5%", top: "20%" },
  { left: "34.5%", top: "19%" },
  { left: "57.5%", top: "13%" },
  { left: "81.5%", top: "19%" },
];

export default function ChampionTeamOverlayPage() {
  const [champion, setChampion] = useState<Champion | null>(null);
  const [liveMatch, setLiveMatch] = useState<LiveMatchSettings>({
    matchNumber: 1,
    status: "not-started",
  });
  const [tournament, setTournament] =
    useState<TournamentSettings>(defaultTournament);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        });
      },
      (snapshotError) => {
        console.error("Unable to load live match:", snapshotError);
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
        const schedule = Array.isArray(data.matchSchedule)
          ? data.matchSchedule
          : [];

        setTournament({
          ...defaultTournament,
          ...(data as Partial<TournamentSettings>),
          matchSchedule: schedule,
          matchesPlanned: Math.max(
            1,
            schedule.length || Number(data.matchesPlanned) || 3,
          ),
        });
      },
      (snapshotError) => {
        console.error("Unable to load tournament settings:", snapshotError);
      },
    );
  }, []);

  useEffect(() => {
    const championQuery = query(
      collection(db, "standings"),
      orderBy("totalPoints", "desc"),
      limit(1),
    );

    let stopSquadListener: (() => void) | null = null;

    const stopStandingsListener = onSnapshot(
      championQuery,
      (snapshot) => {
        if (stopSquadListener) {
          stopSquadListener();
          stopSquadListener = null;
        }

        if (snapshot.empty) {
          setChampion(null);
          setLoading(false);
          return;
        }

        const standingDocument = snapshot.docs[0];
        const standingData = standingDocument.data();
        const squadId =
          typeof standingData.squadId === "string" && standingData.squadId
            ? standingData.squadId
            : standingDocument.id;

        const baseChampion: Champion = {
          squadId,
          squadName:
            typeof standingData.squadName === "string"
              ? standingData.squadName
              : "Tournament Champion",
          logoUrl:
            typeof standingData.logoUrl === "string"
              ? standingData.logoUrl
              : "",
          totalKills: Number(standingData.totalKills) || 0,
          totalPoints: Number(standingData.totalPoints) || 0,
          players: [],
        };

        stopSquadListener = onSnapshot(
          doc(db, "squads", squadId),
          (squadSnapshot) => {
            if (!squadSnapshot.exists()) {
              setChampion(baseChampion);
              setLoading(false);
              return;
            }

            const squadData = squadSnapshot.data();
            const players: Player[] = Array.isArray(squadData.players)
              ? squadData.players
                  .slice(0, 4)
                  .map((player: unknown, index: number) => {
                    const value =
                      player && typeof player === "object"
                        ? (player as Record<string, unknown>)
                        : {};

                    return {
                      name:
                        typeof value.name === "string" && value.name.trim()
                          ? value.name.trim()
                          : `Player ${index + 1}`,
                      role:
                        typeof value.role === "string" ? value.role : "",
                    };
                  })
              : [];

            while (players.length < 4) {
              players.push({ name: `Player ${players.length + 1}` });
            }

            setChampion({
              ...baseChampion,
              squadName:
                typeof squadData.squadName === "string"
                  ? squadData.squadName
                  : baseChampion.squadName,
              logoUrl:
                typeof squadData.logoUrl === "string" && squadData.logoUrl
                  ? squadData.logoUrl
                  : baseChampion.logoUrl,
              players,
            });
            setLoading(false);
            setError("");
          },
          (snapshotError) => {
            console.error("Unable to load champion squad:", snapshotError);
            setChampion(baseChampion);
            setLoading(false);
          },
        );
      },
      (snapshotError) => {
        console.error("Unable to load champion standings:", snapshotError);
        setError("Unable to load tournament champion.");
        setLoading(false);
      },
    );

    return () => {
      stopStandingsListener();
      if (stopSquadListener) stopSquadListener();
    };
  }, []);

  const finalMatchNumber = useMemo(
    () =>
      Math.max(
        1,
        tournament.matchSchedule?.length || tournament.matchesPlanned || 3,
      ),
    [tournament.matchSchedule, tournament.matchesPlanned],
  );

  const tournamentFinished =
    liveMatch.status === "finalized" &&
    liveMatch.matchNumber >= finalMatchNumber;

  const subtitle = [tournament.season, tournament.eventName]
    .filter(Boolean)
    .join(" • ");

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-black text-white">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          background: #000;
          overflow: hidden;
        }

        @keyframes champion-enter {
          from {
            opacity: 0;
            transform: scale(1.04);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes name-drop {
          from {
            opacity: 0;
            transform: translate(-50%, -18px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        @keyframes crown-pulse {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-4px) scale(1.04);
          }
        }

        .champion-enter {
          animation: champion-enter 0.8s ease-out both;
        }

        .player-name {
          animation: name-drop 0.65s ease-out both;
        }

        .crown-pulse {
          animation: crown-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <section className="champion-enter relative aspect-video w-full max-w-[1920px] overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mvp.jpg"
          alt="PUBG Mobile champion team background"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/75" />
        <div className="absolute inset-x-0 top-0 h-[19%] bg-gradient-to-b from-black/75 to-transparent" />

        <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-[3.2%] pt-[2.2%]">
          <div>
            <p className="text-[clamp(12px,1.05vw,22px)] font-black uppercase tracking-[0.34em] text-yellow-300">
              {tournament.name}
            </p>
            <p className="mt-1 text-[clamp(10px,0.78vw,16px)] font-bold uppercase tracking-[0.22em] text-white/75">
              {subtitle || "Tournament Finals"}
            </p>
          </div>

          <div className="rounded-full border border-yellow-300/70 bg-black/65 px-[1.2%] py-[0.55%] text-[clamp(10px,0.8vw,16px)] font-black uppercase tracking-[0.22em] text-yellow-200 backdrop-blur-sm">
            {tournamentFinished ? "Final Champion" : "Champion Preview"}
          </div>
        </header>

        {champion?.players.slice(0, 4).map((player, index) => {
          const position = PLAYER_POSITIONS[index];

          return (
            <div
              key={`${player.name}-${index}`}
              className="player-name absolute z-30 -translate-x-1/2 text-center"
              style={{
                left: position.left,
                top: position.top,
                animationDelay: `${250 + index * 150}ms`,
              }}
            >
              <div className="rounded-xl border border-white/45 bg-black/72 px-[clamp(10px,1vw,22px)] py-[clamp(5px,0.45vw,10px)] shadow-[0_6px_20px_rgba(0,0,0,0.5)] backdrop-blur-sm">
                <p className="whitespace-nowrap text-[clamp(14px,1.25vw,28px)] font-black uppercase leading-none text-white">
                  {player.name}
                </p>
                <p className="mt-1 text-[clamp(8px,0.55vw,12px)] font-bold uppercase tracking-[0.18em] text-yellow-300">
                  {index === 0 ? "Captain" : `Player ${index + 1}`}
                </p>
              </div>
            </div>
          );
        })}

        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-6 px-[3.2%] pb-[2.8%]">
          <div className="flex min-w-0 items-center gap-[clamp(12px,1.2vw,26px)]">
            <div className="crown-pulse flex h-[clamp(70px,7vw,140px)] w-[clamp(70px,7vw,140px)] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-yellow-300/70 bg-black/65 p-2 shadow-[0_0_35px_rgba(250,204,21,0.28)] backdrop-blur-md">
              {champion?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={champion.logoUrl}
                  alt={`${champion.squadName} logo`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-[clamp(30px,3.8vw,76px)]">🏆</span>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-[clamp(12px,1.05vw,22px)] font-black uppercase tracking-[0.3em] text-yellow-300">
                N² Scrims Champions
              </p>
              <h1 className="mt-1 truncate text-[clamp(30px,4vw,82px)] font-black uppercase italic leading-none text-white drop-shadow-[0_5px_14px_rgba(0,0,0,0.9)]">
                {champion?.squadName || "Champion Team"}
              </h1>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 rounded-2xl border border-white/25 bg-black/68 p-[clamp(8px,0.8vw,16px)] text-center backdrop-blur-md">
            <StatBox label="Points" value={champion?.totalPoints ?? 0} />
            <StatBox label="Kills" value={champion?.totalKills ?? 0} />
          </div>
        </div>

        {!tournamentFinished && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
            <div className="max-w-2xl rounded-3xl border border-yellow-300/40 bg-black/80 px-10 py-8 text-center">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-yellow-300">
                Champion Overlay Ready
              </p>
              <h2 className="mt-3 text-4xl font-black uppercase">
                Waiting for the final match
              </h2>
              <p className="mt-3 text-lg text-white/75">
                This screen will reveal the winning squad after Match {finalMatchNumber} is finalized.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black text-xl font-black text-yellow-300">
            Loading champion...
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black px-6 text-center text-xl font-black text-red-300">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[clamp(72px,7vw,135px)] rounded-xl border border-white/15 bg-white/5 px-[clamp(10px,1vw,20px)] py-[clamp(7px,0.7vw,14px)]">
      <p className="text-[clamp(8px,0.55vw,12px)] font-black uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p className="mt-1 text-[clamp(20px,2vw,40px)] font-black leading-none text-yellow-300">
        {value}
      </p>
    </div>
  );
}
