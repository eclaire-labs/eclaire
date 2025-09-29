import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Upload",
};

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
