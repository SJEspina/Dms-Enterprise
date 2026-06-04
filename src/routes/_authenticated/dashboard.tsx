import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { peso } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, ShoppingBag } from "lucide-react";
import {
  startOfDay,
  startOfMonth,
  startOfYear,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  subDays,
} from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

type Range = "day" | "month" | "year";

function getRange(r: Range) {
  const now = new Date();
  if (r === "day") return { from: startOfDay(now), to: endOfDay(now), label: format(now, "PPP") };
  if (r === "month")
    return { from: startOfMonth(now), to: endOfMonth(now), label: format(now, "MMMM yyyy") };
  return { from: startOfYear(now), to: endOfYear(now), label: format(now, "yyyy") };
}

function Dashboard() {
  const [range, setRange] = useState<Range>("month");
  const { from, to, label } = getRange(range);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: async () => {
      const [orders, expenses, recentOrders] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount,paid_amount,payment_status,status,order_date,created_at")
          .gte("order_date", from.toISOString())
          .lte("order_date", to.toISOString()),
        supabase
          .from("expenses")
          .select("amount,expense_date")
          .gte("expense_date", from.toISOString())
          .lte("expense_date", to.toISOString()),
        supabase
          .from("orders")
          .select(
            "id,customer_name,customer_phone,total_amount,paid_amount,payment_status,status,order_date",
          )
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      return {
        orders: orders.data ?? [],
        expenses: expenses.data ?? [],
        recent: recentOrders.data ?? [],
      };
    },
  });

  const sales = (data?.orders ?? []).reduce((s, o) => s + Number(o.paid_amount), 0);
  const totalExpenses = (data?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const profit = sales - totalExpenses;
  const orderCount = (data?.orders ?? []).length;

  // Build trend - last 7 days
  const trendDays = Array.from({ length: 7 }).map((_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { day: format(d, "MMM d"), date: startOfDay(d) };
  });
  const { data: trend } = useQuery({
    queryKey: ["trend"],
    queryFn: async () => {
      const start = subDays(new Date(), 6);
      const [o, e] = await Promise.all([
        supabase
          .from("orders")
          .select("paid_amount,order_date")
          .gte("order_date", startOfDay(start).toISOString()),
        supabase
          .from("expenses")
          .select("amount,expense_date")
          .gte("expense_date", startOfDay(start).toISOString()),
      ]);
      return trendDays.map((td) => {
        const dayEnd = endOfDay(td.date);
        const sales = (o.data ?? [])
          .filter((x) => new Date(x.order_date) >= td.date && new Date(x.order_date) <= dayEnd)
          .reduce((s, x) => s + Number(x.paid_amount), 0);
        const exp = (e.data ?? [])
          .filter((x) => new Date(x.expense_date) >= td.date && new Date(x.expense_date) <= dayEnd)
          .reduce((s, x) => s + Number(x.amount), 0);
        return { day: td.day, sales, expenses: exp, profit: sales - exp };
      });
    },
  });

  const paymentMix = ["paid", "partial", "pending"]
    .map((status) => ({
      name: { paid: "Paid", partial: "Partial", pending: "Pending" }[status] ?? status,
      value: (data?.orders ?? []).filter((o) => o.payment_status === status).length,
      color: {
        paid: "var(--color-success)",
        partial: "var(--color-warning)",
        pending: "var(--color-muted-foreground)",
      }[status],
    }))
    .filter((item) => item.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{label}</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="day">Daily</TabsTrigger>
            <TabsTrigger value="month">Monthly</TabsTrigger>
            <TabsTrigger value="year">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sales Received"
          value={peso(sales)}
          icon={TrendingUp}
          tone="success"
          loading={isLoading}
        />
        <StatCard
          title="Expenses"
          value={peso(totalExpenses)}
          icon={TrendingDown}
          tone="destructive"
          loading={isLoading}
        />
        <StatCard
          title="Net Profit"
          value={peso(profit)}
          icon={Wallet}
          tone={profit >= 0 ? "success" : "destructive"}
          loading={isLoading}
        />
        <StatCard
          title="Orders"
          value={String(orderCount)}
          icon={ShoppingBag}
          tone="primary"
          loading={isLoading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Profit Trend</CardTitle>
            <CardDescription>
              Last 7 days of received payments, expenses, and net profit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => peso(v)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="var(--color-destructive)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="var(--color-success)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
            <CardDescription>Orders in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {paymentMix.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No orders in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {paymentMix.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {(data?.recent ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="divide-y">
              {data!.recent.slice(0, 5).map((o) => (
                <div
                  key={o.id}
                  className="py-2.5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0 leading-tight">
                    <div className="truncate font-medium">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(o.order_date), "PP")}
                      {o.customer_phone ? ` · ${o.customer_phone}` : ""}
                    </div>
                  </div>
                  <div className="min-w-36 text-left sm:text-right">
                    <div className="font-semibold">{peso(o.total_amount)}</div>
                    <div className="mt-1 flex flex-wrap gap-1 sm:justify-end">
                      <StatusPill status={o.payment_status} />
                      {Number(o.total_amount) > Number(o.paid_amount) && (
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                          Balance {peso(Number(o.total_amount) - Number(o.paid_amount))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone, loading }: any) {
  const toneClass = {
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    primary: "bg-primary/10 text-primary",
  }[tone as string];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{loading ? "—" : value}</p>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-success/15 text-success",
    partial: "bg-warning/20 text-warning-foreground",
    pending: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = { paid: "Paid", partial: "Partial", pending: "Pending" };
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.pending}`}
    >
      {label[status] ?? status}
    </span>
  );
}
