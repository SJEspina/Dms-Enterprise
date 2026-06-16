ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS half_month_salary NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_half_month_days NUMERIC NOT NULL DEFAULT 12;

CREATE TABLE IF NOT EXISTS public.employee_cash_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount >= 0),
  CHECK (paid_amount >= 0),
  CHECK (paid_amount <= amount)
);

ALTER TABLE public.employee_cash_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all employee_cash_advances" ON public.employee_cash_advances;
CREATE POLICY "auth all employee_cash_advances" ON public.employee_cash_advances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS employee_cash_advances_employee_id_idx
  ON public.employee_cash_advances(employee_id);
DROP TRIGGER IF EXISTS employee_cash_advances_updated ON public.employee_cash_advances;
CREATE TRIGGER employee_cash_advances_updated
  BEFORE UPDATE ON public.employee_cash_advances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
