import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sprout } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user !== false)
      navigate(user.role === "superadmin" ? "/platform" : "/admin/dashboard", { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await login(email, password);
      navigate(u.role === "superadmin" ? "/platform" : "/admin/dashboard", { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 bg-[#14261D] p-14 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-white">
          <Sprout className="h-5 w-5 text-accent" />
          <span className="font-head text-sm font-extrabold uppercase tracking-[0.2em]">Potato ERP</span>
        </div>
        <div>
          <h2 className="font-display text-4xl leading-tight text-white">
            Every lot, every bag,
            <br /> every rupee accounted.
          </h2>
          <p className="mt-6 max-w-sm text-sm text-white/60">
            Multi-company trading workspace — parties, purchases, sales, stock, ledgers and invoices in one place.
          </p>
        </div>
        <p className="text-xs text-white/30">Trusted by potato traders</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#FDFBF7] px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <h1 className="font-head text-2xl font-extrabold">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Welcome back. Enter your workspace credentials.</p>

          <div className="mt-8 space-y-4">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                data-testid="login-email"
                className="mt-1 bg-white"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="text-xs">Password</Label>
              <Input
                data-testid="login-password"
                className="mt-1 bg-white"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <p
              data-testid="login-error"
              className="mt-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button data-testid="login-submit" type="submit" disabled={busy} className="mt-6 w-full">
            {busy ? "Signing in..." : "Sign In"}
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/signup" data-testid="go-signup" className="font-semibold text-primary hover:underline">
              Create a workspace
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
