import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "success";
type Size = "md" | "sm";

const variantClass: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-[0_10px_24px_rgba(10,132,255,0.28)] hover:bg-primary-dark",
  secondary: "border border-white/70 bg-white/70 text-text shadow-[0_8px_22px_rgba(36,50,80,0.06)] hover:bg-white",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
  success: "bg-success/10 text-success hover:bg-success/20",
};

const sizeClass: Record<Size, string> = {
  md: "min-h-[46px] px-5 text-sm",
  sm: "min-h-[38px] px-3.5 text-xs",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${variantClass[variant]} ${sizeClass[size]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
}
