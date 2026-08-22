import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider } from "@/context/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Vendors from "@/pages/Vendors";
import Farmers from "@/pages/Farmers";
import Companies from "@/pages/Companies";
import Godowns from "@/pages/Godowns";
import Products from "@/pages/Products";
import Purchases from "@/pages/Purchases";
import Sales from "@/pages/Sales";
import Stock from "@/pages/Stock";
import Ledger from "@/pages/Ledger";
import CreditNotes from "@/pages/CreditNotes";
import Invoices from "@/pages/Invoices";
import Reports from "@/pages/Reports";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="farmers" element={<Farmers />} />
              <Route path="companies" element={<Companies />} />
              <Route path="godowns" element={<Godowns />} />
              <Route path="products/:category" element={<Products />} />
              <Route path="purchases/:category" element={<Purchases />} />
              <Route path="sales/:category" element={<Sales />} />
              <Route path="stock/:category" element={<Stock />} />
              <Route path="ledger" element={<Ledger />} />
              <Route path="credit-notes" element={<CreditNotes />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="reports" element={<Reports />} />
            </Route>
          </Routes>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
