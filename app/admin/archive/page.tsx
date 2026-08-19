"use client";

import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/firebase";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

type ArchiveItem = {
  id: string;
  tournamentName: string;
  season: string;
  championName: string;
  championLogoUrl: string;
  matchCount: number;
  squadCount: number;
  archivedAt: Date | null;
};

function toDate(value: unknown) {
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

function formatDate(value: Date | null) {
  if (!value) return "Date unavailable";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default function ArchivePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [view, setView] = useState<"new" | "previous">("new");

  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const newestArchive = useMemo(() => archives[0] ?? null, [archives]);
  const previousArchives = useMemo(() => archives.slice(1), [archives]);


  useEffect(
    () =>
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      }),
    [],
  );

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    return onSnapshot(
      query(
        collection(db, "tournamentArchives"),
        orderBy("archivedAt", "desc"),
      ),
      (snapshot) => {
        setArchives(
          snapshot.docs.map((archiveDocument) => {
            const data = archiveDocument.data();

            return {
              id: archiveDocument.id,
              tournamentName:
                typeof data.tournamentName === "string"
                  ? data.tournamentName
                  : "Untitled Tournament",
              season:
                typeof data.season === "string"
                  ? data.season
                  : "",
              championName:
                typeof data.championName === "string"
                  ? data.championName
                  : "No champion",
              championLogoUrl:
                typeof data.championLogoUrl === "string"
                  ? data.championLogoUrl
                  : "",
              matchCount: Number(data.matchCount) || 0,
              squadCount: Number(data.squadCount) || 0,
              archivedAt: toDate(data.archivedAt),
            };
          }),
        );

        setLoading(false);
      },
      (error) => {
        console.error("Unable to load archives:", error);
        setLoading(false);
      },
    );
  }, [isAdmin]);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Checking admin account...
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-black">
            Admin access required
          </h1>

          {user && (
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="mt-5 rounded-lg bg-white px-4 py-2 font-black text-black"
            >
              Sign out
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto max-w-[1400px]">
        <header className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                N² Scrims Admin
              </p>

              <h1 className="mt-1 text-3xl font-black">
                Tournament Archive
              </h1>

              <p className="mt-1 text-sm text-slate-400">
                Previous tournaments preserved with standings and match results.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/history"
                className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-black"
              >
                Match History
              </Link>

              <Link
                href="/admin/tournament"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black"
              >
                Tournament Standings
              </Link>

              <Link
                href="/admin/matches"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black"
              >
                Live Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setView("new")}
              className={`rounded-xl px-4 py-3 text-sm font-black uppercase transition ${
                view === "new"
                  ? "bg-violet-600 text-white"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              New Update
            </button>
            <button
              type="button"
              onClick={() => setView("previous")}
              className={`rounded-xl px-4 py-3 text-sm font-black uppercase transition ${
                view === "previous"
                  ? "bg-violet-600 text-white"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Previous Updates ({previousArchives.length})
            </button>
          </div>
        </section>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center text-slate-400">
            Loading archives...
          </div>
        ) : archives.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <h2 className="text-xl font-black">No archived tournaments</h2>
            <p className="mt-2 text-sm text-slate-400">
              Archive the current scrim and it will appear here as the New Update.
            </p>
          </div>
        ) : view === "new" ? (
          newestArchive ? (
            <section className="mt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                    Latest Archive
                  </p>
                  <h2 className="mt-1 text-2xl font-black">New Update</h2>
                </div>
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-black uppercase text-violet-200">
                  Newest
                </span>
              </div>
              <ArchiveCard archive={newestArchive} featured />
            </section>
          ) : null
        ) : previousArchives.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <h2 className="text-xl font-black">No previous updates yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Older archives will move here automatically after you archive another scrim.
            </p>
          </div>
        ) : (
          <section className="mt-4">
            <div className="mb-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                Archive History
              </p>
              <h2 className="mt-1 text-2xl font-black">Previous Updates</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {previousArchives.map((archive) => (
                <ArchiveCard key={archive.id} archive={archive} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ArchiveCard({
  archive,
  featured = false,
}: {
  archive: ArchiveItem;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl ${
        featured ? "ring-1 ring-violet-500/30" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
          {archive.championLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={archive.championLogoUrl}
              alt={`${archive.championName} logo`}
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="text-2xl">🏆</span>
          )}
        </div>

        <div className="min-w-0">
          <h2 className="truncate text-xl font-black">
            {archive.tournamentName}
          </h2>
          <p className="text-sm text-slate-400">
            {archive.season ? `Season ${archive.season} · ` : ""}
            {formatDate(archive.archivedAt)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Stat label="Champion" value={archive.championName} />
        <Stat label="Matches" value={archive.matchCount} />
        <Stat label="Squads" value={archive.squadCount} />
      </div>

      <Link
        href={`/admin/archive/${archive.id}`}
        className="mt-5 block rounded-lg bg-violet-600 px-4 py-2.5 text-center text-sm font-black"
      >
        View Update
      </Link>
    </article>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[9px] font-bold uppercase text-slate-500">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-black">
        {value}
      </p>
    </div>
  );
}
