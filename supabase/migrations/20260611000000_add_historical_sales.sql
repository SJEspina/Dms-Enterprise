CREATE TABLE IF NOT EXISTS public.historical_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_month DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all historical_sales" ON public.historical_sales;
CREATE POLICY "auth all historical_sales" ON public.historical_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS historical_sales_sales_month_idx ON public.historical_sales(sales_month);
DROP TRIGGER IF EXISTS historical_sales_updated ON public.historical_sales;
CREATE TRIGGER historical_sales_updated
  BEFORE UPDATE ON public.historical_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
