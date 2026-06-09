import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { peso, fmtDate } from "@/lib/format";
import { StatusPill } from "./dashboard";

export const Route = createFileRoute("/_authenticated/orders")({ component: OrdersPage });

type ServiceLine = { id?: string; service_name: string; price: string; quantity: string };

function OrdersPage() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_services(*), payments(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const filteredOrders = orders.filter((o) =>
    o.customer_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground text-sm">Create and manage customer orders.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Order
        </Button>
      </div>

      <div className="flex justify-end">
        <Input
          className="w-full sm:w-80"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer name..."
        />
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="h-full p-4">
          <div className="h-full overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {search ? "No matching orders" : "No orders yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((o) => {
                    const balance = Number(o.total_amount) - Number(o.paid_amount);
                    return (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => setViewing(o)}>
                        <TableCell className="font-medium">
                          {o.customer_name}
                          <div className="text-xs text-muted-foreground">
                            {o.customer_phone ?? ""}
                          </div>
                        </TableCell>
                        <TableCell>{fmtDate(o.order_date)}</TableCell>
                        <TableCell>{peso(o.total_amount)}</TableCell>
                        <TableCell>{peso(o.paid_amount)}</TableCell>
                        <TableCell className={balance > 0 ? "text-destructive font-medium" : ""}>
                          {peso(balance)}
                        </TableCell>
                        <TableCell>
                          <StatusPill status={o.payment_status} />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["orders"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["trend"] });
        }}
      />
      {viewing && (
        <OrderDetailDialog
          order={viewing}
          onClose={() => setViewing(null)}
          onChange={() => qc.invalidateQueries({ queryKey: ["orders"] })}
        />
      )}
    </div>
  );
}

