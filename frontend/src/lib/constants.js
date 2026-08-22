export const PAYMENT_TYPES = [
  { value: "cash", label: "Cash (રોકડા)" },
  { value: "credit", label: "Credit (ઉધાર)" },
];

export const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "cheque", label: "Cheque" },
];

export const PAYMENT_STATUS = [
  { value: "paid", label: "Paid (settles balance)" },
  { value: "partial", label: "Partially paid" },
  { value: "unpaid", label: "Unpaid (keep outstanding)" },
];

export const RATE_BASIS = [
  { value: "bag", label: "Per Bag / Katta" },
  { value: "weight", label: "Per Kg (Weight)" },
];

export const GST_RATES = [
  { value: "0", label: "0% (Exempt)" },
  { value: "5", label: "5%" },
  { value: "12", label: "12%" },
  { value: "18", label: "18%" },
  { value: "28", label: "28%" },
];

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Temporarily Closed" },
];

export const ROLE_OPTIONS = [
  { value: "farmer", label: "Farmer" },
  { value: "vendor", label: "Vendor / Supplier" },
  { value: "customer", label: "Customer / Company" },
];

export const UNIT_OPTIONS = [
  { value: "bag", label: "Bag / Katta" },
  { value: "kg", label: "Kilogram" },
  { value: "piece", label: "Piece" },
];

export const roleLabel = (role) => ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
