import { Link as LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeApiUrl } from "@/lib/api-client";
import type { Bookmark } from "@/types/bookmark";

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
    return <LinkIcon className={className} />;
  }

  // Check if this is a GitHub domain to apply dark mode inversion
  const isGitHubDomain =
    bookmark.url.includes("github.com") || bookmark.url.includes("github.io");
  const darkModeClasses = isGitHubDomain ? "dark:brightness-0 dark:invert" : "";

  return (
    <img
      src={faviconUrl}
      alt="favicon"
      className={`${className} ${darkModeClasses}`}
      onError={() => setError(true)}
    />
  );
}
