import { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export default function Card({ title, children, className = "" }: Props) {
  return (
    <section className={`rounded-2xl bg-(--surface) p-4 shadow-sm ring-1 ring-(--ring-color) backdrop-blur sm:p-5 ${className}`}>
      {title ? <h3 className="mb-3 text-base font-bold text-slate-800 sm:text-lg">{title}</h3> : null}
      {children}
    </section>
  );
}
