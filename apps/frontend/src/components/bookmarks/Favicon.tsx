import { Link } from "lucide-react";
import { useEffect, useState } from "react";

import { normalizeApiUrl } from "@/lib/api-client";
import type { Bookmark } from "@/types/bookmark";

// Reusable Favicon component with fallback
export function Favicon({
  bookmark,
  className,
}: {
  bookmark: Bookmark;
  className?: string;
}) {
  const [error, setError] = useState(false);
  const faviconUrl = bookmark.faviconUrl
    ? normalizeApiUrl(bookmark.faviconUrl)
    : null;

  useEffect(() => {
    setError(false); // Reset error state when bookmark changes
  }, []);

  if (error || !faviconUrl) {
    return <Link className={className} />;
  }

  return (
    <img
      src={faviconUrl}
      alt="favicon"
      className={className}
      onError={() => setError(true)}
    />
  );
}
