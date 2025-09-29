import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Pinned",
};

export default function PinnedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
