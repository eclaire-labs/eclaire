import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Flagged",
};

export default function FlaggedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
