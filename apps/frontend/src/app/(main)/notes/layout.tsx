import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Notes",
};

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
