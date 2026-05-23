/**
 * Live-feed provider registry. Adding a new provider:
 *   1. Implement `FeedProvider` in `src/lib/feeds/providers/<name>.ts`
 *      (pattern: see `eia-hormuz.ts` and `ofac-sdn.ts`).
 *   2. Add a server route at `src/app/api/feeds/<path>/route.ts` matching
 *      the provider's `endpoint`.
 *   3. Register the provider here.
 *
 * The single `useFeedRegistry()` hook iterates this list, polls each
 * provider on its declared cadence, and dispatches updates through the
 * generic `applyFeedBatch` store action.
 */
import { clinicalTrialsProvider } from "./providers/clinical-trials";
import { derivationsProvider } from "./providers/derivations";
import { eiaHormuzProvider } from "./providers/eia-hormuz";
import { eiaSaudiCrudeProvider } from "./providers/eia-saudi-crude";
import { fredProvider } from "./providers/fred";
import { noaaStormsProvider } from "./providers/noaa-storms";
import { ofacSdnProvider } from "./providers/ofac-sdn";
import { openFdaProvider } from "./providers/openfda";
import { worldBankProvider } from "./providers/world-bank";
import type { FeedProvider } from "./providers/types";

/**
 * Order matters loosely: primitive providers first, derivations last.
 * Polling is independent per provider so this isn't strict execution
 * order, but a derivation provider that fires before its primitives
 * have ticked simply emits an empty batch and tries again next cycle.
 */
export const FEED_PROVIDERS: ReadonlyArray<FeedProvider> = [
  eiaHormuzProvider,
  eiaSaudiCrudeProvider,
  ofacSdnProvider,
  fredProvider,
  worldBankProvider,
  openFdaProvider,
  clinicalTrialsProvider,
  noaaStormsProvider,
  derivationsProvider,
];
