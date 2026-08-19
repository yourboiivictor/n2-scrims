"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/firebase";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

type Standing = {
  squadId: string;
  rank: number;
  squadName: string;
  logoUrl: string;
  matchesPlayed: number;
  chickenDinners: number;
  totalKills: number;
  placementPoints: number;
  totalPoints: number;
};

type ArchivedMatch = {
  id: string;
  matchNumber: number;
  status: string;
  squadCount: number;
};

async function deleteDocumentsInBatches(
  documents: Array<{ ref: ReturnType<typeof doc> }>,
) {
  const batchSize = 450;

  for (let index = 0; index < documents.length; index += batchSize) {
    const batch = writeBatch(db);

    documents.slice(index, index + batchSize).forEach((documentSnapshot) => {
      batch.delete(documentSnapshot.ref);
    });

    await batch.commit();
  }
}

async function permanentlyDeleteArchive(archiveId: string) {
  const standingsSnapshot = await getDocs(
    collection(db, "tournamentArchives", archiveId, "standings"),
  );

  await deleteDocumentsInBatches(standingsSnapshot.docs);

  const matchesSnapshot = await getDocs(
    collection(db, "tournamentArchives", archiveId, "matches"),
  );

  for (const matchDocument of matchesSnapshot.docs) {
    const resultsSnapshot = await getDocs(
      collection(
        db,
        "tournamentArchives",
        archiveId,
        "matches",
        matchDocument.id,
        "results",
      ),
    );

    await deleteDocumentsInBatches(resultsSnapshot.docs);
  }

  await deleteDocumentsInBatches(matchesSnapshot.docs);
  await deleteDoc(doc(db, "tournamentArchives", archiveId));
}

