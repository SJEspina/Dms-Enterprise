import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ShoppingBag, Receipt, FileBarChart, LogOut } from "lucide-react";
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

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-background md:h-screen md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:h-screen md:w-64">
        <div className="flex items-center gap-2 border-b border-sidebar-border p-4 md:p-5">
          <div className="h-10 w-10 overflow-hidden rounded-md bg-white ring-1 ring-sidebar-border">
            <img src="/dms-logo.jpg" alt="DMS Enterprise" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">DMS Enterprise</div>
            <div className="text-xs opacity-70">Admin Console</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 md:flex-1 md:flex-col md:space-y-1 md:overflow-visible">
          {nav.map((n) => {
            const active =
              pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors md:gap-3",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/50",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 border-t border-sidebar-border p-3 md:block">
          <div className="min-w-0 flex-1 truncate px-3 text-xs opacity-70 md:mb-2">
            {session.user.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
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
