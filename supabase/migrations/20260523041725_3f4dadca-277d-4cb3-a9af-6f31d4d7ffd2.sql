
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all services" ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER services_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Materials
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  cost_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_quantity NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all materials" ON public.materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER materials_updated BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  notes TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'in_progress',
  order_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all orders" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Order services
CREATE TABLE public.order_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all order_services" ON public.order_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX ON public.order_services(order_id);

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX ON public.payments(order_id);

-- Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  quantity NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recompute order totals & payment status
CREATE OR REPLACE FUNCTION public.recompute_order(p_order_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total NUMERIC(12,2);
  v_paid NUMERIC(12,2);
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(subtotal),0) INTO v_total FROM public.order_services WHERE order_id = p_order_id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.payments WHERE order_id = p_order_id;
  IF v_paid <= 0 THEN v_status := 'pending';
  ELSIF v_paid >= v_total AND v_total > 0 THEN v_status := 'paid';
  ELSE v_status := 'partial';
  END IF;
  UPDATE public.orders SET total_amount = v_total, paid_amount = v_paid, payment_status = v_status, updated_at = now() WHERE id = p_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_order_services() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.recompute_order(OLD.order_id); RETURN OLD; END IF;
  NEW.subtotal := NEW.price * NEW.quantity;
  PERFORM public.recompute_order(NEW.order_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER order_services_recompute AFTER INSERT OR UPDATE OR DELETE ON public.order_services FOR EACH ROW EXECUTE FUNCTION public.trg_order_services();

CREATE OR REPLACE FUNCTION public.trg_payments() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.recompute_order(OLD.order_id); RETURN OLD; END IF;
  PERFORM public.recompute_order(NEW.order_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER payments_recompute AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.trg_payments();
