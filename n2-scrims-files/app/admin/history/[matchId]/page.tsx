"use client";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db, googleProvider } from "@/firebase";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

type PlayerResult = {
  name: string;
  kills: number;
  isAlive?: boolean;
};

type MatchResult = {
  squadId: string;
  squadName: string;
  logoUrl?: string;
  slot: number;
  players: PlayerResult[];
  playerNames?: string[];
  placement: number | null;
  totalKills: number;
  killPoints: number;
  placementPoints: number;
  totalPoints: number;
};

type MatchDetails = {
  matchNumber: number;
  status: string;
  squadCount: number;
  finalizedAt: Date | null;
};

function getTimestampDate(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate() as Date;
  }

  return null;
}

function formatDate(date: Date | null) {
  if (!date) return "Date unavailable";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getRankedResults(results: MatchResult[]) {
  return [...results].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    if (a.placement !== b.placement) {
      return (
        (a.placement ?? Number.MAX_SAFE_INTEGER) -
        (b.placement ?? Number.MAX_SAFE_INTEGER)
      );
    }

    if (b.totalKills !== a.totalKills) {
      return b.totalKills - a.totalKills;
    }

    return a.squadName.localeCompare(b.squadName);
  });
}

export default function MatchResultsPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);

  const [matchDetails, setMatchDetails] =
    useState<MatchDetails | null>(null);

  const [results, setResults] = useState<MatchResult[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const rankedResults = useMemo(
    () => getRankedResults(results),
    [results],
  );

  const filteredResults = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return rankedResults;

    return rankedResults.filter((result) => {
      const playerNames = result.players
        .map((player) => player.name)
        .join(" ")
        .toLowerCase();

      return (
        result.squadName
          .toLowerCase()
          .includes(normalizedSearch) ||
        playerNames.includes(normalizedSearch) ||
        String(result.slot).includes(normalizedSearch)
      );
    });
  }, [rankedResults, search]);

  const winner = rankedResults[0] || null;

  const matchTotalKills = useMemo(
    () =>
      rankedResults.reduce(
        (total, result) => total + result.totalKills,
        0,
      ),
    [rankedResults],
  );

  const signIn = async () => {
    try {
      setMessage("");

      const provider =
        googleProvider instanceof GoogleAuthProvider
          ? googleProvider
          : new GoogleAuthProvider();

      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Unable to sign in:", error);
      setMessage("Unable to sign in with Google.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Unable to sign out:", error);
      setMessage("Unable to sign out.");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAdmin || !matchId) {
      setResultsLoading(false);
      return;
    }

    let unsubscribeResults: (() => void) | undefined;

    const loadMatch = async () => {
      try {
        setResultsLoading(true);
        setMessage("");

        const matchSnapshot = await getDoc(
          doc(db, "matches", matchId),
        );

        if (!matchSnapshot.exists()) {
          setMatchDetails(null);
          setMessage("This match could not be found.");
          setResultsLoading(false);
          return;
        }

        const matchData = matchSnapshot.data();

        setMatchDetails({
          matchNumber:
            Number(matchData.matchNumber) ||
            Number(matchId.replace("match-", "")) ||
            0,
          status:
            typeof matchData.status === "string"
              ? matchData.status
              : "finalized",
          squadCount: Number(matchData.squadCount) || 0,
          finalizedAt: getTimestampDate(
            matchData.finalizedAt,
          ),
        });

        const resultsQuery = query(
          collection(db, "matches", matchId, "results"),
          orderBy("slot", "asc"),
        );

        unsubscribeResults = onSnapshot(
          resultsQuery,
          (snapshot) => {
            const loadedResults: MatchResult[] =
              snapshot.docs.map((resultDocument) => {
                const data = resultDocument.data();

                const storedPlayers = Array.isArray(
                  data.players,
                )
                  ? data.players
                  : [];

                const fallbackPlayerNames =
                  Array.isArray(data.playerNames)
                    ? data.playerNames
                    : [];

                const players: PlayerResult[] =
                  Array.from(
                    {
                      length: Math.max(
                        storedPlayers.length,
                        fallbackPlayerNames.length,
                        4,
                      ),
                    },
                    (_, index) => {
                      const storedPlayer =
                        storedPlayers[index];

                      if (
                        storedPlayer &&
                        typeof storedPlayer === "object"
                      ) {
                        return {
                          name:
                            typeof storedPlayer.name ===
                            "string"
                              ? storedPlayer.name
                              : fallbackPlayerNames[index] ||
                                `Player ${index + 1}`,
                          kills:
                            Number(storedPlayer.kills) || 0,
                          isAlive:
                            typeof storedPlayer.isAlive ===
                            "boolean"
                              ? storedPlayer.isAlive
                              : undefined,
                        };
                      }

                      return {
                        name:
                          fallbackPlayerNames[index] ||
                          `Player ${index + 1}`,
                        kills: 0,
                      };
                    },
                  );

                return {
                  squadId: resultDocument.id,
                  squadName:
                    typeof data.squadName === "string"
                      ? data.squadName
                      : "Unnamed Squad",
                  logoUrl:
                    typeof data.logoUrl === "string"
                      ? data.logoUrl
                      : "",
                  slot: Number(data.slot) || 0,
                  players,
                  playerNames: fallbackPlayerNames,
                  placement:
                    Number(data.placement) > 0
                      ? Number(data.placement)
                      : null,
                  totalKills:
                    Number(data.totalKills) || 0,
                  killPoints:
                    Number(data.killPoints) || 0,
                  placementPoints:
                    Number(data.placementPoints) || 0,
                  totalPoints:
                    Number(data.totalPoints) || 0,
                };
              });

            setResults(loadedResults);
            setResultsLoading(false);
          },
          (error) => {
            console.error(
              "Unable to load match results:",
              error,
            );
            setMessage(
              "Unable to load the results for this match.",
            );
            setResultsLoading(false);
          },
        );
      } catch (error) {
        console.error("Unable to load match:", error);
        setMessage("Unable to load this match.");
        setResultsLoading(false);
      }
    };

    void loadMatch();

    return () => {
      if (unsubscribeResults) {
        unsubscribeResults();
      }
    };
  }, [isAdmin, matchId]);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Checking admin account...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
            N² Scrims
          </p>

          <h1 className="mt-2 text-2xl font-black">
            Match Results
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Sign in with the administrator account.
          </p>

          <button
            type="button"
            onClick={signIn}
            className="mt-6 w-full rounded-lg bg-white px-4 py-3 font-black text-black"
          >
            Sign in with Google
          </button>

          {message && (
            <p className="mt-3 text-sm text-red-400">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 text-center shadow-2xl">
          <h1 className="text-2xl font-black text-red-400">
            Access denied
          </h1>

          <p className="mt-2 text-sm text-slate-300">
            This Google account is not authorized.
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {user.email}
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-5 rounded-lg bg-white px-4 py-2 font-black text-black"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                N² Scrims Admin
              </p>

              <h1 className="mt-1 text-3xl font-black">
                {matchDetails
                  ? `Match ${matchDetails.matchNumber} Results`
                  : "Match Results"}
              </h1>

              <p className="mt-1 text-sm text-slate-400">
                Finalized squad scores and player kills.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/history"
                className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-black hover:bg-violet-500"
              >
                Match History
              </Link>

              <Link
                href="/admin/matches"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10"
              >
                Live Score Dashboard
              </Link>

              <Link
                href="/admin/tournament"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10"
              >
                Tournament Standings
              </Link>

              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10"
              >
                Sign out
              </button>
            </div>
          </div>

          {matchDetails && (
            <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatBox
                label="Status"
                value={matchDetails.status}
              />

              <StatBox
                label="Squads"
                value={String(
                  matchDetails.squadCount ||
                    rankedResults.length,
                )}
              />

              <StatBox
                label="Total Kills"
                value={String(matchTotalKills)}
              />

              <StatBox
                label="Finalized"
                value={formatDate(matchDetails.finalizedAt)}
                small
              />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              {winner ? (
                <span>
                  Winner:{" "}
                  <strong className="text-white">
                    {winner.squadName}
                  </strong>{" "}
                  · {winner.totalKills} kills ·{" "}
                  {winner.totalPoints} points
                </span>
              ) : (
                <span>No winner available</span>
              )}
            </div>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search squad, player, or slot..."
              className="h-11 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-sm outline-none placeholder:text-slate-600 focus:border-violet-400 sm:max-w-sm"
            />
          </div>

          {message && (
            <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {message}
            </div>
          )}
        </header>

        {resultsLoading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center text-sm text-slate-400">
            Loading match results...
          </div>
        ) : !matchDetails ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <h2 className="text-xl font-black">
              Match not found
            </h2>

            <Link
              href="/admin/history"
              className="mt-5 inline-block rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-black"
            >
              Return to Match History
            </Link>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <h2 className="text-xl font-black">
              No results found
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Try a different squad or player name.
            </p>
          </div>
        ) : (
          <>
            <section className="mt-4 hidden overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl lg:block">
              <div className="grid grid-cols-[70px_90px_220px_520px_100px_120px_140px_120px] border-b border-white/10 bg-black/30 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <div>Rank</div>
                <div>Slot</div>
                <div>Squad</div>
                <div>Players</div>
                <div className="text-center">Squad Kills</div>
                <div>Placement</div>
                <div>Placement Pts</div>
                <div>Total</div>
              </div>

              {filteredResults.map((result) => {
                const originalRank =
                  rankedResults.findIndex(
                    (item) =>
                      item.squadId === result.squadId,
                  ) + 1;

                return (
                  <div
                    key={result.squadId}
                    className="grid grid-cols-[70px_90px_220px_520px_100px_120px_140px_120px] items-center border-b border-white/5 px-4 py-3 last:border-b-0 hover:bg-white/[0.03]"
                  >
                    <div className="text-lg font-black text-violet-400">
                      #{originalRank}
                    </div>

                    <div className="font-black">
                      #{result.slot}
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {result.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={result.logoUrl}
                            alt={`${result.squadName} logo`}
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <span className="text-xs text-slate-600">
                            LOGO
                          </span>
                        )}
                      </div>

                      <p className="truncate font-black">
                        {result.squadName}
                      </p>
                    </div>

                   <div className="space-y-2 w-full pr-10">
  {result.players.slice(0, 4).map((player, index) => (
    <div
      key={`${result.squadId}-${index}`}
      className="grid grid-cols-[1fr_60px] items-center gap-6"
    >
      <span className="truncate text-sm text-slate-300">
        {player.name}
      </span>

      <span className="text-right text-sm font-bold text-slate-400">
        {player.kills}
      </span>
    </div>
  ))}
</div>

                    <div className="flex h-full items-center justify-center pl-6">
  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/15 text-lg font-black text-yellow-400">
    {result.totalKills}
  </span>
</div>

                    <div className="font-black">
                      {result.placement
                        ? `#${result.placement}`
                        : "-"}
                    </div>

                    <div className="font-black">
                      {result.placementPoints}
                    </div>

                    <div className="text-xl font-black text-violet-400">
                      {result.totalPoints}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="mt-4 grid gap-3 lg:hidden">
              {filteredResults.map((result) => {
                const originalRank =
                  rankedResults.findIndex(
                    (item) =>
                      item.squadId === result.squadId,
                  ) + 1;

                return (
                  <article
                    key={result.squadId}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900"
                  >
                    <div className="flex items-center gap-3 border-b border-white/10 bg-black/20 p-4">
                      <div className="text-xl font-black text-violet-400">
                        #{originalRank}
                      </div>

                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {result.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={result.logoUrl}
                            alt={`${result.squadName} logo`}
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <span className="text-xs text-slate-600">
                            LOGO
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-black">
                          {result.squadName}
                        </p>

                        <p className="text-xs text-slate-500">
                          Slot #{result.slot}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] font-bold uppercase text-slate-500">
                          Total
                        </p>

                        <p className="text-xl font-black text-violet-400">
                          {result.totalPoints}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-px bg-white/10">
                      <MobileStat
                        label="Kills"
                        value={result.totalKills}
                      />

                      <MobileStat
                        label="Placement"
                        value={
                          result.placement
                            ? `#${result.placement}`
                            : "-"
                        }
                      />

                      <MobileStat
                        label="Place Pts"
                        value={result.placementPoints}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-4">
                      {result.players
                        .slice(0, 4)
                        .map((player, index) => (
                          <div
                            key={`${result.squadId}-mobile-${index}`}
                            className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs"
                          >
                            <span className="truncate text-slate-300">
                              {player.name}
                            </span>

                            <span className="font-black">
                              {player.kills}
                            </span>
                          </div>
                        ))}
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function StatBox({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p
        className={`mt-1 font-black capitalize text-white ${
          small ? "text-xs" : "text-lg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MobileStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-slate-900 px-2 py-3 text-center">
      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-black">
        {value}
      </p>
    </div>
  );
}