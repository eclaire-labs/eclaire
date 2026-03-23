import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  LogOut,
  Maximize2,
  MessageCircle,
  Minimize2,
  Settings,
} from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Logo } from "@/components/shared/logo";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
              <MessageCircle className="h-5 w-5" />
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
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {(auth?.user as { displayName?: string })?.displayName ??
                      auth?.user?.name ??
                      "User"}
                  </span>
                  {(auth?.user as { isInstanceAdmin?: boolean })
                    ?.isInstanceAdmin && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      Admin
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {auth?.user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
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
