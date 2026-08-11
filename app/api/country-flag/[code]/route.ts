import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const cleanCode = code.trim().toLowerCase();

  if (!/^[a-z]{2}$/.test(cleanCode)) {
    return NextResponse.json(
      { error: "Invalid country code." },
      { status: 400 },
    );
  }

  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "flags",
      `${cleanCode}.png`,
    );

    const png = await readFile(filePath);

    return new NextResponse(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Disposition": `inline; filename="${cleanCode}.png"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Flag not found." },
      { status: 404 },
    );
  }
}
