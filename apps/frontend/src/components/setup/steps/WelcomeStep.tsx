import { ArrowRight, Globe, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StepProps } from "../SetupWizard";

export function WelcomeStep({ state, onNext, isAdvancing }: StepProps) {
  const isFirstUser = state.userCount === 0;

  return (
    <Card>
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl">Welcome to Eclaire</CardTitle>
        <CardDescription className="text-base">
          {isFirstUser
            ? "Let's set up your instance. This wizard will guide you through creating an admin account and configuring AI."
            : "Let's finish setting up your instance. This will only take a few minutes."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3 rounded-lg border p-4">
            <Server className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Local or Cloud AI</p>
              <p className="text-sm text-muted-foreground">
                Use local models with llama.cpp/Ollama, or cloud APIs like
                OpenRouter and OpenAI.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border p-4">
            <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Private by Default</p>
              <p className="text-sm text-muted-foreground">
                Your data stays on your server. Eclaire runs entirely
                self-hosted.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">What we'll set up:</p>
          <ol className="list-decimal list-inside space-y-1">
            {isFirstUser && <li>Create your admin account</li>}
            <li>Choose an AI backend (local or cloud)</li>
            <li>Configure a provider and select models</li>
            <li>Verify everything is working</li>
            <li>Set a registration policy</li>
          </ol>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onNext()} disabled={isAdvancing}>
            {isFirstUser ? "Get Started" : "Continue Setup"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
