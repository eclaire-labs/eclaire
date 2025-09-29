"use client";

import {
  Activity,
  AlertTriangle,
  BookMarked,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  History,
  Home,
  ImageIcon,
  ListTodo,
  Notebook,
  Pin,
  Search,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface MobileFoldersViewProps {
  open: boolean;
  onClose: () => void;
}

// Navigation items from MainLayoutClient - excluding Dashboard and Settings
const navigationGroups = [
  {
    title: "Actions",
    items: [
      { name: "Processing", href: "/processing", icon: Activity },
      { name: "Upload", href: "/upload", icon: Upload },
    ],
  },
  {
    title: "Browse",
    items: [
      { name: "All", href: "/all", icon: Search },
      { name: "Pending", href: "/all/pending", icon: Clock },
      { name: "Due Now", href: "/all/due-now", icon: AlertTriangle },
      { name: "Pinned", href: "/all/pinned", icon: Pin },
      { name: "Flagged", href: "/all/flagged", icon: Flag },
    ],
  },
  {
    title: "Content",
    items: [
      { name: "Tasks", href: "/tasks", icon: ListTodo },
      { name: "Notes", href: "/notes", icon: Notebook },
      { name: "Bookmarks", href: "/bookmarks", icon: BookMarked },
      { name: "Documents", href: "/documents", icon: FileText },
      { name: "Photos", href: "/photos", icon: ImageIcon },
    ],
  },
  {
    title: "History",
    items: [{ name: "History", href: "/history", icon: History }],
  },
];

export function MobileFoldersView({ open, onClose }: MobileFoldersViewProps) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    // Handle exact matches first for specificity
    if (pathname === path) return true;

    // Special handling for nested routes under /all
    if (path === "/all" && pathname.startsWith("/all/")) return false;

    // Handle other paths starting with the href (but not for /all or /dashboard)
    if (path !== "/dashboard" && path !== "/all" && pathname.startsWith(path))
      return true;

    return false;
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-background transition-transform duration-300 ease-in-out flex flex-col safe-area-pt",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Navigation content - Full height with proper scrolling */}
      <div className="flex-1 overflow-y-auto pb-20">
        <nav className="p-4">
          {navigationGroups.map((group, groupIndex) => (
            <div key={group.title} className="mb-8">
              <h2 className="text-lg font-medium text-foreground mb-3 px-3">
                {group.title}
              </h2>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 rounded-lg text-base transition-colors",
                        isActive(item.href)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted",
                      )}
                      onClick={onClose}
                    >
                      <div className="flex items-center gap-4">
                        <item.icon className="h-5 w-5" />
                        <span>{item.name}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
