import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { peso } from "@/lib/format";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { Download, History, Pencil, Plus, Save, Trash2, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/employees")({ component: EmployeesPage });

type EmployeeRow = Tables<"employees">;
type ScheduleRow = Tables<"employee_schedules">;
type AttendanceRow = Tables<"employee_attendance">;
type CashAdvanceRow = Tables<"employee_cash_advances">;
type PayslipRow = Tables<"employee_payslips">;
type EmployeeWithSchedules = EmployeeRow & { employee_schedules?: ScheduleRow[] };
type AttendanceStatus = "blank" | "present" | "absent" | "halfday" | "day_off";

const days = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const statuses: Record<AttendanceStatus, { label: string; badge: string }> = {
  blank: {
    label: "",
    badge: "border-slate-200 bg-white text-slate-500",
  },
  present: {
    label: "Present",
    badge: "border-emerald-200 bg-emerald-500 text-white",
  },
  absent: {
    label: "Absent",
    badge: "border-red-200 bg-red-500 text-white",
  },
  halfday: {
    label: "Halfday",
    badge: "border-orange-200 bg-orange-400 text-white",
  },
  day_off: {
    label: "Day Off",
    badge: "border-slate-200 bg-slate-200 text-slate-600",
  },
};

const defaultWorkingDays = [1, 2, 3, 4, 5, 6];

function blankManualDeductions() {
  return [
    { name: "", amount: "" },
    { name: "", amount: "" },
  ];
}

function numberValue(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeAttendanceStatus(
  value: string | null | undefined,
  fallback: AttendanceStatus = "blank",
) {
  return value && value in statuses ? (value as AttendanceStatus) : fallback;
}

function dateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function todayInputValue() {
  return dateInputValue(new Date());
}

function monthInputValue() {
  return todayInputValue().slice(0, 7);
}

function dateFromInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function halfMonthPeriodFromDate(value: string) {
  const date = dateFromInputValue(value);
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const day = date.getDate();
  const firstHalf = day <= 15;
  const start = new Date(year, monthIndex, firstHalf ? 1 : 16);
  const end = firstHalf ? new Date(year, monthIndex, 15) : new Date(year, monthIndex + 1, 0);

  return {
    start: dateInputValue(start),
    end: dateInputValue(end),
  };
}

function currentHalfMonthPeriod() {
  return halfMonthPeriodFromDate(todayInputValue());
}

function moveHalfMonthPeriod(period: { start: string; end: string }, direction: -1 | 1) {
  const start = dateFromInputValue(period.start);
  const day = start.getDate();
  const nextStart =
    direction === 1
      ? new Date(start.getFullYear(), start.getMonth() + (day <= 15 ? 0 : 1), day <= 15 ? 16 : 1)
      : new Date(start.getFullYear(), start.getMonth() - (day <= 15 ? 1 : 0), day <= 15 ? 16 : 1);

  return halfMonthPeriodFromDate(dateInputValue(nextStart));
}

function monthRange(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 0);
  const monthLabel = start.toLocaleDateString("en-US", { month: "short" });

  return {
    start: dateInputValue(start),
    end: dateInputValue(end),
    days: Array.from({ length: end.getDate() }, (_, index) => {
      const date = new Date(year, monthIndex - 1, index + 1);

      return {
        date: dateInputValue(date),
        label: `${monthLabel}-${String(index + 1).padStart(2, "0")}`,
        dayOfWeek: date.getDay(),
      };
    }),
  };
}

function attendanceKey(employeeId: string, workDate: string) {
  return `${employeeId}:${workDate}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function scheduleLabels(schedules: ScheduleRow[] | undefined) {
  const working = new Set(
    (schedules ?? [])
      .filter((schedule) => schedule.is_working_day)
      .map((schedule) => schedule.day_of_week),
  );
  return days
    .filter((day) => working.has(day.value))
    .map((day) => day.label)
    .join(", ");
}

function EmployeesPage() {
  const qc = useQueryClient();
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [payslipHistoryOpen, setPayslipHistoryOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithSchedules | null>(null);
  const [attendanceMonth, setAttendanceMonth] = useState(monthInputValue());
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, AttendanceStatus>>({});
  const [selectedPayrollEmployeeId, setSelectedPayrollEmployeeId] = useState("");
  const [selectedHistoryEmployeeId, setSelectedHistoryEmployeeId] = useState("");
  const [payrollPeriod, setPayrollPeriod] = useState(currentHalfMonthPeriod);
  const [manualDeductions, setManualDeductions] = useState(blankManualDeductions);
  const [cashAdvanceForm, setCashAdvanceForm] = useState({
    amount: "",
    advance_date: todayInputValue(),
    notes: "",
  });
  const [editingCashAdvanceId, setEditingCashAdvanceId] = useState("");
  const [editingCashAdvanceForm, setEditingCashAdvanceForm] = useState({
    amount: "",
    advance_date: todayInputValue(),
    notes: "",
  });
  const [cashAdvanceDeduction, setCashAdvanceDeduction] = useState("");
  const [appliedCashAdvanceDeduction, setAppliedCashAdvanceDeduction] = useState(0);
  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    role: "",
    active: true,
    halfMonthSalary: "",
    requiredDays: "12",
    workingDays: defaultWorkingDays,
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, employee_schedules(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as EmployeeWithSchedules[];
    },
  });

  const attendanceMonthRange = useMemo(() => monthRange(attendanceMonth), [attendanceMonth]);
  const attendanceGridStyle = {
    gridTemplateColumns: `180px repeat(${attendanceMonthRange.days.length}, 74px)`,
    minWidth: `${180 + attendanceMonthRange.days.length * 74}px`,
  } as CSSProperties;

  const { data: attendance = [] } = useQuery({
    queryKey: ["employee-attendance", attendanceMonthRange.start, attendanceMonthRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_attendance")
        .select("*")
        .gte("work_date", attendanceMonthRange.start)
        .lte("work_date", attendanceMonthRange.end);

      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  const attendanceMap = useMemo(
    () =>
      new Map(
        attendance.map((item) => [
          attendanceKey(item.employee_id, item.work_date),
          normalizeAttendanceStatus(item.status),
        ]),
      ),
    [attendance],
  );
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.active),
    [employees],
  );
  const selectedPayrollEmployee = useMemo(
    () =>
      activeEmployees.find((employee) => employee.id === selectedPayrollEmployeeId) ??
      activeEmployees[0],
    [activeEmployees, selectedPayrollEmployeeId],
  );
  const selectedHistoryEmployee = useMemo(
    () =>
      activeEmployees.find((employee) => employee.id === selectedHistoryEmployeeId) ??
      selectedPayrollEmployee,
    [activeEmployees, selectedHistoryEmployeeId, selectedPayrollEmployee],
  );
  const { data: payrollAttendance = [] } = useQuery({
    queryKey: [
      "employee-payroll-attendance",
      selectedPayrollEmployee?.id,
      payrollPeriod.start,
      payrollPeriod.end,
    ],
    enabled: Boolean(selectedPayrollEmployee?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_attendance")
        .select("*")
        .eq("employee_id", selectedPayrollEmployee!.id)
        .gte("work_date", payrollPeriod.start)
        .lte("work_date", payrollPeriod.end);

      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });
  const { data: cashAdvances = [] } = useQuery({
    queryKey: ["employee-cash-advances", selectedPayrollEmployee?.id],
    enabled: Boolean(selectedPayrollEmployee?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_cash_advances")
        .select("*")
        .eq("employee_id", selectedPayrollEmployee!.id)
        .order("advance_date", { ascending: true });

      if (error) throw error;
      return (data ?? []) as CashAdvanceRow[];
    },
  });
  const { data: payslips = [] } = useQuery({
    queryKey: ["employee-payslips", selectedHistoryEmployee?.id],
    enabled: Boolean(selectedHistoryEmployee?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payslips")
        .select("*")
        .eq("employee_id", selectedHistoryEmployee!.id)
        .order("period_start", { ascending: false });

      if (error) throw error;
      return (data ?? []) as PayslipRow[];
    },
  });
  const today = useMemo(() => todayInputValue(), []);
  const todayDay = new Date(`${today}T00:00:00`).getDay();
  const scheduledToday = useMemo(
    () =>
      activeEmployees.filter((employee) =>
        (employee.employee_schedules ?? []).some(
          (schedule) => schedule.day_of_week === todayDay && schedule.is_working_day,
        ),
      ),
    [activeEmployees, todayDay],
  );
  const absentToday = useMemo(
    () =>
      activeEmployees.filter(
        (employee) => attendanceMap.get(attendanceKey(employee.id, today)) === "absent",
      ),
    [activeEmployees, attendanceMap, today],
  );

  useEffect(() => {
    if (!selectedPayrollEmployeeId && activeEmployees[0]) {
      setSelectedPayrollEmployeeId(activeEmployees[0].id);
    }
  }, [activeEmployees, selectedPayrollEmployeeId]);

  useEffect(() => {
    if (!selectedHistoryEmployeeId && selectedPayrollEmployee?.id) {
      setSelectedHistoryEmployeeId(selectedPayrollEmployee.id);
    }
  }, [selectedHistoryEmployeeId, selectedPayrollEmployee?.id]);

  useEffect(() => {
    setManualDeductions(blankManualDeductions());
    setCashAdvanceDeduction("");
    setAppliedCashAdvanceDeduction(0);
    setEditingCashAdvanceId("");
  }, [payrollPeriod.end, payrollPeriod.start, selectedPayrollEmployee?.id]);

  const filledManualDeductions = useMemo(
    () =>
      manualDeductions
        .map((item) => ({
          name: item.name.trim(),
          amount: numberValue(item.amount),
        }))
        .filter((item) => item.name || item.amount > 0),
    [manualDeductions],
  );

  const payrollSummary = useMemo(() => {
    const salary = numberValue(selectedPayrollEmployee?.half_month_salary);
    const requiredDays = Math.max(
      1,
      numberValue(selectedPayrollEmployee?.required_half_month_days),
    );
    const dailyRate = salary / requiredDays;
    const presentDays = payrollAttendance.filter(
      (item) => normalizeAttendanceStatus(item.status) === "present",
    ).length;
    const absentDays = payrollAttendance.filter(
      (item) => normalizeAttendanceStatus(item.status) === "absent",
    ).length;
    const halfDays = payrollAttendance.filter(
      (item) => normalizeAttendanceStatus(item.status) === "halfday",
    ).length;
    const workedDays = presentDays + halfDays * 0.5;
    const absentDeduction = absentDays * dailyRate;
    const halfdayDeduction = halfDays * (dailyRate / 2);
    const manualDeductionTotal = filledManualDeductions.reduce(
      (total, item) => total + item.amount,
      0,
    );
    const cashAdvanceBalance = cashAdvances.reduce(
      (total, item) =>
        total + Math.max(0, numberValue(item.amount) - numberValue(item.paid_amount)),
      0,
    );
    const typedCashAdvanceDeduction = Math.min(
      numberValue(cashAdvanceDeduction),
      cashAdvanceBalance,
    );
    const requestedCashAdvanceDeduction =
      appliedCashAdvanceDeduction > 0 ? appliedCashAdvanceDeduction : typedCashAdvanceDeduction;
    const cashAdvanceDeducted = Math.min(
      requestedCashAdvanceDeduction,
      cashAdvanceBalance + appliedCashAdvanceDeduction,
    );
    const totalDeductions =
      absentDeduction + halfdayDeduction + manualDeductionTotal + cashAdvanceDeducted;

    return {
      salary,
      requiredDays,
      dailyRate,
      presentDays,
      absentDays,
      halfDays,
      workedDays,
      absentDeduction,
      halfdayDeduction,
      manualDeductionTotal,
      cashAdvanceBalance,
      cashAdvanceDeducted,
      totalDeductions,
      caBalanceAfterPayroll:
        appliedCashAdvanceDeduction > 0
          ? cashAdvanceBalance
          : Math.max(0, cashAdvanceBalance - typedCashAdvanceDeduction),
      netPay: salary - totalDeductions,
    };
  }, [
    appliedCashAdvanceDeduction,
    cashAdvanceDeduction,
    cashAdvances,
    filledManualDeductions,
    payrollAttendance,
    selectedPayrollEmployee?.half_month_salary,
    selectedPayrollEmployee?.required_half_month_days,
  ]);

  useEffect(() => {
    const next: Record<string, AttendanceStatus> = {};

    activeEmployees.forEach((employee) => {
      attendanceMonthRange.days.forEach((day) => {
        const key = attendanceKey(employee.id, day.date);

        next[key] = attendanceMap.get(key) ?? "blank";
      });
    });
    setAttendanceDraft(next);
  }, [attendanceMap, activeEmployees, attendanceMonthRange.days]);

  const resetEmployeeForm = () => {
    setEditingEmployee(null);
    setEmployeeForm({
      name: "",
      role: "",
      active: true,
      halfMonthSalary: "",
      requiredDays: "12",
      workingDays: defaultWorkingDays,
    });
  };

  const openNewEmployee = () => {
    resetEmployeeForm();
    setEmployeeOpen(true);
  };

  const openEditEmployee = (employee: EmployeeWithSchedules) => {
    const workingDays = (employee.employee_schedules ?? [])
      .filter((schedule) => schedule.is_working_day)
      .map((schedule) => schedule.day_of_week);

    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name,
      role: employee.role ?? "",
      active: employee.active,
      halfMonthSalary: String(numberValue(employee.half_month_salary) || ""),
      requiredDays: String(numberValue(employee.required_half_month_days) || 12),
      workingDays: workingDays.length > 0 ? workingDays : defaultWorkingDays,
    });
    setEmployeeOpen(true);
  };

  const saveEmployee = useMutation({
    mutationFn: async () => {
      const name = employeeForm.name.trim();
      if (!name) throw new Error("Employee name is required");

      const payload: TablesInsert<"employees"> | TablesUpdate<"employees"> = {
        name,
        role: employeeForm.role.trim() || null,
        active: employeeForm.active,
        half_month_salary: numberValue(employeeForm.halfMonthSalary),
        required_half_month_days: Math.max(1, numberValue(employeeForm.requiredDays)),
      };
      const employeeResult = editingEmployee
        ? await supabase
            .from("employees")
            .update(payload)
            .eq("id", editingEmployee.id)
            .select()
            .single()
        : await supabase
            .from("employees")
            .insert(payload as TablesInsert<"employees">)
            .select()
            .single();

      if (employeeResult.error) throw employeeResult.error;

      const employeeId = employeeResult.data.id;
      const workingDays = new Set(employeeForm.workingDays);
      const schedules: TablesInsert<"employee_schedules">[] = days.map((day) => ({
        employee_id: employeeId,
        day_of_week: day.value,
        is_working_day: workingDays.has(day.value),
      }));
      const { error } = await supabase
        .from("employee_schedules")
        .upsert(schedules, { onConflict: "employee_id,day_of_week" });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setEmployeeOpen(false);
      resetEmployeeForm();
      toast.success(editingEmployee ? "Employee updated" : "Employee added");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const deleteEmployee = useMutation({
    mutationFn: async (employee: EmployeeRow) => {
      const { error } = await supabase.from("employees").delete().eq("id", employee.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee-attendance"] });
      toast.success("Employee deleted");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const saveAttendance = useMutation({
    mutationFn: async () => {
      const employeeIds = activeEmployees.map((employee) => employee.id);
      const rows: TablesInsert<"employee_attendance">[] = activeEmployees.flatMap((employee) =>
        attendanceMonthRange.days
          .map((day) => ({
            employee_id: employee.id,
            work_date: day.date,
            status: normalizeAttendanceStatus(
              attendanceDraft[attendanceKey(employee.id, day.date)],
            ),
          }))
          .filter((row) => row.status !== "blank"),
      );

      const deleteResult = await supabase
        .from("employee_attendance")
        .delete()
        .in("employee_id", employeeIds)
        .gte("work_date", attendanceMonthRange.start)
        .lte("work_date", attendanceMonthRange.end);

      if (deleteResult.error) throw deleteResult.error;
      if (rows.length === 0) return;

      const { error } = await supabase
        .from("employee_attendance")
        .upsert(rows, { onConflict: "employee_id,work_date" });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-attendance"] });
      toast.success("Attendance saved");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const addCashAdvance = useMutation({
    mutationFn: async () => {
      if (!selectedPayrollEmployee) throw new Error("Select an employee first");
      const amount = numberValue(cashAdvanceForm.amount);
      if (amount <= 0) throw new Error("Cash advance amount is required");

      const { error } = await supabase.from("employee_cash_advances").insert({
        employee_id: selectedPayrollEmployee.id,
        advance_date: cashAdvanceForm.advance_date || todayInputValue(),
        amount,
        notes: cashAdvanceForm.notes.trim() || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-cash-advances"] });
      setCashAdvanceForm({ amount: "", advance_date: todayInputValue(), notes: "" });
      toast.success("Cash advance added");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const openEditCashAdvance = (advance: CashAdvanceRow) => {
    setEditingCashAdvanceId(advance.id);
    setEditingCashAdvanceForm({
      amount: String(numberValue(advance.amount) || ""),
      advance_date: advance.advance_date,
      notes: advance.notes ?? "",
    });
  };

  const updateCashAdvance = useMutation({
    mutationFn: async (advance: CashAdvanceRow) => {
      const amount = numberValue(editingCashAdvanceForm.amount);
      const paidAmount = numberValue(advance.paid_amount);

      if (amount <= 0) throw new Error("Cash advance amount is required");
      if (amount < paidAmount) {
        throw new Error("Amount cannot be lower than the amount already deducted");
      }

      const { error } = await supabase
        .from("employee_cash_advances")
        .update({
          amount,
          advance_date: editingCashAdvanceForm.advance_date || todayInputValue(),
          notes: editingCashAdvanceForm.notes.trim() || null,
        })
        .eq("id", advance.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-cash-advances"] });
      setEditingCashAdvanceId("");
      toast.success("Cash advance updated");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const deleteCashAdvance = useMutation({
    mutationFn: async (advance: CashAdvanceRow) => {
      const { error } = await supabase.from("employee_cash_advances").delete().eq("id", advance.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-cash-advances"] });
      toast.success("Cash advance deleted");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const applyCashAdvanceDeduction = useMutation({
    mutationFn: async () => {
      const appliedAmount = Math.min(
        numberValue(cashAdvanceDeduction),
        payrollSummary.cashAdvanceBalance,
      );
      let remaining = appliedAmount;
      if (remaining <= 0) throw new Error("Enter a cash advance deduction first");

      for (const advance of cashAdvances) {
        if (remaining <= 0) break;

        const openBalance = Math.max(
          0,
          numberValue(advance.amount) - numberValue(advance.paid_amount),
        );
        if (openBalance <= 0) continue;

        const payment = Math.min(openBalance, remaining);
        const { error } = await supabase
          .from("employee_cash_advances")
          .update({ paid_amount: numberValue(advance.paid_amount) + payment })
          .eq("id", advance.id);

        if (error) throw error;
        remaining -= payment;
      }

      return appliedAmount;
    },
    onSuccess: (appliedAmount) => {
      qc.invalidateQueries({ queryKey: ["employee-cash-advances"] });
      setAppliedCashAdvanceDeduction(appliedAmount);
      setCashAdvanceDeduction("");
      toast.success("Cash advance deduction applied");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const savePayslip = useMutation({
    mutationFn: async () => {
      if (!selectedPayrollEmployee) throw new Error("Select an employee first");

      const attendanceDeductions = payrollSummary.absentDeduction + payrollSummary.halfdayDeduction;
      const payload: TablesInsert<"employee_payslips"> = {
        employee_id: selectedPayrollEmployee.id,
        period_start: payrollPeriod.start,
        period_end: payrollPeriod.end,
        gross_pay: payrollSummary.salary,
        daily_rate: payrollSummary.dailyRate,
        worked_days: payrollSummary.workedDays,
        required_days: payrollSummary.requiredDays,
        absent_days: payrollSummary.absentDays,
        halfday_days: payrollSummary.halfDays,
        attendance_deductions: attendanceDeductions,
        manual_deductions: filledManualDeductions,
        manual_deduction_total: payrollSummary.manualDeductionTotal,
        cash_advance_deducted: payrollSummary.cashAdvanceDeducted,
        total_deductions: payrollSummary.totalDeductions,
        net_pay: payrollSummary.netPay,
      };
      const { error } = await supabase
        .from("employee_payslips")
        .upsert(payload, { onConflict: "employee_id,period_start,period_end" });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-payslips"] });
      toast.success("Payslip saved");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const deletePayslip = useMutation({
    mutationFn: async (payslip: PayslipRow) => {
      const { error } = await supabase.from("employee_payslips").delete().eq("id", payslip.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-payslips"] });
      toast.success("Payslip deleted");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const payslipCsvRows = (rowsToExport: PayslipRow[]) => [
    [
      "Employee",
      "Period Start",
      "Period End",
      "Gross Pay",
      "Daily Rate",
      "Worked Days",
      "Absent Days",
      "Halfday Days",
      "Attendance Deductions",
      "Manual Deductions",
      "Manual Deduction Total",
      "Cash Advance Deducted",
      "Total Deductions",
      "Net Pay",
    ],
    ...rowsToExport.map((payslip) => [
      selectedHistoryEmployee?.name ?? "",
      payslip.period_start,
      payslip.period_end,
      payslip.gross_pay,
      payslip.daily_rate,
      payslip.worked_days,
      payslip.absent_days,
      payslip.halfday_days,
      payslip.attendance_deductions,
      JSON.stringify(payslip.manual_deductions ?? []),
      payslip.manual_deduction_total,
      payslip.cash_advance_deducted,
      payslip.total_deductions,
      payslip.net_pay,
    ]),
  ];

  const employeeCsvName = `${selectedHistoryEmployee?.name ?? "employee"}`
    .replaceAll(/\s+/g, "-")
    .toLowerCase();

  const downloadPayslipsCsv = () => {
    downloadCsv(`${employeeCsvName}-payslips.csv`, payslipCsvRows(payslips));
  };

  const downloadPayslipCsv = (payslip: PayslipRow) => {
    const rows = [
      [`${selectedHistoryEmployee?.name ?? ""} Payslip`],
      ["Period", `${payslip.period_start} to ${payslip.period_end}`],
      [],
      ...payslipCsvRows([payslip]),
    ];

    downloadCsv(`${employeeCsvName}-${payslip.period_start}-to-${payslip.period_end}.csv`, rows);
  };

  const toggleWorkingDay = (day: number) => {
    setEmployeeForm((current) => {
      const daysSet = new Set(current.workingDays);

      if (daysSet.has(day)) {
        daysSet.delete(day);
      } else {
        daysSet.add(day);
      }

      return { ...current, workingDays: Array.from(daysSet).sort((a, b) => a - b) };
    });
  };

  const cycleAttendance = (employeeId: string, workDate: string) => {
    const key = attendanceKey(employeeId, workDate);
    const order: AttendanceStatus[] = ["blank", "present", "absent", "halfday", "day_off"];

    setAttendanceDraft((current) => {
      const currentStatus = normalizeAttendanceStatus(current[key]);
      const nextStatus = order[(order.indexOf(currentStatus) + 1) % order.length];

      return { ...current, [key]: nextStatus };
    });
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Employees</h1>
          <p className="text-muted-foreground text-sm">
            Manage staff schedules and daily attendance.
          </p>
        </div>
        <Button onClick={openNewEmployee}>
          <Plus className="h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <EmployeeMetric title="Active Employees" value={String(activeEmployees.length)} />
        <EmployeeMetric title="Working Today" value={String(scheduledToday.length)} />
        <EmployeeMetric title="Absent Today" value={String(absentToday.length)} />
      </div>

      <div className="grid flex-1 gap-4">
        <Card className="dms-solid-panel min-w-0">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Employee Directory</CardTitle>
              <CardDescription>Staff details and regular weekly schedules</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-2xl border bg-white/70">
              <Table className="min-w-[760px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/6">Name</TableHead>
                    <TableHead className="w-1/6">Role</TableHead>
                    <TableHead className="w-1/6">Schedule</TableHead>
                    <TableHead className="w-1/6 text-center">Required Days</TableHead>
                    <TableHead className="w-1/6 text-center">Status</TableHead>
                    <TableHead className="w-1/6 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeesLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading employees...
                      </TableCell>
                    </TableRow>
                  ) : employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No employees added yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>
                          <div className="font-medium">{employee.name}</div>
                        </TableCell>
                        <TableCell>{employee.role || "-"}</TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {scheduleLabels(employee.employee_schedules) || "No working days"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {numberValue(employee.required_half_month_days)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={
                              employee.active
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }
                          >
                            {employee.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditEmployee(employee)}
                              aria-label={`Edit ${employee.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Delete ${employee.name}?`)) {
                                  deleteEmployee.mutate(employee);
                                }
                              }}
                              aria-label={`Delete ${employee.name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="dms-solid-panel min-w-0">
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>Monthly attendance grid for active employees</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-2">
                <Label>Month</Label>
                <Input
                  className="sm:w-40"
                  type="month"
                  value={attendanceMonth}
                  onChange={(event) => setAttendanceMonth(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["present", "absent", "halfday", "day_off"] as AttendanceStatus[]).map(
                  (status) => (
                    <Badge key={status} variant="outline" className={statuses[status].badge}>
                      {statuses[status].label}
                    </Badge>
                  ),
                )}
              </div>
            </div>

            {activeEmployees.length === 0 ? (
              <div className="flex h-56 items-center justify-center rounded-2xl border bg-white/60 text-center text-sm text-muted-foreground">
                Add active employees to start tracking attendance.
              </div>
            ) : (
              <div className="overflow-auto rounded-2xl border bg-white/80">
                <div>
                  <div
                    className="grid border-b bg-emerald-600 text-xs font-semibold text-white"
                    style={attendanceGridStyle}
                  >
                    <div className="border-r border-white/30 px-3 py-2">Employee</div>
                    {attendanceMonthRange.days.map((day) => (
                      <div
                        key={day.date}
                        className="border-r border-white/30 px-2 py-2 text-center last:border-r-0"
                      >
                        {day.label}
                      </div>
                    ))}
                  </div>
                  {activeEmployees.map((employee) => (
                    <div
                      key={employee.id}
                      className="grid border-b last:border-b-0"
                      style={attendanceGridStyle}
                    >
                      <div className="sticky left-0 z-10 border-r bg-white px-3 py-2">
                        <div className="truncate text-sm font-medium">{employee.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {employee.role || "Staff"}
                        </div>
                      </div>
                      {attendanceMonthRange.days.map((day) => {
                        const key = attendanceKey(employee.id, day.date);
                        const status = normalizeAttendanceStatus(attendanceDraft[key]);
                        const statusMeta = statuses[status];

                        return (
                          <button
                            key={day.date}
                            type="button"
                            className={cn(
                              "min-h-11 border-r px-1.5 py-2 text-xs font-semibold transition-opacity last:border-r-0 hover:opacity-80",
                              status === "blank" && "bg-white text-transparent hover:bg-emerald-50",
                              status === "present" && "bg-emerald-500 text-white",
                              status === "absent" && "bg-red-500 text-white",
                              status === "halfday" && "bg-orange-400 text-white",
                              status === "day_off" && "bg-slate-100 text-slate-500",
                            )}
                            title={`${employee.name} - ${day.label} - ${statusMeta.label || "Blank"}`}
                            onClick={() => cycleAttendance(employee.id, day.date)}
                          >
                            {statusMeta.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-full sm:w-auto"
              onClick={() => saveAttendance.mutate()}
              disabled={activeEmployees.length === 0 || saveAttendance.isPending}
            >
              <Save className="h-4 w-4" />
              {saveAttendance.isPending ? "Saving..." : "Save Attendance"}
            </Button>
          </CardContent>
        </Card>

        <Card className="dms-solid-panel min-w-0">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Payroll Preview</CardTitle>
              <CardDescription>
                Open payroll calculator for salary, deductions, and cash advance
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setPayrollOpen(true)} disabled={activeEmployees.length === 0}>
                <WalletCards className="h-4 w-4" />
                Open Payroll
              </Button>
              <Button
                variant="outline"
                onClick={() => setPayslipHistoryOpen(true)}
                disabled={activeEmployees.length === 0}
              >
                <History className="h-4 w-4" />
                History
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={payrollOpen} onOpenChange={setPayrollOpen}>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Payroll Preview</DialogTitle>
              <DialogDescription>
                Attendance deductions, cash advance, and net pay for a half-month period
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_150px_150px]">
                <div className="grid gap-2">
                  <Label>Employee</Label>
                  <Select
                    value={selectedPayrollEmployee?.id ?? ""}
                    onValueChange={setSelectedPayrollEmployeeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={payrollPeriod.start}
                    onChange={(event) =>
                      setPayrollPeriod(halfMonthPeriodFromDate(event.target.value))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>To</Label>
                  <Input type="date" value={payrollPeriod.end} readOnly />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayrollPeriod((current) => moveHalfMonthPeriod(current, -1))}
                >
                  Previous Period
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayrollPeriod((current) => moveHalfMonthPeriod(current, 1))}
                >
                  Next Period
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <PayrollStat label="Gross Pay" value={peso(payrollSummary.salary)} />
                <PayrollStat label="Daily Rate" value={peso(payrollSummary.dailyRate)} />
                <PayrollStat
                  label="Worked Days"
                  value={`${payrollSummary.workedDays.toLocaleString()} / ${payrollSummary.requiredDays}`}
                />
                <PayrollStat label="Net Pay" value={peso(payrollSummary.netPay)} highlight />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border bg-white/75 p-4">
                  <h3 className="font-semibold">Automatic Attendance Deductions</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <PayrollLine
                      label={`Absent (${payrollSummary.absentDays} day/s)`}
                      value={peso(payrollSummary.absentDeduction)}
                    />
                    <PayrollLine
                      label={`Halfday (${payrollSummary.halfDays} day/s)`}
                      value={peso(payrollSummary.halfdayDeduction)}
                    />
                    <PayrollLine
                      label="Attendance total"
                      value={peso(payrollSummary.absentDeduction + payrollSummary.halfdayDeduction)}
                      strong
                    />
                  </div>
                  <div className="mt-5 border-t pt-4">
                    <h4 className="font-semibold">Manual Deductions</h4>
                    <div className="mt-3 grid gap-3">
                      {manualDeductions.map((deduction, index) => (
                        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_140px_40px]">
                          <Input
                            placeholder="Deduction name"
                            value={deduction.name}
                            onChange={(event) =>
                              setManualDeductions((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <Input
                            type="number"
                            min="0"
                            placeholder="Amount"
                            value={deduction.amount}
                            onChange={(event) =>
                              setManualDeductions((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, amount: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-9 text-destructive hover:text-destructive"
                            onClick={() =>
                              setManualDeductions((current) =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                            aria-label={`Delete deduction ${index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setManualDeductions((current) => [...current, { name: "", amount: "" }])
                        }
                      >
                        <Plus className="h-4 w-4" />
                        Add Deduction
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white/75 p-4">
                  <h3 className="font-semibold">Cash Advance</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_150px]">
                    <Input
                      type="number"
                      min="0"
                      placeholder="New cash advance"
                      value={cashAdvanceForm.amount}
                      onChange={(event) =>
                        setCashAdvanceForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                    />
                    <Input
                      type="date"
                      value={cashAdvanceForm.advance_date}
                      onChange={(event) =>
                        setCashAdvanceForm((current) => ({
                          ...current,
                          advance_date: event.target.value,
                        }))
                      }
                    />
                    <Input
                      className="sm:col-span-2"
                      placeholder="Cash advance note"
                      value={cashAdvanceForm.notes}
                      onChange={(event) =>
                        setCashAdvanceForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                    <Button
                      className="sm:col-span-2"
                      variant="outline"
                      onClick={() => addCashAdvance.mutate()}
                      disabled={!selectedPayrollEmployee || addCashAdvance.isPending}
                    >
                      <WalletCards className="h-4 w-4" />
                      Add Cash Advance
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {cashAdvances.length === 0 ? (
                      <div className="rounded-2xl border bg-white/60 px-3 py-4 text-center text-sm text-muted-foreground">
                        No cash advances added.
                      </div>
                    ) : (
                      cashAdvances.map((advance) => {
                        const isEditing = editingCashAdvanceId === advance.id;
                        const remainingBalance = Math.max(
                          0,
                          numberValue(advance.amount) - numberValue(advance.paid_amount),
                        );

                        return (
                          <div key={advance.id} className="rounded-2xl border bg-white/70 p-3">
                            {isEditing ? (
                              <div className="grid gap-2">
                                <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editingCashAdvanceForm.amount}
                                    onChange={(event) =>
                                      setEditingCashAdvanceForm((current) => ({
                                        ...current,
                                        amount: event.target.value,
                                      }))
                                    }
                                  />
                                  <Input
                                    type="date"
                                    value={editingCashAdvanceForm.advance_date}
                                    onChange={(event) =>
                                      setEditingCashAdvanceForm((current) => ({
                                        ...current,
                                        advance_date: event.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <Input
                                  value={editingCashAdvanceForm.notes}
                                  placeholder="Cash advance note"
                                  onChange={(event) =>
                                    setEditingCashAdvanceForm((current) => ({
                                      ...current,
                                      notes: event.target.value,
                                    }))
                                  }
                                />
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setEditingCashAdvanceId("")}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() => updateCashAdvance.mutate(advance)}
                                    disabled={updateCashAdvance.isPending}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold">{peso(advance.amount)}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {advance.advance_date}
                                  </div>
                                  {advance.notes ? (
                                    <div className="mt-1 truncate text-sm">{advance.notes}</div>
                                  ) : null}
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Remaining {peso(remainingBalance)}
                                  </div>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => openEditCashAdvance(advance)}
                                    aria-label="Edit cash advance"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => {
                                      if (confirm("Delete this cash advance?")) {
                                        deleteCashAdvance.mutate(advance);
                                      }
                                    }}
                                    aria-label="Delete cash advance"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <PayrollLine
                      label="Current CA balance"
                      value={peso(payrollSummary.cashAdvanceBalance)}
                    />
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="grid gap-2">
                        <Label>Deduct this payroll</Label>
                        <Input
                          type="number"
                          min="0"
                          value={cashAdvanceDeduction}
                          onChange={(event) => {
                            setAppliedCashAdvanceDeduction(0);
                            setCashAdvanceDeduction(event.target.value);
                          }}
                        />
                      </div>
                      <Button
                        onClick={() => applyCashAdvanceDeduction.mutate()}
                        disabled={
                          !selectedPayrollEmployee ||
                          numberValue(cashAdvanceDeduction) <= 0 ||
                          applyCashAdvanceDeduction.isPending
                        }
                      >
                        Apply
                      </Button>
                    </div>
                    <PayrollLine
                      label="CA balance after payroll"
                      value={peso(payrollSummary.caBalanceAfterPayroll)}
                      strong
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-emerald-50/70 p-4">
                <div className="grid gap-2 text-sm">
                  <PayrollLine label="Gross pay" value={peso(payrollSummary.salary)} />
                  <PayrollLine
                    label="Attendance deductions"
                    value={peso(payrollSummary.absentDeduction + payrollSummary.halfdayDeduction)}
                  />
                  <PayrollLine
                    label="Manual deductions"
                    value={peso(payrollSummary.manualDeductionTotal)}
                  />
                  <PayrollLine
                    label="Cash advance deducted"
                    value={peso(payrollSummary.cashAdvanceDeducted)}
                  />
                  <PayrollLine
                    label="Total deductions"
                    value={peso(payrollSummary.totalDeductions)}
                    strong
                  />
                  <PayrollLine label="Net pay" value={peso(payrollSummary.netPay)} strong />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => savePayslip.mutate()}
                    disabled={!selectedPayrollEmployee || savePayslip.isPending}
                  >
                    <Save className="h-4 w-4" />
                    {savePayslip.isPending ? "Saving..." : "Save Payslip"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPayslipHistoryOpen(true)}
                    disabled={!selectedPayrollEmployee}
                  >
                    <History className="h-4 w-4" />
                    Payslip History
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadPayslipsCsv}
                    disabled={payslips.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={payslipHistoryOpen} onOpenChange={setPayslipHistoryOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Payslip History</DialogTitle>
              <DialogDescription>
                Saved payslips for {selectedHistoryEmployee?.name ?? "selected employee"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label>Employee</Label>
              <Select
                value={selectedHistoryEmployee?.id ?? ""}
                onValueChange={setSelectedHistoryEmployeeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              {payslips.length === 0 ? (
                <div className="rounded-2xl border bg-white/70 p-6 text-center text-sm text-muted-foreground">
                  No saved payslips yet.
                </div>
              ) : (
                payslips.map((payslip) => (
                  <div key={payslip.id} className="rounded-2xl border bg-white/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {payslip.period_start} to {payslip.period_end}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Worked {payslip.worked_days} / {payslip.required_days} days
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Net Pay</div>
                        <div className="text-lg font-bold">{peso(payslip.net_pay)}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <PayrollLine label="Gross pay" value={peso(payslip.gross_pay)} />
                      <PayrollLine
                        label="Attendance deductions"
                        value={peso(payslip.attendance_deductions)}
                      />
                      <PayrollLine
                        label="Manual deductions"
                        value={peso(payslip.manual_deduction_total)}
                      />
                      <PayrollLine
                        label="Cash advance"
                        value={peso(payslip.cash_advance_deducted)}
                      />
                      <PayrollLine
                        label="Total deductions"
                        value={peso(payslip.total_deductions)}
                        strong
                      />
                      <PayrollLine label="Net pay" value={peso(payslip.net_pay)} strong />
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => downloadPayslipCsv(payslip)}
                      >
                        <Download className="h-4 w-4" />
                        Download CSV
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Delete this saved payslip?")) {
                            deletePayslip.mutate(payslip);
                          }
                        }}
                        disabled={deletePayslip.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={employeeOpen}
        onOpenChange={(open) => {
          setEmployeeOpen(open);
          if (!open) resetEmployeeForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <div>
                <Label>Name</Label>
                <Input
                  value={employeeForm.name}
                  onChange={(event) =>
                    setEmployeeForm({ ...employeeForm, name: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Role</Label>
                <Input
                  value={employeeForm.role}
                  onChange={(event) =>
                    setEmployeeForm({ ...employeeForm, role: event.target.value })
                  }
                  placeholder="Tailor, Printer"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Half-Month Salary</Label>
                <Input
                  type="number"
                  min="0"
                  value={employeeForm.halfMonthSalary}
                  onChange={(event) =>
                    setEmployeeForm({ ...employeeForm, halfMonthSalary: event.target.value })
                  }
                  placeholder="9000"
                />
              </div>
              <div>
                <Label>Required Work Days</Label>
                <Input
                  type="number"
                  min="1"
                  value={employeeForm.requiredDays}
                  onChange={(event) =>
                    setEmployeeForm({ ...employeeForm, requiredDays: event.target.value })
                  }
                  placeholder="12"
                />
              </div>
            </div>
            <div>
              <Label>Weekly Schedule</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {days.map((day) => (
                  <label
                    key={day.value}
                    className={cn(
                      "flex min-w-20 cursor-pointer items-center justify-center gap-2 rounded-2xl border bg-white/70 px-3 py-2 text-sm transition-colors",
                      employeeForm.workingDays.includes(day.value) &&
                        "border-emerald-300 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    <Checkbox
                      checked={employeeForm.workingDays.includes(day.value)}
                      onCheckedChange={() => toggleWorkingDay(day.value)}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border bg-white/60 px-3 py-2">
              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={employeeForm.active}
                  onCheckedChange={(checked) =>
                    setEmployeeForm({ ...employeeForm, active: Boolean(checked) })
                  }
                />
                Active employee
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmployeeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveEmployee.mutate()} disabled={saveEmployee.isPending}>
              {saveEmployee.isPending ? "Saving..." : editingEmployee ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeMetric({ title, value }: { title: string; value: string }) {
  return (
    <Card className="dms-glass-card min-h-28">
      <CardContent className="relative z-10 flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700">
          <Users className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function PayrollStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/75 p-4",
        highlight && "border-emerald-200 bg-emerald-50",
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function PayrollLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", strong && "font-semibold")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
