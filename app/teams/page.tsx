"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "../../firebase";

const DEFAULT_MAX_SQUADS = 25;

type MatchScheduleItem = {
  id: string;
  map: string;
  startTime: string;
};

type TournamentSettings = {
  maxSquads?: number;
  matchSchedule?: MatchScheduleItem[];
  maps?: string[];
};

type Player = {
  name: string;
  role?: string;
};

type Squad = {
  id: string;
  squadName: string;
  players: Player[];
  logoUrl?: string;
};

export default function TeamsPage() {
  const router = useRouter();

  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [matchSchedule, setMatchSchedule] = useState<MatchScheduleItem[]>([]);
  const [maxSquads, setMaxSquads] = useState(DEFAULT_MAX_SQUADS);
  const [expandedSquads, setExpandedSquads] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const approvedSquadsQuery = query(
      collection(db, "squads"),
      where("status", "==", "approved")
    );

    const unsubscribe = onSnapshot(
      approvedSquadsQuery,
      (snapshot) => {
        const approvedSquads: Squad[] = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            squadName: data.squadName || "Unnamed Squad",
            players: Array.isArray(data.players) ? data.players : [],
            logoUrl:
              typeof data.logoUrl === "string" ? data.logoUrl : "",
          };
        });

        approvedSquads.sort((firstSquad, secondSquad) =>
          firstSquad.squadName.localeCompare(secondSquad.squadName)
        );

        setSquads(approvedSquads);
        setLoading(false);
        setMessage("");
      },
      (error) => {
        console.error("Approved squads error:", error);
        setMessage("Unable to load approved squads.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);


  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "tournament"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setMatchSchedule([]);
          setMaxSquads(DEFAULT_MAX_SQUADS);
          return;
        }

        const data = snapshot.data() as TournamentSettings;

        if (Array.isArray(data.matchSchedule)) {
          const schedule = data.matchSchedule
            .map((match, index) => ({
              id:
                typeof match?.id === "string" && match.id
                  ? match.id
                  : `match-${index + 1}`,
              map:
                typeof match?.map === "string" && match.map
                  ? match.map
                  : "Map not set",
              startTime:
                typeof match?.startTime === "string"
                  ? match.startTime
                  : "",
            }))
            .filter((match) => match.map);

          setMatchSchedule(schedule);
        } else if (Array.isArray(data.maps)) {
          setMatchSchedule(
            data.maps
              .filter((map): map is string => typeof map === "string")
              .map((map, index) => ({
                id: `match-${index + 1}`,
                map,
                startTime: "",
              })),
          );
        } else {
          setMatchSchedule([]);
        }

        setMaxSquads(
          Math.max(1, Number(data.maxSquads) || DEFAULT_MAX_SQUADS),
        );
      },
      (error) => {
        console.error("Tournament settings error:", error);
      },
    );

    return unsubscribe;
  }, []);

  const spotsLeft = Math.max(maxSquads - squads.length, 0);

  function toggleSquad(squadId: string) {
    setExpandedSquads((current) => {
      const next = new Set(current);

      if (next.has(squadId)) {
        next.delete(squadId);
      } else {
        next.add(squadId);
      }

      return next;
    });
  }

  return (
    <main
      className="min-h-screen bg-black bg-center bg-no-repeat px-5 py-10 text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.84), rgba(0,0,0,0.97)), url('/n2-logo.png')",
        backgroundSize: "55%",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto max-w-6xl">
        
        <header className="mt-8 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-blue-400">
            N² Scrims
          </p>

          <h1 className="mt-3 text-4xl font-black sm:text-5xl">
            Approved Squads
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-gray-400">
            Only squads approved by the tournament administrator are shown
            here.
          </p>
        </header>


        <section className="mt-8 rounded-3xl border border-blue-900 bg-black/90 p-5 shadow-lg shadow-blue-950/20 sm:p-7">
          <div className="text-center sm:text-left">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-400">
              Tournament Schedule
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              Match Maps
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Maps are shown in the order they will be played.
            </p>
          </div>

          {matchSchedule.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/80 p-6 text-center text-gray-400">
              The match schedule has not been announced yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {matchSchedule.map((match, index) => (
                <div
                  key={match.id}
                  className="relative overflow-hidden rounded-2xl border border-blue-800 bg-gradient-to-br from-blue-950/60 to-black p-5"
                >
                  <div className="absolute right-0 top-0 rounded-bl-2xl border-b border-l border-blue-800 bg-blue-950 px-3 py-2 text-xs font-black text-blue-300">
                    #{index + 1}
                  </div>

                  <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-500">
                    Match {index + 1}
                  </p>
                  <p className="mt-3 text-2xl font-black uppercase text-white">
                    {match.map}
                  </p>
                  <p className="mt-3 text-sm font-bold text-blue-300">
                    {formatMatchTime(match.startTime)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-900 bg-blue-950/30 p-5 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-400">
              Approved
            </p>

            <p className="mt-2 text-3xl font-black text-blue-400">
              {squads.length}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-5 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-400">
              Maximum
            </p>

            <p className="mt-2 text-3xl font-black">{maxSquads}</p>
          </div>

          <div className="col-span-2 rounded-2xl border border-gray-800 bg-gray-950/80 p-5 text-center sm:col-span-1">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-400">
              Spots Left
            </p>

            <p className="mt-2 text-3xl font-black text-green-400">
              {spotsLeft}
            </p>
          </div>
        </section>

        {loading && (
          <div className="mt-12 rounded-2xl border border-blue-900 bg-black/80 p-10 text-center">
            <p className="font-bold text-blue-400">
              Loading approved squads...
            </p>
          </div>
        )}

        {message && (
          <div className="mt-12 rounded-2xl border border-red-900 bg-red-950/30 p-6 text-center text-red-300">
            {message}
          </div>
        )}

        {!loading && !message && squads.length === 0 && (
          <div className="mt-12 rounded-2xl border border-gray-800 bg-black/80 p-10 text-center">
            <h2 className="text-2xl font-black">No Approved Squads Yet</h2>

            <p className="mt-3 text-gray-400">
              Approved squads will automatically appear here.
            </p>
          </div>
        )}

        {!loading && !message && squads.length > 0 && (
          <section className="mt-10 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {squads.map((squad, squadIndex) => {
              const isExpanded = expandedSquads.has(squad.id);

              return (
                <article
                  key={squad.id}
                  className="overflow-hidden rounded-2xl border border-blue-900 bg-black/90 shadow-lg shadow-blue-950/20 transition hover:border-blue-600"
                >
                  <div className="relative p-4">
                    <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-blue-700 bg-black/80 text-xs font-black text-blue-300">
                      {squadIndex + 1}
                    </div>

                    <div className="flex items-center gap-3 pr-8">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-800 bg-black p-1.5">
                        {squad.logoUrl ? (
                          <img
                            src={squad.logoUrl}
                            alt={`${squad.squadName} logo`}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="text-center">
                            <p className="text-2xl">🛡️</p>
                            <p className="text-[8px] font-bold uppercase text-gray-600">
                              No Logo
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                          Approved Squad
                        </p>

                        <h2
                          className="mt-1 truncate text-lg font-black"
                          title={squad.squadName}
                        >
                          {squad.squadName}
                        </h2>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleSquad(squad.id)}
                      aria-expanded={isExpanded}
                      className="mt-4 w-full rounded-lg border border-blue-700 bg-blue-950/40 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-blue-300 transition hover:bg-blue-700 hover:text-white"
                    >
                      {isExpanded ? "Hide Players ▲" : "Show Players ▼"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-blue-900 bg-gray-950/70 p-4">
                      {squad.players.length > 0 ? (
                        <div className="space-y-2">
                          {squad.players.map((player, playerIndex) => (
                            <div
                              key={`${squad.id}-${playerIndex}`}
                              className="flex items-center gap-3 rounded-lg border border-gray-800 bg-black/70 px-3 py-2.5"
                            >
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                                  playerIndex === 0
                                    ? "bg-yellow-700 text-yellow-100"
                                    : "bg-blue-950 text-blue-300"
                                }`}
                              >
                                {playerIndex + 1}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-white">
                                  {player.name}
                                </p>
                                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                                  {playerIndex === 0
                                    ? "Captain"
                                    : `Player ${playerIndex + 1}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-sm text-gray-500">
                          Player information unavailable.
                        </p>
                      )}
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

function formatMatchTime(value: string) {
  if (!value) return "Start time TBA";

  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
