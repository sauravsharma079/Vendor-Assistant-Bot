import type { SapConnector } from "./types";
import { RealS4HanaConnector } from "./s4hana-connector";

export * from "./types";

let connector: SapConnector | null = null;

/**
 * Single switch point for the whole app. By default this only ever talks
 * to a real SAP S/4HANA tenant, so every response the app shows reflects
 * what's actually true in SAP.
 *
 * The one exception: SAP_MODE=mock, set explicitly in .env.local, routes
 * to MockSapConnector (mock-sap-server) for local development against
 * fabricated test data instead of a live tenant. This is hard-blocked
 * whenever NODE_ENV=production UNLESS a second, separately-named flag —
 * ALLOW_MOCK_IN_PRODUCTION=true — is also set. Requiring both means a real
 * client deployment (which would only ever set SAP_S4_* and never either
 * of these two) can't end up showing fabricated data by accident; the
 * combination only exists so a hosted demo build (no real SAP tenant
 * available) can knowingly opt in.
 */
export function getSapConnector(): SapConnector {
  if (connector) return connector;

  if (process.env.SAP_MODE === "mock") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_IN_PRODUCTION !== "true") {
      throw new Error(
        "SAP_MODE=mock is set but NODE_ENV=production — refusing to start. " +
          "This app must never show fabricated data to real vendors. Unset SAP_MODE " +
          "(and configure SAP_S4_* against a real tenant) before deploying, or set " +
          "ALLOW_MOCK_IN_PRODUCTION=true if this is a knowingly mock-data demo deployment."
      );
    }
    console.warn(
      `[lib/sap] SAP_MODE=mock — using MockSapConnector against ` +
        `${process.env.MOCK_SAP_BASE_URL || "http://localhost:4001"}. Never set this for a real client.`
    );
    const { MockSapConnector } = require("./mock-connector");
    connector = new MockSapConnector();
    return connector as SapConnector;
  }

  connector = new RealS4HanaConnector();
  return connector;
}
