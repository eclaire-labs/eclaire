// components/chat/thinking-accordion.tsx

import { Brain } from "lucide-react";
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
      <AccordionItem
        value="item-1"
        className="border-b-0 rounded-md border border-dashed border-muted-foreground/20 bg-muted/10"
      >
        <AccordionTrigger className="py-2 px-2 text-xs text-muted-foreground hover:no-underline">
          <div className="flex items-center gap-1.5">
            <Brain className="h-3 w-3 text-muted-foreground/70" />
            <span className="text-xs font-normal">Thought Process</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-2 pb-2">
          <div className="p-2 bg-muted/20 rounded border-l-2 border-muted-foreground/20">
            <div className="text-xs whitespace-pre-wrap text-muted-foreground/90 leading-relaxed max-w-full break-words font-mono">
              {content}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
