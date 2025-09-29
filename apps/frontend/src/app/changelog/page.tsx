"use client";

import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Function to render markdown content as HTML (simple implementation)
function renderMarkdown(markdown: string) {
  return markdown
    .replace(/^# (.+$)/gim, '<h1 class="text-3xl font-bold mb-6">$1</h1>')
    .replace(
      /^## (.+$)/gim,
      '<h2 class="text-2xl font-semibold mb-4 mt-8">$1</h2>',
    )
    .replace(
      /^### (.+$)/gim,
      '<h3 class="text-lg font-medium mb-3 mt-6">$1</h3>',
    )
    .replace(/^- (.+$)/gim, '<li class="ml-6 mb-1">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export default function ChangelogPage() {
  const [changelogContent, setChangelogContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChangelog = async () => {
      try {
        const response = await fetch("/api/changelog");
        const data = await response.json();

        if (data.status === "success") {
          setChangelogContent(data.content);
        } else {
          setError(data.error || "Failed to load changelog");
        }
      } catch (err) {
        setError("Failed to fetch changelog");
      } finally {
        setLoading(false);
      }
    };

    fetchChangelog();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-8 h-8" />
          <h1 className="text-3xl font-bold">Eclaire Changelog</h1>
        </div>
        <p className="text-muted-foreground">
          Track all changes, updates, and improvements to Eclaire
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Release History</CardTitle>
          <CardDescription>
            Detailed changelog with all features, bug fixes, and improvements
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading changelog...</div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-destructive">{error}</div>
            </div>
          )}

          {changelogContent && !loading && (
            <div
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(changelogContent),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
