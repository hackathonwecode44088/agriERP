export const CATEGORY_META = {
  seeds: { label: "Seeds", supplier: "vendors", supplierLabel: "Vendor", buyer: "farmers", buyerLabel: "Farmer" },
  lenobag: { label: "Leno Bag", supplier: "vendors", supplierLabel: "Vendor", buyer: "farmers", buyerLabel: "Farmer" },
  potato: { label: "Potato", supplier: "farmers", supplierLabel: "Farmer", buyer: "companies", buyerLabel: "Company" },
};

export const PAYMENT_TYPES = [
  { value: "cash", label: "Cash (રોકડા)" },
  { value: "credit", label: "Credit (ઉધાર)" },
];

export const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "cheque", label: "Cheque" },
];

export const RATE_BASIS = [
  { value: "bag", label: "Per Bag / Katta" },
  { value: "weight", label: "Per Kg (Weight)" },
];

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Temporarily Closed" },
];
