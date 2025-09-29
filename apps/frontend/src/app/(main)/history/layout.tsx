import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "History",
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
