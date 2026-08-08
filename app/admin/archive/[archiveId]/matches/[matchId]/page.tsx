"use client";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/firebase";
import { rebuildArchivedStandings } from "@/lib/tournamentAdmin";

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
};

function getRankedResults(results: MatchResult[]) {
  return [...results].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.placement !== b.placement) {
      return (
        (a.placement ?? Number.MAX_SAFE_INTEGER) -
        (b.placement ?? Number.MAX_SAFE_INTEGER)
      );
    }
    if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
    return a.squadName.localeCompare(b.squadName);
  });
}

export default function ArchivedMatchResultsPage() {
  const params = useParams<{ archiveId: string; matchId: string }>();
  const archiveId = params.archiveId;
  const matchId = params.matchId;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [message, setMessage] = useState("");

  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const rankedResults = useMemo(
    () => getRankedResults(results),
    [results],
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      }),
    [],
  );

  useEffect(() => {
    if (!isAdmin || !archiveId || !matchId) {
      setLoading(false);
      return;
    }

    let unsubscribeResults: (() => void) | undefined;

    void (async () => {
      try {
        setLoading(true);

        const matchSnapshot = await getDoc(
          doc(
            db,
            "tournamentArchives",
            archiveId,
            "matches",
            matchId,
          ),
        );

        if (!matchSnapshot.exists()) {
          setMessage("Archived match not found.");
          setLoading(false);
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
        });

        unsubscribeResults = onSnapshot(
          query(
            collection(
              db,
              "tournamentArchives",
              archiveId,
              "matches",
              matchId,
              "results",
            ),
            orderBy("slot", "asc"),
          ),
          (snapshot) => {
            setResults(
              snapshot.docs.map((resultDocument) => {
                const data = resultDocument.data();
                const storedPlayers = Array.isArray(data.players)
                  ? data.players
                  : [];
                const fallbackNames = Array.isArray(data.playerNames)
                  ? data.playerNames
                  : [];

                const players: PlayerResult[] = Array.from(
                  {
                    length: Math.max(
                      storedPlayers.length,
                      fallbackNames.length,
                      4,
                    ),
                  },
                  (_, index) => {
                    const storedPlayer = storedPlayers[index];

                    if (
                      storedPlayer &&
                      typeof storedPlayer === "object"
                    ) {
                      return {
                        name:
                          typeof storedPlayer.name === "string"
                            ? storedPlayer.name
                            : fallbackNames[index] ||
                              `Player ${index + 1}`,
                        kills: Math.max(
                          0,
                          Number(storedPlayer.kills) || 0,
                        ),
                        isAlive:
                          typeof storedPlayer.isAlive === "boolean"
                            ? storedPlayer.isAlive
                            : undefined,
                      };
                    }

                    return {
                      name:
                        fallbackNames[index] ||
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
                  playerNames: fallbackNames,
                  placement:
                    Number(data.placement) > 0
                      ? Number(data.placement)
                      : null,
                  totalKills: Number(data.totalKills) || 0,
                  killPoints: Number(data.killPoints) || 0,
                  placementPoints:
                    Number(data.placementPoints) || 0,
                  totalPoints: Number(data.totalPoints) || 0,
                };
              }),
            );
            setLoading(false);
          },
          (error) => {
            console.error(error);
            setMessage("Unable to load archived match results.");
            setLoading(false);
          },
        );
      } catch (error) {
        console.error(error);
        setMessage("Unable to load archived match.");
        setLoading(false);
      }
    })();

    return () => unsubscribeResults?.();
  }, [isAdmin, archiveId, matchId]);

  function updatePlayerKills(
    squadId: string,
    playerIndex: number,
    value: number,
  ) {
    setResults((current) =>
      current.map((result) => {
        if (result.squadId !== squadId) return result;

        const players = result.players.map((player, index) =>
          index === playerIndex
            ? {
                ...player,
                kills: Math.max(0, Number(value) || 0),
              }
            : player,
        );

        const totalKills = players.reduce(
          (total, player) => total + player.kills,
          0,
        );

        // Preserve the original per-kill value when possible.
        const killValue =
          result.totalKills > 0
            ? result.killPoints / result.totalKills
            : 1;
        const killPoints = totalKills * killValue;

        return {
          ...result,
          players,
          totalKills,
          killPoints,
          totalPoints: killPoints + result.placementPoints,
        };
      }),
    );
  }

  function updatePlacementPoints(squadId: string, value: number) {
    setResults((current) =>
      current.map((result) => {
        if (result.squadId !== squadId) return result;
        const placementPoints = Math.max(0, Number(value) || 0);

        return {
          ...result,
          placementPoints,
          totalPoints: result.killPoints + placementPoints,
        };
      }),
    );
  }

  function updateTotalPoints(squadId: string, value: number) {
    setResults((current) =>
      current.map((result) =>
        result.squadId === squadId
          ? {
              ...result,
              totalPoints: Math.max(0, Number(value) || 0),
            }
          : result,
      ),
    );
  }

  async function saveChanges() {
    if (!isAdmin || saving || results.length === 0) return;

    if (
      !window.confirm(
        `Save edits to archived Match ${matchDetails?.matchNumber ?? ""}? Archive standings and champion will be recalculated.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const batch = writeBatch(db);

      results.forEach((result) => {
        batch.set(
          doc(
            db,
            "tournamentArchives",
            archiveId,
            "matches",
            matchId,
            "results",
            result.squadId,
          ),
          {
            players: result.players,
            playerNames: result.players.map((player) => player.name),
            totalKills: result.totalKills,
            killPoints: result.killPoints,
            placementPoints: result.placementPoints,
            totalPoints: result.totalPoints,
            editedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });

      await batch.commit();
      await rebuildArchivedStandings(archiveId);

      setMessage(
        "Archived match saved. Archive standings and champion were recalculated.",
      );
    } catch (error) {
      console.error(error);
      setMessage("Unable to save archived match changes.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Checking admin account...
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Admin access required.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <Link
            href={`/admin/archive/${archiveId}`}
            className="text-sm font-black text-violet-400"
          >
            ← Back to Archive
          </Link>

          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">
                Archived Match {matchDetails?.matchNumber ?? ""} Results
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Edit individual player kills, placement points, and total points.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={saving || loading || results.length === 0}
              className="rounded-lg bg-violet-600 px-5 py-3 text-sm font-black disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Archive Changes"}
            </button>
          </div>

          {message && (
            <div className="mt-4 rounded-lg border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-100">
              {message}
            </div>
          )}
        </header>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">
            Loading archived results...
          </div>
        ) : (
          <section className="mt-4 space-y-3">
            {rankedResults.map((result, rankIndex) => (
              <article
                key={result.squadId}
                className="rounded-2xl border border-white/10 bg-slate-900 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="text-xl font-black text-violet-400">
                    #{rankIndex + 1}
                  </div>

                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {result.logoUrl ? (
                      <img
                        src={result.logoUrl}
                        alt=""
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      "🏆"
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-black">
                      {result.squadName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Slot #{result.slot}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {result.players.slice(0, 4).map((player, playerIndex) => (
                    <label
                      key={`${result.squadId}-${playerIndex}`}
                      className="rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <span className="block truncate text-xs font-bold text-slate-300">
                        {player.name}
                      </span>
                      <span className="mt-2 block text-[9px] font-bold uppercase text-slate-500">
                        Kills
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={player.kills}
                        onChange={(event) =>
                          updatePlayerKills(
                            result.squadId,
                            playerIndex,
                            Number(event.target.value),
                          )
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-center font-black outline-none focus:border-violet-400"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <ReadOnlyScore label="Team Kills" value={result.totalKills} />
                  <ReadOnlyScore label="Kill Pts" value={result.killPoints} />

                  <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                    <span className="text-[9px] font-bold uppercase text-slate-500">
                      Place Pts
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={result.placementPoints}
                      onChange={(event) =>
                        updatePlacementPoints(
                          result.squadId,
                          Number(event.target.value),
                        )
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-center font-black outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-3 text-center">
                    <span className="text-[9px] font-bold uppercase text-violet-300">
                      Total Pts
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={result.totalPoints}
                      onChange={(event) =>
                        updateTotalPoints(
                          result.squadId,
                          Number(event.target.value),
                        )
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-violet-400/30 bg-slate-950 px-2 text-center font-black outline-none"
                    />
                  </label>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function ReadOnlyScore({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
      <p className="text-[9px] font-bold uppercase text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}
