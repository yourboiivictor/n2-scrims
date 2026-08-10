"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebase";
import CountryPicker from "@/components/CountryPicker";
import { getCountryByCode } from "@/lib/countries";

const MAX_SQUADS = 25;
const MAX_LOGO_SIZE = 5 * 1024 * 1024;


const ALLOWED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

type RegistrationStatus = "pending" | "approved" | "rejected";

type ExistingSquad = {
  id: string;
  squadName: string;
  status: RegistrationStatus;
  logoUrl?: string;
};

type UploadResponse = {
  logoUrl?: string;
  logoPublicId?: string;
  error?: string;
};

export default function RegisterPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loadingUser, setLoadingUser] = useState(true);

  const [checkingRegistration, setCheckingRegistration] = useState(true);

  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loadingRegistrationSetting, setLoadingRegistrationSetting] =
    useState(true);

  const [squadName, setSquadName] = useState("");
  const [facebookName, setFacebookName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [playerNames, setPlayerNames] = useState(["", "", "", ""]);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const [existingSquad, setExistingSquad] =
    useState<ExistingSquad | null>(null);

  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingUser(false);

      if (!currentUser) {
        setExistingSquad(null);
        setCheckingRegistration(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
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
          setLoadingRegistrationSetting(false);
          return;
        }

        const data = snapshot.data();

        setRegistrationOpen(data.isOpen !== false);
        setLoadingRegistrationSetting(false);
      },
      (error) => {
        console.error("Registration setting error:", error);

        setMessage(
          "Unable to check whether registration is open."
        );

        setLoadingRegistrationSetting(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const squadQuery = query(
      collection(db, "squads"),
      where("ownerUid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      squadQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setExistingSquad(null);
          setCheckingRegistration(false);
          return;
        }

        const squadDocument = snapshot.docs[0];
        const data = squadDocument.data();

        let status: RegistrationStatus = "pending";

        if (data.status === "approved") {
          status = "approved";
        } else if (data.status === "rejected") {
          status = "rejected";
        }

        setExistingSquad({
          id: squadDocument.id,
          squadName: data.squadName || "Your Squad",
          status,
          logoUrl:
            typeof data.logoUrl === "string" ? data.logoUrl : "",
        });

        setCheckingRegistration(false);
      },
      (error) => {
        console.error("Registration status error:", error);

        setMessage(
          "Unable to check your registration status."
        );

        setCheckingRegistration(false);
      }
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    return () => {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  function updatePlayerName(index: number, value: string) {
    setPlayerNames((currentNames) =>
      currentNames.map((name, playerIndex) =>
        playerIndex === index ? value : name
      )
    );
  }

  function handleLogoChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setMessage("");

    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (!ALLOWED_LOGO_TYPES.includes(selectedFile.type)) {
      setMessage(
        "The team logo must be a PNG, JPG, JPEG, or WebP image."
      );

      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_LOGO_SIZE) {
      setMessage(
        "The team logo must be smaller than 5 MB."
      );

      event.target.value = "";
      return;
    }

    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }

    const previewUrl = URL.createObjectURL(selectedFile);

    setLogoFile(selectedFile);
    setLogoPreview(previewUrl);
  }

  function removeLogo() {
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }

    setLogoFile(null);
    setLogoPreview("");
  }

  async function uploadTeamLogo() {
    if (!logoFile) {
      return {
        logoUrl: "",
        logoPublicId: "",
      };
    }

    const formData = new FormData();
    formData.append("file", logoFile);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const result =
      (await response.json()) as UploadResponse;

    if (!response.ok || !result.logoUrl) {
      throw new Error(
        result.error || "Unable to upload the team logo."
      );
    }

    return {
      logoUrl: result.logoUrl,
      logoPublicId: result.logoPublicId || "",
    };
  }

  async function handleWithdrawSquad() {
    if (!user || !existingSquad || withdrawing) {
      return;
    }

    const confirmed = window.confirm(
      `Withdraw "${existingSquad.squadName}" from registration?\n\nThis permanently removes the squad registration. You can register again later if registration is still open.`,
    );

    if (!confirmed) {
      return;
    }

    setWithdrawing(true);
    setMessage("");

    try {
      await deleteDoc(doc(db, "squads", existingSquad.id));
      setExistingSquad(null);
      setMessage("Your squad was withdrawn. You may register again while registration is open.");
    } catch (error) {
      console.error("Withdraw squad error:", error);
      setMessage("Unable to withdraw your squad. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleSubmit() {
    setMessage("");

    if (!user) {
      setMessage(
        "Please sign in with Google from the homepage."
      );
      return;
    }

    if (!registrationOpen) {
      setMessage(
        "Registration is currently closed."
      );
      return;
    }

    if (existingSquad) {
      setMessage(
        "This Google account has already registered a squad."
      );
      return;
    }

    const cleanSquadName = squadName.trim();
    const cleanFacebookName = facebookName.trim();

    const cleanPlayerNames = playerNames.map((name) =>
      name.trim()
    );

    if (!cleanSquadName) {
      setMessage("Please enter your squad name.");
      return;
    }

    if (!cleanFacebookName) {
      setMessage("Please enter your Facebook or Messenger name.");
      return;
    }

    if (!countryCode) {
      setMessage("Please select your squad country or region.");
      return;
    }

    if (cleanPlayerNames.some((name) => !name)) {
      setMessage("Please enter all 4 player names.");
      return;
    }

    const normalizedPlayerNames = cleanPlayerNames.map(
      (name) => name.toLowerCase()
    );

    if (new Set(normalizedPlayerNames).size !== 4) {
      setMessage(
        "Each player must have a different name."
      );
      return;
    }

    try {
      setSubmitting(true);

      const registrationSnapshot = await getDoc(
        doc(db, "settings", "registration")
      );

      if (
        registrationSnapshot.exists() &&
        registrationSnapshot.data().isOpen === false
      ) {
        setRegistrationOpen(false);
        setMessage(
          "Registration is currently closed."
        );
        return;
      }

      const allSquadsSnapshot = await getDocs(
        collection(db, "squads")
      );

      if (allSquadsSnapshot.size >= MAX_SQUADS) {
        setMessage(
          `Registration is full. The ${MAX_SQUADS}-squad limit has been reached.`
        );
        return;
      }

      const accountQuery = query(
        collection(db, "squads"),
        where("ownerUid", "==", user.uid)
      );

      const accountSnapshot = await getDocs(accountQuery);

      if (!accountSnapshot.empty) {
        setMessage(
          "This Google account has already registered a squad."
        );
        return;
      }

      const squadNameQuery = query(
        collection(db, "squads"),
        where(
          "squadNameLower",
          "==",
          cleanSquadName.toLowerCase()
        )
      );

      const squadNameSnapshot = await getDocs(
        squadNameQuery
      );

      if (!squadNameSnapshot.empty) {
        setMessage(
          "That squad name has already been registered."
        );
        return;
      }

      let logoUrl = "";
      let logoPublicId = "";

      if (logoFile) {
        setMessage("Uploading team logo...");

        const uploadedLogo = await uploadTeamLogo();

        logoUrl = uploadedLogo.logoUrl;
        logoPublicId = uploadedLogo.logoPublicId;
      }

      setMessage("Saving squad registration...");

      const selectedCountry = getCountryByCode(countryCode);

      await addDoc(collection(db, "squads"), {
        squadName: cleanSquadName,

        squadNameLower: cleanSquadName.toLowerCase(),

        players: cleanPlayerNames.map((name, index) => ({
          name,
          role:
            index === 0
              ? "Captain"
              : `Player ${index + 1}`,
        })),

        logoUrl,
        logoPublicId,

        ownerUid: user.uid,
        ownerEmail: user.email || "",
        ownerName: user.displayName || "",
        facebookName: cleanFacebookName,
        countryCode,
        countryName: selectedCountry?.name || "",

        status: "pending",
        createdAt: serverTimestamp(),
      });

      setSquadName("");
      setFacebookName("");
      setCountryCode("");
      setPlayerNames(["", "", "", ""]);

      removeLogo();
      setMessage("");
    } catch (error) {
      console.error("Registration error:", error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Registration failed.";

      setMessage(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  if (
    loadingUser ||
    checkingRegistration ||
    loadingRegistrationSetting
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <p className="font-bold text-blue-400">
          Checking registration status...
        </p>
      </main>
    );
  }

  if (existingSquad) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-black bg-center bg-no-repeat px-6 py-12 text-white"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.82), rgba(0,0,0,0.96)), url('/n2-logo.png')",
          backgroundSize: "55%",
        }}
      >
        <div className="w-full max-w-2xl rounded-3xl border border-blue-800 bg-black/90 p-8 text-center backdrop-blur-sm sm:p-12">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-400">
            N² Scrims
          </p>

          {existingSquad.logoUrl && (
            <div className="mx-auto mt-6 flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl border border-blue-800 bg-gray-950 p-3">
              <img
                src={existingSquad.logoUrl}
                alt={`${existingSquad.squadName} logo`}
                className="h-full w-full object-contain"
              />
            </div>
          )}

          <h1 className="mt-5 text-4xl font-black">
            {existingSquad.squadName}
          </h1>

          {existingSquad.status === "pending" && (
            <>
              <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-600 text-3xl font-black">
                ⏳
              </div>

              <h2 className="mt-6 text-3xl font-black text-yellow-300">
                Pending Approval
              </h2>

              <p className="mt-4 text-gray-300">
                Your squad registration has been received and is
                waiting for an admin to review it.
              </p>

              <div className="mt-8 rounded-2xl border border-yellow-900 bg-yellow-950/30 p-6">
                <p className="font-bold text-yellow-300">
                  Please check this page again after your
                  registration has been reviewed.
                </p>
              </div>
            </>
          )}

          {existingSquad.status === "approved" && (
            <>
              <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-3xl font-black">
                ✓
              </div>

              <h2 className="mt-6 text-3xl font-black text-green-300">
                Squad Approved!
              </h2>

              <p className="mt-4 text-gray-300">
                Your squad has been approved. An admin will add you
                to the official N² Scrims Messenger Group Chat using
                the Facebook or Messenger name you provided.
              </p>

              <div className="mt-8 rounded-2xl border border-blue-900 bg-blue-950/30 p-6">
                <h3 className="text-xl font-black text-blue-400">
                  Messenger Group Chat
                </h3>

                <p className="mt-3 text-gray-300">
                  Make sure your Facebook or Messenger account is
                  searchable and not private so the admin can find
                  and add you.
                </p>

                <p className="mt-4 font-bold text-blue-200">
                  Once added, you will receive room IDs, passwords,
                  and tournament updates in the group chat.
                </p>
              </div>
            </>
          )}

          {existingSquad.status === "rejected" && (
            <>
              <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-red-700 text-3xl font-black">
                ✕
              </div>

              <h2 className="mt-6 text-3xl font-black text-red-300">
                Registration Rejected
              </h2>

              <p className="mt-4 text-gray-300">
                Your squad registration was not approved.
              </p>

              <div className="mt-8 rounded-2xl border border-red-900 bg-red-950/30 p-6">
                <p className="font-bold text-red-300">
                  Contact the tournament organizer for more
                  information.
                </p>
              </div>
            </>
          )}

          {message && (
            <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleWithdrawSquad()}
            disabled={withdrawing}
            className="mt-6 w-full rounded-xl border border-red-700 bg-red-950/40 px-6 py-4 font-black uppercase tracking-wide text-red-300 transition hover:bg-red-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {withdrawing ? "Withdrawing Squad..." : "Withdraw Squad"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/teams")}
            disabled={withdrawing}
            className="mt-4 w-full rounded-xl border border-blue-600 px-6 py-4 font-bold uppercase tracking-wide text-blue-400 transition hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            View Approved Squads
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 w-full rounded-xl border border-gray-700 bg-gray-950 px-6 py-4 font-bold uppercase tracking-wide transition hover:border-blue-500 hover:text-blue-400"
          >
            Return Home
          </button>
        </div>
      </main>
    );
  }

  if (!registrationOpen) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-black bg-center bg-no-repeat px-6 py-12 text-white"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.86), rgba(0,0,0,0.97)), url('/n2-logo.png')",
          backgroundSize: "55%",
        }}
      >
        <div className="w-full max-w-2xl rounded-3xl border border-red-800 bg-black/90 p-8 text-center shadow-2xl shadow-red-950/20 backdrop-blur-sm sm:p-12">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-400">
            N² Scrims
          </p>

          <div className="mx-auto mt-7 flex h-20 w-20 items-center justify-center rounded-full bg-red-700 text-4xl">
            🔒
          </div>

          <h1 className="mt-7 text-4xl font-black uppercase text-red-300 sm:text-5xl">
            Registration Closed
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-gray-300">
            New squad registrations are currently closed. Existing
            squad registrations are not affected.
          </p>

          <div className="mt-8 rounded-2xl border border-red-900 bg-red-950/30 p-6">
            <p className="font-bold text-red-300">
              Check back later or contact the tournament organizer
              for more information.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/teams")}
            className="mt-7 w-full rounded-xl border border-blue-600 px-6 py-4 font-black uppercase tracking-wide text-blue-400 transition hover:bg-blue-600 hover:text-white"
          >
            View Approved Squads
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 w-full rounded-xl border border-gray-700 bg-gray-950 px-6 py-4 font-black uppercase tracking-wide transition hover:border-blue-500 hover:text-blue-400"
          >
            Return Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-black bg-center bg-no-repeat px-6 py-12 text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.82), rgba(0,0,0,0.96)), url('/n2-logo.png')",
        backgroundSize: "55%",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-sm font-bold uppercase tracking-wide text-blue-400 hover:text-blue-300"
        >
          ← Back to Home
        </button>

        <div className="mt-6 rounded-3xl border border-blue-900 bg-black/90 p-6 backdrop-blur-sm sm:p-10">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-400">
            N² Scrims
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Register Your Squad
          </h1>

          <p className="mt-3 text-gray-400">
            Enter your squad name, Facebook or Messenger name,
            upload a team logo, and add exactly four players.
          </p>

          <div className="mt-5 rounded-xl border border-green-900 bg-green-950/30 p-4 text-sm text-green-300">
            Registration is currently open.
          </div>


          {!user && (
            <div className="mt-6 rounded-xl border border-yellow-900 bg-yellow-950/30 p-4 text-yellow-300">
              You must sign in with Google from the homepage before
              registering.
            </div>
          )}

          {user && (
            <div className="mt-6 rounded-xl border border-green-900 bg-green-950/30 p-4 text-green-300">
              Signed in as {user.email}
            </div>
          )}

          <div className="mt-8">
            <label
              htmlFor="squad-name"
              className="block text-sm font-bold text-gray-300"
            >
              Squad Name
            </label>

            <input
              id="squad-name"
              type="text"
              value={squadName}
              onChange={(event) =>
                setSquadName(event.target.value)
              }
              placeholder="Enter squad name"
              maxLength={40}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="mt-8">
            <CountryPicker
              value={countryCode}
              onChange={(code) => setCountryCode(code)}
              disabled={submitting}
              label="Squad Country / Region"
            />

            <p className="mt-2 text-sm text-gray-400">
              Start typing or tap the arrow to choose a country or region.
            </p>
          </div>

          <div className="mt-8">
            <label
              htmlFor="facebook-name"
              className="block text-sm font-bold text-gray-300"
            >
              Facebook / Messenger Name
            </label>

            <input
              id="facebook-name"
              type="text"
              value={facebookName}
              onChange={(event) =>
                setFacebookName(event.target.value)
              }
              placeholder="Enter your exact Facebook or Messenger name"
              maxLength={80}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <p className="mt-2 text-sm text-gray-400">
              Make sure your account is searchable and not private so
              the admin can add you to the official group chat after
              your squad is approved.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-blue-900 bg-blue-950/20 p-5 sm:p-6">
            <h2 className="text-xl font-black text-blue-400">
              Team Logo
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Upload a PNG, JPG, JPEG, or WebP image smaller than
              5 MB. A square logo works best.
            </p>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-blue-800 bg-black">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Team logo preview"
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <div className="px-4 text-center">
                    <p className="text-4xl">🛡️</p>

                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                      Logo Preview
                    </p>
                  </div>
                )}
              </div>

              <div className="flex-1">
                <label
                  htmlFor="team-logo"
                  className="inline-flex cursor-pointer rounded-xl bg-blue-700 px-5 py-3 text-sm font-black uppercase tracking-wide transition hover:bg-blue-600"
                >
                  Choose Team Logo
                </label>

                <input
                  id="team-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoChange}
                  disabled={submitting}
                  className="hidden"
                />

                {logoFile && (
                  <div className="mt-4">
                    <p className="break-all text-sm text-gray-300">
                      {logoFile.name}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      {(logoFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>

                    <button
                      type="button"
                      onClick={removeLogo}
                      disabled={submitting}
                      className="mt-3 rounded-lg border border-red-800 px-4 py-2 text-xs font-black uppercase text-red-400 transition hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove Logo
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-950/80 p-5 sm:p-6">
            <h2 className="text-xl font-black text-blue-400">
              Squad Members
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Player 1 will be listed as the squad captain.
            </p>

            <div className="mt-6 space-y-4">
              {playerNames.map((playerName, index) => (
                <div
                  key={index}
                  className="grid items-center gap-2 sm:grid-cols-[150px_1fr]"
                >
                  <label
                    htmlFor={`player-${index + 1}`}
                    className="font-bold text-gray-300"
                  >
                    {index === 0
                      ? "Player 1 — Captain"
                      : `Player ${index + 1}`}
                  </label>

                  <input
                    id={`player-${index + 1}`}
                    type="text"
                    value={playerName}
                    onChange={(event) =>
                      updatePlayerName(index, event.target.value)
                    }
                    placeholder={`Enter Player ${index + 1} name`}
                    maxLength={40}
                    disabled={submitting}
                    className="w-full rounded-xl border border-gray-700 bg-black px-4 py-3 text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
          </div>

          {message && (
            <div
              className={`mt-6 rounded-xl border p-4 ${
                submitting
                  ? "border-blue-900 bg-blue-950/30 text-blue-300"
                  : "border-red-900 bg-red-950/30 text-red-300"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !user || !registrationOpen}
            className="mt-8 w-full rounded-xl bg-blue-600 px-6 py-4 font-black uppercase tracking-wide transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Registering Squad..."
              : "Register Squad"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/teams")}
            disabled={submitting}
            className="mt-4 w-full rounded-xl border border-blue-600 px-6 py-4 font-bold uppercase tracking-wide text-blue-400 transition hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            View Approved Squads
          </button>
        </div>
      </div>
    </main>
  );
}