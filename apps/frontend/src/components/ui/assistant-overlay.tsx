import { useNavigate } from "@tanstack/react-router";
import { CheckSquare, Maximize2, MessageSquare, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AssistantOverlayProps {
  onFullScreenChat: () => void;
  onWindowedChat: () => void;
  onAssignTask: () => void;
  className?: string;
}

export function AssistantOverlay({
  onFullScreenChat,
  onWindowedChat,
  onAssignTask,
  className,
}: AssistantOverlayProps) {
  const [isActive, setIsActive] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const hideMenuTimer = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  const actions = [
    {
      name: "Upload Document",
      icon: Upload,
      action: () => navigate({ to: "/upload" }),
    },
    {
      name: "Assign Task",
      icon: CheckSquare,
      action: onAssignTask,
    },
    {
      name: "Windowed Chat",
      icon: MessageSquare,
      action: onWindowedChat,
    },
    {
      name: "Full Screen Chat",
      icon: Maximize2,
      action: onFullScreenChat,
    },
  ];

  // Calculate positions dynamically using trigonometry (same as original prototype)
  // biome-ignore lint/correctness/useExhaustiveDependencies: geometry only depends on count, not action content
  const actionPositions = useMemo(() => {
    const radius = 75;
    const startAngle = 90; // degrees
    const endAngle = 180; // degrees
    const totalAngle = endAngle - startAngle;
    const angleStep =
      actions.length > 1 ? totalAngle / (actions.length - 1) : 0;

    return actions.map((_, index) => {
      const angle = (startAngle + angleStep * index) * (Math.PI / 180); // Convert to radians
      const x = radius * Math.cos(angle);
      const y = -radius * Math.sin(angle); // Negative because CSS y increases downward

      return {
        x: x.toFixed(2),
        y: y.toFixed(2),
        delay: index * 50, // Animation delay
      };
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- geometry only depends on count, not action content
  }, [actions.length]);

  const handleMouseEnter = () => {
    if (hideMenuTimer.current) {
      clearTimeout(hideMenuTimer.current);
    }
    setIsActive(true);
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  };

  const handleMouseLeave = () => {
    hideMenuTimer.current = setTimeout(() => {
      setIsActive(false);
      setHoveredAction(null);
    }, 300);
  };

  const handleActionClick = (action: () => void) => {
    action();
    setIsActive(false);
    setHoveredAction(null);
  };

  useEffect(() => {
    return () => {
      if (hideMenuTimer.current) {
        clearTimeout(hideMenuTimer.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed bottom-8 right-8 z-50 w-50 h-50 flex justify-end items-end pointer-events-none",
        className,
      )}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover detection wrapper for assistant menu, not a clickable element */}
      <div
        className="relative w-full h-full flex justify-end items-end pointer-events-auto"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={cn(
            "relative w-16 h-16 flex items-center justify-center",
            !hasInteracted && "animate-[gentle-bounce_4s_infinite_ease-in-out]",
          )}
        >
          {/* Ripple effect - only show if not interacted */}
          {!hasInteracted && (
            <div className="absolute inset-0 rounded-full pointer-events-none z-20 opacity-100 transition-opacity duration-500">
              <div className="absolute top-1/2 left-1/2 w-full h-full -translate-x-1/2 -translate-y-1/2">
                <div
                  className="w-full h-full border-2 rounded-full opacity-0 animate-[ripple-pulse_4s_infinite_ease-out]"
                  style={{ borderColor: "hsl(var(--brand-400))" }}
                />
              </div>
              <div className="absolute top-1/2 left-1/2 w-full h-full -translate-x-1/2 -translate-y-1/2">
                <div
                  className="w-full h-full border-2 rounded-full opacity-0 animate-[ripple-pulse_4s_infinite_ease-out] [animation-delay:0.5s]"
                  style={{ borderColor: "hsl(var(--brand-400))" }}
                />
              </div>
              <div className="absolute top-1/2 left-1/2 w-full h-full -translate-x-1/2 -translate-y-1/2">
                <div
                  className="w-full h-full border-2 rounded-full opacity-0 animate-[ripple-pulse_4s_infinite_ease-out] [animation-delay:1s]"
                  style={{ borderColor: "hsl(var(--brand-400))" }}
                />
              </div>
            </div>
          )}

          {/* Floating particles - only show if not interacted */}
          {!hasInteracted && (
            <div className="absolute inset-0 rounded-full pointer-events-none z-10 overflow-hidden opacity-100 transition-opacity duration-500">
              <div
                className="absolute w-1 h-1 rounded-full opacity-0 animate-[float-up_3s_infinite_ease-out] left-[20%]"
                style={{ backgroundColor: "hsl(var(--brand-400))" }}
              />
              <div
                className="absolute w-1 h-1 rounded-full opacity-0 animate-[float-up_3s_infinite_ease-out] left-[40%] [animation-delay:0.5s]"
                style={{ backgroundColor: "hsl(var(--brand-400))" }}
              />
              <div
                className="absolute w-1 h-1 rounded-full opacity-0 animate-[float-up_3s_infinite_ease-out] left-[60%] [animation-delay:1s]"
                style={{ backgroundColor: "hsl(var(--brand-400))" }}
              />
              <div
                className="absolute w-1 h-1 rounded-full opacity-0 animate-[float-up_3s_infinite_ease-out] left-[80%] [animation-delay:1.5s]"
                style={{ backgroundColor: "hsl(var(--brand-400))" }}
              />
              <div
                className="absolute w-1 h-1 rounded-full opacity-0 animate-[float-up_3s_infinite_ease-out] left-[30%] [animation-delay:2s]"
                style={{ backgroundColor: "hsl(var(--brand-400))" }}
              />
              <div
                className="absolute w-1 h-1 rounded-full opacity-0 animate-[float-up_3s_infinite_ease-out] left-[70%] [animation-delay:2.5s]"
                style={{ backgroundColor: "hsl(var(--brand-400))" }}
              />
            </div>
          )}

          {/* Main assistant button */}
          <button
            type="button"
            className={cn(
              "relative z-30 w-16 h-16 rounded-full border-none cursor-pointer shadow-lg flex items-center justify-center transition-all duration-300",
              "hover:scale-110 hover:shadow-xl",
            )}
            aria-label="Open AI Assistant Menu"
            style={{
              background:
                "linear-gradient(to bottom right, hsl(var(--brand-400)), hsl(var(--brand-500)))",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(to bottom right, hsl(var(--brand-300)), hsl(var(--brand-400)))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(to bottom right, hsl(var(--brand-400)), hsl(var(--brand-500)))";
            }}
          >
            <svg
              className="w-9 h-9 text-white filter drop-shadow-sm"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>AI Assistant</title>
              <path d="M19 6h-2.28a3 3 0 0 0-5.44 0H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3ZM7.5 15a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
              <path d="M12 5a1 1 0 0 1-1-1V2a1 1 0 0 1 2 0v2a1 1 0 0 1-1 1Z" />
            </svg>
          </button>
        </div>

        {/* Action items */}
        {actions.map((action, index) => {
          const position = actionPositions[index];
          return (
            // biome-ignore lint/a11y/useSemanticElements: positioned action item not suited for button element
            <div
              key={action.name}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
              role="button"
              tabIndex={0}
              className={cn(
                "absolute bottom-3.5 right-3.5 w-9 h-9 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition-all duration-300 pointer-events-none",
                "opacity-0 scale-50",
                isActive && "opacity-100 scale-100 pointer-events-auto",
                "hover:scale-110 hover:shadow-xl",
              )}
              style={{
                background:
                  "linear-gradient(to bottom right, hsl(var(--brand-400)), hsl(var(--brand-500)))",
                transform: isActive
                  ? `translate(${position.x}px, ${position.y}px) scale(1)`
                  : "translate(0, 0) scale(0.5)",
                transitionDelay: isActive ? `${position.delay}ms` : "0ms",
              }}
              onMouseEnter={() => setHoveredAction(action.name)}
              onMouseLeave={() => setHoveredAction(null)}
              onClick={() => handleActionClick(action.action)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleActionClick(action.action);
                }
              }}
            >
              <action.icon className="w-4 h-4 text-white" />
            </div>
          );
        })}

        {/* Action label */}
        <div
          className={cn(
            "absolute bottom-32 right-2 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 pointer-events-none whitespace-nowrap",
            "opacity-0 invisible translate-y-0",
            isActive && hoveredAction && "opacity-100 visible -translate-y-1",
          )}
          style={{
            background:
              "linear-gradient(to bottom right, hsl(var(--brand-400) / 0.95), hsl(var(--brand-500) / 0.95))",
          }}
        >
          {hoveredAction}
        </div>
      </div>
    </div>
  );
}
