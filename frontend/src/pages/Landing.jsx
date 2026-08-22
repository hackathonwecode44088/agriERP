import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Boxes, FileText, Snowflake, Sprout, Tractor } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

const HERO = "https://images.pexels.com/photos/31908568/pexels-photo-31908568.jpeg";
const FARMER = "https://images.unsplash.com/photo-1561635741-c416a5193b6e";
const STORAGE = "https://images.pexels.com/photos/4487382/pexels-photo-4487382.jpeg";

const Landing = () => {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.get("/company-profile").then(({ data }) => setCompany(data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            <span className="font-head text-sm font-extrabold uppercase tracking-[0.2em]">
              {company?.name || "Potato ERP"}
            </span>
          </div>
          <Link to="/login">
            <Button data-testid="landing-login-btn" className="rounded-full px-5">
              Admin Login
            </Button>
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <img src={HERO} alt="Potato fields" className="h-[520px] w-full object-cover" />
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-6xl px-6">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-accent">
              Seeds · Leno Bags · Cold Storage
            </p>
            <h1 className="font-display max-w-2xl text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {company?.tagline || "Seed to Storage. One System."}
            </h1>
            <p className="mt-6 max-w-xl text-base text-white/80">
              {company?.about ||
                "Complete management software for potato traders — purchases, farmer ledgers, godown stock, invoices and reports in one place."}
            </p>
            <Link to="/login">
              <Button
                data-testid="landing-hero-cta"
                size="lg"
                className="mt-10 gap-2 rounded-full bg-accent px-7 text-[#14261D] hover:bg-accent/90"
              >
                Enter Admin Panel <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 border border-border bg-white p-10 transition-shadow duration-200 hover:shadow-lg">
            <Tractor className="h-6 w-6 text-primary" />
            <h2 className="font-head mt-6 text-base font-extrabold md:text-lg">Farmer & Ledger Management</h2>
            <p className="mt-3 max-w-lg text-sm text-muted-foreground">
              Track every farmer's purchases, seed and leno-bag sales, credit notes and running balance with a
              full statement you can export as PDF.
            </p>
            <img src={FARMER} alt="Farmer with potatoes" className="mt-8 h-56 w-full object-cover" />
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="border border-border bg-white p-8 transition-shadow duration-200 hover:shadow-lg">
              <Snowflake className="h-6 w-6 text-primary" />
              <h2 className="font-head mt-5 text-base font-extrabold md:text-lg">Godown & Cold Storage</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Lot-wise and godown-wise stock with bags, katta and weight balances.
              </p>
            </div>
            <div className="border border-border bg-white p-8 transition-shadow duration-200 hover:shadow-lg">
              <FileText className="h-6 w-6 text-primary" />
              <h2 className="font-head mt-5 text-base font-extrabold md:text-lg">Invoices & Reports</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Cash, online or cheque payments with downloadable invoices and filtered reports.
              </p>
            </div>
          </div>
          <div className="lg:col-span-5 border border-border bg-white p-8 transition-shadow duration-200 hover:shadow-lg">
            <Boxes className="h-6 w-6 text-primary" />
            <h2 className="font-head mt-5 text-base font-extrabold md:text-lg">Purchase & Sales Control</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Cash (રોકડા) or Credit (ઉધાર) entries with lot no., vehicle no., bags and weight captured on every
              transaction.
            </p>
          </div>
          <div className="lg:col-span-7 overflow-hidden border border-border">
            <img src={STORAGE} alt="Cold storage warehouse" className="h-full min-h-[220px] w-full object-cover" />
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-3">
          <div>
            <p className="font-head text-sm font-extrabold uppercase tracking-widest">{company?.name}</p>
            <p className="mt-3 text-sm text-muted-foreground">{company?.address}</p>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Phone: {company?.phone}</p>
            <p className="mt-1">Email: {company?.email}</p>
            <p className="mt-1">GSTIN: {company?.gstin}</p>
          </div>
          <div className="text-sm text-muted-foreground">
            <Link to="/login" className="transition-colors duration-200 hover:text-primary">
              Admin Login
            </Link>
            <p className="mt-6 text-xs">© {new Date().getFullYear()} Potato Management Software</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
