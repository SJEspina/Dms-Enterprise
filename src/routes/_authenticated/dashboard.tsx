import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { peso } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, ShoppingBag, type LucideIcon } from "lucide-react";
import {
  startOfDay,
  startOfMonth,
  startOfYear,
  endOfDay,
  endOfMonth,
  endOfYear,
  eachDayOfInterval,
  eachHourOfInterval,
  eachMonthOfInterval,
  format,
  endOfHour,
  startOfHour,
} from "date-fns";
import {
  Area,
  ComposedChart,
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
      const [orders, expenses, historicalSales, recentOrders] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "customer_name,total_amount,paid_amount,payment_status,status,order_date,created_at",
          )
          .gte("order_date", from.toISOString())
          .lte("order_date", to.toISOString()),
        supabase
          .from("expenses")
          .select("amount,expense_date")
          .gte("expense_date", from.toISOString())
          .lte("expense_date", to.toISOString()),
        supabase
          .from("historical_sales")
          .select("amount,sales_month")
          .gte("sales_month", format(from, "yyyy-MM-dd"))
          .lte("sales_month", format(to, "yyyy-MM-dd")),
        supabase
          .from("orders")
          .select(
            "id,customer_name,customer_phone,total_amount,paid_amount,payment_status,status,order_date,order_services(service_name,quantity)",
          )
          .order("created_at", { ascending: false })
          .limit(7),
      ]);

      return {
        orders: orders.data ?? [],
        expenses: expenses.data ?? [],
        historicalSales: historicalSales.data ?? [],
        recent: recentOrders.data ?? [],
      };
    },
  });

  const orderSales = (data?.orders ?? []).reduce((s, o) => s + Number(o.paid_amount), 0);
  const historicalSalesTotal = (data?.historicalSales ?? []).reduce(
    (s, sale) => s + Number(sale.amount),
    0,
  );
  const sales = orderSales + historicalSalesTotal;
  const totalExpenses = (data?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const profit = sales - totalExpenses;
  const orderCount = (data?.orders ?? []).length;

  const trendPeriods =
    range === "day"
      ? eachHourOfInterval({ start: from, end: to }).map((d) => ({
          label: format(d, "ha"),
          from: startOfHour(d),
          to: endOfHour(d),
        }))
      : range === "year"
        ? eachMonthOfInterval({ start: from, end: to }).map((d) => ({
            label: format(d, "MMM"),
            from: startOfMonth(d),
            to: endOfMonth(d),
          }))
        : eachDayOfInterval({ start: from, end: to }).map((d) => ({
            label: format(d, "MMM d"),
            from: startOfDay(d),
            to: endOfDay(d),
          }));
  const trendTicks = trendPeriods
    .filter(
      (_, index) =>
        (range === "day" && (index % 3 === 0 || index === trendPeriods.length - 1)) ||
        (range === "month" && (index % 2 === 0 || index === trendPeriods.length - 1)) ||
        range === "year",
    )
    .map((period) => period.label);

  const { data: trend } = useQuery({
    queryKey: ["trend", range, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const [o, e, h] = await Promise.all([
        supabase
          .from("orders")
          .select("paid_amount,order_date")
          .gte("order_date", from.toISOString())
          .lte("order_date", to.toISOString()),
        supabase
          .from("expenses")
          .select("amount,expense_date")
          .gte("expense_date", from.toISOString())
          .lte("expense_date", to.toISOString()),
        supabase
          .from("historical_sales")
          .select("amount,sales_month")
          .gte("sales_month", format(from, "yyyy-MM-dd"))
          .lte("sales_month", format(to, "yyyy-MM-dd")),
      ]);

      return trendPeriods.map((period) => {
        const orderSales = (o.data ?? [])
          .filter(
            (x) => new Date(x.order_date) >= period.from && new Date(x.order_date) <= period.to,
          )
          .reduce((s, x) => s + Number(x.paid_amount), 0);
        const historicalSales = (h.data ?? [])
          .filter((x) => {
            const saleDate = new Date(`${x.sales_month}T00:00:00`);
            return saleDate >= period.from && saleDate <= period.to;
          })
          .reduce((s, x) => s + Number(x.amount), 0);

        const exp = (e.data ?? [])
          .filter(
            (x) => new Date(x.expense_date) >= period.from && new Date(x.expense_date) <= period.to,
          )
          .reduce((s, x) => s + Number(x.amount), 0);
        const sales = orderSales + historicalSales;

        return {
          day: period.label,
          sales,
          expenses: exp,
          profit: sales - exp,
        };
      });
    },
  });
  const hasTrendActivity = (trend ?? []).some(
    (point) => point.sales !== 0 || point.expenses !== 0 || point.profit !== 0,
  );

  const paymentMix = ["paid", "partial", "pending"]
    .map((status) => ({
      name: { paid: "Paid", partial: "Partial", pending: "Pending" }[status] ?? status,
      value: (data?.orders ?? []).filter((o) => o.payment_status === status).length,
      color: {
        paid: "#10b981",
        partial: "#fbbf24",
        pending: "#94a3b8",
      }[status],
    }))
    .filter((item) => item.value > 0);
  const topCustomers = Array.from(
    (data?.orders ?? []).reduce((customers, order) => {
      const name = order.customer_name?.trim() || "Unnamed Customer";
      const current = customers.get(name) ?? { name, total: 0, orders: 0 };

      current.total += Number(order.paid_amount || 0);
      current.orders += 1;
      customers.set(name, current);

      return customers;
    }, new Map<string, { name: string; total: number; orders: number }>()),
  )
    .map(([, customer]) => customer)
    .filter((customer) => customer.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const topCustomerRankStyles = [
    {
      row: "border-emerald-400/70 bg-emerald-50/80",
      rank: "bg-emerald-600 text-white",
      amount: "text-emerald-700",
    },
    {
      row: "border-blue-300/70 bg-blue-50/70",
      rank: "bg-blue-500 text-white",
      amount: "text-blue-700",
    },
    {
      row: "border-amber-300/80 bg-amber-50/70",
      rank: "bg-amber-400 text-amber-950",
      amount: "text-amber-950",
    },
    {
      row: "border-slate-200 bg-white/65",
      rank: "bg-slate-100 text-slate-500",
      amount: "text-slate-900",
    },
    {
      row: "border-slate-200 bg-white/65",
      rank: "bg-slate-100 text-slate-500",
      amount: "text-slate-900",
    },
  ];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-6">
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <Card className="dms-solid-panel flex-1">
        <CardHeader>
          <CardTitle>Profit Trend</CardTitle>
          <CardDescription>
            Selected period received payments, expenses, and net profit
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="h-[42vh] min-h-96">
            {!trend || hasTrendActivity || range !== "day" ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend ?? []}>
                  <defs>
                    <linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="dashboardExpensesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="dashboardProfitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="day"
                    ticks={trendTicks}
                    interval={0}
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    minTickGap={18}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickFormatter={(value: number) => peso(value)}
                  />

                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => peso(v)}
                  />

                  <Legend />

                  <Area
                    type="monotone"
                    dataKey="sales"
                    fill="url(#dashboardSalesFill)"
                    stroke="none"
                    dot={false}
                    legendType="none"
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    fill="url(#dashboardExpensesFill)"
                    stroke="none"
                    dot={false}
                    legendType="none"
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    fill="url(#dashboardProfitFill)"
                    stroke="none"
                    dot={false}
                    legendType="none"
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    legendType="circle"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    legendType="circle"
                    stroke="var(--color-destructive)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    legendType="circle"
                    stroke="var(--color-success)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                No sales or expenses recorded today.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid flex-1 gap-4 2xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)_minmax(280px,1fr)]">
        <Card className="dms-solid-panel min-w-0">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>

          <CardContent className="min-w-0 pt-0">
            {(data?.recent ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="divide-y">
                <div className="hidden grid-cols-[minmax(100px,1fr)_95px_minmax(120px,1.2fr)_105px_130px] gap-3 px-1 pb-2 text-xs font-medium text-muted-foreground md:grid">
                  <div>Name</div>
                  <div>Date</div>
                  <div>Items</div>
                  <div>Amount</div>
                  <div className="text-right">Status</div>
                </div>
                {data!.recent.slice(0, 7).map((o) => (
                  <div
                    key={o.id}
                    className="grid gap-3 py-4 md:grid-cols-[minmax(100px,1fr)_95px_minmax(120px,1.2fr)_105px_130px] md:items-start"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{o.customer_name}</div>
                      {o.customer_phone && (
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {o.customer_phone}
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {format(new Date(o.order_date), "PP")}
                    </div>

                    <div className="truncate text-sm text-muted-foreground">
                      {(() => {
                        const items = o.order_services ?? [];
                        const first = items[0];
                        if (!first) return "No items listed";

                        const quantity = Number(first.quantity || 1);
                        const label = `${first.service_name}${quantity > 1 ? ` x${quantity}` : ""}`;

                        return items.length > 1 ? `${label}, ...` : label;
                      })()}
                    </div>

                    <div className="font-semibold tabular-nums">{peso(o.total_amount)}</div>

                    <div className="flex flex-col items-end gap-1">
                      <StatusPill status={o.payment_status} />

                      {Number(o.total_amount) > Number(o.paid_amount) && (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          Balance {peso(Number(o.total_amount) - Number(o.paid_amount))}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="dms-solid-panel min-w-0">
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
            <CardDescription>Orders in the selected period</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="h-80">
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

        <Card className="dms-solid-panel min-w-0">
          <CardHeader>
            <CardTitle>Top Customers</CardTitle>
            <CardDescription>Highest spending customers in the selected period</CardDescription>
          </CardHeader>

          <CardContent>
            {topCustomers.length === 0 ? (
              <div className="flex h-80 items-center justify-center text-center text-sm text-muted-foreground">
                No customer data available
              </div>
            ) : (
              <div className="space-y-4">
                {topCustomers.map((customer, index) => (
                  <div
                    key={customer.name}
                    className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-3 ${
                      topCustomerRankStyles[index]?.row ?? "bg-muted/20"
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold leading-none tabular-nums ${
                        topCustomerRankStyles[index]?.rank ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{customer.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <span
                          className={`font-medium tabular-nums ${
                            topCustomerRankStyles[index]?.amount ?? "text-foreground"
                          }`}
                        >
                          {peso(customer.total)}
                        </span>
                        <span>
                          {customer.orders} {customer.orders === 1 ? "order" : "orders"}
                        </span>
                      </div>
                    </div>
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

type StatCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  tone: "success" | "destructive" | "primary";
  loading?: boolean;
};

function StatCard({ title, value, icon: Icon, tone, loading }: StatCardProps) {
  const toneClass = {
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    primary: "bg-blue-500/10 text-blue-600",
  }[tone as string];
  const waveClass = {
    success: "text-success",
    destructive: "text-destructive",
    primary: "text-blue-500",
  }[tone as string];
  const wavePath =
    tone === "destructive"
      ? "M0 54 C18 52 28 57 45 57 C68 58 78 52 91 35 C106 14 132 22 145 39 C159 58 178 59 198 57 C220 55 230 44 250 35 C268 27 284 24 300 25 L300 80 L0 80 Z"
      : tone === "primary"
        ? "M0 51 C18 48 28 53 44 55 C64 58 78 56 92 48 C108 38 126 33 145 37 C166 41 176 52 194 52 C214 53 222 43 240 39 C257 35 270 29 286 24 C293 22 297 23 300 24 L300 80 L0 80 Z"
        : "M0 47 C18 42 32 43 48 48 C68 55 78 56 92 49 C108 40 122 48 136 51 C154 55 164 58 178 52 C194 45 210 42 226 47 C242 52 250 43 266 34 C282 26 292 25 300 28 L300 80 L0 80 Z";

  return (
    <Card className="dms-glass-card min-h-36 transition-transform duration-200 hover:-translate-y-0.5">
      <svg
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24 w-full ${waveClass}`}
        viewBox="0 0 300 80"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={wavePath} fill="currentColor" opacity="0.13" />
        <path
          d={wavePath.replace(" L300 80 L0 80 Z", "")}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1.5"
        />
      </svg>
      <CardContent className="pt-6">
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{loading ? "—" : value}</p>
          </div>

          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass}`}>
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

  const label: Record<string, string> = {
    paid: "Paid",
    partial: "Partial",
    pending: "Pending",
  };

  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.pending}`}
    >
      {label[status] ?? status}
    </span>
  );
}
