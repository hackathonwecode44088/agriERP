import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Sprout } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEPS = ["Business", "Company", "Account"];

const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    workspace_name: "",
    company_name: "",
    phone: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await signup(form);
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(errMsg(err));
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step === 0 && !form.workspace_name.trim()) return setError("Business name is required");
    if (step === 1 && !form.company_name.trim()) return setError("Company name is required");
    setError("");
    setStep((s) => s + 1);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFBF7] px-6 py-14">
      <div className="w-full max-w-lg" data-testid="signup-form">
        <div className="mb-8 flex items-center gap-2">
          <Sprout className="h-5 w-5 text-primary" />
          <span className="font-head text-sm font-extrabold uppercase tracking-[0.2em]">Potato ERP</span>
        </div>

        <h1 className="font-head text-2xl font-extrabold">Create your workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          14-day free trial · no card needed · add more companies any time
        </p>

        <div className="mt-8 flex gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 ${i <= step ? "bg-primary" : "bg-border"}`} />
              <p className={`mt-2 text-xs ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
                {i < step ? <Check className="inline h-3 w-3" /> : `${i + 1}. `} {s}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 space-y-4 border border-border bg-white p-6">
          {step === 0 && (
            <>
              <div>
                <Label className="text-xs">Business / Workspace name</Label>
                <Input data-testid="signup-workspace" className="mt-1" value={form.workspace_name} onChange={set("workspace_name")} />
              </div>
              <p className="text-xs text-muted-foreground">
                This is your account. You can run several companies inside it, each with fully separate data.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <div>
                <Label className="text-xs">First company name</Label>
                <Input data-testid="signup-company" className="mt-1" value={form.company_name} onChange={set("company_name")} />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input data-testid="signup-phone" className="mt-1" value={form.phone} onChange={set("phone")} />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <Label className="text-xs">Your name</Label>
                <Input data-testid="signup-name" className="mt-1" value={form.name} onChange={set("name")} />
              </div>
              <div>
                <Label className="text-xs">Email (login)</Label>
                <Input data-testid="signup-email" type="email" className="mt-1" value={form.email} onChange={set("email")} />
              </div>
              <div>
                <Label className="text-xs">Password (6+ characters)</Label>
                <Input data-testid="signup-password" type="password" className="mt-1" value={form.password} onChange={set("password")} />
              </div>
            </>
          )}

          {error && (
            <p data-testid="signup-error" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
              data-testid="signup-back"
            >
              Back
            </Button>
            {step < 2 ? (
              <Button onClick={next} data-testid="signup-next">
                Continue
              </Button>
            ) : (
              <Button onClick={submit} disabled={busy} data-testid="signup-submit">
                {busy ? "Creating..." : "Start free trial"}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/" className="font-semibold text-primary hover:underline" data-testid="go-login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
