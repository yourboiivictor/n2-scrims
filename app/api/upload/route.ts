import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export async function POST(request: NextRequest) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        {
          error:
            "Cloudinary is not configured on the server.",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No image file was provided." },
        { status: 400 },
      );
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid image type. Please upload a JPG, PNG, or WEBP image.",
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "The image must be smaller than 5 MB." },
        { status: 400 },
      );
    }

    const cloudinaryFormData = new FormData();

    cloudinaryFormData.append("file", file);
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "n2-scrims/squad-logos";
    const signatureBase = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;

    const signatureBuffer = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(signatureBase),
    );

    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    cloudinaryFormData.append("api_key", apiKey);
    cloudinaryFormData.append("timestamp", String(timestamp));
    cloudinaryFormData.append("signature", signature);
    cloudinaryFormData.append("folder", folder);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: cloudinaryFormData,
      },
    );

    const cloudinaryResult = await cloudinaryResponse.json();

    if (!cloudinaryResponse.ok) {
      console.error("Cloudinary upload error:", cloudinaryResult);

      return NextResponse.json(
        {
          error:
            cloudinaryResult?.error?.message ||
            "Cloudinary could not upload the image.",
        },
        { status: cloudinaryResponse.status },
      );
    }

    return NextResponse.json(
      {
        success: true,
        logoUrl: cloudinaryResult.secure_url,
        logoPublicId: cloudinaryResult.public_id,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        format: cloudinaryResult.format,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Upload route error:", error);

    return NextResponse.json(
      { error: "Something went wrong while uploading the image." },
      { status: 500 },
    );
  }
}