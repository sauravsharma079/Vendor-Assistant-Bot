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
 * whenever NODE_ENV=production, so it can never end up in front of a real
 * vendor no matter what .env is deployed with.
 */
export function getSapConnector(): SapConnector {
  if (connector) return connector;

  if (process.env.SAP_MODE === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SAP_MODE=mock is set but NODE_ENV=production — refusing to start. " +
          "This app must never show fabricated data to real vendors. Unset SAP_MODE " +
          "(and configure SAP_S4_* against a real tenant) before deploying."
      );
    }
    console.warn(
      `[lib/sap] SAP_MODE=mock — using MockSapConnector against ` +
        `${process.env.MOCK_SAP_BASE_URL || "http://localhost:4001"}. Never set this in production.`
    );
    const { MockSapConnector } = require("./mock-connector");
    connector = new MockSapConnector();
    return connector as SapConnector;
  }

  connector = new RealS4HanaConnector();
  return connector;
}
