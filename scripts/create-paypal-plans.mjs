const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const mode = process.env.PAYPAL_MODE || "live";

if (!clientId || !clientSecret) {
  console.error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET.");
  process.exit(1);
}

const apiBase =
  mode === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

async function getAccessToken() {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || "Unable to authenticate with PayPal.",
    );
  }

  return payload.access_token;
}

async function createProduct(accessToken) {
  const response = await fetch(`${apiBase}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      name: "N2 Scrims Support Membership",
      description: "Monthly community support membership for N2 Scrims.",
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || "Unable to create PayPal product.",
    );
  }

  return payload.id;
}

async function createPlan(accessToken, productId, name, price) {
  const response = await fetch(`${apiBase}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      product_id: productId,
      name,
      description: `${name} monthly support for N2 Scrims.`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: price,
              currency_code: "USD",
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 1,
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || `Unable to create ${name} plan.`,
    );
  }

  return payload.id;
}

try {
  const accessToken = await getAccessToken();
  const productId = await createProduct(accessToken);

  const supporter = await createPlan(
    accessToken,
    productId,
    "N2 Scrims Supporter",
    "2.99",
  );

  const elite = await createPlan(
    accessToken,
    productId,
    "N2 Scrims Elite Supporter",
    "5.99",
  );

  const vip = await createPlan(
    accessToken,
    productId,
    "N2 Scrims VIP",
    "9.99",
  );

  console.log("");
  console.log("PayPal plans created successfully.");
  console.log("");
  console.log(`PAYPAL_PLAN_SUPPORTER=${supporter}`);
  console.log(`PAYPAL_PLAN_ELITE=${elite}`);
  console.log(`PAYPAL_PLAN_VIP=${vip}`);
  console.log("");
  console.log("Copy those three values into Vercel Environment Variables.");
} catch (error) {
  console.error(error);
  process.exit(1);
}
