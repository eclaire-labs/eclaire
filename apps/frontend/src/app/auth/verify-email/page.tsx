"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleResendEmail = () => {
    setIsResending(true);

    // Simulate API call
    setTimeout(() => {
      setIsResending(false);
      toast({
        title: "Verification email sent",
        description: "Please check your inbox for the verification link.",
      });
    }, 1500);
  };

  const handleVerify = () => {
    if (!verificationCode) return;

    setIsVerifying(true);

    // Simulate API call
    setTimeout(() => {
      setIsVerifying(false);
      toast({
        title: "Email verified",
        description: "Your email has been successfully verified.",
      });
      router.push("/dashboard");
    }, 1500);
  };

  return (
    <div className="container relative flex min-h-screen flex-col items-center justify-center">
      <Link
        href="/auth/login"
        className="absolute left-4 top-4 md:left-8 md:top-8 flex items-center text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to login
      </Link>

      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <div className="mx-auto bg-primary/10 p-3 rounded-full">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Verify your email
          </h1>
          <p className="text-sm text-muted-foreground">
            We've sent a verification code to your email address. Please enter
            the code below to verify your account.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Enter verification code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleVerify}
            disabled={!verificationCode || isVerifying}
          >
            {isVerifying ? "Verifying..." : "Verify Email"}
          </Button>
        </div>

        <div className="text-center text-sm">
          Didn't receive the email?{" "}
          <button
            onClick={handleResendEmail}
            disabled={isResending}
            className="text-primary hover:underline disabled:opacity-70"
          >
            {isResending ? "Sending..." : "Resend"}
          </button>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>
            For demo purposes, you can click the "Verify Email" button with any
            code to proceed to the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
