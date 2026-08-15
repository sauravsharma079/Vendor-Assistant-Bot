import type { SapConnector } from "./types";
import { RealS4HanaConnector } from "./s4hana-connector";

export * from "./types";

let connector: SapConnector | null = null;

/**
 * Single switch point for the whole app. There is no mock/demo data path
 * by design \u2014 every response the app shows comes from a live SAP
 * S/4HANA call. If the sandbox isn't configured yet, this throws a clear
 * configuration error rather than ever returning fabricated data.
 */
export function getSapConnector(): SapConnector {
  if (connector) return connector;
  connector = new RealS4HanaConnector();
  return connector;
}
