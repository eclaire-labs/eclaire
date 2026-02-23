import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CreditCard,
  Info,
  Key,
  LogOut,
  Maximize2,
  MessageSquare,
  Minimize2,
  User,
} from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/ui/logo";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { useDueNowCount } from "@/hooks/use-due-now-count";
import { useIsMobile } from "@/hooks/use-mobile";

interface TopBarProps {
  onAssistantToggle: () => void;
  assistantOpen: boolean;
  onAssistantFullScreenToggle?: () => void;
  assistantFullScreen?: boolean;
}

export function TopBar({
  onAssistantToggle,
  assistantOpen,
  onAssistantFullScreenToggle,
  assistantFullScreen,
}: TopBarProps) {
  const { pathname: _pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { count: dueNowCount } = useDueNowCount();
  const { data: auth } = useAuth();

  const handleBellClick = () => {
    navigate({ to: "/all/due-now" });
  };

  return (
    <header className="h-16 flex items-center gap-2 md:gap-4 border-b bg-background px-3 md:px-6 w-full">
      <div className={`${isMobile ? "mr-2" : "mr-6"}`}>
        <Logo />
      </div>

      <div className="flex-1">
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a
            href="https://eclaire.co/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--hover-bg))] px-2 py-1 rounded transition-colors"
          >
            Documentation
          </a>
          <a
            href="https://eclaire.co/docs/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--hover-bg))] px-2 py-1 rounded transition-colors"
          >
            Developers
          </a>
        </nav>
      </div>

      <div className={`flex items-center ${isMobile ? "gap-1" : "gap-2"}`}>
        {/* Hide assistant controls on mobile - they're handled by the mobile tab bar */}
        {!isMobile && (
          <>
            <Button
              variant={assistantOpen ? "default" : "ghost"}
              size="icon"
              onClick={onAssistantToggle}
              className="relative"
              aria-label={assistantOpen ? "Close Assistant" : "Open Assistant"}
            >
              <MessageSquare className="h-5 w-5" />
            </Button>
            {onAssistantFullScreenToggle && (
              <Button
                variant={assistantFullScreen ? "default" : "ghost"}
                size="icon"
                onClick={onAssistantFullScreenToggle}
                className="relative"
                aria-label={
                  assistantFullScreen
                    ? "Exit Full Screen Assistant"
                    : "Full Screen Assistant"
                }
              >
                {assistantFullScreen ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </Button>
            )}
          </>
        )}

        <Button
          variant="ghost"
          size={isMobile ? "sm" : "icon"}
          className="relative"
          aria-label="Due Now Notifications"
          onClick={handleBellClick}
        >
          <Bell className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
          {dueNowCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 ${isMobile ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-xs"} rounded-full bg-red-500 text-white flex items-center justify-center font-medium`}
            >
              {dueNowCount > 99 ? "99+" : dueNowCount}
            </span>
          )}
        </Button>

        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size={isMobile ? "sm" : "icon"}
              className="rounded-full"
            >
              {auth?.user ? (
                <UserAvatar
                  user={{
                    email: auth.user.email,
                    displayName:
                      (auth.user as { displayName?: string }).displayName ??
                      auth.user.name ??
                      null,
                    fullName:
                      (auth.user as { fullName?: string }).fullName ??
                      auth.user.name ??
                      null,
                    avatarUrl:
                      (auth.user as { avatarUrl?: string }).avatarUrl ??
                      auth.user.image ??
                      null,
                    id: auth.user.id,
                  }}
                  size={isMobile ? "sm" : "md"}
                />
              ) : (
                <Avatar className={isMobile ? "h-6 w-6" : "h-8 w-8"}>
                  <AvatarFallback className={isMobile ? "text-xs" : ""}>
                    ?
                  </AvatarFallback>
                </Avatar>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings" search={{ tab: "profile" }}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" search={{ tab: "account" }}>
                <CreditCard className="mr-2 h-4 w-4" />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" search={{ tab: "assistant" }}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Assistant
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" search={{ tab: "notifications" }}>
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" search={{ tab: "api-keys" }}>
                <Key className="mr-2 h-4 w-4" />
                API Keys
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" search={{ tab: "about" }}>
                <Info className="mr-2 h-4 w-4" />
                About
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/auth/logout">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
