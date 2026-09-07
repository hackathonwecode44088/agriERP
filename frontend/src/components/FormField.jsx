import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";

export const FieldError = ({ message, testid }) =>
  message ? (
    <p
      data-testid={testid}
      className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive"
    >
      <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  ) : null;

export const FormField = ({ label, required, error, hint, className = "", testid, children }) => (
  <div className={className}>
    {label && (
      <Label className="text-xs font-semibold text-foreground/80">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
    )}
    <div className="mt-1.5">{children}</div>
    {!error && hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    <FieldError message={error} testid={testid ? `${testid}-error` : undefined} />
  </div>
);

export const errorClass = (error) =>
  error ? "border-destructive focus-visible:ring-destructive" : "";

export default FormField;
