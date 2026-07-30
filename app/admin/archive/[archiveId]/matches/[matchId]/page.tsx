"use client";

import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, db, googleProvider } from "@/firebase";
import { defaultTournamentSettings, TournamentSettings } from "@/lib/tournamentClient";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

export default function TournamentSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [settings, setSettings] = useState<TournamentSettings>(defaultTournamentSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(doc(db, "settings", "tournament"), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setSettings({
  ...defaultTournamentSettings,
  name:
    typeof data.name === "string"
      ? data.name
      : defaultTournamentSettings.name,
  season:
    typeof data.season === "string"
      ? data.season
      : defaultTournamentSettings.season,
  streamUrl:
    typeof data.streamUrl === "string"
      ? data.streamUrl
      : defaultTournamentSettings.streamUrl,
  prizeFirst:
    typeof data.prizeFirst === "string"
      ? data.prizeFirst
      : defaultTournamentSettings.prizeFirst,
  prizeSecond:
    typeof data.prizeSecond === "string"
      ? data.prizeSecond
      : defaultTournamentSettings.prizeSecond,
  prizeThird:
    typeof data.prizeThird === "string"
      ? data.prizeThird
      : defaultTournamentSettings.prizeThird,
  prizeMvp:
    typeof data.prizeMvp === "string"
      ? data.prizeMvp
      : defaultTournamentSettings.prizeMvp,
});
    });
  }, [isAdmin]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await setDoc(doc(db, "settings", "tournament"), {
        ...settings,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage("Tournament settings saved.");
    } catch (error) {
      console.error(error);
      setMessage("Unable to save tournament settings.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return <main className="min-h-screen bg-slate-950 p-6 text-white">Checking admin account...</main>;
  if (!user) return <SignIn onClick={async () => {
    const provider = googleProvider instanceof GoogleAuthProvider ? googleProvider : new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }} />;
  if (!isAdmin) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white"><div className="rounded-2xl border border-red-500/30 bg-slate-900 p-6 text-center"><h1 className="text-2xl font-black text-red-400">Access denied</h1><button onClick={() => void signOut(auth)} className="mt-5 rounded-lg bg-white px-4 py-2 font-black text-black">Sign out</button></div></main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto max-w-4xl">
        <header className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">N² Scrims Admin</p>
          <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-3xl font-black">Tournament Settings</h1><p className="text-sm text-slate-400">Name, stream link, and prize distribution.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/admin/tournament" className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-black">Standings</Link><Link href="/admin/history" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black">History</Link></div>
          </div>
        </header>

        <section className="mt-4 grid gap-4 rounded-2xl border border-white/10 bg-slate-900 p-5 md:grid-cols-2">
          <Field label="Tournament Name" value={settings.name} onChange={(value) => setSettings((current) => ({ ...current, name: value }))} />
          <Field label="Season" value={settings.season} onChange={(value) => setSettings((current) => ({ ...current, season: value }))} />
          <div className="md:col-span-2"><Field label="Public Stream Link" value={settings.streamUrl} onChange={(value) => setSettings((current) => ({ ...current, streamUrl: value }))} placeholder="https://www.tiktok.com/@yourname/live" /></div>
          <Field label="1st Place Prize" value={settings.prizeFirst} onChange={(value) => setSettings((current) => ({ ...current, prizeFirst: value }))} placeholder="$500" />
          <Field label="2nd Place Prize" value={settings.prizeSecond} onChange={(value) => setSettings((current) => ({ ...current, prizeSecond: value }))} placeholder="$250" />
          <Field label="3rd Place Prize" value={settings.prizeThird} onChange={(value) => setSettings((current) => ({ ...current, prizeThird: value }))} placeholder="$100" />
          <Field label="MVP Prize" value={settings.prizeMvp} onChange={(value) => setSettings((current) => ({ ...current, prizeMvp: value }))} placeholder="$50" />
          <button onClick={() => void save()} disabled={saving} className="md:col-span-2 rounded-lg bg-violet-600 px-5 py-3 font-black disabled:opacity-50">{saving ? "Saving..." : "Save Tournament Settings"}</button>
          {message && <p className="md:col-span-2 text-sm text-violet-300">{message}</p>}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 outline-none focus:border-violet-400" /></label>;
}

function SignIn({ onClick }: { onClick: () => Promise<void> }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center"><h1 className="text-2xl font-black">Tournament Settings</h1><button onClick={() => void onClick()} className="mt-6 w-full rounded-lg bg-white px-4 py-3 font-black text-black">Sign in with Google</button></div></main>;
}
