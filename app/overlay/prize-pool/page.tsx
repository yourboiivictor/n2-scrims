"use client";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { defaultTournamentSettings, TournamentSettings } from "@/lib/tournamentClient";
export default function PrizePoolOverlay() {
  const [settings, setSettings] = useState<TournamentSettings>(defaultTournamentSettings);
  useEffect(() => onSnapshot(doc(db, "settings", "tournament"), (snapshot) => { if (snapshot.exists()) setSettings({ ...defaultTournamentSettings, ...(snapshot.data() as Partial<TournamentSettings>) }); }), []);
  return <main className="min-h-screen bg-transparent p-4 text-white"><section className="w-[650px] overflow-hidden rounded-2xl border border-yellow-400/30 bg-slate-950/95 shadow-2xl"><div className="bg-yellow-500 px-5 py-3 text-xl font-black text-black">💰 PRIZE POOL</div><div className="grid grid-cols-2 gap-3 p-4"><Prize label="1st Place" value={settings.prizeFirst} /><Prize label="2nd Place" value={settings.prizeSecond} /><Prize label="3rd Place" value={settings.prizeThird} /><Prize label="MVP" value={settings.prizeMvp} /></div></section></main>;
}
function Prize({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-yellow-400">{value || "-"}</p></div>; }
