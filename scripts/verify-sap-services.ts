/**
 * Pre-demo check: confirms all five SAP OData service paths this app
 * depends on actually resolve against the connected tenant, before
 * anyone runs the vendor portal in front of a client. The vendor,
 * invoice, and purchase order paths are standard SAP-released services
 * and should just work; the payment and Form 16 paths are best-effort
 * guesses at custom CDS view names (see lib/sap/s4hana-connector.ts) and
 * are the ones most likely to need a SAP_S4_*_SERVICE_PATH override in
 * .env.local.
 *
 * Usage: npm run verify:sap
 */
import fs from "fs";
import path from "path";
import { SAP_SERVICE_PATHS } from "../lib/sap/s4hana-connector";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function getAccessToken(tokenUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`OAuth2 token request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

interface CheckResult {
  name: string;
  envVar: string;
  path: string;
  ok: boolean;
  status?: number;
  note: string;
}

async function checkService(
  name: string,
  envVar: string,
  baseUrl: string,
  servicePath: string,
  token: string
): Promise<CheckResult> {
  try {
    const res = await fetch(`${baseUrl}${servicePath}?$top=1&$format=json`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.ok) {
      return { name, envVar, path: servicePath, ok: true, status: res.status, note: "reachable" };
    }
    if (res.status === 404) {
      return {
        name,
        envVar,
        path: servicePath,
        ok: false,
        status: 404,
        note: `Service/entity not found. If this is a custom CDS view under a different name, set ${envVar} in .env.local.`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        name,
        envVar,
        path: servicePath,
        ok: false,
        status: res.status,
        note: "Auth token was rejected for this service — check the Communication Arrangement grants access to this scenario.",
      };
    }
    return {
      name,
      envVar,
      path: servicePath,
      ok: false,
      status: res.status,
      note: `Unexpected response (${res.status} ${res.statusText}).`,
    };
  } catch (err) {
    return {
      name,
      envVar,
      path: servicePath,
      ok: false,
      note: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main() {
  loadEnvLocal();

  const baseUrl = process.env.SAP_S4_BASE_URL;
  const tokenUrl = process.env.SAP_S4_TOKEN_URL;
  const clientId = process.env.SAP_S4_CLIENT_ID;
  const clientSecret = process.env.SAP_S4_CLIENT_SECRET;

  if (!baseUrl || !tokenUrl || !clientId || !clientSecret) {
    console.error(
      "Missing SAP_S4_BASE_URL / SAP_S4_TOKEN_URL / SAP_S4_CLIENT_ID / SAP_S4_CLIENT_SECRET in .env.local.\n" +
        "Set these from your Communication Arrangement before running this check (see docs/SANDBOX_SETUP.md)."
    );
    process.exit(1);
  }

  console.log(`Getting OAuth2 token from ${tokenUrl} ...`);
  let token: string;
  try {
    token = await getAccessToken(tokenUrl, clientId, clientSecret);
  } catch (err) {
    console.error(`Could not get an access token: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
    return;
  }
  console.log("Token acquired. Checking each service...\n");

  const checks: Array<[string, string, string]> = [
    ["Vendor verification", "SAP_S4_VENDOR_SERVICE_PATH", SAP_SERVICE_PATHS.vendor],
    ["Invoice status", "SAP_S4_INVOICE_SERVICE_PATH", SAP_SERVICE_PATHS.invoice],
    ["Payment status", "SAP_S4_PAYMENT_SERVICE_PATH", SAP_SERVICE_PATHS.payment],
    ["Form 16 / TDS certificate", "SAP_S4_FORM16_SERVICE_PATH", SAP_SERVICE_PATHS.form16],
    ["Purchase order details", "SAP_S4_PO_ITEM_SERVICE_PATH", SAP_SERVICE_PATHS.purchaseOrderItem],
  ];

  const results: CheckResult[] = [];
  for (const [name, envVar, servicePath] of checks) {
    const result = await checkService(name, envVar, baseUrl, servicePath, token);
    results.push(result);
    const icon = result.ok ? "PASS" : "FAIL";
    console.log(`[${icon}] ${name}`);
    console.log(`       ${result.path}`);
    if (result.status) console.log(`       HTTP ${result.status}`);
    console.log(`       ${result.note}\n`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `${failed.length} of ${results.length} service(s) did not resolve. Fix these before demoing to the client — ` +
        `an escalation ticket is a safe fallback for missing data, but a broken service path shows up as a hard error.`
    );
    process.exit(1);
  }

  console.log("All SAP service paths resolved. Safe to demo.");
}

main();
