import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
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

  const widthValue = request.nextUrl.searchParams.get("w");
  const parsedWidth = Number(widthValue);
  const width =
    Number.isFinite(parsedWidth) && parsedWidth >= 20 && parsedWidth <= 256
      ? Math.round(parsedWidth)
      : 80;

  const upstream = await fetch(
    `https://flagcdn.com/w${width}/${cleanCode}.png`,
    {
      next: { revalidate: 86400 },
    },
  );

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Flag unavailable." },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}
