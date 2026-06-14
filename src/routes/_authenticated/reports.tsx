import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
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
import {
  Download,
  type LucideIcon,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function ReportsPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [applied, setApplied] = useState({ from, to });
  const [reportYear, setReportYear] = useState(format(new Date(), "yyyy"));
  const [reportSearch, setReportSearch] = useState("");
  const [reportTypeFilter, setReportTypeFilter] = useState<"All" | "Sales" | "Expense">("All");
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [historicalForm, setHistoricalForm] = useState({
    sales_month: format(new Date(), "yyyy-MM"),
    amount: "",
    notes: "",
  });
  const [editingHistoricalId, setEditingHistoricalId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["report", applied],
    queryFn: async () => {
      const fromIso = new Date(applied.from + "T00:00:00").toISOString();
      const toIso = new Date(applied.to + "T23:59:59").toISOString();
      const [orders, expenses, historicalSales] = await Promise.all([
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
        supabase
          .from("historical_sales")
          .select("amount,sales_month,notes")
          .gte("sales_month", applied.from)
          .lte("sales_month", applied.to),
      ]);
      return {
        orders: orders.data ?? [],
        expenses: expenses.data ?? [],
        historicalSales: historicalSales.data ?? [],
      };
    },
  });

  const orderSales = (data?.orders ?? []).reduce((s, o) => s + Number(o.paid_amount), 0);
  const historicalSalesTotal = (data?.historicalSales ?? []).reduce(
    (s, h) => s + Number(h.amount),
    0,
  );
  const sales = orderSales + historicalSalesTotal;
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
  const itemMixRaw = Array.from(
    (data?.orders ?? [])
      .flatMap((order) => order.order_services ?? [])
      .reduce((items, item) => {
        const name = item.service_name || "Unnamed Item";
        items.set(name, (items.get(name) ?? 0) + Number(item.subtotal || 0));
        return items;
      }, new Map<string, number>()),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const itemMix = [
    ...itemMixRaw.slice(0, 9),
    ...(itemMixRaw.length > 9
      ? [
          {
            name: "Other",
            value: itemMixRaw.slice(9).reduce((sum, item) => sum + item.value, 0),
          },
        ]
      : []),
  ].map(({ name, value }, index) => ({
    name,
    value,
    percent: itemTotal > 0 ? Math.round((value / itemTotal) * 100) : 0,
    color: chartColors[index % chartColors.length],
  }));
  const itemMixColumns = [itemMix.slice(0, 5), itemMix.slice(5, 10)];
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
      const [orders, expenses, historicalSales] = await Promise.all([
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
        supabase
          .from("historical_sales")
          .select("amount,sales_month,notes")
          .gte("sales_month", format(yearStart, "yyyy-MM-dd"))
          .lte("sales_month", format(yearEnd, "yyyy-MM-dd")),
      ]);

      return yearMonths.map((m) => {
        const monthOrders = (orders.data ?? []).filter(
          (o) => new Date(o.order_date) >= m.from && new Date(o.order_date) <= m.to,
        );
        const monthExpenseItems = (expenses.data ?? []).filter(
          (e) => new Date(e.expense_date) >= m.from && new Date(e.expense_date) <= m.to,
        );
        const monthHistoricalSales = (historicalSales.data ?? []).filter(
          (h) =>
            new Date(`${h.sales_month}T00:00:00`) >= m.from &&
            new Date(`${h.sales_month}T00:00:00`) <= m.to,
        );
        const monthOrderSales = monthOrders.reduce((sum, o) => sum + Number(o.paid_amount), 0);
        const monthHistoricalTotal = monthHistoricalSales.reduce(
          (sum, sale) => sum + Number(sale.amount),
          0,
        );
        const monthSales = monthOrderSales + monthHistoricalTotal;
        const monthExpenses = monthExpenseItems.reduce((sum, e) => sum + Number(e.amount), 0);
        const salesRows = monthOrders
          .flatMap((order) => {
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
          })
          .concat(
            monthHistoricalSales.map((sale) => [
              format(new Date(`${sale.sales_month}T00:00:00`), "yyyy-MM-dd"),
              "Historical Sales",
              sale.notes || "Imported monthly total",
              "1",
              peso(sale.amount ?? 0),
              peso(sale.amount ?? 0),
              peso(sale.amount ?? 0),
            ]),
          );
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
  const { data: historicalSalesList = [] } = useQuery({
    queryKey: ["historical-sales", selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historical_sales")
        .select("*")
        .gte("sales_month", format(yearStart, "yyyy-MM-dd"))
        .lte("sales_month", format(yearEnd, "yyyy-MM-dd"))
        .order("sales_month", { ascending: false });

      if (error) throw error;
      return data ?? [];
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
  const resetHistoricalForm = () => {
    setHistoricalForm({
      sales_month: format(new Date(), "yyyy-MM"),
      amount: "",
      notes: "",
    });
    setEditingHistoricalId(null);
  };
  const saveHistoricalSales = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(historicalForm.amount);

      if (!historicalForm.sales_month) throw new Error("Select a month");
      if (!amount || amount <= 0) throw new Error("Enter a valid sales amount");

      const payload = {
        sales_month: `${historicalForm.sales_month}-01`,
        amount,
        notes: historicalForm.notes || null,
      };
      const { error } = editingHistoricalId
        ? await supabase.from("historical_sales").update(payload).eq("id", editingHistoricalId)
        : await supabase.from("historical_sales").insert(payload);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["annual-report"] });
      qc.invalidateQueries({ queryKey: ["historical-sales"] });
      const wasEditing = Boolean(editingHistoricalId);
      resetHistoricalForm();
      setHistoricalOpen(false);
      toast.success(wasEditing ? "Historical sales updated" : "Historical sales saved");
    },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });
  const deleteHistoricalSales = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("historical_sales").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["annual-report"] });
      qc.invalidateQueries({ queryKey: ["historical-sales"] });
      toast.success("Historical sales deleted");
    },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });
  const editHistoricalSale = (sale: (typeof historicalSalesList)[number]) => {
    setEditingHistoricalId(sale.id);
    setHistoricalForm({
      sales_month: format(new Date(`${sale.sales_month}T00:00:00`), "yyyy-MM"),
      amount: String(sale.amount),
      notes: sale.notes ?? "",
    });
  };
  const confirmDeleteHistoricalSale = (sale: (typeof historicalSalesList)[number]) => {
    const month = format(new Date(`${sale.sales_month}T00:00:00`), "MMMM yyyy");

    if (window.confirm(`Delete historical sales for ${month}?`)) {
      deleteHistoricalSales.mutate(sale.id);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reports</h1>
        <p className="text-muted-foreground text-sm">Filter by custom date range.</p>
      </div>

      <Card className="dms-solid-panel">
        <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full sm:w-auto">
              <Label>From</Label>
              <Input
                className="w-full sm:w-auto"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-auto">
              <Label>To</Label>
              <Input
                className="w-full sm:w-auto"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button className="w-full sm:w-auto" onClick={() => setApplied({ from, to })}>
              Apply
            </Button>
          </div>
          <Button
            className="w-full sm:w-auto lg:ml-auto"
            variant="outline"
            onClick={() => setHistoricalOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Historical Sales
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={historicalOpen}
        onOpenChange={(open) => {
          setHistoricalOpen(open);
          if (!open) resetHistoricalForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingHistoricalId ? "Edit Historical Sales" : "Add Historical Sales"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Month</Label>
              <Input
                type="month"
                value={historicalForm.sales_month}
                onChange={(e) =>
                  setHistoricalForm({ ...historicalForm, sales_month: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Total Sales</Label>
              <Input
                type="number"
                step="0.01"
                value={historicalForm.amount}
                onChange={(e) => setHistoricalForm({ ...historicalForm, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={historicalForm.notes}
                onChange={(e) => setHistoricalForm({ ...historicalForm, notes: e.target.value })}
                placeholder="January imported sales total"
              />
            </div>
            <div className="rounded-md border">
              <div className="flex items-center justify-between gap-3 border-b p-3">
                <div>
                  <p className="font-medium">Saved Historical Sales</p>
                  <p className="text-muted-foreground text-xs">{selectedYear}</p>
                </div>
                {editingHistoricalId && (
                  <Button variant="outline" size="sm" onClick={resetHistoricalForm}>
                    New
                  </Button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto">
                {historicalSalesList.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    No historical sales saved yet.
                  </p>
                ) : (
                  historicalSalesList.map((sale) => (
                    <div
                      key={sale.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 border-b p-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {format(new Date(`${sale.sales_month}T00:00:00`), "MMM yyyy")}
                          </p>
                          <Badge variant="secondary">{peso(sale.amount)}</Badge>
                        </div>
                        {sale.notes && (
                          <p className="text-muted-foreground mt-1 truncate text-xs">
                            {sale.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={() => editHistoricalSale(sale)}
                          title="Edit historical sales"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={() => confirmDeleteHistoricalSale(sale)}
                          disabled={deleteHistoricalSales.isPending}
                          title="Delete historical sales"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoricalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveHistoricalSales.mutate()}
              disabled={saveHistoricalSales.isPending}
            >
              {saveHistoricalSales.isPending
                ? "Saving..."
                : editingHistoricalId
                  ? "Update"
                  : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Card className="dms-solid-panel">
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
          <div className="h-72 min-h-0 sm:h-[38vh] sm:min-h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={annualTrend ?? []}>
                <defs>
                  <linearGradient id="reportsSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="reportsExpensesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="reportsProfitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="month"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
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
                <Area
                  type="monotone"
                  dataKey="sales"
                  fill="url(#reportsSalesFill)"
                  stroke="none"
                  dot={false}
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={!annualLoading}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  fill="url(#reportsExpensesFill)"
                  stroke="none"
                  dot={false}
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={!annualLoading}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  fill="url(#reportsProfitFill)"
                  stroke="none"
                  dot={false}
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={!annualLoading}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  legendType="circle"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={!annualLoading}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  legendType="circle"
                  stroke="var(--color-destructive)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={!annualLoading}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  legendType="circle"
                  stroke="var(--color-success)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={!annualLoading}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid flex-1 gap-4 xl:grid-cols-2">
        <Card className="dms-solid-panel overflow-hidden">
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
              <div className="grid items-center gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(170px,210px)]">
                <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                  {itemMixColumns.map((column, columnIndex) => (
                    <div key={columnIndex} className="grid gap-y-3">
                      {column.map((item) => (
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
                  ))}
                </div>

                <div className="h-48 min-w-0">
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

        <Card className="dms-solid-panel overflow-hidden">
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

      <Card className="dms-solid-panel">
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
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={exportReports}
              disabled={visibleReports.length === 0}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={cycleReportFilter}>
              <SlidersHorizontal className="h-4 w-4" />
              {reportTypeFilter === "All" ? "Filter" : reportTypeFilter}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-2xl border bg-white/75">
            <Table className="min-w-[820px]">
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

type StatProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  tone?: "success" | "destructive" | "primary";
  loading?: boolean;
};

function Stat({ title, value, icon: Icon, tone, loading }: StatProps) {
  const t = {
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
      <CardContent className="relative z-10 flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{loading ? "—" : value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${t}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
