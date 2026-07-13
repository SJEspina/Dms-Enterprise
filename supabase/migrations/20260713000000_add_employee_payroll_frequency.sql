ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS payroll_frequency TEXT NOT NULL DEFAULT 'semi_monthly',
  ADD COLUMN IF NOT EXISTS weekly_salary NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_weekly_days NUMERIC NOT NULL DEFAULT 6;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_payroll_frequency_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_payroll_frequency_check
      CHECK (payroll_frequency IN ('weekly', 'semi_monthly'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