function CreateOrderDialog({ open, onOpenChange, onCreated }: any) {
  const [customer, setCustomer] = useState({ customer_name: "", notes: "" });
  const [lines, setLines] = useState<ServiceLine[]>([
    { service_name: "", price: "", quantity: "1" },
  ]);
  const [downpayment, setDownpayment] = useState("");
  const [busy, setBusy] = useState(false);

  const addLine = () => setLines([...lines, { service_name: "", price: "", quantity: "1" }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<ServiceLine>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const total = lines.reduce(
    (s, l) => s + (parseFloat(l.price) || 0) * (parseInt(l.quantity) || 0),
    0,
  );

  const reset = () => {
    setCustomer({ customer_name: "", notes: "" });
    setLines([{ service_name: "", price: "", quantity: "1" }]);
    setDownpayment("");
  };

  const submit = async () => {
    if (!customer.customer_name) return toast.error("Customer name required");
    const valid = lines.filter(
      (l) => l.service_name && parseFloat(l.price) > 0 && parseInt(l.quantity) > 0,
    );
    if (valid.length === 0) return toast.error("Add at least one item");
    setBusy(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          customer_name: customer.customer_name,
          notes: customer.notes || null,
        })
        .select()
        .single();
      if (error) throw error;

      const rows = valid.map((l) => ({
        order_id: order.id,
        service_name: l.service_name,
        price: parseFloat(l.price),
        quantity: parseInt(l.quantity),
        subtotal: parseFloat(l.price) * parseInt(l.quantity),
      }));
      const { error: e2 } = await supabase.from("order_services").insert(rows);
      if (e2) throw e2;

      const dp = parseFloat(downpayment);
      if (dp > 0) {
        const { error: e3 } = await supabase
          .from("payments")
          .insert({ order_id: order.id, amount: dp, notes: "Downpayment" });
        if (e3) throw e3;
      }
      toast.success("Order created");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Customer Name</Label>
              <Input
                value={customer.customer_name}
                onChange={(e) => setCustomer({ ...customer, customer_name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={customer.notes}
                onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
              <h3 className="font-medium text-sm">Items</h3>
              <Button size="sm" variant="ghost" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="p-3 space-y-2">
              {lines.map((l, i) => {
                const sub = (parseFloat(l.price) || 0) * (parseInt(l.quantity) || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Label className="text-xs">Item</Label>
                      <div className="flex gap-1">
                        <Input
                          value={l.service_name}
                          onChange={(e) => updateLine(i, { service_name: e.target.value })}
                          placeholder="Item name"
                        />
                      </div>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={l.price}
                        onChange={(e) => updateLine(i, { price: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <span className="text-sm font-medium flex-1">{peso(sub)}</span>
                      {lines.length > 1 && (
                        <Button size="icon" variant="ghost" onClick={() => removeLine(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-end justify-between gap-4 bg-muted/50 rounded-lg p-4">
            <div className="flex-1 max-w-xs">
              <Label>Downpayment (optional)</Label>
              <Input
                type="number"
                step="0.01"
                value={downpayment}
                onChange={(e) => setDownpayment(e.target.value)}
              />
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">{peso(total)}</div>
              {parseFloat(downpayment) > 0 && (
                <div className="text-xs text-muted-foreground">
                  Balance: {peso(total - parseFloat(downpayment))}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailDialog({ order, onClose, onChange }: any) {
  const qc = useQueryClient();
  const { data: full, refetch } = useQuery({
    queryKey: ["order", order.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, order_services(*), payments(*)")
        .eq("id", order.id)
        .single();
      return data as any;
    },
    initialData: order,
  });
  const [paymentAmount, setPaymentAmount] = useState("");
  const [editLines, setEditLines] = useState<ServiceLine[]>([]);
  const balance = Number(full?.total_amount ?? 0) - Number(full?.paid_amount ?? 0);

  useEffect(() => {
    setEditLines(
      (full?.order_services ?? []).map((s: any) => ({
        id: s.id,
        service_name: s.service_name,
        price: String(s.price),
        quantity: String(s.quantity),
      })),
    );
  }, [full?.order_services]);

  const updateEditLine = (i: number, patch: Partial<ServiceLine>) => {
    setEditLines((lines) => lines.map((line, idx) => (idx === i ? { ...line, ...patch } : line)));
  };
  const addEditLine = () =>
    setEditLines((lines) => [...lines, { service_name: "", price: "", quantity: "1" }]);

  const addPayment = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(paymentAmount);
      if (!amt || amt <= 0) throw new Error("Enter amount");
      const { error } = await supabase.from("payments").insert({ order_id: order.id, amount: amt });
      if (error) throw error;
    },
    onSuccess: () => {
      setPaymentAmount("");
      refetch();
      onChange();
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["trend"] });
      toast.success("Payment recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePayment = async (id: string) => {
    if (!confirm("Delete payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
    onChange();
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["trend"] });
  };

  const saveItems = useMutation({
    mutationFn: async () => {
      const valid = editLines.filter(
        (l) => l.service_name && parseFloat(l.price) > 0 && parseInt(l.quantity) > 0,
      );
      if (valid.length !== editLines.length)
        throw new Error("Each item needs a name, price, and quantity");

      const existing = valid.filter((l) => l.id);
      const additions = valid.filter((l) => !l.id);

      await Promise.all(
        existing.map(async (l) => {
          const price = parseFloat(l.price);
          const quantity = parseInt(l.quantity);
          const { error } = await supabase
            .from("order_services")
            .update({
              service_name: l.service_name,
              price,
              quantity,
              subtotal: price * quantity,
            })
            .eq("id", l.id);
          if (error) throw error;
        }),
      );

      if (additions.length > 0) {
        const { error } = await supabase.from("order_services").insert(
          additions.map((l) => {
            const price = parseFloat(l.price);
            const quantity = parseInt(l.quantity);

            return {
              order_id: order.id,
              service_name: l.service_name,
              price,
              quantity,
              subtotal: price * quantity,
            };
          }),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetch();
      onChange();
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["trend"] });
      toast.success("Items updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteOrder = async () => {
    if (!confirm("Delete this order? This cannot be undone.")) return;
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) return toast.error(error.message);
    toast.success("Order deleted");
    onChange();
    onClose();
  };

  if (!full) return null;

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {full.customer_name} <StatusPill status={full.payment_status} />
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            {full.customer_phone ?? ""} · {fmtDate(full.order_date)}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="font-medium text-sm">Items</h4>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addEditLine}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
                <Button size="sm" onClick={() => saveItems.mutate()} disabled={saveItems.isPending}>
                  {saveItems.isPending ? "Saving..." : "Save Items"}
                </Button>
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editLines.map((s, i) => {
                    const subtotal = (parseFloat(s.price) || 0) * (parseInt(s.quantity) || 0);
                    return (
                      <TableRow key={s.id ?? `new-${i}`}>
                        <TableCell>
                          <Input
                            value={s.service_name}
                            onChange={(e) => updateEditLine(i, { service_name: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={s.price}
                            onChange={(e) => updateEditLine(i, { price: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={s.quantity}
                            onChange={(e) => updateEditLine(i, { quantity: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{peso(subtotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 bg-muted/50 rounded-lg p-4">
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-semibold">{peso(full.total_amount)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="text-lg font-semibold text-success">{peso(full.paid_amount)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Balance</div>
              <div className={`text-lg font-semibold ${balance > 0 ? "text-destructive" : ""}`}>
                {peso(balance)}
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-2">Payments</h4>
            {full.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-3">No payments yet.</p>
            ) : (
              <div className="space-y-1 mb-3">
                {full.payments.map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
                  >
                    <div>
                      <span className="font-medium">{peso(p.amount)}</span>{" "}
                      <span className="text-muted-foreground">
                        · {fmtDate(p.payment_date)}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deletePayment(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {balance > 0 && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Add Payment</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={`Up to ${peso(balance)}`}
                  />
                </div>
                <Button onClick={() => addPayment.mutate()} disabled={addPayment.isPending}>
                  Record
                </Button>
              </div>
            )}
          </div>

          {full.notes && (
            <div>
              <h4 className="font-medium text-sm mb-1">Notes</h4>
              <p className="text-sm text-muted-foreground">{full.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="destructive" onClick={deleteOrder}>
            Delete Order
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
