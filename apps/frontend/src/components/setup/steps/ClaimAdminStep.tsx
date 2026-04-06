import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { signUp, useSession } from "@/lib/auth";
import type { StepProps } from "../SetupWizard";

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    email: z.string().email("Please enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function ClaimAdminStep({ state, onNext, isAdvancing }: StepProps) {
  const { data: session } = useSession();
  const [isRegistering, setIsRegistering] = useState(false);

  const isLoggedIn = !!session?.user;
  const isAdmin = state.adminExists;

  // Auto-advance if already admin
  useEffect(() => {
    if (isAdmin && isLoggedIn) {
      onNext();
    }
  }, [isAdmin, isLoggedIn, onNext]);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  async function handleRegister(values: z.infer<typeof registerSchema>) {
    setIsRegistering(true);
    try {
      const { error } = await signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      if (error) throw new Error(error.message || "Registration failed");
      toast.success("Account created! You are now the instance admin.");
      // Give the backend a moment to promote to admin, then advance
      setTimeout(() => onNext(), 500);
    } catch (error) {
      toast.error("Registration failed", {
        description:
          error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsRegistering(false);
    }
  }

  // Already logged in as admin — show confirmation
  if (isLoggedIn && isAdmin) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Admin Account Ready
          </CardTitle>
          <CardDescription>
            You're signed in as the instance administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end">
            <Button onClick={() => onNext()} disabled={isAdvancing}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Need to create first account
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Admin Account</CardTitle>
        <CardDescription>
          The first account becomes the instance administrator. You'll be able
          to manage all settings, users, and AI configuration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleRegister)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="admin@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isRegistering}>
                {isRegistering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
