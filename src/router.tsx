import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const QUERY_CACHE_KEY = "maydan-query-cache";
const QUERY_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function restoreQueryCache(queryClient: QueryClient) {
  if (typeof window === "undefined") return;

  try {
    const stored = localStorage.getItem(QUERY_CACHE_KEY);
    if (!stored) return;

    const cache = JSON.parse(stored) as { timestamp?: number; state?: unknown };
    if (!cache.timestamp || Date.now() - cache.timestamp > QUERY_CACHE_MAX_AGE) {
      localStorage.removeItem(QUERY_CACHE_KEY);
      return;
    }

    hydrate(queryClient, cache.state);
  } catch (error) {
    console.warn("Unable to restore offline query data:", error);
  }
}

function persistQueryCache(queryClient: QueryClient) {
  if (typeof window === "undefined") return;

  queryClient.getQueryCache().subscribe(() => {
    try {
      localStorage.setItem(
        QUERY_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          state: dehydrate(queryClient),
        }),
      );
    } catch (error) {
      console.warn("Unable to persist offline query data:", error);
    }
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();
  restoreQueryCache(queryClient);
  persistQueryCache(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
