import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { peso } from "@/lib/format";
import {
  eachMonthOfInterval,
  startOfMonth,
  startOfYear,
  endOfMonth,
  endOfYear,
  format,
} from "date-fns";
import { Download, Search, SlidersHorizontal, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

function ReportsPage() {
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ from, to });
  const [reportYear, setReportYear] = useState(format(new Date(), "yyyy"));
  const [reportSearch, setReportSearch] = useState("");
  const [reportTypeFilter, setReportTypeFilter] = useState<"All" | "Sales" | "Expense">("All");

  const { data, isLoading } = useQuery({
    queryKey: ["report", applied],
    queryFn: async () => {
      const fromIso = new Date(applied.from + "T00:00:00").toISOString();
      const toIso = new Date(applied.to + "T23:59:59").toISOString();
      const [orders, expenses] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "paid_amount,payment_status,customer_name,order_date,order_services(service_name,quantity,subtotal)",
          )
          .gte("order_date", fromIso)
          .lte("order_date", toIso),
        supabase
          .from("expenses")
          .select("name,amount,expense_date,category")
          .gte("expense_date", fromIso)
          .lte("expense_date", toIso),
      ]);
      return { orders: orders.data ?? [], expenses: expenses.data ?? [] };
    },
  });

  const sales = (data?.orders ?? []).reduce((s, o) => s + Number(o.paid_amount), 0);
  const totalExpenses = (data?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const profit = sales - totalExpenses;
  const chartColors = [
    "var(--color-primary)",
    "#4f7cf7",
    "#c15ce8",
    "#70c7e8",
    "var(--color-success)",
    "#ef4fb4",
    "#ff5a68",
    "#7c55f2",
    "var(--color-warning)",
    "#36d399",
  ];
  const itemTotal = (data?.orders ?? [])
    .flatMap((order) => order.order_services ?? [])
    .reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const itemMix = Array.from(
    (data?.orders ?? [])
      .flatMap((order) => order.order_services ?? [])
      .reduce((items, item) => {
        const name = item.service_name || "Unnamed Item";
        items.set(name, (items.get(name) ?? 0) + Number(item.subtotal || 0));
        return items;
      }, new Map<string, number>()),
  ).map(([name, value], index) => ({
    name,
    value,
    percent: itemTotal > 0 ? Math.round((value / itemTotal) * 100) : 0,
    color: chartColors[index % chartColors.length],
  }));
  const expenseMix = Array.from(
    (data?.expenses ?? []).reduce((expenses, expense) => {
      const name = expense.category || expense.name || "Uncategorized";
      expenses.set(name, (expenses.get(name) ?? 0) + Number(expense.amount || 0));
      return expenses;
    }, new Map<string, number>()),
  ).map(([name, value], index) => ({
    name,
    value,
    percent: totalExpenses > 0 ? Math.round((value / totalExpenses) * 100) : 0,
    color: chartColors[index % chartColors.length],
  }));
  const selectedYear = Number(reportYear) || new Date().getFullYear();
  const yearStart = startOfYear(new Date(selectedYear, 0, 1));
  const yearEnd = endOfYear(yearStart);
  const yearMonths = eachMonthOfInterval({ start: yearStart, end: yearEnd }).map((month) => ({
    month: format(month, "MMM"),
    from: startOfMonth(month),
    to: endOfMonth(month),
  }));

  const { data: annualTrend, isLoading: annualLoading } = useQuery({
    queryKey: ["annual-report", selectedYear],
    queryFn: async () => {
      const [orders, expenses] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "paid_amount,customer_name,order_date,order_services(service_name,quantity,price,subtotal)",
          )
          .gte("order_date", yearStart.toISOString())
          .lte("order_date", yearEnd.toISOString()),
        supabase
          .from("expenses")
          .select("name,category,amount,quantity,expense_date,notes")
          .gte("expense_date", yearStart.toISOString())
          .lte("expense_date", yearEnd.toISOString()),
      ]);

      return yearMonths.map((m) => {
        const monthOrders = (orders.data ?? []).filter(
          (o) => new Date(o.order_date) >= m.from && new Date(o.order_date) <= m.to,
        );
        const monthExpenseItems = (expenses.data ?? []).filter(
          (e) => new Date(e.expense_date) >= m.from && new Date(e.expense_date) <= m.to,
        );
        const monthSales = monthOrders.reduce((sum, o) => sum + Number(o.paid_amount), 0);
        const monthExpenses = monthExpenseItems.reduce((sum, e) => sum + Number(e.amount), 0);
        const salesRows = monthOrders.flatMap((order) => {
          const services =
            order.order_services && order.order_services.length > 0
              ? order.order_services
              : [{ service_name: "Unlisted item", quantity: 1, price: 0, subtotal: 0 }];

          return services.map((service) => [
            format(new Date(order.order_date), "yyyy-MM-dd"),
            order.customer_name ?? "",
            service.service_name ?? "",
            String(service.quantity ?? ""),
            peso(service.price ?? 0),
            peso(service.subtotal ?? 0),
            peso(order.paid_amount ?? 0),
          ]);
        });
        const expenseRows = monthExpenseItems.map((expense) => [
          format(new Date(expense.expense_date), "yyyy-MM-dd"),
          expense.name ?? "",
          expense.category ?? "",
          String(expense.quantity ?? ""),
          peso(expense.amount ?? 0),
          expense.notes ?? "",
        ]);

        return {
          month: m.month,
          sales: monthSales,
          expenses: monthExpenses,
          profit: monthSales - monthExpenses,
          salesRows,
          expenseRows,
        };
      });
    },
  });
  const generatedOn = format(new Date(), "MMM d, yyyy");
  const generatedReports = yearMonths.flatMap((month, index) => {
    const monthData = annualTrend?.[index] ?? {
      sales: 0,
      expenses: 0,
      profit: 0,
      salesRows: [],
      expenseRows: [],
    };
    const dateRange = `${format(month.from, "MMM d")} - ${format(month.to, "MMM d")}`;
    const reports = [];

    if (monthData.salesRows.length > 0) {
      reports.push({
        id: `${selectedYear}-${index}-sales`,
        name: `${month.month} Sales Report`,
        description: "Monthly customer and item sales",
        type: "Sales" as const,
        dateRange,
        format: "CSV",
        generatedOn,
        status: annualLoading ? "Generating" : "Ready",
        rows: [
          ["Month", month.month],
          ["Date Range", dateRange],
          ["Total Sales", peso(monthData.sales)],
          ["Total Expenses", peso(monthData.expenses)],
          ["Net Profit", peso(monthData.profit)],
          [],
          ["Order Date", "Customer Name", "Item", "Quantity", "Price", "Subtotal", "Paid Amount"],
          ...monthData.salesRows,
        ],
      });
    }

    if (monthData.expenseRows.length > 0) {
      reports.push({
        id: `${selectedYear}-${index}-expense`,
        name: `${month.month} Expense Report`,
        description: "Monthly expense details",
        type: "Expense" as const,
        dateRange,
        format: "CSV",
        generatedOn,
        status: annualLoading ? "Generating" : "Ready",
        rows: [
          ["Month", month.month],
          ["Date Range", dateRange],
          ["Total Expenses", peso(monthData.expenses)],
          ["Total Sales", peso(monthData.sales)],
          ["Net Profit", peso(monthData.profit)],
          [],
          ["Expense Date", "Name", "Category", "Quantity", "Amount", "Notes"],
          ...monthData.expenseRows,
        ],
      });
    }

    return reports;
  });
  const visibleReports = generatedReports.filter((report) => {
    const query = reportSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      report.name.toLowerCase().includes(query) ||
      report.description.toLowerCase().includes(query) ||
      report.type.toLowerCase().includes(query);
    const matchesType = reportTypeFilter === "All" || report.type === reportTypeFilter;

    return matchesSearch && matchesType;
  });
  const downloadReport = (report: (typeof generatedReports)[number]) => {
    const csv = report.rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${report.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportReports = () => {
    const csv = [
      ["Report Name", "Type", "Date Range", "Format", "Generated On", "Status"],
      ...visibleReports.map((report) => [
        report.name,
        report.type,
        report.dateRange,
        report.format,
        report.generatedOn,
        report.status,
      ]),
    ]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${selectedYear}-generated-reports.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const cycleReportFilter = () => {
    setReportTypeFilter((current) =>
      current === "All" ? "Sales" : current === "Sales" ? "Expense" : "All",
    );
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">Filter by custom date range.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={() => setApplied({ from, to })}>Apply</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          title="Total Sales"
          value={peso(sales)}
          icon={TrendingUp}
          tone="success"
          loading={isLoading}
        />
        <Stat
          title="Total Expenses"
          value={peso(totalExpenses)}
          icon={TrendingDown}
          tone="destructive"
          loading={isLoading}
        />
        <Stat
          title="Net Profit"
          value={peso(profit)}
          icon={Wallet}
          tone={profit >= 0 ? "success" : "destructive"}
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Annual Trend</CardTitle>
            <CardDescription>Monthly sales, expenses, and net profit</CardDescription>
          </div>
          <div className="w-full sm:w-32">
            <Label>Year</Label>
            <Input
              type="number"
              min="2000"
              max="2100"
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[38vh] min-h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={annualTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                  formatter={(value: number) => peso(value)}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={!annualLoading}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="var(--color-destructive)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={!annualLoading}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke="var(--color-success)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={!annualLoading}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid flex-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle>Sales by Product Category</CardTitle>
            <CardDescription>Product sales share in the selected date range</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            {itemTotal === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No product sales in range.
              </div>
            ) : (
              <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)]">
                <div className="grid gap-y-3">
                  {itemMix.map((item) => (
                    <div key={item.name} className="flex min-w-0 items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-muted-foreground">- {item.percent}%</span>
                    </div>
                  ))}
                </div>

                <div className="h-56 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={itemMix}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="50%"
                        outerRadius="78%"
                        paddingAngle={3}
                        cornerRadius={4}
                      >
                        {itemMix.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                        formatter={(value: number, _name, props) => [
                          `${peso(value)} (${props.payload.percent}%)`,
                          "Sales",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle>Expenses by Category</CardTitle>
            <CardDescription>Expense share in the selected date range</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            {totalExpenses === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No expenses in range.
              </div>
            ) : (
              <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)]">
                <div className="grid gap-y-3">
                  {expenseMix.map((expense) => (
                    <div key={expense.name} className="flex min-w-0 items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: expense.color }}
                      />
                      <span className="truncate font-medium">{expense.name}</span>
                      <span className="shrink-0 text-muted-foreground">- {expense.percent}%</span>
                    </div>
                  ))}
                </div>

                <div className="h-56 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseMix}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="50%"
                        outerRadius="78%"
                        paddingAngle={3}
                        cornerRadius={4}
                      >
                        {expenseMix.map((expense) => (
                          <Cell key={expense.name} fill={expense.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                        formatter={(value: number, _name, props) => [
                          `${peso(value)} (${props.payload.percent}%)`,
                          "Expenses",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Generated Reports</CardTitle>
            <CardDescription>Download monthly sales and expense summaries</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Search here..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={exportReports} disabled={visibleReports.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={cycleReportFilter}>
              <SlidersHorizontal className="h-4 w-4" />
              {reportTypeFilter === "All" ? "Filter" : reportTypeFilter}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Report Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Generated On</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No generated reports found.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <div className="font-medium">{report.name}</div>
                        <div className="text-xs text-muted-foreground">{report.description}</div>
                      </TableCell>
                      <TableCell>{report.type}</TableCell>
                      <TableCell>{report.dateRange}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{report.format}</Badge>
                      </TableCell>
                      <TableCell>{report.generatedOn}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-success/10 text-success hover:bg-success/10"
                        >
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => downloadReport(report)}
                          disabled={annualLoading}
                          aria-label={`Download ${report.name}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value, icon: Icon, tone, loading }: any) {
  const t = {
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[tone as string];
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{loading ? "—" : value}</p>
        </div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${t}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
