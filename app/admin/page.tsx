"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db, googleProvider } from "@/firebase";

type Player = {
  name: string;
  role?: string;
};

type SquadStatus = "pending" | "approved" | "rejected";

type Squad = {
  id: string;
  squadName: string;
  players: Player[];
  logoUrl?: string;
  ownerName?: string;
  ownerEmail?: string;
  facebookName?: string;
  status: SquadStatus;
  createdAt?: Timestamp | Date | null;
};

const ADMIN_EMAIL = "victornicetry2@gmail.com";

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loadingSquads, setLoadingSquads] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loadingRegistration, setLoadingRegistration] = useState(true);
  const [changingRegistration, setChangingRegistration] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedLogo, setSelectedLogo] = useState<{
    url: string;
    squadName: string;
  } | null>(null);

  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadSquads();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoadingRegistration(false);
      return;
    }

    return onSnapshot(
      doc(db, "settings", "registration"),
      (snapshot) => {
        setRegistrationOpen(
          snapshot.exists() ? snapshot.data().isOpen !== false : true,
        );
        setLoadingRegistration(false);
      },
      (error) => {
        console.error("Unable to load registration status:", error);
        setMessage("Unable to load registration status.");
        setLoadingRegistration(false);
      },
    );
  }, [isAdmin]);

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedLogo(null);
      }
    }

    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, []);

  async function signInWithGoogle() {
    try {
      setMessage("");
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
      setMessage("Google sign-in failed. Please try again.");
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setSquads([]);
    } catch (error) {
      console.error(error);
      setMessage("Sign-out failed.");
    }
  }

  async function loadSquads() {
    setLoadingSquads(true);
    setMessage("");

    try {
      let snapshot;

      try {
        snapshot = await getDocs(
          query(collection(db, "squads"), orderBy("createdAt", "desc")),
        );
      } catch {
        snapshot = await getDocs(collection(db, "squads"));
      }

      const loadedSquads: Squad[] = snapshot.docs.map((squadDocument) => {
        const data = squadDocument.data();

        return {
          id: squadDocument.id,
          squadName:
            typeof data.squadName === "string"
              ? data.squadName
              : "Unnamed Squad",
          players: Array.isArray(data.players) ? data.players : [],
          logoUrl:
            typeof data.logoUrl === "string" ? data.logoUrl : "",
          ownerName:
            typeof data.ownerName === "string" ? data.ownerName : "",
          ownerEmail:
            typeof data.ownerEmail === "string" ? data.ownerEmail : "",
          facebookName:
            typeof data.facebookName === "string" ? data.facebookName : "",
          status:
            data.status === "approved" || data.status === "rejected"
              ? data.status
              : "pending",
          createdAt: data.createdAt || null,
        };
      });

      loadedSquads.sort(
        (first, second) =>
          getCreatedTime(second.createdAt) -
          getCreatedTime(first.createdAt),
      );

      setSquads(loadedSquads);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load squads from Firestore.");
    } finally {
      setLoadingSquads(false);
    }
  }

  async function toggleRegistration() {
    if (loadingRegistration || changingRegistration) return;

    const nextValue = !registrationOpen;

    if (
      !window.confirm(
        nextValue
          ? "Open registration for new squads?"
          : "Close registration for new squads?",
      )
    ) {
      return;
    }

    setChangingRegistration(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "settings", "registration"), {
        isOpen: nextValue,
      });

      setMessage(
        nextValue
          ? "Registration is now open."
          : "Registration is now closed.",
      );
    } catch (error) {
      console.error(error);
      setMessage("Unable to update registration.");
    } finally {
      setChangingRegistration(false);
    }
  }

  async function updateStatus(
    squadId: string,
    status: SquadStatus,
  ) {
    setWorkingId(squadId);
    setMessage("");

    try {
      await updateDoc(doc(db, "squads", squadId), { status });

      setSquads((current) =>
        current.map((squad) =>
          squad.id === squadId ? { ...squad, status } : squad,
        ),
      );

      setMessage(`Squad status changed to ${status}.`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to update squad status.");
    } finally {
      setWorkingId(null);
    }
  }

  async function removeRejectedSquad(squad: Squad) {
    if (squad.status !== "rejected") return;

    if (
      !window.confirm(
        `Permanently remove "${squad.squadName}"?`,
      )
    ) {
      return;
    }

    setWorkingId(squad.id);

    try {
      await deleteDoc(doc(db, "squads", squad.id));
      setSquads((current) =>
        current.filter((item) => item.id !== squad.id),
      );
      setMessage(`${squad.squadName} was removed.`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to remove squad.");
    } finally {
      setWorkingId(null);
    }
  }

  const filteredSquads = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return squads;

    return squads.filter((squad) => {
      const playerNames = squad.players
        .map((player) => player.name)
        .join(" ")
        .toLowerCase();

      return (
        squad.squadName.toLowerCase().includes(term) ||
        squad.ownerName?.toLowerCase().includes(term) ||
        squad.ownerEmail?.toLowerCase().includes(term) ||
        squad.facebookName?.toLowerCase().includes(term) ||
        squad.status.toLowerCase().includes(term) ||
        playerNames.includes(term)
      );
    });
  }, [squads, search]);

  const pendingSquads = squads.filter(
    (squad) => squad.status === "pending",
  ).length;
  const approvedSquads = squads.filter(
    (squad) => squad.status === "approved",
  ).length;
  const rejectedSquads = squads.filter(
    (squad) => squad.status === "rejected",
  ).length;

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading admin page...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-blue-900 bg-black/90 p-8 text-center">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-400">
            N² Scrims
          </p>
          <h1 className="mt-4 text-4xl font-black uppercase">
            Admin Dashboard
          </h1>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="mt-8 w-full rounded-xl bg-blue-700 px-6 py-4 font-black uppercase"
          >
            Sign In With Google
          </button>
          {message && (
            <p className="mt-4 text-sm text-red-300">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-red-900 bg-black/90 p-8 text-center">
          <h1 className="text-3xl font-black uppercase text-red-400">
            Access Denied
          </h1>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-7 rounded-xl bg-blue-700 px-6 py-3 font-bold uppercase"
          >
            Sign Out
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px]">
          <header className="rounded-3xl border border-blue-900 bg-black/90 p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-400">
                  N² Scrims
                </p>
                <h1 className="mt-2 text-3xl font-black uppercase sm:text-4xl">
                  Admin Dashboard
                </h1>
                <p className="mt-2 text-sm text-gray-400">
                  Signed in as {user.email}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void loadSquads()}
                  disabled={loadingSquads}
                  className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black uppercase disabled:opacity-50"
                >
                  {loadingSquads ? "Refreshing..." : "Refresh Squads"}
                </button>

              </div>
            </div>
          </header>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AdminButton
              href="/admin/matches"
              title="Matches"
              description="Create matches and manage live scoring"
              icon="🎮"
            />
            <AdminButton
              href="/admin/tournament"
              title="Standings"
              description="View and manage the tournament leaderboard"
              icon="🏆"
            />
            <AdminButton
              href="/admin/history"
              title="History"
              description="Review completed match results"
              icon="📋"
            />
            <AdminButton
              href="/admin/archive"
              title="Archive"
              description="Open previous tournament records"
              icon="🗂️"
            />
            <AdminButton
              href="/admin/settings"
              title="Tournament Settings"
              description="Edit tournament details, maps, and rules"
              icon="⚙️"
            />
            <AdminButton
              href="/admin/graphics"
              title="Graphics"
              description="Generate tournament result graphics"
              icon="🖼️"
            />
            <AdminButton
              href="/overlay"
              title="Live Overlay"
              description="Open the live side standings overlay"
              icon="🎥"
              openInNewTab
            />
            <AdminButton
              href="/overlay/results"
              title="Results Overlay"
              description="Open the complete end-of-match results screen"
              icon="🏁"
              openInNewTab
            />
          </section>

          {message && (
            <div className="mt-5 rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
              {message}
            </div>
          )}

          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total" value={squads.length} />
            <StatCard label="Pending" value={pendingSquads} />
            <StatCard label="Approved" value={approvedSquads} />
            <StatCard label="Rejected" value={rejectedSquads} />
          </section>

          <section
            className={`mt-6 rounded-3xl border p-6 ${
              registrationOpen
                ? "border-green-800 bg-green-950/20"
                : "border-red-800 bg-red-950/20"
            }`}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                  Tournament Registration
                </p>
                <h2
                  className={`mt-2 text-2xl font-black uppercase ${
                    registrationOpen
                      ? "text-green-300"
                      : "text-red-300"
                  }`}
                >
                  Registration {registrationOpen ? "Open" : "Closed"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => void toggleRegistration()}
                disabled={
                  loadingRegistration || changingRegistration
                }
                className={`rounded-xl px-6 py-4 text-sm font-black uppercase disabled:opacity-50 ${
                  registrationOpen
                    ? "bg-red-700"
                    : "bg-green-700"
                }`}
              >
                {changingRegistration
                  ? "Updating..."
                  : registrationOpen
                    ? "Close Registration"
                    : "Open Registration"}
              </button>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-blue-900 bg-black/90 p-4">
            <label className="text-xs font-black uppercase tracking-widest text-blue-400">
              Search Squads
            </label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search squad, player, Messenger name, email, or status..."
              className="mt-3 w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-white outline-none"
            />
          </section>

          {loadingSquads ? (
            <div className="mt-8 rounded-2xl border border-blue-900 bg-black/90 p-10 text-center text-blue-300">
              Loading squads...
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-blue-900 bg-black/90">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="border-b border-blue-900 bg-blue-950/30">
                  <tr className="text-xs uppercase tracking-wider text-blue-300">
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Logo</th>
                    <th className="px-3 py-3">Squad</th>
                    <th className="px-3 py-3">Players</th>
                    <th className="px-3 py-3">Facebook / Messenger</th>
                    <th className="px-3 py-3">Registered By</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSquads.map((squad, index) => {
                    const isWorking = workingId === squad.id;

                    return (
                      <tr
                        key={squad.id}
                        className="border-b border-gray-900"
                      >
                        <td className="px-3 py-3">
                          {index + 1}
                        </td>
                        <td className="px-3 py-3">
                          {squad.logoUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedLogo({
                                  url: squad.logoUrl || "",
                                  squadName: squad.squadName,
                                })
                              }
                              className="h-14 w-14 overflow-hidden rounded-xl border border-blue-800"
                            >
                              <img
                                src={squad.logoUrl}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 font-black">
                          {squad.squadName}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-300">
                          {squad.players
                            .map((player) => player.name)
                            .join(", ")}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-bold text-blue-300">
                            {squad.facebookName || "—"}
                          </div>
                          {squad.facebookName && (
                            <button
                              type="button"
                              onClick={() =>
                                void navigator.clipboard.writeText(
                                  squad.facebookName || "",
                                )
                              }
                              className="mt-2 rounded-lg border border-blue-800 px-3 py-1.5 text-[11px] font-black uppercase text-blue-300 hover:bg-blue-950"
                            >
                              Copy Name
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div>{squad.ownerName || "Unknown"}</div>
                          <div className="text-gray-500">
                            {squad.ownerEmail}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {squad.status}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                void updateStatus(
                                  squad.id,
                                  "approved",
                                )
                              }
                              className="rounded-lg bg-green-700 px-3 py-2 text-xs font-black uppercase disabled:opacity-40"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                void updateStatus(
                                  squad.id,
                                  "pending",
                                )
                              }
                              className="rounded-lg bg-yellow-700 px-3 py-2 text-xs font-black uppercase disabled:opacity-40"
                            >
                              Pending
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                void updateStatus(
                                  squad.id,
                                  "rejected",
                                )
                              }
                              className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black uppercase disabled:opacity-40"
                            >
                              Reject
                            </button>
                            {squad.status === "rejected" && (
                              <button
                                type="button"
                                disabled={isWorking}
                                onClick={() =>
                                  void removeRejectedSquad(squad)
                                }
                                className="rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs font-black uppercase text-red-300 disabled:opacity-40"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {selectedLogo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setSelectedLogo(null)}
        >
          <div className="w-full max-w-lg rounded-3xl border border-blue-800 bg-gray-950 p-6 text-center">
            <h2 className="text-2xl font-black">
              {selectedLogo.squadName}
            </h2>
            <img
              src={selectedLogo.url}
              alt=""
              className="mt-6 max-h-[420px] w-full object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

function AdminButton({
  href,
  title,
  description,
  icon,
  openInNewTab = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
  openInNewTab?: boolean;
}) {
  return (
    <Link
      href={href}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      className="rounded-2xl border border-blue-900 bg-blue-950/20 p-5 transition hover:border-blue-500 hover:bg-blue-950/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-3xl">{icon}</div>

        {openInNewTab && (
          <span className="rounded-full border border-blue-800 bg-blue-950/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-300">
            New Tab
          </span>
        )}
      </div>

      <h2 className="mt-3 text-xl font-black uppercase">
        {title}
      </h2>

      <p className="mt-1 text-sm text-gray-400">
        {description}
      </p>
    </Link>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-blue-900 bg-black/90 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-blue-300">
        {value}
      </p>
    </div>
  );
}

function getCreatedTime(createdAt: Squad["createdAt"]) {
  if (!createdAt) return 0;
  if (createdAt instanceof Date) return createdAt.getTime();

  if (
    typeof createdAt === "object" &&
    "toDate" in createdAt &&
    typeof createdAt.toDate === "function"
  ) {
    return createdAt.toDate().getTime();
  }

  return 0;
}
