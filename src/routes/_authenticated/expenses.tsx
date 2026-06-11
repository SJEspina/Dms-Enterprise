import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { peso, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/expenses")({ component: ExpensesPage });

type ExpenseForm = {
  name: string;
  category: string;
  amount: string;
  expense_date: string;
  notes: string;
};

const newExpenseForm = (): ExpenseForm => ({
  name: "",
  category: "",
  amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  notes: "",
});

function ExpensesPage() {
  const qc = useQueryClient();
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [forms, setForms] = useState<ExpenseForm[]>([newExpenseForm()]);
  const form = forms[0];

  const reset = () => {
    setEditing(null);
    setForms([newExpenseForm()]);
  };
  const openNew = () => {
    reset();
    setOpen(true);
  };
  const openEdit = (e: any) => {
    setEditing(e);
    setForms([{
      name: e.name,
      category: e.category ?? "",
      amount: String(e.amount),
      expense_date: new Date(e.expense_date).toISOString().slice(0, 10),
      notes: e.notes ?? "",
    }]);
    setOpen(true);
  };
  const updateForm = (index: number, patch: Partial<ExpenseForm>) => {
    setForms((current) =>
      current.map((expense, i) => (i === index ? { ...expense, ...patch } : expense)),
    );
  };
  const addForm = () => {
    setForms((current) => [...current, newExpenseForm()]);
  };
  const removeForm = (index: number) => {
    setForms((current) => current.filter((_, i) => i !== index));
  };

  const save = useMutation({
    mutationFn: async () => {
      const valid = forms.filter((expense) => expense.name && parseFloat(expense.amount) > 0);
      if (valid.length !== forms.length) throw new Error("Each expense needs a name and amount");

      if (editing) {
        const payload: any = {
          name: form.name,
          category: form.category || null,
          amount: parseFloat(form.amount) || 0,
          expense_date: new Date(form.expense_date).toISOString(),
          notes: form.notes || null,
        };
        const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const payload = valid.map((expense) => ({
          name: expense.name,
          category: expense.category || null,
          amount: parseFloat(expense.amount),
          expense_date: new Date(expense.expense_date).toISOString(),
          notes: expense.notes || null,
        }));
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setOpen(false);
      reset();
      toast.success(editing ? "Saved" : `${forms.length} expense${forms.length === 1 ? "" : "s"} saved`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Deleted");
    },
  });

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground text-sm">Track all business expenses.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              New Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit" : "New"} Expense</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => updateForm(0, { name: e.target.value })}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => updateForm(0, { category: e.target.value })}
                  placeholder="Utilities, Rent…"
                />
              </div>
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => updateForm(0, { amount: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => updateForm(0, { notes: e.target.value })}
                />
              </div>
            </div>
            {!editing && (
              <div className="space-y-3">
                {forms.slice(1).map((expense, offset) => {
                  const index = offset + 1;

                  return (
                    <div key={index} className="rounded-md border p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-medium">Expense {index + 1}</h3>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeForm(index)}
                          aria-label="Remove expense"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Label>Name</Label>
                          <Input
                            value={expense.name}
                            onChange={(e) => updateForm(index, { name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Category</Label>
                          <Input
                            value={expense.category}
                            onChange={(e) => updateForm(index, { category: e.target.value })}
                            placeholder="Utilities, Rent..."
                          />
                        </div>
                        <div>
                          <Label>Amount</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={expense.amount}
                            onChange={(e) => updateForm(index, { amount: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Notes</Label>
                          <Textarea
                            value={expense.notes}
                            onChange={(e) => updateForm(index, { notes: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" onClick={addForm}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Expense
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={forms.some((expense) => !expense.name) || save.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="h-full p-4">
          <div className="h-full overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No expenses yet
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>
                        {e.category ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{fmtDate(e.expense_date)}</TableCell>
                      <TableCell className="font-semibold">{peso(e.amount)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete?")) del.mutate(e.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
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
