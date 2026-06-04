import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { peso } from "@/lib/format";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

function ReportsPage() {
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ from, to });

  const { data, isLoading } = useQuery({
    queryKey: ["report", applied],
    queryFn: async () => {
      const fromIso = new Date(applied.from + "T00:00:00").toISOString();
      const toIso = new Date(applied.to + "T23:59:59").toISOString();
      const [orders, expenses] = await Promise.all([
        supabase.from("orders").select("total_amount,payment_status,customer_name,order_date").eq("payment_status", "paid").gte("order_date", fromIso).lte("order_date", toIso),
        supabase.from("expenses").select("name,amount,expense_date,category").gte("expense_date", fromIso).lte("expense_date", toIso),
      ]);
      return { orders: orders.data ?? [], expenses: expenses.data ?? [] };
    },
  });

  const sales = (data?.orders ?? []).reduce((s, o) => s + Number(o.total_amount), 0);
  const totalExpenses = (data?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const profit = sales - totalExpenses;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">Filter by custom date range.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button onClick={() => setApplied({ from, to })}>Apply</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat title="Total Sales" value={peso(sales)} icon={TrendingUp} tone="success" loading={isLoading} />
        <Stat title="Total Expenses" value={peso(totalExpenses)} icon={TrendingDown} tone="destructive" loading={isLoading} />
        <Stat title="Net Profit" value={peso(profit)} icon={Wallet} tone={profit >= 0 ? "success" : "destructive"} loading={isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Paid Orders ({data?.orders.length ?? 0})</CardTitle></CardHeader>
          <CardContent>
            {(data?.orders ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No paid orders in range.</p> : (
              <div className="divide-y text-sm">
                {data!.orders.map((o, i) => (
                  <div key={i} className="py-2 flex justify-between">
                    <div><div className="font-medium">{o.customer_name}</div><div className="text-xs text-muted-foreground">{format(new Date(o.order_date), "PP")}</div></div>
                    <div className="font-semibold">{peso(o.total_amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Expenses ({data?.expenses.length ?? 0})</CardTitle></CardHeader>
          <CardContent>
            {(data?.expenses ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No expenses in range.</p> : (
              <div className="divide-y text-sm">
                {data!.expenses.map((e, i) => (
                  <div key={i} className="py-2 flex justify-between">
                    <div><div className="font-medium">{e.name}</div><div className="text-xs text-muted-foreground">{e.category ?? "—"} · {format(new Date(e.expense_date), "PP")}</div></div>
                    <div className="font-semibold">{peso(e.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ title, value, icon: Icon, tone, loading }: any) {
  const t = { success: "bg-success/10 text-success", destructive: "bg-destructive/10 text-destructive" }[tone as string];
  return (
    <Card><CardContent className="pt-6 flex items-center justify-between">
      <div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-bold mt-1">{loading ? "—" : value}</p></div>
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${t}`}><Icon className="h-5 w-5" /></div>
    </CardContent></Card>
  );
}
