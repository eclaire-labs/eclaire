// components/chat/thinking-accordion.tsx

import { BrainCircuit } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ThinkingAccordionProps {
  content: string;
}

export function ThinkingAccordion({ content }: ThinkingAccordionProps) {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1" className="border-b-0">
        <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4" />
            <span>Assistant thoughts</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="prose prose-sm dark:prose-invert max-w-full rounded-md border bg-muted p-3 text-muted-foreground">
          {content}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
