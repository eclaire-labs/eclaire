import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Photos",
};

export default function PhotosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
