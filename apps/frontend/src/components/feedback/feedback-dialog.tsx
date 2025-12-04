
import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FeedbackDialogProps {
  children?: React.ReactNode;
  trigger?: React.ReactNode;
}

type Sentiment = "positive" | "negative" | null;

export function FeedbackDialog({ children, trigger }: FeedbackDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [sentiment, setSentiment] = useState<Sentiment>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setDescription("");
      setSentiment(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Please enter a description");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          description: description.trim(),
          sentiment: sentiment,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      toast.success("Thank you for your feedback!");
      setOpen(false);
      // Form will be reset by useEffect when dialog reopens
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultTrigger = (
    <Button variant="ghost" className="w-full justify-start">
      <MessageSquare className="h-4 w-4 mr-3" />
      Feedback
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || children || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Share Your Feedback</DialogTitle>
          <DialogDescription>
            Help us improve by sharing your thoughts and suggestions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="description">
              Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Tell us what you think..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
              maxLength={2000}
            />
            <div className="text-sm text-muted-foreground text-right">
              {description.length}/2000
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Sentiment (optional)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={sentiment === "positive" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setSentiment(sentiment === "positive" ? null : "positive")
                }
                className={cn(
                  "flex-1",
                  sentiment === "positive" && "bg-green-600 hover:bg-green-700",
                )}
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={sentiment === "negative" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setSentiment(sentiment === "negative" ? null : "negative")
                }
                className={cn(
                  "flex-1",
                  sentiment === "negative" && "bg-red-600 hover:bg-red-700",
                )}
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
