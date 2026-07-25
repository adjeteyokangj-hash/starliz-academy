"use client";



import Link from "next/link";

import { usePathname } from "next/navigation";



const TABS = [

  { href: "/school-admin/short-learning", label: "Overview", exact: true },

  { href: "/school-admin/short-learning/bookings", label: "Bookings", exact: false },

  { href: "/school-admin/short-learning/forecast", label: "Demand Forecast", exact: false },

  { href: "/school-admin/short-learning/shifts", label: "Tutor Shifts", exact: false },

  { href: "/school-admin/short-learning/coverage", label: "Coverage", exact: false },

  { href: "/school-admin/short-learning/policies", label: "Policies/Settings", exact: false },

  { href: "/school-admin/short-learning/reliability", label: "Reliability", exact: false },

] as const;



export default function ShortLearningSubNav() {

  const pathname = usePathname();



  return (

    <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">

      {TABS.map((tab) => {

        const active = tab.exact

          ? pathname === tab.href

          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (

          <Link

            key={tab.href}

            href={tab.href}

            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${

              active

                ? "bg-primary/10 font-semibold text-primary"

                : "text-foreground/60 hover:bg-muted/50 hover:text-foreground"

            }`}

          >

            {tab.label}

          </Link>

        );

      })}

    </nav>

  );

}


