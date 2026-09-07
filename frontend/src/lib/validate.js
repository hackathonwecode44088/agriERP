const isBlank = (v) =>
  v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");

const PATTERNS = {
  email: {
    re: /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/,
    msg: "Enter a valid email address (e.g. name@company.com)",
  },
  phone: { re: /^[6-9]\d{9}$/, msg: "Enter a valid 10-digit mobile number" },
  gstin: {
    re: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    msg: "GSTIN must be 15 characters (e.g. 24ABCDE1234F1Z5)",
  },
  ifsc: { re: /^[A-Z]{4}0[A-Z0-9]{6}$/, msg: "IFSC must be 11 characters (e.g. SBIN0001234)" },
  aadhaar: { re: /^\d{12}$/, msg: "Aadhaar must be 12 digits" },
  hsn: { re: /^\d{4,8}$/, msg: "HSN must be 4 to 8 digits" },
  pincode: { re: /^\d{6}$/, msg: "Pincode must be 6 digits" },
  bank_account: { re: /^\d{9,18}$/, msg: "Account number must be 9 to 18 digits" },
};

export const checkRule = (rule, value) => {
  if (isBlank(value)) return "";
  const raw = String(value).trim();
  if (PATTERNS[rule]) {
    const p = PATTERNS[rule];
    return p.re.test(rule === "gstin" || rule === "ifsc" ? raw.toUpperCase() : raw) ? "" : p.msg;
  }
  if (rule === "positive") {
    const n = Number(raw);
    if (Number.isNaN(n)) return "Enter a valid number";
    return n > 0 ? "" : "Must be greater than 0";
  }
  if (rule === "nonneg") {
    const n = Number(raw);
    if (Number.isNaN(n)) return "Enter a valid number";
    return n >= 0 ? "" : "Cannot be negative";
  }
  if (rule === "percent") {
    const n = Number(raw);
    if (Number.isNaN(n)) return "Enter a valid number";
    return n >= 0 && n <= 100 ? "" : "Must be between 0 and 100";
  }
  if (rule === "notFuture") {
    return raw > new Date().toISOString().slice(0, 10) ? "Date cannot be in the future" : "";
  }
  if (rule === "date") {
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? "" : "Enter a valid date";
  }
  return "";
};

export const validateValue = (field, value, form) => {
  const label = field.label || "This field";
  if (field.required && isBlank(value)) return `${label} is required`;
  if (isBlank(value)) return "";
  if (field.rule) {
    const msg = checkRule(field.rule, value);
    if (msg) return msg;
  }
  if (field.minLength && String(value).trim().length < field.minLength)
    return `${label} must be at least ${field.minLength} characters`;
  if (field.maxLength && String(value).trim().length > field.maxLength)
    return `${label} must be at most ${field.maxLength} characters`;
  if (field.min !== undefined && Number(value) < field.min)
    return `${label} cannot be less than ${field.min}`;
  if (field.max !== undefined && Number(value) > field.max)
    return `${label} cannot be more than ${field.max}`;
  if (field.validate) return field.validate(value, form) || "";
  return "";
};

export const validateForm = (fields, form) => {
  const errors = {};
  fields.forEach((f) => {
    const msg = validateValue(f, form?.[f.name], form);
    if (msg) errors[f.name] = msg;
  });
  return errors;
};

export const hasErrors = (errors) => Object.keys(errors || {}).length > 0;
