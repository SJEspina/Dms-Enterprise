import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  ChevronRight,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Receipt,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/reports", label: "Reports", icon: FileBarChart },
];

function AuthLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden md:h-screen md:flex-row">
      <aside
        className={cn(
          "dms-glass-sidebar relative z-10 flex shrink-0 flex-col border-sidebar-border text-sidebar-foreground transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:m-3 md:h-[calc(100vh-1.5rem)] md:rounded-[24px] md:border",
          sidebarExpanded ? "md:w-64" : "md:w-20",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b border-white/55 p-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:h-[73px]",
            sidebarExpanded ? "md:px-5" : "md:justify-center md:px-3",
          )}
        >
          <div className="h-10 w-10 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-white/70">
            <img src="/dms-logo.jpg" alt="DMS Enterprise" className="h-full w-full object-cover" />
          </div>
          <div
            className={cn(
              "min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
              sidebarExpanded
                ? "md:max-w-40 md:translate-x-0 md:opacity-100"
                : "md:max-w-0 md:-translate-x-2 md:opacity-0",
            )}
          >
            <div className="font-semibold">DMS Enterprise</div>
            <div className="text-xs opacity-70">Admin Console</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className={cn(
              "ml-auto hidden h-9 w-9 rounded-xl border border-white/70 bg-white/70 text-sidebar-foreground shadow-sm transition-all duration-300 hover:bg-white hover:text-sidebar-accent-foreground md:flex",
              !sidebarExpanded && "absolute -right-4 top-4 z-10",
            )}
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
          >
            {sidebarExpanded ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
        <nav
          className={cn(
            "flex gap-1 overflow-x-auto p-3 md:flex-1 md:flex-col md:space-y-1 md:overflow-visible",
            !sidebarExpanded && "md:items-center",
          )}
        >
          {nav.map((n) => {
            const active =
              pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-label={n.label}
                title={!sidebarExpanded ? n.label : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-200",
                  sidebarExpanded ? "md:w-full" : "md:h-11 md:w-11 md:justify-center md:px-0",
                  sidebarExpanded ? "md:gap-3" : "md:gap-0",
                  active
                    ? "border border-white/70 bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_14px_32px_oklch(0.62_0.17_155_/_0.16)]"
                    : "hover:bg-white/55 hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                <span
                  className={cn(
                    "overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
                    sidebarExpanded
                      ? "md:max-w-32 md:translate-x-0 md:opacity-100"
                      : "md:max-w-0 md:-translate-x-2 md:opacity-0",
                  )}
                >
                  {n.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div
          className={cn(
            "flex items-center gap-2 border-t border-white/55 p-3 md:block",
            !sidebarExpanded && "md:flex md:flex-col md:items-center",
          )}
        >
          <div
            className={cn(
              "min-w-0 flex-1 truncate px-3 text-xs opacity-70 transition-all duration-300 ease-out md:mb-2",
              sidebarExpanded
                ? "md:max-w-full md:translate-x-0 md:opacity-70"
                : "md:max-w-0 md:-translate-x-2 md:px-0 md:opacity-0",
            )}
          >
            {session.user.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            title={!sidebarExpanded ? "Sign out" : undefined}
            className={cn(
              "shrink-0 justify-start rounded-2xl text-sidebar-foreground hover:bg-white/60 hover:text-sidebar-accent-foreground md:w-full",
              !sidebarExpanded && "md:h-11 md:w-11 md:justify-center md:px-0",
            )}
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className={cn("h-4 w-4", sidebarExpanded && "mr-2")} />
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
                sidebarExpanded
                  ? "md:max-w-24 md:translate-x-0 md:opacity-100"
                  : "md:max-w-0 md:-translate-x-2 md:opacity-0",
              )}
            >
              Sign out
            </span>
          </Button>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="min-h-full w-full p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
