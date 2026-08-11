"use client";

import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { db } from "@/firebase";

type UploadResponse = {
  logoUrl?: string;
  logoPublicId?: string;
  error?: string;
};

async function convertFlagToJpeg(code: string) {
  const response = await fetch(`https://flagcdn.com/w320/${code}.png`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to download flag for ${code.toUpperCase()}.`);
  }

  const sourceBlob = await response.blob();
  const objectUrl = URL.createObjectURL(sourceBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();

      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error(`Unable to decode flag for ${code.toUpperCase()}.`));

      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 200;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to create flag conversion canvas.");
    }

    // Flatten every flag onto an opaque white RGB-style background.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(
      canvas.width / image.naturalWidth,
      canvas.height / image.naturalHeight,
    );

    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    context.drawImage(image, x, y, width, height);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Unable to convert flag to JPEG."));
          }
        },
        "image/jpeg",
        0.92,
      );
    });

    return new File([jpegBlob], `${code}-flag.jpg`, {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function HostFlagsPage() {
  const [status, setStatus] = useState(
    "Ready to rebuild squad flags as simple JPEG images.",
  );
  const [running, setRunning] = useState(false);

  async function hostFlags() {
    if (running) return;

    setRunning(true);

    try {
      const snapshot = await getDocs(collection(db, "squads"));

      let updated = 0;
      let skipped = 0;

      for (const squadDocument of snapshot.docs) {
        const data = squadDocument.data();
        const code =
          typeof data.countryCode === "string"
            ? data.countryCode.trim().toLowerCase()
            : "";

        if (!/^[a-z]{2}$/.test(code)) {
          skipped += 1;
          continue;
        }

        setStatus(
          `Rebuilding JPEG flag for ${data.squadName || squadDocument.id}...`,
        );

        const jpegFile = await convertFlagToJpeg(code);

        const formData = new FormData();
        formData.append("file", jpegFile);

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const result = (await uploadResponse.json()) as UploadResponse;

        if (!uploadResponse.ok || !result.logoUrl) {
          throw new Error(
            result.error ||
              `Unable to upload JPEG flag for ${code.toUpperCase()}.`,
          );
        }

        await updateDoc(doc(db, "squads", squadDocument.id), {
          flagUrl: result.logoUrl,
          flagPublicId: result.logoPublicId || "",
          flagFormat: "jpeg",
        });

        updated += 1;
      }

      setStatus(
        `Done. Rebuilt ${updated} flag(s) as JPEG. Skipped ${skipped}. Refresh /overlay and TikTok LIVE Studio.`,
      );
    } catch (error) {
      console.error(error);
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to rebuild squad flags.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-xl rounded-2xl border border-blue-800 bg-gray-950 p-8">
        <h1 className="text-3xl font-black">Rebuild Squad Flags</h1>

        <p className="mt-3 text-gray-300">
          This recreates every squad flag as a plain opaque JPEG, uploads it
          through the same /api/upload pipeline as team logos, and replaces the
          squad&apos;s flagUrl in Firestore.
        </p>

        <button
          type="button"
          onClick={() => void hostFlags()}
          disabled={running}
          className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-4 font-black disabled:opacity-50"
        >
          {running ? "REBUILDING FLAGS..." : "REBUILD ALL FLAGS AS JPEG"}
        </button>

        <p className="mt-5 rounded-xl border border-gray-800 bg-black p-4 text-sm text-gray-200">
          {status}
        </p>
      </div>
    </main>
  );
}
