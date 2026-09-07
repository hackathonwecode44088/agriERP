import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(localStorage.getItem("companyId") || "");

  const loadMe = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    setUser(data.user);
    setTenant(data.tenant);
    setCompanies(data.companies || []);
    if (data.companies?.length) {
      const stored = localStorage.getItem("companyId");
      const active = data.companies.find((c) => c.id === stored)?.id || data.companies[0].id;
      localStorage.setItem("companyId", active);
      setCompanyId(active);
    }
    return data.user;
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setUser(false);
      return;
    }
    loadMe().catch(() => setUser(false));
  }, [loadMe]);

  const finishAuth = async (token) => {
    localStorage.setItem("token", token);
    return loadMe();
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.user?.role === "superadmin") {
      localStorage.setItem("token", data.access_token);
      localStorage.removeItem("companyId");
      setUser(data.user);
      setTenant(null);
      setCompanies([]);
      return data.user;
    }
    return finishAuth(data.access_token);
  };

  const signup = async (payload) => {
    const { data } = await api.post("/auth/signup", payload);
    localStorage.setItem("companyId", data.company_id);
    return finishAuth(data.access_token);
  };

  const switchCompany = (id) => {
    localStorage.setItem("companyId", id);
    setCompanyId(id);
    window.location.reload();
  };

  const logout = async () => {
    localStorage.removeItem("token");
    localStorage.removeItem("companyId");
    setUser(false);
    setTenant(null);
    setCompanies([]);
    try {
      await api.post("/auth/logout");
    } catch (e) {
      /* ignore */
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, tenant, companies, companyId, login, signup, logout, switchCompany, refresh: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
