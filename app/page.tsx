"use client";

import { useEffect, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db, googleProvider } from "../firebase";

const MAX_SQUADS = 25;

export default function Home() {
  const router = useRouter();

  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [approvedSquads, setApprovedSquads] = useState(0);
  const [loadingSquads, setLoadingSquads] = useState(true);

  useEffect(() => {
    const approvedSquadsQuery = query(
      collection(db, "squads"),
      where("status", "==", "approved")
    );

    const unsubscribe = onSnapshot(
      approvedSquadsQuery,
      (snapshot) => {
        setApprovedSquads(snapshot.size);
        setLoadingSquads(false);
      },
      (error) => {
        console.error("Approved squad count error:", error);
        setLoadingSquads(false);
      }
    );

    return unsubscribe;
  }, []);

  async function handleRegister() {
    if (signingIn) return;

    setSigningIn(true);
    setErrorMessage("");

    try {
      if (!auth.currentUser) {
        await signInWithPopup(auth, googleProvider);
      }

      router.push("/register");
    } catch (error: any) {
      if (
        error?.code === "auth/cancelled-popup-request" ||
        error?.code === "auth/popup-closed-by-user"
      ) {
        return;
      }

      console.error("Google sign-in error:", error);
      setErrorMessage("Google sign-in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  function scrollToRules() {
    document.getElementById("rules")?.scrollIntoView({
      behavior: "smooth",
    });
  }

  function viewApprovedSquads() {
    router.push("/teams");
  }

  const spotsLeft = Math.max(MAX_SQUADS - approvedSquads, 0);
  const registrationFull = approvedSquads >= MAX_SQUADS;

  return (
    <main
      className="min-h-screen bg-black bg-center bg-no-repeat text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.68), rgba(0,0,0,0.94)), url('/n2-logo.png')",
        backgroundSize: "65%",
        backgroundAttachment: "fixed",
      }}
    >
      <section className="flex min-h-screen items-center justify-center px-6 py-16 text-center">
        <div className="w-full max-w-5xl">
          <div className="mb-6 inline-block rounded-full border border-blue-500 bg-blue-500/10 px-5 py-2 text-sm font-bold uppercase tracking-widest text-blue-400">
            PUBG Mobile Tournaments
          </div>

          <h1 className="text-6xl font-black tracking-tight sm:text-8xl">
            N<span className="text-blue-500">²</span> SCRIMS
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 sm:text-xl">
            Register your squad, compete against the best players, and prove
            your team belongs at the top.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={handleRegister}
              disabled={signingIn || registrationFull}
              className="w-full rounded-xl bg-blue-600 px-8 py-4 font-bold uppercase tracking-wide transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {registrationFull
                ? "Registration Full"
                : signingIn
                  ? "Signing In..."
                  : "Register Squad"}
            </button>

            <button
              type="button"
              onClick={viewApprovedSquads}
              className="w-full rounded-xl border border-blue-600 bg-blue-950/30 px-8 py-4 font-bold uppercase tracking-wide text-blue-400 transition hover:bg-blue-600 hover:text-white sm:w-auto"
            >
              View Approved Squads
            </button>

            <button
              type="button"
              onClick={scrollToRules}
              className="w-full rounded-xl border border-gray-600 bg-black/70 px-8 py-4 font-bold uppercase tracking-wide transition hover:border-blue-500 hover:text-blue-400 sm:w-auto"
            >
              View Rules
            </button>
          </div>

          {errorMessage && (
            <p className="mx-auto mt-5 max-w-xl rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">
              {errorMessage}
            </p>
          )}

          {registrationFull && (
            <p className="mx-auto mt-5 max-w-xl rounded-xl border border-yellow-900 bg-yellow-950/40 p-4 text-yellow-300">
              All {MAX_SQUADS} approved squad spots have been filled.
            </p>
          )}

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-blue-900 bg-black/80 p-6 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-wider text-gray-400">
                Tournament Date
              </p>

              <p className="mt-3 text-2xl font-black">Coming Soon</p>

              <p className="mt-2 text-sm text-gray-400">
                Stay tuned for updates
              </p>
            </div>

            <button
              type="button"
              onClick={viewApprovedSquads}
              className="rounded-2xl border border-blue-900 bg-black/80 p-6 text-left backdrop-blur-sm transition hover:border-blue-500 hover:bg-blue-950/30"
            >
              <p className="text-sm uppercase tracking-wider text-gray-400">
                Approved Squads
              </p>

              <p className="mt-3 text-2xl font-black text-blue-400">
                {loadingSquads
                  ? "Loading..."
                  : `${approvedSquads} / ${MAX_SQUADS}`}
              </p>

              <p className="mt-2 text-sm text-gray-400">
                {loadingSquads
                  ? "Checking registrations"
                  : registrationFull
                    ? "Registration is full"
                    : `${spotsLeft} spots remaining`}
              </p>
            </button>

            <div className="rounded-2xl border border-blue-900 bg-black/80 p-6 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-wider text-gray-400">
                Prize Pool
              </p>

              <p className="mt-3 text-2xl font-black">TBA</p>

              <p className="mt-2 text-sm text-gray-400">
                To be announced
              </p>
            </div>

            <div className="rounded-2xl border border-blue-900 bg-black/80 p-6 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-wider text-gray-400">
                Game Mode
              </p>

              <p className="mt-3 text-2xl font-black">Squad | TPP</p>

              <p className="mt-2 text-sm text-gray-400">Classic mode</p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="rules"
        className="border-t border-gray-900 bg-black/95 px-6 py-20"
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="text-4xl font-black">
            Tournament <span className="text-blue-500">Rules</span>
          </h2>

          <p className="mt-4 max-w-2xl text-gray-400">
            Every squad must follow these rules before registration can be
            approved.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {[
              "Exactly 4 players per squad",
              "One Google account can register only one squad",
              "Duplicate squad names are not allowed",
              "All player names must be accurate",
              "No cheating, teaming, exploits, or unfair play",
              "The organizer may reject invalid registrations",
              "The Messenger group invite is provided after approval",
              "Players must follow all tournament announcements",
            ].map((rule, index) => (
              <div
                key={rule}
                className="flex items-start gap-4 rounded-2xl border border-gray-800 bg-gray-950/90 p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 font-black">
                  {index + 1}
                </span>

                <p className="pt-1 text-gray-200">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-gray-900 bg-blue-950/20 px-6 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-4xl font-black">
            {registrationFull ? "Registration Is Full" : "Ready to Compete?"}
          </h2>

          <p className="mt-4 text-gray-300">
            {registrationFull
              ? "View the approved squads that secured a tournament spot."
              : "Sign in with Google and register your squad of four players."}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            {!registrationFull && (
              <button
                type="button"
                onClick={handleRegister}
                disabled={signingIn}
                className="rounded-xl bg-blue-600 px-8 py-4 font-bold uppercase tracking-wide transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingIn ? "Signing In..." : "Register Your Squad"}
              </button>
            )}

            <button
              type="button"
              onClick={viewApprovedSquads}
              className="rounded-xl border border-blue-600 px-8 py-4 font-bold uppercase tracking-wide text-blue-400 transition hover:bg-blue-600 hover:text-white"
            >
              View Approved Squads
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-900 bg-black px-6 py-8 text-center text-sm text-gray-500">
        © 2026 N² Scrims. All rights reserved.
      </footer>
    </main>
  );
}