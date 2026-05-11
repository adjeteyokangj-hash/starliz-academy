type Props = {
  title: string;
  subtitle: string;
};

export default function Celebration({ title, subtitle }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/85 via-secondary/75 to-accent/80 p-5 text-white shadow-lg">
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/10" />
      <p className="relative text-xl font-black">{title}</p>
      <p className="relative mt-1 text-sm font-semibold text-white/95">{subtitle}</p>
    </div>
  );
}
