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

    const background = ctx.createLinearGradient(0, 0, 1080, 1920);
    background.addColorStop(0, "#000000");
    background.addColorStop(0.45, "#0a0a0a");
    background.addColorStop(1, "#050505");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const headerGradient = ctx.createLinearGradient(0, 0, 1080, 500);
    headerGradient.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    headerGradient.addColorStop(0.55, "rgba(255, 255, 255, 0.08)");
    headerGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, 1080, 560);

    drawPolynesianInspiredPattern(ctx, canvas.width, canvas.height);

    try {
      const n2Logo = await loadCanvasImage("/n2-logo.png");
      ctx.save();
      ctx.globalAlpha = 0.075;
      drawImageContained(ctx, n2Logo, 170, 600, 740, 740);
      ctx.restore();
    } catch (error) {
      console.warn("Unable to load N² watermark:", error);
    }

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "900 76px Arial";
    ctx.fillText(settings.name || "N² Scrims", 540, 165);

    ctx.font = "700 34px Arial";
    ctx.fillStyle = "#d4d4d4";
    ctx.fillText(
      `${settings.season ? `Season ${settings.season} · ` : ""}Overall Standings`,
      540,
      225,
    );

    ctx.font = "900 46px Arial";
    ctx.fillStyle = "#ffffff";
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

      const rowBackgrounds = ["#ffffff", "#d4d4d4", "#737373"];
      const rowTextColors = ["#000000", "#000000", "#ffffff"];

      if (index < 3) {
        ctx.fillStyle = rowBackgrounds[index];
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
      }
      drawRoundedRectangle(ctx, 70, y, 940, 92, 18);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = rowTextColors[index] ?? "#ffffff";
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
        ctx.fillStyle = "#737373";
        ctx.font = "900 24px Arial";
        ctx.fillText(
          row.squadName.trim().charAt(0).toUpperCase() || "?",
          logoX + logoSize / 2,
          logoY + 44,
        );
      }

      ctx.textAlign = "left";
      ctx.fillStyle = rowTextColors[index] ?? "#ffffff";
      ctx.font = "900 30px Arial";
      ctx.fillText(row.squadName.slice(0, 21), 295, y + 57);

      ctx.textAlign = "right";
      ctx.fillStyle = rowTextColors[index] ?? "#ffffff";
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
    <main className="min-h-screen bg-black px-4 py-5 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-white/10 bg-neutral-950 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-neutral-300">
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
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    index === 0
                      ? "border-white bg-white text-black"
                      : index === 1
                        ? "border-neutral-300 bg-neutral-300 text-black"
                        : index === 2
                          ? "border-neutral-500 bg-neutral-500 text-white"
                          : "border-white/15 bg-white/[0.05] text-white backdrop-blur-sm"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`w-8 shrink-0 font-black ${index < 3 ? "text-current" : "text-neutral-300"}`}>
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
                        <span className="text-sm font-black text-neutral-500">
                          {row.squadName.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                    </div>

                    <span className="truncate font-black">
                      {row.squadName}
                    </span>
                  </div>

                  <span className={`font-black ${index < 3 ? "text-current" : "text-neutral-300"}`}>
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


function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
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

function drawPolynesianInspiredPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;

  const bandWidth = 62;
  const step = 72;

  for (let y = 20; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(12, y + 30);
    ctx.lineTo(12 + bandWidth / 2, y);
    ctx.lineTo(12 + bandWidth, y + 30);
    ctx.lineTo(12 + bandWidth / 2, y + 60);
    ctx.closePath();
    ctx.stroke();

    const right = width - 12 - bandWidth;
    ctx.beginPath();
    ctx.moveTo(right, y + 30);
    ctx.lineTo(right + bandWidth / 2, y);
    ctx.lineTo(right + bandWidth, y + 30);
    ctx.lineTo(right + bandWidth / 2, y + 60);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.globalAlpha = 0.035;
  ctx.lineWidth = 4;
  for (let y = 500; y < height - 160; y += 150) {
    for (let x = 150; x < width - 150; x += 130) {
      ctx.beginPath();
      ctx.moveTo(x, y + 54);
      ctx.lineTo(x + 32, y);
      ctx.lineTo(x + 64, y + 54);
      ctx.lineTo(x + 48, y + 54);
      ctx.lineTo(x + 32, y + 28);
      ctx.lineTo(x + 16, y + 54);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
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
