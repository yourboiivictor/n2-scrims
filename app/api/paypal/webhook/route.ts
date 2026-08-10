import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    if (!webhookId) {
      return NextResponse.json(
        { error: "PAYPAL_WEBHOOK_ID is not configured." },
        { status: 500 },
      );
    }

    const rawBody = await request.text();
    const event = JSON.parse(rawBody) as {
      id?: string;
      event_type?: string;
      resource?: Record<string, unknown>;
    };

    const verified = await verifyPayPalWebhook(request, event, webhookId);

    if (!verified) {
      return NextResponse.json(
        { error: "Invalid PayPal webhook signature." },
        { status: 400 },
      );
    }

    // Initial version: verified events are logged.
    // Add Firestore supporter syncing here when you want automatic badges/status.
    console.log("Verified PayPal webhook:", {
      id: event.id,
      eventType: event.event_type,
      resource: event.resource,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("PayPal webhook failed:", error);

    return NextResponse.json(
      { error: "Unable to process PayPal webhook." },
      { status: 500 },
    );
  }
}

async function verifyPayPalWebhook(
  request: NextRequest,
  webhookEvent: unknown,
  webhookId: string,
) {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${getPayPalApiBase()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: request.headers.get("paypal-auth-algo"),
        cert_url: request.headers.get("paypal-cert-url"),
        transmission_id: request.headers.get("paypal-transmission-id"),
        transmission_sig: request.headers.get("paypal-transmission-sig"),
        transmission_time: request.headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as {
    verification_status?: string;
  };

  return (
    response.ok &&
    payload.verification_status === "SUCCESS"
  );
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
  };

  if (!response.ok || !payload.access_token) {
    throw new Error("Unable to authenticate with PayPal.");
  }

  return payload.access_token;
}
