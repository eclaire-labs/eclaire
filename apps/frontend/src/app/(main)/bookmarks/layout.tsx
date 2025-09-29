import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Bookmarks",
};

export default function BookmarksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
