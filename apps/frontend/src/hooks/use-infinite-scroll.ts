import { useEffect, useRef } from "react";

/**
 * Uses an IntersectionObserver to trigger `fetchNextPage` when
 * a sentinel element scrolls into view.
 */
export function useInfiniteScroll(options: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  rootMargin?: string;
}) {
  const {
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootMargin = "300px",
  } = options;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin]);

  return { sentinelRef };
}
