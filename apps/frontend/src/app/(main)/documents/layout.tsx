import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Documents",
};

export default function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
