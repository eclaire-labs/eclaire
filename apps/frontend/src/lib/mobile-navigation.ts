import type { MobileTab } from "@/components/mobile/mobile-tab-bar";

/**
 * Get the appropriate mobile tab based on the current pathname
 */
export function getMobileTabFromPathname(pathname: string): MobileTab {
  if (pathname === "/settings") {
    return "settings";
  }

  // Check if it's a content/folders path
  const foldersPath =
    pathname.startsWith("/all") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/notes") ||
    pathname.startsWith("/bookmarks") ||
    pathname.startsWith("/documents") ||
    pathname.startsWith("/photos") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/processing") ||
    pathname.startsWith("/upload");

  if (foldersPath) {
    return "folders";
  }

  // Default to chat for any other paths (including dashboard)
  return "chat";
}

/**
 * Check if a path should show the folders sheet when accessed
 */
export function shouldShowFolders(
  pathname: string,
  currentTab: MobileTab,
): boolean {
  return (
    currentTab === "folders" &&
    (pathname.startsWith("/all") ||
      pathname.startsWith("/tasks") ||
      pathname.startsWith("/notes") ||
      pathname.startsWith("/bookmarks") ||
      pathname.startsWith("/documents") ||
      pathname.startsWith("/photos") ||
      pathname.startsWith("/history") ||
      pathname.startsWith("/processing") ||
      pathname.startsWith("/upload"))
  );
}

/**
 * Get the default route for a mobile tab
 */
export function getRouteForMobileTab(tab: MobileTab): string | null {
  switch (tab) {
    case "settings":
      return "/settings";
    case "chat":
    case "folders":
      // These tabs don't navigate to routes, they open overlays
      return null;
    default:
      return null;
  }
}
