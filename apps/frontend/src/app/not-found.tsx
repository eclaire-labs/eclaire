import { redirect } from "next/navigation";

export default function NotFound() {
  // For non-API routes, return a nice 404 page
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <a
        href="/"
        className="mt-8 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Go back home
      </a>
    </div>
  );
}
