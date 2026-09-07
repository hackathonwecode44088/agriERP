import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider } from "@/context/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Platform from "@/pages/Platform";
import Companies from "@/pages/Companies";
import Dashboard from "@/pages/Dashboard";
import Parties from "@/pages/Parties";
import Categories from "@/pages/Categories";
import Products from "@/pages/Products";
import Godowns from "@/pages/Godowns";
import TxnPage from "@/pages/TxnPage";
import Stock from "@/pages/Stock";
import LotTrace from "@/pages/LotTrace";
import Ledger from "@/pages/Ledger";
import Receipts from "@/pages/Receipts";
import CreditNotes from "@/pages/CreditNotes";
import Invoices from "@/pages/Invoices";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Users from "@/pages/Users";
import ScheduleHistory from "@/pages/ScheduleHistory";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/platform" element={<Platform />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="parties" element={<Parties />} />
              <Route path="companies" element={<Companies />} />
              <Route path="categories" element={<Categories />} />
              <Route path="products" element={<Products />} />
              <Route path="godowns" element={<Godowns />} />
              <Route path="purchases" element={<TxnPage kind="purchases" />} />
              <Route path="sales" element={<TxnPage kind="sales" />} />
              <Route path="stock" element={<Stock />} />
              <Route path="lots" element={<LotTrace />} />
              <Route path="ledger" element={<Ledger />} />
              <Route path="receipts" element={<Receipts />} />
              <Route path="credit-notes" element={<CreditNotes />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="users" element={<Users />} />
              <Route path="schedule-history" element={<ScheduleHistory />} />
            </Route>
          </Routes>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
