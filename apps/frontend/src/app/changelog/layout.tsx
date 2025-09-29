import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Changelog",
};

export default function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
