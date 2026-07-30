"use client";

import { useEffect, useMemo, useState } from "react";
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
  logoPublicId?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerUid?: string;
  status: SquadStatus;
  createdAt?: Timestamp | Date | null;
};

type TournamentSettings = {
  title: string;
  prizePool: string;
  maxSquads: number;
  registrationDeadline: string;
  messengerLink: string;
  maps: string[];
  rules: string[];
};

const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  title: "N² Scrims",
  prizePool: "$500 USD",
  maxSquads: 25,
  registrationDeadline: "To Be Announced",
  messengerLink: "https://m.me/ch/AbYdfxf6YUCkPx7P/",
  maps: ["Erangel", "Miramar", "Sanhok", "Rondo"],
  rules: ["No cheating", "No teaming", "Follow admin instructions"],
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

  const [tournamentSettings, setTournamentSettings] =
    useState<TournamentSettings>(DEFAULT_TOURNAMENT_SETTINGS);
  const [loadingTournamentSettings, setLoadingTournamentSettings] =
    useState(true);
  const [savingTournamentSettings, setSavingTournamentSettings] =
    useState(false);
  const [mapsText, setMapsText] = useState(
    DEFAULT_TOURNAMENT_SETTINGS.maps.join("\n")
  );
  const [rulesText, setRulesText] = useState(
    DEFAULT_TOURNAMENT_SETTINGS.rules.join("\n")
  );

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  const [selectedLogo, setSelectedLogo] = useState<{
    url: string;
    squadName: string;
  } | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadSquads();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoadingRegistration(false);
      return;
    }

    const registrationReference = doc(
      db,
      "settings",
      "registration"
    );

    const unsubscribe = onSnapshot(
      registrationReference,
      (snapshot) => {
        if (!snapshot.exists()) {
          setRegistrationOpen(true);
          setMessage(
            'Registration settings were not found. Create "settings/registration" with the boolean field "isOpen".'
          );
          setLoadingRegistration(false);
          return;
        }

        const data = snapshot.data();

        setRegistrationOpen(data.isOpen !== false);
        setLoadingRegistration(false);
      },
      (error) => {
        console.error("Registration settings error:", error);

        setMessage(
          "Unable to load the registration setting from Firestore."
        );

        setLoadingRegistration(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoadingTournamentSettings(false);
      return;
    }

    const tournamentReference = doc(db, "settings", "tournament");

    const unsubscribe = onSnapshot(
      tournamentReference,
      (snapshot) => {
        if (!snapshot.exists()) {
          setTournamentSettings(DEFAULT_TOURNAMENT_SETTINGS);
          setMapsText(DEFAULT_TOURNAMENT_SETTINGS.maps.join("\n"));
          setRulesText(DEFAULT_TOURNAMENT_SETTINGS.rules.join("\n"));
          setMessage(
            'Tournament settings were not found. Create "settings/tournament" in Firestore.'
          );
          setLoadingTournamentSettings(false);
          return;
        }

        const data = snapshot.data();

        const loadedSettings: TournamentSettings = {
          title:
            typeof data.title === "string"
              ? data.title
              : DEFAULT_TOURNAMENT_SETTINGS.title,
          prizePool:
            typeof data.prizePool === "string"
              ? data.prizePool
              : DEFAULT_TOURNAMENT_SETTINGS.prizePool,
          maxSquads:
            typeof data.maxSquads === "number" && data.maxSquads > 0
              ? data.maxSquads
              : DEFAULT_TOURNAMENT_SETTINGS.maxSquads,
          registrationDeadline:
            typeof data.registrationDeadline === "string"
              ? data.registrationDeadline
              : DEFAULT_TOURNAMENT_SETTINGS.registrationDeadline,
          messengerLink:
            typeof data.messengerLink === "string"
              ? data.messengerLink
              : DEFAULT_TOURNAMENT_SETTINGS.messengerLink,
          maps: Array.isArray(data.maps)
            ? data.maps.filter((item): item is string => typeof item === "string")
            : DEFAULT_TOURNAMENT_SETTINGS.maps,
          rules: Array.isArray(data.rules)
            ? data.rules.filter((item): item is string => typeof item === "string")
            : DEFAULT_TOURNAMENT_SETTINGS.rules,
        };

        setTournamentSettings(loadedSettings);
        setMapsText(loadedSettings.maps.join("\n"));
        setRulesText(loadedSettings.rules.join("\n"));
        setLoadingTournamentSettings(false);
      },
      (error) => {
        console.error("Tournament settings error:", error);
        setMessage("Unable to load tournament settings from Firestore.");
        setLoadingTournamentSettings(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedLogo(null);
      }
    }

    window.addEventListener("keydown", closeWithEscape);

    return () => {
      window.removeEventListener("keydown", closeWithEscape);
    };
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
      setRegistrationOpen(true);
      setLoadingRegistration(true);
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
        const squadsQuery = query(
          collection(db, "squads"),
          orderBy("createdAt", "desc")
        );

        snapshot = await getDocs(squadsQuery);
      } catch {
        snapshot = await getDocs(collection(db, "squads"));
      }

      const loadedSquads: Squad[] = snapshot.docs.map((squadDocument) => {
        const data = squadDocument.data();

        return {
          id: squadDocument.id,
          squadName: data.squadName || "Unnamed Squad",
          players: Array.isArray(data.players) ? data.players : [],
          logoUrl:
            typeof data.logoUrl === "string" ? data.logoUrl : "",
          logoPublicId:
            typeof data.logoPublicId === "string"
              ? data.logoPublicId
              : "",
          ownerName: data.ownerName || "",
          ownerEmail: data.ownerEmail || "",
          ownerUid: data.ownerUid || "",
          status:
            data.status === "approved" || data.status === "rejected"
              ? data.status
              : "pending",
          createdAt: data.createdAt || null,
        };
      });

      loadedSquads.sort((firstSquad, secondSquad) => {
        return (
          getCreatedTime(secondSquad.createdAt) -
          getCreatedTime(firstSquad.createdAt)
        );
      });

      setSquads(loadedSquads);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load squads from Firestore.");
    } finally {
      setLoadingSquads(false);
    }
  }

  async function toggleRegistration() {
    if (loadingRegistration || changingRegistration) {
      return;
    }

    const newRegistrationStatus = !registrationOpen;

    const confirmationMessage = newRegistrationStatus
      ? "Open registration for new squads?"
      : "Close registration?\n\nNew squads will not be able to register until you reopen it.";

    const confirmed = window.confirm(confirmationMessage);

    if (!confirmed) {
      return;
    }

    setChangingRegistration(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "settings", "registration"), {
        isOpen: newRegistrationStatus,
      });

      setMessage(
        newRegistrationStatus
          ? "Registration is now open."
          : "Registration is now closed."
      );
    } catch (error) {
      console.error("Registration toggle error:", error);

      setMessage(
        'Unable to update registration. Confirm that "settings/registration" exists and contains the boolean field "isOpen".'
      );
    } finally {
      setChangingRegistration(false);
    }
  }

  async function saveTournamentSettings() {
    if (savingTournamentSettings || loadingTournamentSettings) {
      return;
    }

    const cleanTitle = tournamentSettings.title.trim();
    const cleanPrizePool = tournamentSettings.prizePool.trim();
    const cleanDeadline = tournamentSettings.registrationDeadline.trim();
    const cleanMessengerLink = tournamentSettings.messengerLink.trim();
    const cleanMaps = mapsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const cleanRules = rulesText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!cleanTitle) {
      setMessage("Tournament name cannot be empty.");
      return;
    }

    if (!cleanPrizePool) {
      setMessage("Prize pool cannot be empty.");
      return;
    }

    if (
      !Number.isInteger(tournamentSettings.maxSquads) ||
      tournamentSettings.maxSquads < 1
    ) {
      setMessage("Maximum squads must be a whole number greater than 0.");
      return;
    }

    if (cleanMaps.length === 0) {
      setMessage("Add at least one map.");
      return;
    }

    if (cleanRules.length === 0) {
      setMessage("Add at least one rule.");
      return;
    }

    setSavingTournamentSettings(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "settings", "tournament"), {
        title: cleanTitle,
        prizePool: cleanPrizePool,
        maxSquads: tournamentSettings.maxSquads,
        registrationDeadline: cleanDeadline || "To Be Announced",
        messengerLink: cleanMessengerLink,
        maps: cleanMaps,
        rules: cleanRules,
      });

      setMessage("Tournament settings saved successfully.");
    } catch (error) {
      console.error("Tournament settings save error:", error);
      setMessage(
        'Unable to save tournament settings. Confirm that "settings/tournament" exists and your Firestore rules allow the admin to update it.'
      );
    } finally {
      setSavingTournamentSettings(false);
    }
  }

  async function updateStatus(
    squadId: string,
    status: SquadStatus
  ) {
    setWorkingId(squadId);
    setMessage("");

    try {
      await updateDoc(doc(db, "squads", squadId), {
        status,
      });

      setSquads((currentSquads) =>
        currentSquads.map((squad) =>
          squad.id === squadId ? { ...squad, status } : squad
        )
      );

      if (status === "rejected") {
        setMessage(
          "Squad rejected. You can now remove it so the owner can register again."
        );
      } else {
        setMessage(`Squad status changed to ${status}.`);
      }
    } catch (error) {
      console.error(error);
      setMessage("Unable to update the squad status.");
    } finally {
      setWorkingId(null);
    }
  }

  async function removeRejectedSquad(squad: Squad) {
    if (squad.status !== "rejected") {
      setMessage("You must reject the squad before removing it.");
      return;
    }

    const confirmed = window.confirm(
      `Remove "${squad.squadName}" permanently?\n\nAfter removal, ${
        squad.ownerEmail || "the owner"
      } will be able to register another squad.\n\nThis cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setWorkingId(squad.id);
    setMessage("");

    try {
      await deleteDoc(doc(db, "squads", squad.id));

      setSquads((currentSquads) =>
        currentSquads.filter(
          (currentSquad) => currentSquad.id !== squad.id
        )
      );

      setMessage(
        `${squad.squadName} was removed. The owner can now register again.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to remove the squad. Check your Firestore permissions."
      );
    } finally {
      setWorkingId(null);
    }
  }

  const filteredSquads = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) {
      return squads;
    }

    return squads.filter((squad) => {
      const playerNames = squad.players
        .map((player) => player.name)
        .join(" ")
        .toLowerCase();

      return (
        squad.squadName.toLowerCase().includes(searchText) ||
        squad.ownerName?.toLowerCase().includes(searchText) ||
        squad.ownerEmail?.toLowerCase().includes(searchText) ||
        squad.status.toLowerCase().includes(searchText) ||
        playerNames.includes(searchText)
      );
    });
  }, [squads, search]);

  const totalSquads = squads.length;

  const pendingSquads = squads.filter(
    (squad) => squad.status === "pending"
  ).length;

  const approvedSquads = squads.filter(
    (squad) => squad.status === "approved"
  ).length;

  const rejectedSquads = squads.filter(
    (squad) => squad.status === "rejected"
  ).length;

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <p className="text-lg font-bold text-blue-300">
          Loading admin page...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
        <BackgroundLogo />

        <section className="relative z-10 w-full max-w-md rounded-3xl border border-blue-900 bg-black/90 p-8 text-center shadow-2xl shadow-blue-950/40 backdrop-blur-sm">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-400">
            N² Scrims
          </p>

          <h1 className="mt-4 text-4xl font-black uppercase">
            Admin Dashboard
          </h1>

          <p className="mt-4 text-gray-400">
            Sign in with the authorized Google account.
          </p>

          <button
            type="button"
            onClick={signInWithGoogle}
            className="mt-8 w-full rounded-xl bg-blue-700 px-6 py-4 font-black uppercase tracking-wide transition hover:bg-blue-600"
          >
            Sign In With Google
          </button>

          {message && (
            <p className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
        <BackgroundLogo />

        <section className="relative z-10 w-full max-w-lg rounded-3xl border border-red-900 bg-black/90 p-8 text-center">
          <h1 className="text-3xl font-black uppercase text-red-400">
            Access Denied
          </h1>

          <p className="mt-4 text-gray-300">
            This Google account is not authorized to access the admin
            page.
          </p>

          <p className="mt-3 break-all text-sm text-gray-500">
            {user.email}
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-7 rounded-xl bg-blue-700 px-6 py-3 font-bold uppercase hover:bg-blue-600"
          >
            Sign Out
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
        <BackgroundLogo />

        <div className="relative z-10 mx-auto max-w-[1500px]">
          <header className="flex flex-col gap-5 rounded-3xl border border-blue-900 bg-black/90 p-6 shadow-2xl shadow-blue-950/30 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
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
                onClick={loadSquads}
                disabled={loadingSquads}
                className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black uppercase tracking-wide transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingSquads ? "Refreshing..." : "Refresh Squads"}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl border border-gray-700 bg-gray-950 px-5 py-3 text-sm font-black uppercase tracking-wide transition hover:border-gray-500"
              >
                Sign Out
              </button>
            </div>
          </header>

          {message && (
            <div className="mt-5 rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
              {message}
            </div>
          )}

          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total" value={totalSquads} />
            <StatCard label="Pending" value={pendingSquads} />
            <StatCard label="Approved" value={approvedSquads} />
            <StatCard label="Rejected" value={rejectedSquads} />
          </section>

          <section
            className={`mt-6 overflow-hidden rounded-3xl border ${
              registrationOpen
                ? "border-green-800 bg-green-950/20"
                : "border-red-800 bg-red-950/20"
            } backdrop-blur-sm`}
          >
            <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl ${
                    registrationOpen
                      ? "bg-green-700 text-white"
                      : "bg-red-700 text-white"
                  }`}
                >
                  {registrationOpen ? "✓" : "✕"}
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                    Tournament Registration
                  </p>

                  {loadingRegistration ? (
                    <h2 className="mt-2 text-2xl font-black text-blue-300">
                      Loading Status...
                    </h2>
                  ) : (
                    <h2
                      className={`mt-2 text-2xl font-black uppercase ${
                        registrationOpen
                          ? "text-green-300"
                          : "text-red-300"
                      }`}
                    >
                      Registration {registrationOpen ? "Open" : "Closed"}
                    </h2>
                  )}

                  <p className="mt-2 max-w-2xl text-sm text-gray-400">
                    {registrationOpen
                      ? "New squads are currently allowed to submit registrations."
                      : "New squad registrations are currently blocked. Existing squads remain unchanged."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleRegistration}
                disabled={
                  loadingRegistration || changingRegistration
                }
                className={`w-full rounded-xl px-6 py-4 text-sm font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto ${
                  registrationOpen
                    ? "bg-red-700 hover:bg-red-600"
                    : "bg-green-700 hover:bg-green-600"
                }`}
              >
                {changingRegistration
                  ? "Updating..."
                  : registrationOpen
                    ? "Close Registration"
                    : "Open Registration"}
              </button>
            </div>

            <div
              className={`h-1 w-full ${
                registrationOpen ? "bg-green-600" : "bg-red-600"
              }`}
            />
          </section>

          <section className="mt-6 rounded-3xl border border-blue-900 bg-black/90 p-6 backdrop-blur-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-400">
                  Tournament Settings
                </p>
                <h2 className="mt-2 text-2xl font-black uppercase text-white">
                  Edit Tournament Details
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  Change the prize pool, maximum squads, maps, rules, and other details here.
                </p>
              </div>

              {loadingTournamentSettings && (
                <p className="text-sm font-bold text-blue-300">Loading settings...</p>
              )}
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <AdminField
                id="tournament-title"
                label="Tournament Name"
                value={tournamentSettings.title}
                onChange={(value) =>
                  setTournamentSettings((current) => ({ ...current, title: value }))
                }
                disabled={loadingTournamentSettings || savingTournamentSettings}
              />

              <AdminField
                id="prize-pool"
                label="Prize Pool"
                value={tournamentSettings.prizePool}
                onChange={(value) =>
                  setTournamentSettings((current) => ({
                    ...current,
                    prizePool: value,
                  }))
                }
                placeholder="$500 USD"
                disabled={loadingTournamentSettings || savingTournamentSettings}
              />

              <div>
                <label
                  htmlFor="max-squads"
                  className="text-xs font-black uppercase tracking-widest text-gray-400"
                >
                  Maximum Squads
                </label>
                <input
                  id="max-squads"
                  type="number"
                  min={1}
                  step={1}
                  value={tournamentSettings.maxSquads}
                  onChange={(event) =>
                    setTournamentSettings((current) => ({
                      ...current,
                      maxSquads: Number(event.target.value),
                    }))
                  }
                  disabled={loadingTournamentSettings || savingTournamentSettings}
                  className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <AdminField
                id="registration-deadline"
                label="Registration Deadline"
                value={tournamentSettings.registrationDeadline}
                onChange={(value) =>
                  setTournamentSettings((current) => ({
                    ...current,
                    registrationDeadline: value,
                  }))
                }
                placeholder="To Be Announced"
                disabled={loadingTournamentSettings || savingTournamentSettings}
              />

              <div className="lg:col-span-2">
                <AdminField
                  id="messenger-link"
                  label="Messenger Group Link"
                  value={tournamentSettings.messengerLink}
                  onChange={(value) =>
                    setTournamentSettings((current) => ({
                      ...current,
                      messengerLink: value,
                    }))
                  }
                  placeholder="https://m.me/..."
                  disabled={loadingTournamentSettings || savingTournamentSettings}
                />
              </div>

              <div>
                <label
                  htmlFor="maps"
                  className="text-xs font-black uppercase tracking-widest text-gray-400"
                >
                  Maps — One Per Line
                </label>
                <textarea
                  id="maps"
                  value={mapsText}
                  onChange={(event) => setMapsText(event.target.value)}
                  rows={6}
                  disabled={loadingTournamentSettings || savingTournamentSettings}
                  className="mt-2 w-full resize-y rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="rules"
                  className="text-xs font-black uppercase tracking-widest text-gray-400"
                >
                  Rules — One Per Line
                </label>
                <textarea
                  id="rules"
                  value={rulesText}
                  onChange={(event) => setRulesText(event.target.value)}
                  rows={6}
                  disabled={loadingTournamentSettings || savingTournamentSettings}
                  className="mt-2 w-full resize-y rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveTournamentSettings}
              disabled={loadingTournamentSettings || savingTournamentSettings}
              className="mt-6 w-full rounded-xl bg-blue-700 px-6 py-4 text-sm font-black uppercase tracking-wide transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {savingTournamentSettings ? "Saving Changes..." : "Save Tournament Settings"}
            </button>
          </section>

          <section className="mt-6 rounded-2xl border border-blue-900 bg-black/90 p-4 backdrop-blur-sm">
            <label
              htmlFor="squad-search"
              className="text-xs font-black uppercase tracking-widest text-blue-400"
            >
              Search Squads
            </label>

            <input
              id="squad-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search squad, player, email or status..."
              className="mt-3 w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-blue-600"
            />
          </section>

          {loadingSquads ? (
            <div className="mt-8 rounded-2xl border border-blue-900 bg-black/90 p-10 text-center text-blue-300">
              Loading squads...
            </div>
          ) : filteredSquads.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-gray-800 bg-black/90 p-10 text-center text-gray-400">
              {search
                ? "No squads match your search."
                : "No squads registered yet."}
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-blue-900 bg-black/90 backdrop-blur-sm">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="border-b border-blue-900 bg-blue-950/30">
                  <tr className="text-xs uppercase tracking-wider text-blue-300">
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Logo</th>
                    <th className="px-3 py-3">Squad</th>
                    <th className="px-3 py-3">Players</th>
                    <th className="px-3 py-3">Registered By</th>
                    <th className="px-3 py-3">Date</th>
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
                        className="border-b border-gray-900 last:border-b-0 hover:bg-blue-950/20"
                      >
                        <td className="px-3 py-3 font-bold text-gray-500">
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
                              className="group flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-blue-800 bg-black p-1 transition hover:border-blue-400"
                              title="View larger logo"
                            >
                              <img
                                src={squad.logoUrl}
                                alt={`${squad.squadName} logo`}
                                className="h-full w-full object-contain transition group-hover:scale-105"
                              />
                            </button>
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-950 text-center">
                              <div>
                                <p className="text-xl">🛡️</p>

                                <p className="mt-1 text-[9px] font-black uppercase text-gray-600">
                                  No Logo
                                </p>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <p className="max-w-[180px] truncate font-black text-white">
                            {squad.squadName}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            Captain:{" "}
                            {squad.players[0]?.name || "Unknown"}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            {squad.players.map(
                              (player, playerIndex) => (
                                <p
                                  key={`${squad.id}-${playerIndex}`}
                                  className="max-w-[150px] truncate text-gray-300"
                                  title={player.name}
                                >
                                  <span className="text-gray-600">
                                    {playerIndex + 1}.
                                  </span>{" "}
                                  {player.name}
                                </p>
                              )
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <p className="max-w-[170px] truncate font-bold text-gray-200">
                            {squad.ownerName || "Unknown"}
                          </p>

                          <p
                            className="mt-1 max-w-[190px] truncate text-xs text-gray-500"
                            title={squad.ownerEmail}
                          >
                            {squad.ownerEmail || "No email"}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-400">
                          {formatDate(squad)}
                        </td>

                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
                              squad.status === "approved"
                                ? "bg-green-950 text-green-300"
                                : squad.status === "rejected"
                                  ? "bg-red-950 text-red-300"
                                  : "bg-yellow-950 text-yellow-300"
                            }`}
                          >
                            {squad.status}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              title="Approve squad"
                              disabled={
                                isWorking ||
                                squad.status === "approved"
                              }
                              onClick={() =>
                                updateStatus(squad.id, "approved")
                              }
                              className="rounded-lg bg-green-700 px-3 py-2 text-xs font-black uppercase hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Approve
                            </button>

                            <button
                              type="button"
                              title="Mark squad as pending"
                              disabled={
                                isWorking ||
                                squad.status === "pending"
                              }
                              onClick={() =>
                                updateStatus(squad.id, "pending")
                              }
                              className="rounded-lg bg-yellow-700 px-3 py-2 text-xs font-black uppercase hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Pending
                            </button>

                            <button
                              type="button"
                              title="Reject squad"
                              disabled={
                                isWorking ||
                                squad.status === "rejected"
                              }
                              onClick={() =>
                                updateStatus(squad.id, "rejected")
                              }
                              className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black uppercase hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Reject
                            </button>

                            {squad.status === "rejected" && (
                              <button
                                type="button"
                                title="Remove rejected squad"
                                disabled={isWorking}
                                onClick={() =>
                                  removeRejectedSquad(squad)
                                }
                                className="rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs font-black uppercase text-red-300 transition hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {isWorking
                                  ? "Removing..."
                                  : "Remove Squad"}
                              </button>
                            )}
                          </div>

                          {squad.status === "rejected" && (
                            <p className="mt-2 max-w-[260px] text-xs text-red-400">
                              Removing this squad allows the owner to
                              register again.
                            </p>
                          )}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-5 py-10"
          onClick={() => setSelectedLogo(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl border border-blue-800 bg-gray-950 p-6 text-center shadow-2xl shadow-blue-950/50"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedLogo(null)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-black text-xl font-black text-gray-300 transition hover:border-red-500 hover:text-red-400"
              aria-label="Close logo preview"
            >
              ×
            </button>

            <p className="pr-12 text-sm font-black uppercase tracking-[0.25em] text-blue-400">
              Team Logo
            </p>

            <h2 className="mt-2 pr-12 text-3xl font-black text-white">
              {selectedLogo.squadName}
            </h2>

            <div className="mt-6 flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-blue-900 bg-black p-6">
              <img
                src={selectedLogo.url}
                alt={`${selectedLogo.squadName} enlarged logo`}
                className="max-h-[420px] w-full object-contain"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedLogo(null)}
              className="mt-6 w-full rounded-xl bg-blue-700 px-6 py-3 font-black uppercase tracking-wide transition hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AdminField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-black uppercase tracking-widest text-gray-400"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
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
    <div className="rounded-2xl border border-blue-900 bg-black/90 p-4 backdrop-blur-sm">
      <p className="text-xs font-black uppercase tracking-widest text-gray-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-blue-300">
        {value}
      </p>
    </div>
  );
}

function BackgroundLogo() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 bg-center bg-no-repeat opacity-[0.07]"
      style={{
        backgroundImage: "url('/n2-logo.png')",
        backgroundSize: "min(650px, 80vw)",
      }}
    />
  );
}

function getCreatedTime(createdAt: Squad["createdAt"]) {
  if (!createdAt) {
    return 0;
  }

  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }

  if (
    typeof createdAt === "object" &&
    "toDate" in createdAt &&
    typeof createdAt.toDate === "function"
  ) {
    return createdAt.toDate().getTime();
  }

  return 0;
}

function formatDate(squad: Squad) {
  const createdAt = squad.createdAt;

  if (!createdAt) {
    return "No date";
  }

  let date: Date;

  if (createdAt instanceof Date) {
    date = createdAt;
  } else if (
    typeof createdAt === "object" &&
    "toDate" in createdAt &&
    typeof createdAt.toDate === "function"
  ) {
    date = createdAt.toDate();
  } else {
    return "No date";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}