"use client";

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { db } from "@/firebase";
import {
  defaultTournamentSettings,
  loadTournamentStats,
} from "@/lib/tournamentClient";
import type {
  TournamentSettings,
  TournamentStanding,
} from "@/lib/tournamentClient";

export default function ResultsGraphicsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [settings, setSettings] = useState<TournamentSettings>(
    defaultTournamentSettings,
  );
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [squadLogos, setSquadLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [rows, snapshot, squadsSnapshot] = await Promise.all([
          loadTournamentStats(),
          getDoc(doc(db, "settings", "tournament")),
          getDocs(collection(db, "squads")),
        ]);

        if (!active) return;

        const logos: Record<string, string> = {};

        squadsSnapshot.docs.forEach((squadDocument) => {
          const data = squadDocument.data();
          const logoUrl =
            typeof data.logoUrl === "string" ? data.logoUrl.trim() : "";

          if (logoUrl) {
            logos[squadDocument.id] = logoUrl;
          }
        });

        setSquadLogos(logos);
        setStandings(rows);

        if (snapshot.exists()) {
          setSettings({
            ...defaultTournamentSettings,
            ...(snapshot.data() as Partial<TournamentSettings>),
          });
        }
      } catch (error) {
        console.error("Unable to load graphics data:", error);

        if (active) {
          setMessage("Unable to load tournament graphics data.");
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  async function generate() {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setMessage("Canvas is not supported in this browser.");
      return;
    }

    setMessage("Generating preview...");

    canvas.width = 1080;
    canvas.height = 1920;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(0, 0, 1080, 500);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#0a0a0a");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 500);

    try {
      const background = await loadCanvasImage("/poly.png");
      drawImageCover(ctx, background, 0, 500, canvas.width, canvas.height - 500);
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      ctx.fillRect(0, 500, canvas.width, canvas.height - 500);
    } catch (error) {
      console.warn("Unable to load Polynesian background:", error);
    }


    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.textAlign = "center";
    ctx.font = "900 76px Arial";
    ctx.strokeText(settings.name || "N² Scrims", 540, 165);
    ctx.fillText(settings.name || "N² Scrims", 540, 165);

    ctx.font = "700 34px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 7;
    ctx.strokeText(
      `${settings.season ? `Season ${settings.season} · ` : ""}Overall Standings`,
      540,
      225,
    );
    ctx.fillText(
      `${settings.season ? `Season ${settings.season} · ` : ""}Overall Standings`,
      540,
      225,
    );

    ctx.font = "900 46px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 8;
    ctx.strokeText("TOURNAMENT RESULTS", 540, 340);
    ctx.fillText("TOURNAMENT RESULTS", 540, 340);

    const topTen = standings.slice(0, 10);
    const loadedLogos = await Promise.all(
      topTen.map(async (row) => {
        const logoUrl = squadLogos[row.squadId];

        if (!logoUrl) return null;

        try {
          return await loadCanvasImage(logoUrl);
        } catch (error) {
          console.warn(`Unable to load logo for ${row.squadName}:`, error);
          return null;
        }
      }),
    );

    topTen.forEach((row, index) => {
      const y = 560 + index * 118;

      ctx.fillStyle = index < 3 ? "#171717" : "#0a0a0a";
      drawRoundedRectangle(ctx, 70, y, 940, 92, 18);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 34px Arial";
      ctx.fillText(`#${index + 1}`, 100, y + 58);

      const logo = loadedLogos[index];
      const logoX = 205;
      const logoY = y + 12;
      const logoSize = 68;

      ctx.fillStyle = "#ffffff";
      drawRoundedRectangle(ctx, logoX, logoY, logoSize, logoSize, 14);
      ctx.fill();

      if (logo) {
        drawImageContained(ctx, logo, logoX + 5, logoY + 5, logoSize - 10, logoSize - 10);
      } else {
        ctx.textAlign = "center";
        ctx.fillStyle = "#000000";
        ctx.font = "900 24px Arial";
        ctx.fillText(
          row.squadName.trim().charAt(0).toUpperCase() || "?",
          logoX + logoSize / 2,
          logoY + 44,
        );
      }

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 30px Arial";
      ctx.fillText(row.squadName.slice(0, 21), 295, y + 57);

      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 34px Arial";
      ctx.fillText(String(row.totalPoints), 940, y + 57);
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#a3a3a3";
    ctx.font = "700 24px Arial";
    ctx.fillText("N² SCRIMS", 540, 1810);

    setMessage("");
  }

  async function download() {
    await generate();

    const canvas = canvasRef.current;

    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "n2-tournament-results.png";
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Unable to download results graphic:", error);
      setMessage(
        "The graphic was generated, but the browser could not export it. Check that squad logo URLs allow cross-origin image access.",
      );
    }
  }

  return (
    <main
      className="min-h-screen bg-black px-4 py-5 text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.48), rgba(0,0,0,0.48)), url('/poly.png')",
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-white/10 bg-neutral-950 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-white">
            N² Scrims Admin
          </p>

          <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-black">
                Results Graphics
              </h1>

              <p className="text-sm text-neutral-400">
                Generate a 1080 × 1920 tournament-results image.
              </p>
            </div>

            <Link
              href="/admin/tournament"
              className="rounded-lg bg-white text-black px-4 py-2.5 text-sm font-black"
            >
              Standings
            </Link>
          </div>

          {message && (
            <div className="mt-4 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-white">
              {message}
            </div>
          )}
        </header>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="rounded-2xl border border-white/10 bg-neutral-950 p-5">
            <h2 className="text-xl font-black">
              Top 10 Preview
            </h2>

            <div className="mt-4 space-y-2">
              {standings.slice(0, 10).map((row, index) => (
                <div
                  key={row.squadId}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-8 shrink-0 font-black text-white">
                      #{index + 1}
                    </span>

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white bg-white p-1">
                      {squadLogos[row.squadId] ? (
                        <img
                          src={squadLogos[row.squadId]}
                          alt={`${row.squadName} logo`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-sm font-black text-black">
                          {row.squadName.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                    </div>

                    <span className="truncate font-black">
                      {row.squadName}
                    </span>
                  </div>

                  <span className="font-black text-white">
                    {row.totalPoints}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={download}
              disabled={!ready}
              className="mt-5 w-full rounded-lg bg-white text-black px-5 py-3 font-black disabled:opacity-50"
            >
              Download 1080 × 1920 PNG
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-950 p-4">
            <canvas
              ref={canvasRef}
              className="h-auto w-full rounded-xl border border-white/10"
            />

            <button
              type="button"
              onClick={generate}
              disabled={!ready}
              className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-black disabled:opacity-50"
            >
              Refresh Preview
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}


function drawPolynesianPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 5;

  const cell = 120;

  for (let y = 500; y < height - 90; y += cell) {
    for (let x = -cell; x < width + cell; x += cell) {
      const offsetX = ((Math.floor(y / cell) % 2) * cell) / 2;
      const cx = x + offsetX;
      const cy = y;

      // Repeating spear/chevron motif.
      ctx.beginPath();
      ctx.moveTo(cx, cy + 55);
      ctx.lineTo(cx + 30, cy + 20);
      ctx.lineTo(cx + 60, cy + 55);
      ctx.lineTo(cx + 90, cy + 20);
      ctx.lineTo(cx + 120, cy + 55);
      ctx.stroke();

      // Diamond motif.
      ctx.beginPath();
      ctx.moveTo(cx + 30, cy + 78);
      ctx.lineTo(cx + 60, cy + 58);
      ctx.lineTo(cx + 90, cy + 78);
      ctx.lineTo(cx + 60, cy + 98);
      ctx.closePath();
      ctx.stroke();

      // Small stepped marks.
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy + 104);
      ctx.lineTo(cx + 20, cy + 92);
      ctx.lineTo(cx + 32, cy + 104);
      ctx.stroke();
    }
  }

  ctx.restore();
}


function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawImageContained(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawRoundedRectangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}
