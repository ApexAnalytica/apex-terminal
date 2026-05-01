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
import { eiaHormuzProvider } from "./providers/eia-hormuz";
import { fredProvider } from "./providers/fred";
import { ofacSdnProvider } from "./providers/ofac-sdn";
import { openFdaProvider } from "./providers/openfda";
import { worldBankProvider } from "./providers/world-bank";
import type { FeedProvider } from "./providers/types";

export const FEED_PROVIDERS: ReadonlyArray<FeedProvider> = [
  eiaHormuzProvider,
  ofacSdnProvider,
  fredProvider,
  worldBankProvider,
  openFdaProvider,
];
