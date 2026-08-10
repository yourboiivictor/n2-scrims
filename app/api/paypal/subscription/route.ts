import { NextRequest, NextResponse } from "next/server";

type TierId = "supporter" | "elite" | "vip";

const PLAN_ENV: Record<TierId, string> = {
  supporter: "PAYPAL_PLAN_SUPPORTER",
  elite: "PAYPAL_PLAN_ELITE",
  vip: "PAYPAL_PLAN_VIP",
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tier?: string };
    const tier = body.tier as TierId | undefined;

    if (!tier || !(tier in PLAN_ENV)) {
      return NextResponse.json(
        { error: "Invalid subscription tier." },
        { status: 400 },
      );
    }

    const planId = process.env[PLAN_ENV[tier]];

    if (!planId) {
      return NextResponse.json(
        { error: `${PLAN_ENV[tier]} is not configured.` },
        { status: 500 },
      );
    }

    const accessToken = await getPayPalAccessToken();
    const apiBase = getPayPalApiBase();
    const origin = request.nextUrl.origin;

    const response = await fetch(`${apiBase}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        plan_id: planId,
        application_context: {
          brand_name: "N2 Scrims",
          locale: "en-US",
          user_action: "SUBSCRIBE_NOW",
          return_url: `${origin}/support?status=success`,
          cancel_url: `${origin}/support?status=cancelled`,
        },
        custom_id: tier,
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      id?: string;
      status?: string;
      links?: Array<{ href?: string; rel?: string }>;
      message?: string;
      details?: Array<{ description?: string }>;
    };

    if (!response.ok) {
      console.error("PayPal subscription error:", payload);

      return NextResponse.json(
        {
          error:
            payload.details?.[0]?.description ||
            payload.message ||
            "PayPal could not create the subscription.",
        },
        { status: 502 },
      );
    }

    const approvalUrl =
      payload.links?.find((link) => link.rel === "approve")?.href || "";

    if (!approvalUrl) {
      return NextResponse.json(
        { error: "PayPal did not return an approval URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      subscriptionId: payload.id || "",
      status: payload.status || "",
      approvalUrl,
    });
  } catch (error) {
    console.error("PayPal subscription route failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create PayPal subscription.",
      },
      { status: 500 },
    );
  }
}

function getPayPalApiBase() {
  return process.env.PAYPAL_MODE === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be configured.",
    );
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || "Unable to authenticate with PayPal.",
    );
  }

  return payload.access_token;
}
