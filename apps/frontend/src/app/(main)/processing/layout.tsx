import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Processing",
};

export default function ProcessingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
