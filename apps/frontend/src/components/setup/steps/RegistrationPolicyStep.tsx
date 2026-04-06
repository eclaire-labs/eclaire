import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { StepProps } from "../SetupWizard";

export function RegistrationPolicyStep({
  onNext,
  onBack,
  isAdvancing,
}: StepProps) {
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration Policy</CardTitle>
        <CardDescription>
          Choose whether new users can create accounts on their own, or if only
          administrators can create accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="registration-toggle" className="text-base">
              Allow open registration
            </Label>
            <p className="text-sm text-muted-foreground">
              {registrationEnabled
                ? "Anyone with the link can create an account."
                : "Only admins can create accounts for new users."}
            </p>
          </div>
          <Switch
            id="registration-toggle"
            checked={registrationEnabled}
            onCheckedChange={setRegistrationEnabled}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          You can always change this later in Settings &gt; Administration &gt;
          Registration.
        </p>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => onNext({ registrationEnabled })}
            disabled={isAdvancing}
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
