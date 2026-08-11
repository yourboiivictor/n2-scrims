"use client";

import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { db } from "@/firebase";

type UploadResponse = {
  logoUrl?: string;
  logoPublicId?: string;
  error?: string;
};

export default function HostFlagsPage() {
  const [status, setStatus] = useState("Ready to host squad flags.");
  const [running, setRunning] = useState(false);

  async function hostFlags() {
    if (running) return;
    setRunning(true);

    try {
      const snapshot = await getDocs(collection(db, "squads"));
      let updated = 0;
      let skipped = 0;

      for (const squadDoc of snapshot.docs) {
        const data = squadDoc.data();
        const code = typeof data.countryCode === "string" ? data.countryCode.trim().toLowerCase() : "";

        if (!/^[a-z]{2}$/.test(code)) {
          skipped += 1;
          continue;
        }

        if (typeof data.flagUrl === "string" && data.flagUrl.trim()) {
          skipped += 1;
          continue;
        }

        setStatus(`Hosting flag for ${data.squadName || squadDoc.id}...`);

        const flagResponse = await fetch(`https://flagcdn.com/w160/${code}.png`, {
          cache: "no-store",
        });

        if (!flagResponse.ok) {
          throw new Error(`Unable to download flag for ${code.toUpperCase()}.`);
        }

        const blob = await flagResponse.blob();
        const file = new File([blob], `${code}-flag.png`, { type: "image/png" });
        const formData = new FormData();
        formData.append("file", file);

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const result = (await uploadResponse.json()) as UploadResponse;

        if (!uploadResponse.ok || !result.logoUrl) {
          throw new Error(result.error || `Unable to host flag for ${code.toUpperCase()}.`);
        }

        await updateDoc(doc(db, "squads", squadDoc.id), {
          flagUrl: result.logoUrl,
          flagPublicId: result.logoPublicId || "",
        });

        updated += 1;
      }

      setStatus(`Done. Hosted ${updated} flag(s). Skipped ${skipped}. You can return to /overlay now.`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Unable to host flags.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-xl rounded-2xl border border-blue-800 bg-gray-950 p-8">
        <h1 className="text-3xl font-black">Host Squad Flags</h1>
        <p className="mt-3 text-gray-300">
          This downloads each squad country flag, uploads it through the same /api/upload pipeline used by team logos, and saves the returned hosted URL as flagUrl in Firestore.
        </p>
        <button
          type="button"
          onClick={() => void hostFlags()}
          disabled={running}
          className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-4 font-black disabled:opacity-50"
        >
          {running ? "HOSTING FLAGS..." : "HOST ALL FLAGS"}
        </button>
        <p className="mt-5 rounded-xl border border-gray-800 bg-black p-4 text-sm text-gray-200">{status}</p>
      </div>
    </main>
  );
}
