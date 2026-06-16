CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all employees" ON public.employees;
CREATE POLICY "auth all employees" ON public.employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS employees_updated ON public.employees;
CREATE TRIGGER employees_updated
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_working_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_of_week)
);

ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all employee_schedules" ON public.employee_schedules;
CREATE POLICY "auth all employee_schedules" ON public.employee_schedules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS employee_schedules_employee_id_idx
  ON public.employee_schedules(employee_id);
DROP TRIGGER IF EXISTS employee_schedules_updated ON public.employee_schedules;
CREATE TRIGGER employee_schedules_updated
  BEFORE UPDATE ON public.employee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.employee_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all employee_attendance" ON public.employee_attendance;
CREATE POLICY "auth all employee_attendance" ON public.employee_attendance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS employee_attendance_work_date_idx
  ON public.employee_attendance(work_date);
CREATE INDEX IF NOT EXISTS employee_attendance_employee_id_idx
  ON public.employee_attendance(employee_id);
DROP TRIGGER IF EXISTS employee_attendance_updated ON public.employee_attendance;
CREATE TRIGGER employee_attendance_updated
  BEFORE UPDATE ON public.employee_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
