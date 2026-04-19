const resolveApiBaseUrl = () => {
  // const configured = import.meta.env.VITE_API_BASE_URL;
  const configured = "https://lake-smartly-grumpily.ngrok-free.dev";
  if (configured) return configured;
  if (typeof window === "undefined") return "http://localhost:4001";
  const { protocol, hostname, port, origin } = window.location;
  if (port === "5173") return `${protocol}//${hostname}:4001`;
  return origin;
};

export const API_BASE_URL = resolveApiBaseUrl();
const TOKEN_KEY = "medcore_access_token";

if (!import.meta.env.VITE_API_BASE_URL) {
  console.warn(
    `VITE_API_BASE_URL is not set. Falling back to ${API_BASE_URL}.`
  );
}

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

const request = async (path, options = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error(data?.message || res.statusText || "Request failed");
    error.status = res.status;
    error.body = data;
    throw error;
  }
  return data;
};

const normalizeEntityName = (entityName) => {
  const mapping = {
    Patient: "patients",
    Appointment: "appointments",
    User: "users",
    Prescription: "prescriptions",
    Medicine: "medicines",
    Supplier: "suppliers",
    Sale: "sales",
    DiagnosisRecord: "diagnosis-records",
    Master: "masters",
  };
  return mapping[entityName] || entityName.toLowerCase();
};

const createEntityClient = (entityName) => {
  const basePath = `/api/${normalizeEntityName(entityName)}`;

  return {
    list: (sort, limit) => {
      const params = new URLSearchParams();
      if (sort) params.set("sort", sort);
      if (limit) params.set("limit", String(limit));
      const query = params.toString();
      return request(`${basePath}${query ? `?${query}` : ""}`);
    },
    filter: (filterObj) => {
      const params = new URLSearchParams();
      Object.entries(filterObj || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null) params.set(key, String(value));
      });
      return request(`${basePath}?${params.toString()}`);
    },
    create: (data) => request(basePath, { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id) => request(`${basePath}/${id}`, { method: "DELETE" }),
  };
};

export const base44 = {
  auth: {
    me: async () => {
      const data = await request("/api/auth/me");
      return data.user;
    },
    login: async ({ email, password }) => {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      return data;
    },
    logout: (redirectUrl) => {
      setToken(null);
      if (redirectUrl) window.location.href = redirectUrl;
    },
    redirectToLogin: (redirectUrl) => {
      const redirect = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : "";
      window.location.href = `/login${redirect}`;
    },
  },
  settings: {
    all: () => request("/api/settings"),
    branding: () => request("/api/settings/public/branding"),
    get: (key) => request(`/api/settings/${encodeURIComponent(key)}`),
    set: (key, value) => request(`/api/settings/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) }),
  },
  entities: {
    Patient: createEntityClient("Patient"),
    Appointment: createEntityClient("Appointment"),
    User: createEntityClient("User"),
    Prescription: createEntityClient("Prescription"),
    Medicine: createEntityClient("Medicine"),
    Supplier: createEntityClient("Supplier"),
    Sale: createEntityClient("Sale"),
    DiagnosisRecord: createEntityClient("DiagnosisRecord"),
    Master: createEntityClient("Master"),
  },
  dispensary: {
    medicineCategories: () => request("/api/medicines/categories"),
    grnList: (limit) => {
      const q = limit ? `?limit=${limit}` : "";
      return request(`/api/grn${q}`);
    },
    grnGet: (id) => request(`/api/grn/${id}`),
    grnCreate: (data) =>
      request("/api/grn", { method: "POST", body: JSON.stringify(data) }),
    grnUpdate: (id, data) =>
      request(`/api/grn/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    grnDelete: (id) => request(`/api/grn/${id}`, { method: "DELETE" }),
    batches: (medicineId, includeId) => {
      const params = new URLSearchParams();
      params.set("medicine_id", medicineId);
      if (includeId) params.set("include_id", includeId);
      return request(`/api/grn/batches?${params.toString()}`);
    },
    salesBillCreate: (data) =>
      request("/api/sales-bills", { method: "POST", body: JSON.stringify(data) }),
    salesBillUpdate: (id, data) =>
      request(`/api/sales-bills/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    salesBillDelete: (id) => request(`/api/sales-bills/${id}`, { method: "DELETE" }),
    salesBills: (limit) => {
      const q = limit ? `?limit=${limit}` : "";
      return request(`/api/sales-bills${q}`);
    },
    salesBillGet: (id) => request(`/api/sales-bills/${id}`),
    salesBillLines: (limit) => {
      const q = limit ? `?limit=${limit}` : "";
      return request(`/api/sales-bills/lines/all${q}`);
    },
  },
  functions: {
    invoke: async (name, data) => {
      return request(`/api/functions/${name}`, { method: "POST", body: JSON.stringify(data) });
    },
  },
};
