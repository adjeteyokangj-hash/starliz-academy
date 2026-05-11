import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent";
};

export default function Button({ variant = "primary", className = "", ...props }: Props) {
  const styleMap = {
    primary: "bg-(image:--btn-primary) text-white shadow-[0_14px_32px_rgba(108,92,231,0.25)] hover:brightness-105",
    secondary: "bg-(image:--btn-secondary) text-white shadow-[0_14px_32px_rgba(0,206,201,0.22)] hover:brightness-105",
    accent: "bg-(image:--btn-accent) text-slate-950 shadow-[0_14px_32px_rgba(253,203,110,0.24)] hover:brightness-105",
  } as const;

  return (
    <button
      className={`min-h-11 rounded-2xl px-4 py-2.5 font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:shadow-none sm:px-5 sm:py-3 ${styleMap[variant]} ${className}`}
      {...props}
    />
  );
}
