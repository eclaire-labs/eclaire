"use client";

import { Copy, Eye, EyeOff, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/utils";

interface ApiKeyDisplayProps {
  apiKey: string;
}

export function ApiKeyDisplay({ apiKey }: ApiKeyDisplayProps) {
  const { toast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [exampleContent, setExampleContent] = useState<string>("");

  // Only run on client-side after hydration
  useEffect(() => {
    setIsMounted(true);
    const apiBaseUrl = getApiBaseUrl();
    setExampleContent(`curl -X POST ${apiBaseUrl}/api/prompt \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Hello there", "deviceInfo": {"deviceName": "my-device"}}'`);
  }, [apiKey]);

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast({
      title: "API key copied",
      description: "Your API key has been copied to the clipboard.",
    });
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const copyCurlExample = () => {
    navigator.clipboard.writeText(exampleContent);
    toast({
      title: "cURL example copied",
      description: "The example API call has been copied to the clipboard.",
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="bg-muted p-2 rounded-md text-sm font-mono flex-1 overflow-x-auto">
          {!apiKey
            ? "Loading..."
            : isVisible
              ? apiKey
              : apiKey.replace(/./g, "*")}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleVisibility}
                disabled={!apiKey}
              >
                {isVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isVisible ? "Hide API key" : "Show API key"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={copyApiKey}
                disabled={!apiKey}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy API key</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center mt-4 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mr-2" />
        <span>Never share your API key publicly or in client-side code</span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Example API Call</h4>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyCurlExample}
                  disabled={!apiKey}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  <span className="text-xs">Copy</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy cURL example</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="bg-muted p-3 rounded-md">
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
            {isMounted ? exampleContent : "Loading example..."}
          </pre>
        </div>
      </div>
    </>
  );
}
