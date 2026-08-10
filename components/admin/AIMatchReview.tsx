"use client";

import { getAuth } from "firebase/auth";
import { useMemo, useState } from "react";

export type AiReviewPlayer = {
  playerIndex: number;
  registeredName: string;
  screenshotName: string;
  kills: number | null;
  confidence: number;
  nameMatch: "exact" | "similar" | "uncertain";
  applySuggestedName: boolean;
  note?: string;
};

export type AiReviewSquad = {
  squadId: string;
  squadName: string;
  screenshotSquadName: string;
  placement: number | null;
  confidence: number;
  players: AiReviewPlayer[];
  note?: string;
};

type ReviewResponse = {
  summary: string;
  warnings: string[];
  squads: AiReviewSquad[];
};

type CurrentSquad = {
  squadId: string;
  squadName: string;
  slot: number;
  placement: number | null;
  players: Array<{ playerIndex: number; name: string; kills: number }>;
};

export default function AIMatchReview({
  matchNumber,
  matchStatus,
  killPointValue,
  squads,
  onApplySquad,
}: {
  matchNumber: number;
  matchStatus: "not-started" | "live" | "finalized";
  killPointValue: number;
  squads: CurrentSquad[];
  onApplySquad: (review: AiReviewSquad) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const canReview = files.length > 0 && squads.length > 0 && !loading;
  const currentLookup = useMemo(
    () => new Map(squads.map((squad) => [squad.squadId, squad])),
    [squads],
  );

  async function analyzeScreenshots() {
    if (!canReview) return;
    setLoading(true);
    setMessage("");
    setReview(null);

    try {
      const currentUser = getAuth().currentUser;
      if (!currentUser) throw new Error("Sign in again before using AI Match Review.");
      const token = await currentUser.getIdToken();
      const images = await Promise.all(
        files.slice(0, 6).map(async (file) => ({
          name: file.name,
          dataUrl: await fileToDataUrl(file),
        })),
      );

      const response = await fetch("/api/admin/matches/ai-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ matchNumber, killPointValue, squads, images }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "AI review failed.");
      setReview(payload as ReviewResponse);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Unable to analyze screenshots.");
    } finally {
      setLoading(false);
    }
  }

  function updatePlayer(squadId: string, playerIndex: number, patch: Partial<AiReviewPlayer>) {
    setReview((current) => {
      if (!current) return current;
      return {
        ...current,
        squads: current.squads.map((squad) =>
          squad.squadId === squadId
            ? {
                ...squad,
                players: squad.players.map((player) =>
                  player.playerIndex === playerIndex ? { ...player, ...patch } : player,
                ),
              }
            : squad,
        ),
      };
    });
  }

  return (
    <section className="mt-4 rounded-2xl border border-cyan-400/20 bg-slate-900 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">AI Match Review</p>
          <h2 className="mt-1 text-2xl font-black">Read PUBG Mobile Result Screenshots</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Upload up to 6 result screenshots. AI reads squad names, player IGNs, kills, and placement, then fuzzy-matches similar names to the current roster. Nothing changes until you press Apply.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black">
            Choose Screenshots
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                setFiles(Array.from(event.target.files || []).slice(0, 6));
                setReview(null);
                setMessage("");
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void analyzeScreenshots()}
            disabled={!canReview}
            className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-black text-black disabled:opacity-40"
          >
            {loading ? "AI is checking..." : "Analyze Screenshots"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <span>Match {matchNumber}</span><span>•</span><span>{matchStatus}</span><span>•</span>
        <span>{killPointValue} pts per kill</span><span>•</span><span>{files.length} screenshot(s)</span>
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">{message}</div>
      )}

      {review && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="font-black">{review.summary}</p>
            {review.warnings.map((warning, index) => (
              <p key={`${warning}-${index}`} className="mt-1 text-xs text-yellow-200">⚠ {warning}</p>
            ))}
          </div>

          {review.squads.map((squad) => {
            const current = currentLookup.get(squad.squadId);
            return (
              <article key={squad.squadId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{squad.squadName}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                      Confidence {Math.round(squad.confidence * 100)}%
                      {typeof squad.placement === "number" ? ` • Placement ${squad.placement}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!current || matchStatus !== "live"}
                    onClick={() => onApplySquad(squad)}
                    className="rounded-lg bg-white px-4 py-2 text-xs font-black text-black disabled:opacity-40"
                  >Apply to Match</button>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[1fr_1fr_90px_110px_150px] gap-2 border-b border-white/10 px-2 py-2 text-[9px] font-black uppercase text-slate-500">
                      <span>Registered IGN</span><span>Screenshot IGN</span><span>Kills</span><span>Confidence</span><span>Name action</span>
                    </div>
                    {squad.players.map((player) => (
                      <div key={`${squad.squadId}-${player.playerIndex}`} className="grid grid-cols-[1fr_1fr_90px_110px_150px] items-center gap-2 border-b border-white/5 px-2 py-2 text-xs">
                        <span className="truncate font-bold">{player.registeredName}</span>
                        <span className="truncate font-bold text-cyan-200">{player.screenshotName || "Not read"}</span>
                        <input
                          type="number"
                          min={0}
                          value={player.kills ?? ""}
                          onChange={(event) => updatePlayer(squad.squadId, player.playerIndex, { kills: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })}
                          className="h-8 rounded-md border border-white/10 bg-slate-950 px-2 text-center font-black outline-none"
                        />
                        <span className={player.confidence >= 0.9 ? "font-black text-green-300" : player.confidence >= 0.7 ? "font-black text-yellow-300" : "font-black text-red-300"}>
                          {Math.round(player.confidence * 100)}% {player.nameMatch}
                        </span>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={player.applySuggestedName}
                            disabled={!player.screenshotName}
                            onChange={(event) => updatePlayer(squad.squadId, player.playerIndex, { applySuggestedName: event.target.checked })}
                          />
                          <span>Use screenshot IGN</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-500">
        AI suggestions are review-only. Your existing scoring code still calculates team kills, kill points, placement points, and total points.
      </p>
    </section>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read screenshot."));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
