import { useEffect } from "react";
import { signOut } from "@/lib/auth";

export default function LogoutPage() {
  useEffect(() => {
    signOut().then(() => {
      // Full page reload to clear all React state and query caches
      window.location.href = "/auth/login";
    });
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Logging out...</h1>
        <p className="mt-2 text-muted-foreground">
          You will be redirected shortly.
        </p>
      </div>
    </div>
  );
}
