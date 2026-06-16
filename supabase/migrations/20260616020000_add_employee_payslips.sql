CREATE TABLE IF NOT EXISTS public.employee_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_pay NUMERIC NOT NULL DEFAULT 0,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  worked_days NUMERIC NOT NULL DEFAULT 0,
  required_days NUMERIC NOT NULL DEFAULT 0,
  absent_days NUMERIC NOT NULL DEFAULT 0,
  halfday_days NUMERIC NOT NULL DEFAULT 0,
  attendance_deductions NUMERIC NOT NULL DEFAULT 0,
  manual_deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
  manual_deduction_total NUMERIC NOT NULL DEFAULT 0,
  cash_advance_deducted NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_start, period_end)
);

ALTER TABLE public.employee_payslips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all employee_payslips" ON public.employee_payslips;
CREATE POLICY "auth all employee_payslips" ON public.employee_payslips
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS employee_payslips_employee_id_idx
  ON public.employee_payslips(employee_id);
CREATE INDEX IF NOT EXISTS employee_payslips_period_idx
  ON public.employee_payslips(period_start, period_end);
DROP TRIGGER IF EXISTS employee_payslips_updated ON public.employee_payslips;
CREATE TRIGGER employee_payslips_updated
  BEFORE UPDATE ON public.employee_payslips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