export default function ArchiveDetailsPage() {
  const params = useParams<{ archiveId: string }>();
  const router = useRouter();
  const archiveId = params.archiveId;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Tournament Archive");
  const [season, setSeason] = useState("");
  const [champion, setChampion] = useState("No champion");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<ArchivedMatch[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const topPoints = useMemo(
    () =>
      [...standings]
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }
          if (b.totalKills !== a.totalKills) {
            return b.totalKills - a.totalKills;
          }
          return a.squadName.localeCompare(b.squadName);
        })
        .slice(0, 5),
    [standings],
  );

  const topKills = useMemo(
    () =>
      [...standings]
        .sort((a, b) => {
          if (b.totalKills !== a.totalKills) {
            return b.totalKills - a.totalKills;
          }
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }
          return a.squadName.localeCompare(b.squadName);
        })
        .slice(0, 5),
    [standings],
  );

  const topWins = useMemo(
    () =>
      [...standings]
        .sort((a, b) => {
          if (b.chickenDinners !== a.chickenDinners) {
            return b.chickenDinners - a.chickenDinners;
          }
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }
          return a.squadName.localeCompare(b.squadName);
        })
        .slice(0, 5),
    [standings],
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
    if (!isAdmin || !archiveId) return;

    void (async () => {
      try {
        setLoading(true);
        setMessage("");

        const archiveSnapshot = await getDoc(
          doc(db, "tournamentArchives", archiveId),
        );

        if (!archiveSnapshot.exists()) {
          setMessage("This tournament archive could not be found.");
          setLoading(false);
          return;
        }

        const data = archiveSnapshot.data();

        setTitle(
          typeof data.tournamentName === "string"
            ? data.tournamentName
            : "Tournament Archive",
        );

        setSeason(
          typeof data.season === "string"
            ? data.season
            : "",
        );

        setChampion(
          typeof data.championName === "string"
            ? data.championName
            : "No champion",
        );

        const [standingsSnapshot, matchesSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(
                db,
                "tournamentArchives",
                archiveId,
                "standings",
              ),
              orderBy("rank", "asc"),
            ),
          ),
          getDocs(
            query(
              collection(
                db,
                "tournamentArchives",
                archiveId,
                "matches",
              ),
              orderBy("matchNumber", "asc"),
            ),
          ),
        ]);

        setStandings(
          standingsSnapshot.docs.map((standingDocument) => ({
            squadId: standingDocument.id,
            ...(standingDocument.data() as Omit<Standing, "squadId">),
          })),
        );

        setMatches(
          matchesSnapshot.docs.map((matchDocument) => {
            const matchData = matchDocument.data();

            return {
              id: matchDocument.id,
              matchNumber: Number(matchData.matchNumber) || 0,
              status:
                typeof matchData.status === "string"
                  ? matchData.status
                  : "finalized",
              squadCount: Number(matchData.squadCount) || 0,
            };
          }),
        );
      } catch (error) {
        console.error("Unable to load archive:", error);
        setMessage("Unable to load this tournament archive.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, archiveId]);

  async function handleDeleteArchive() {
    const firstConfirmation = window.confirm(
      `Permanently delete "${title}"?\n\nThis will delete all archived standings, matches, and match results.\n\nThis action cannot be undone.`,
    );

    if (!firstConfirmation) return;

    const finalConfirmation = window.confirm(
      `Delete "${title}" forever?\n\nThis is your final warning. This action cannot be undone.`,
    );

    if (!finalConfirmation) {
      setMessage("Archive deletion cancelled.");
      return;
    }

    setDeleting(true);
    setMessage("");

    try {
      await permanentlyDeleteArchive(archiveId);
      router.push("/admin/archive");
      router.refresh();
    } catch (error) {
      console.error("Unable to delete archive:", error);
      setMessage(
        "Unable to delete the archive. Check your Firestore rules and try again.",
      );
      setDeleting(false);
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                href="/admin/archive"
                className="text-sm font-black text-violet-400"
              >
                ← Tournament Archive
              </Link>

              <h1 className="mt-3 text-3xl font-black">{title}</h1>

              <p className="mt-1 text-sm text-slate-400">
                {season ? `Season ${season} · ` : ""}
                Champion:{" "}
                <strong className="text-white">{champion}</strong>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/archive/${archiveId}/graphics`}
                className="rounded-lg bg-white px-4 py-2.5 text-sm font-black text-black"
              >
                Archive Graphics
              </Link>

              <button
                type="button"
                onClick={() => void handleDeleteArchive()}
                disabled={deleting || loading}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-black text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting
                  ? "Deleting Archive..."
                  : "Permanently Delete Archive"}
              </button>
            </div>
          </div>

          {message && (
            <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {message}
            </div>
          )}
        </header>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">
            Loading archive...
          </div>
        ) : (
          <>
            <section className="mt-4 grid gap-4 lg:grid-cols-3">
              <TopCard
                title="Top Points"
                rows={topPoints}
                value={(row) => `${row.totalPoints} pts`}
              />
              <TopCard
                title="Top Kills"
                rows={topKills}
                value={(row) => `${row.totalKills} kills`}
              />
              <TopCard
                title="Top Wins"
                rows={topWins}
                value={(row) => `${row.chickenDinners} wins`}
              />
            </section>

            <section className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900">
              <div className="border-b border-white/10 px-5 py-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                  Final Results
                </p>
                <h2 className="mt-1 text-2xl font-black">Final Standings</h2>
              </div>

              <div className="min-w-[900px]">
                <div className="grid grid-cols-[70px_minmax(200px,1fr)_100px_130px_110px_140px_120px] border-b border-white/10 bg-black/30 px-4 py-3 text-[10px] font-black uppercase text-slate-500">
                  <div>Rank</div>
                  <div>Squad</div>
                  <div>Matches</div>
                  <div>Chicken Dinners</div>
                  <div>Kills</div>
                  <div>Placement Pts</div>
                  <div>Total</div>
                </div>

                {standings.map((standing) => (
                  <div
                    key={standing.squadId}
                    className="grid grid-cols-[70px_minmax(200px,1fr)_100px_130px_110px_140px_120px] items-center border-b border-white/5 px-4 py-3 last:border-b-0"
                  >
                    <div className="font-black text-violet-400">
                      #{standing.rank}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                        {standing.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={standing.logoUrl}
                            alt=""
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          "🏆"
                        )}
                      </div>

                      <span className="font-black">
                        {standing.squadName}
                      </span>
                    </div>

                    <div>{standing.matchesPlayed}</div>
                    <div>{standing.chickenDinners}</div>
                    <div>{standing.totalKills}</div>
                    <div>{standing.placementPoints}</div>

                    <div className="text-xl font-black text-violet-400">
                      {standing.totalPoints}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-4">
              <div className="mb-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                  Match History
                </p>
                <h2 className="mt-1 text-2xl font-black">Previous Matches</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {matches.map((match) => (
                  <article
                    key={match.id}
                    className="rounded-2xl border border-white/10 bg-slate-900 p-5"
                  >
                    <p className="text-xs font-black uppercase text-violet-400">
                      Archived Match
                    </p>

                    <h2 className="mt-1 text-2xl font-black">
                      Match {match.matchNumber}
                    </h2>

                    <p className="mt-1 text-sm text-slate-400">
                      {match.squadCount} squads · {match.status}
                    </p>

                    <Link
                      href={`/admin/archive/${archiveId}/matches/${match.id}`}
                      className="mt-4 block rounded-lg bg-violet-600 px-4 py-2.5 text-center text-sm font-black"
                    >
                      View Match Results
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function TopCard({
  title,
  rows,
  value,
}: {
  title: string;
  rows: Standing[];
  value: (row: Standing) => string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h2 className="text-xl font-black">{title}</h2>

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-500">
            No archived stats.
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${title}-${row.squadId}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-7 shrink-0 font-black text-violet-400">
                  #{index + 1}
                </span>

                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                  {row.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.logoUrl}
                      alt=""
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    "🏆"
                  )}
                </div>

                <span className="truncate font-black">{row.squadName}</span>
              </div>

              <span className="shrink-0 font-black">{value(row)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
