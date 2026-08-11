import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ squadId: string }> },
) {
  const { squadId } = await context.params;

  if (!squadId) {
    return NextResponse.json(
      { error: "Missing squad ID." },
      { status: 400 },
    );
  }

  const squadSnapshot = await getDoc(doc(db, "squads", squadId));

  if (!squadSnapshot.exists()) {
    return NextResponse.json(
      { error: "Squad not found." },
      { status: 404 },
    );
  }

  const data = squadSnapshot.data();
  const flagUrl =
    typeof data.flagUrl === "string" ? data.flagUrl.trim() : "";

  if (!flagUrl) {
    return NextResponse.json(
      { error: "This squad does not have a hosted flag URL." },
      { status: 404 },
    );
  }

  const response = await fetch(flagUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": "N2-Scrims-Flag-Proxy/1.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to load hosted squad flag." },
      { status: 502 },
    );
  }

  const contentType =
    response.headers.get("content-type") || "image/jpeg";
  const body = await response.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Disposition": "inline",
    },
  });
}
