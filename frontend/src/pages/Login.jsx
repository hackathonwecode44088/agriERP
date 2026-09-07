import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Eye, EyeOff, Loader2, ShieldCheck, Warehouse } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { validateForm } from "@/lib/validate";
import { Logo } from "@/components/Logo";
import { FormField, errorClass } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FIELDS = [
  { name: "email", label: "Email", required: true, rule: "email" },
  { name: "password", label: "Password", required: true, minLength: 6 },
];

const HIGHLIGHTS = [
  { icon: Warehouse, title: "Stock & godowns", text: "Bag-wise and lot-wise stock across every store." },
  { icon: BarChart3, title: "Ledgers & reports", text: "Party balances, margins and season comparisons." },
  { icon: ShieldCheck, title: "Role-based access", text: "Give each staff member exactly what they need." },
];

const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user !== false)
      navigate(user.role === "superadmin" ? "/platform" : "/admin/dashboard", { replace: true });
  }, [user, navigate]);

  const set = (k) => (e) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((s) => ({ ...s, [k]: "" }));
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateForm(FIELDS, form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError("");
    try {
      const u = await login(form.email.trim(), form.password);
      navigate(u.role === "superadmin" ? "/platform" : "/admin/dashboard", { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden overflow-hidden bg-[#14261D] lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#E8C16B 1px, transparent 1px), linear-gradient(90deg, #E8C16B 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <Logo tone="dark" subtitle="Agri Trading Suite" className="relative" />

        <div className="relative">
          <h2 className="font-display text-[2.6rem] leading-[1.1] text-white">
            Every lot, every bag,
            <br /> every rupee accounted.
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/55">
            One business, many companies — parties, purchases, sales, stock, ledgers and invoices in a
            single place.
          </p>
          <div className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10">
                  <h.icon className="h-4 w-4 text-accent" />
                </span>
                <div>
                  <p className="font-head text-sm font-semibold text-white">{h.title}</p>
                  <p className="mt-0.5 text-xs text-white/45">{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/25">Trusted by agri traders & cold-storage operators</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#FDFBF7] px-5 py-12 sm:px-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 lg:hidden">
            <Logo tone="light" subtitle="Agri Trading Suite" />
          </div>

          <form onSubmit={submit} noValidate data-testid="login-form">
            <h1 className="font-head text-2xl font-extrabold tracking-tight sm:text-3xl">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Welcome back. Use the email your business admin gave you.
            </p>

            <div className="mt-8 space-y-5">
              <FormField label="Email" required error={errors.email} testid="login-email">
                <Input
                  data-testid="login-email"
                  className={`h-11 bg-white ${errorClass(errors.email)}`}
                  type="email"
                  autoComplete="email"
                  placeholder="you@business.com"
                  value={form.email}
                  onChange={set("email")}
                />
              </FormField>

              <FormField label="Password" required error={errors.password} testid="login-password">
                <div className="relative">
                  <Input
                    data-testid="login-password"
                    className={`h-11 bg-white pr-11 ${errorClass(errors.password)}`}
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={set("password")}
                  />
                  <button
                    type="button"
                    data-testid="login-toggle-password"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-primary"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>
            </div>

            {error && (
              <p
                data-testid="login-error"
                className="mt-5 rounded-sm border-l-2 border-destructive bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              data-testid="login-submit"
              type="submit"
              disabled={busy}
              className="mt-7 h-11 w-full gap-2 text-sm font-semibold"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Signing in..." : "Sign In"}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              New to AgriERP?{" "}
              <Link to="/signup" data-testid="go-signup" className="font-semibold text-primary hover:underline">
                Create your business
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
