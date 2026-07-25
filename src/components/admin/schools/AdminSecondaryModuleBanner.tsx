import Link from "next/link";

type Props = {
  schoolId: string;
};

export default function AdminSecondaryModuleBanner({ schoolId }: Props) {
  return (
    <div className="mb-4 rounded-[var(--admin-radius)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <p>
        This secondary module is not in the primary school command centre. Prefer{" "}
        <Link
          href={`/admin/schools/${schoolId}/dashboard`}
          className="font-semibold underline underline-offset-2 hover:text-white"
        >
          Overview
        </Link>
        {" / "}
        <Link
          href={`/admin/schools/${schoolId}/support`}
          className="font-semibold underline underline-offset-2 hover:text-white"
        >
          Support
        </Link>
        {" / "}
        <Link
          href={`/admin/schools/${schoolId}/short-learning`}
          className="font-semibold underline underline-offset-2 hover:text-white"
        >
          Short Learning
        </Link>{" "}
        for launch ops.
      </p>
      <Link
        href={`/admin/schools/${schoolId}/dashboard`}
        className="mt-2 inline-block text-xs font-semibold text-amber-200 hover:text-white"
      >
        ← Back to school dashboard
      </Link>
    </div>
  );
}
