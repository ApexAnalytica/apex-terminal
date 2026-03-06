// ─── Engine Provider Registry ─────────────────────────────────
// Returns the active EngineProvider. Currently LocalProvider.
// Future: switch to RemoteProvider when FastAPI/gRPC backend is ready.

import type { EngineProvider } from "./engine-interface";
import { LocalProvider } from "./local-provider";

let _provider: EngineProvider | null = null;

export function getEngineProvider(): EngineProvider {
  if (!_provider) {
    _provider = new LocalProvider();
  }
  return _provider;
}

export type { EngineProvider } from "./engine-interface";
