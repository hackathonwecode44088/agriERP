import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { validateForm } from "@/lib/validate";
import { Logo } from "@/components/Logo";
import { FormField, errorClass } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STEPS = [
  {
    key: "business",
    label: "Business",
    title: "Name your business",
    caption: "This is your AgriERP account. Run several companies inside it, each with separate books.",
    fields: [
      {
        name: "workspace_name",
        label: "Business name",
        required: true,
        minLength: 2,
        maxLength: 80,
        placeholder: "e.g. Shree Agro Traders",
        hint: "You can rename this later from settings.",
        testid: "signup-workspace",
      },
    ],
  },
  {
    key: "company",
    label: "Company",
    title: "Add your first company",
    caption: "Every company keeps its own products, stock, invoices and ledgers.",
    fields: [
      {
        name: "company_name",
        label: "Company name",
        required: true,
        minLength: 2,
        placeholder: "e.g. Shree Agro Traders Pvt Ltd",
        testid: "signup-company",
      },
      {
        name: "phone",
        label: "Phone",
        required: true,
        rule: "phone",
        placeholder: "10-digit mobile number",
        testid: "signup-phone",
      },
      {
        name: "gstin",
        label: "GSTIN (optional)",
        rule: "gstin",
        placeholder: "24ABCDE1234F1Z5",
        testid: "signup-gstin",
      },
    ],
  },
  {
    key: "account",
    label: "Account",
    title: "Create your login",
    caption: "You become the owner of this business and can add staff logins later.",
    fields: [
      { name: "name", label: "Your name", required: true, minLength: 2, testid: "signup-name" },
      {
        name: "email",
        label: "Email (login)",
        required: true,
        rule: "email",
        placeholder: "you@business.com",
        testid: "signup-email",
      },
      {
        name: "password",
        label: "Password",
        required: true,
        minLength: 6,
        type: "password",
        hint: "At least 6 characters.",
        testid: "signup-password",
      },
    ],
  },
];

const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    workspace_name: "",
    company_name: "",
    phone: "",
    gstin: "",
    name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = STEPS[step];

  const set = (k) => (e) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((s) => ({ ...s, [k]: "" }));
    setError("");
  };

  const validateStep = () => {
    const errs = validateForm(current.fields, form);
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validateStep()) return;
    setBusy(true);
    setError("");
    try {
      await signup({ ...form, gstin: form.gstin.trim().toUpperCase() });
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8">
        <Logo tone="light" />
        <Link
          to="/login"
          data-testid="go-login"
          className="text-sm font-semibold text-primary transition-colors duration-200 hover:underline"
        >
          Sign in
        </Link>
      </header>

      <div className="mx-auto w-full max-w-xl px-5 py-10 sm:px-8 sm:py-14" data-testid="signup-form">
        <p className="font-head text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-3 font-head text-2xl font-extrabold tracking-tight sm:text-3xl">
          {current.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{current.caption}</p>

        <ol className="mt-8 grid grid-cols-3 gap-2" data-testid="signup-steps">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <div className={`h-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
              <p
                className={`mt-2 flex items-center gap-1 text-xs font-medium ${
                  i <= step ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}.</span>} {s.label}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-7 space-y-5 rounded-sm border border-border bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)] sm:p-7">
          {current.fields.map((f) => (
            <FormField
              key={f.name}
              label={f.label}
              required={f.required}
              error={errors[f.name]}
              hint={f.hint}
              testid={f.testid}
            >
              {f.type === "password" ? (
                <div className="relative">
                  <Input
                    data-testid={f.testid}
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    className={`h-11 pr-11 ${errorClass(errors[f.name])}`}
                    value={form[f.name]}
                    onChange={set(f.name)}
                  />
                  <button
                    type="button"
                    data-testid="signup-toggle-password"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-primary"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              ) : (
                <Input
                  data-testid={f.testid}
                  className={`h-11 ${errorClass(errors[f.name])}`}
                  placeholder={f.placeholder}
                  value={form[f.name]}
                  onChange={set(f.name)}
                />
              )}
            </FormField>
          ))}

          {error && (
            <p
              data-testid="signup-error"
              className="rounded-sm border-l-2 border-destructive bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
            <Button
              variant="outline"
              className="h-11 gap-2"
              disabled={step === 0 || busy}
              onClick={() => {
                setErrors({});
                setError("");
                setStep((s) => s - 1);
              }}
              data-testid="signup-back"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                className="h-11 gap-2"
                onClick={() => validateStep() && setStep((s) => s + 1)}
                data-testid="signup-next"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button className="h-11 gap-2" onClick={submit} disabled={busy} data-testid="signup-submit">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Creating..." : "Start free trial"}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          14-day free trial · no card needed · add more companies any time
        </p>
      </div>
    </div>
  );
};

export default Signup;
