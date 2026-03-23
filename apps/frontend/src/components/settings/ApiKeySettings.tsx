import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Key } from "lucide-react";
import ApiKeyManager from "./ApiKeyManager";

export default function ApiKeySettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          API Keys
        </CardTitle>
        <CardDescription>
          Manage API keys for yourself, your agents, and external systems.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-4">
          <ApiKeyManager />
        </div>
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">API Documentation</h3>
          <div className="prose dark:prose-invert max-w-none">
            <p>
              To use the API, include the actor API key in the Authorization
              header of your requests:
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-4">
              <code>{`Authorization: Bearer YOUR_API_KEY`}</code>
            </pre>
            <p>For example:</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-4">
              <code>
                {`fetch('https://api.eclaire.example/api/documents', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
})`}
              </code>
            </pre>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
