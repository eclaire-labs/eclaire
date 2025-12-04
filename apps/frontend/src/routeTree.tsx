import {
  createRootRouteWithContext,
  createRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { AssistantPreferencesProvider } from "@/providers/AssistantPreferencesProvider";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { MainLayoutClient } from "@/components/dashboard/main-layout-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { RouterContext } from "@/router";

// Lazy imports for route components
const DashboardPage = lazy(
  () => import("@/app/(main)/dashboard/page"),
);
const NotesIndexPage = lazy(() => import("@/app/(main)/notes/page"));
const NoteDetailClient = lazy(() =>
  import("@/app/(main)/notes/NoteDetailClient").then((m) => ({
    default: m.NoteDetailClient,
  })),
);
const TasksIndexPage = lazy(() => import("@/app/(main)/tasks/page"));
const TaskDetailClient = lazy(() =>
  import("@/app/(main)/tasks/TaskDetailClient").then((m) => ({
    default: m.TaskDetailClient,
  })),
);
const BookmarksIndexPage = lazy(() => import("@/app/(main)/bookmarks/page"));
const BookmarkDetailClient = lazy(() =>
  import("@/app/(main)/bookmarks/BookmarkDetailClient").then((m) => ({
    default: m.BookmarkDetailClient,
  })),
);
const DocumentsIndexPage = lazy(() => import("@/app/(main)/documents/page"));
const DocumentDetailClient = lazy(() =>
  import("@/app/(main)/documents/DocumentDetailClient").then((m) => ({
    default: m.DocumentDetailClient,
  })),
);
const PhotosIndexPage = lazy(() => import("@/app/(main)/photos/page"));
const PhotoDetailClient = lazy(() =>
  import("@/app/(main)/photos/PhotoDetailClient").then((m) => ({
    default: m.PhotoDetailClient,
  })),
);
const HistoryPage = lazy(() => import("@/app/(main)/history/page"));
const ProcessingPage = lazy(() => import("@/app/(main)/processing/page"));
const UploadPage = lazy(() => import("@/app/(main)/upload/page"));
const SettingsPage = lazy(() => import("@/app/(main)/settings/page"));
const AllIndexPage = lazy(() => import("@/app/(main)/all/page"));
const AllDueNowPage = lazy(() => import("@/app/(main)/all/due-now/page"));
const AllFlaggedPage = lazy(() => import("@/app/(main)/all/flagged/page"));
const AllPendingPage = lazy(() => import("@/app/(main)/all/pending/page"));
const AllPinnedPage = lazy(() => import("@/app/(main)/all/pinned/page"));
const LoginPage = lazy(() => import("@/app/auth/login/page"));
const RegisterPage = lazy(() => import("@/app/auth/register/page"));
const LogoutPage = lazy(() => import("@/app/auth/logout/page"));
const VerifyEmailPage = lazy(() => import("@/app/auth/verify-email/page"));
const ForgotPasswordPage = lazy(
  () => import("@/app/auth/forgot-password/page"),
);
const SupportPage = lazy(() => import("@/app/support/page"));

// Page loading fallback
function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

// Wrap lazy component with Suspense
function withSuspense(Component: React.LazyExoticComponent<any>) {
  return function SuspenseWrapper() {
    return (
      <Suspense fallback={<PageLoading />}>
        <Component />
      </Suspense>
    );
  };
}

// Root route with providers
// Note: SessionProvider and QueryProvider are in main.tsx (before RouterProvider)
// so that useSession() works when setting router context
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AssistantPreferencesProvider>
        <Outlet />
      </AssistantPreferencesProvider>
      <Toaster />
      <PWAInstallPrompt />
    </ThemeProvider>
  ),
});

// Index route - redirect to dashboard
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

// Auth loading skeleton
function AuthLoadingSkeleton() {
  return (
    <div className="flex flex-col h-screen">
      <div className="h-14 border-b bg-background flex items-center px-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="flex flex-1">
        <div className="w-48 border-r bg-background p-3 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

// Authenticated layout route
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  beforeLoad: async ({ context, location }) => {
    if (context.auth.isLoading) {
      return;
    }
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/auth/login",
        search: { callbackUrl: location.pathname },
      });
    }
  },
  component: () => (
    <MainLayoutClient>
      <Outlet />
    </MainLayoutClient>
  ),
  pendingComponent: AuthLoadingSkeleton,
});

// Dashboard
const dashboardRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/dashboard",
  component: withSuspense(DashboardPage),
});

// Notes
const notesIndexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/notes",
  component: withSuspense(NotesIndexPage),
});

const noteDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/notes/$id",
  component: withSuspense(NoteDetailClient),
});

// Tasks
const tasksIndexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/tasks",
  component: withSuspense(TasksIndexPage),
});

const taskDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/tasks/$id",
  component: withSuspense(TaskDetailClient),
});

// Bookmarks
const bookmarksIndexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/bookmarks",
  component: withSuspense(BookmarksIndexPage),
});

const bookmarkDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/bookmarks/$id",
  component: withSuspense(BookmarkDetailClient),
});

// Documents
const documentsIndexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/documents",
  component: withSuspense(DocumentsIndexPage),
});

const documentDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/documents/$id",
  component: withSuspense(DocumentDetailClient),
});

// Photos
const photosIndexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/photos",
  component: withSuspense(PhotosIndexPage),
});

const photoDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/photos/$id",
  component: withSuspense(PhotoDetailClient),
});

// Other authenticated routes
const historyRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/history",
  component: withSuspense(HistoryPage),
});

const processingRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/processing",
  component: withSuspense(ProcessingPage),
});

const uploadRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/upload",
  component: withSuspense(UploadPage),
});

const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/settings",
  component: withSuspense(SettingsPage),
});

// All routes
const allIndexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/all",
  component: withSuspense(AllIndexPage),
});

const allDueNowRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/all/due-now",
  component: withSuspense(AllDueNowPage),
});

const allFlaggedRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/all/flagged",
  component: withSuspense(AllFlaggedPage),
});

const allPendingRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/all/pending",
  component: withSuspense(AllPendingPage),
});

const allPinnedRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/all/pinned",
  component: withSuspense(AllPinnedPage),
});

// Auth routes (not protected)
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/login",
  component: withSuspense(LoginPage),
  validateSearch: (search: Record<string, unknown>) => ({
    callbackUrl: (search.callbackUrl as string) || "/dashboard",
  }),
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/register",
  component: withSuspense(RegisterPage),
});

const logoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/logout",
  component: withSuspense(LogoutPage),
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/verify-email",
  component: withSuspense(VerifyEmailPage),
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/forgot-password",
  component: withSuspense(ForgotPasswordPage),
});

// Support route
const supportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/support",
  component: withSuspense(SupportPage),
});

// Build route tree
export const routeTree = rootRoute.addChildren([
  indexRoute,
  authenticatedRoute.addChildren([
    dashboardRoute,
    notesIndexRoute,
    noteDetailRoute,
    tasksIndexRoute,
    taskDetailRoute,
    bookmarksIndexRoute,
    bookmarkDetailRoute,
    documentsIndexRoute,
    documentDetailRoute,
    photosIndexRoute,
    photoDetailRoute,
    historyRoute,
    processingRoute,
    uploadRoute,
    settingsRoute,
    allIndexRoute,
    allDueNowRoute,
    allFlaggedRoute,
    allPendingRoute,
    allPinnedRoute,
  ]),
  loginRoute,
  registerRoute,
  logoutRoute,
  verifyEmailRoute,
  forgotPasswordRoute,
  supportRoute,
]);
