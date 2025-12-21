
import { ArrowLeft, Mail } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      toast({
        title: "Reset email sent",
        description:
          "If an account exists with this email, you will receive a password reset link.",
      });
    }, 1500);
  };

  return (
    <div className="container relative flex min-h-screen flex-col items-center justify-center">
      <Link
        to="/auth/login"
        search={{ callbackUrl: "/dashboard" }}
        className="absolute left-4 top-4 md:left-8 md:top-8 flex items-center text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to login
      </Link>

      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          {!isSubmitted ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                Forgot password
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto bg-primary/10 p-3 rounded-full">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Check your email
              </h1>
              <p className="text-sm text-muted-foreground">
                We've sent a password reset link to{" "}
                <span className="font-medium">{email}</span>.
              </p>
            </>
          )}
        </div>

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="name@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!email || isSubmitting}
            >
              {isSubmitting ? "Sending reset link..." : "Send reset link"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <Button variant="outline" className="w-full" asChild>
              <Link to="/auth/login" search={{ callbackUrl: "/dashboard" }}>Return to login</Link>
            </Button>
            <div className="text-center text-sm">
              Didn't receive the email?{" "}
              <button
                onClick={() => setIsSubmitted(false)}
                className="text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
