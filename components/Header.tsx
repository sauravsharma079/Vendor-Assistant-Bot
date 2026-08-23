import Link from "next/link";
import { VeltrianceMark } from "./VeltrianceMark";

export function Header({ active }: { active: "portal" | "admin" }) {
  return (
    <header className="border-b border-black/10 bg-[#0f1729]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white p-1.5">
            <VeltrianceMark className="h-full w-full" />
          </div>
          <div>
            <p className="font-display text-[15px] font-semibold leading-none text-white">
              Vendor Query Assistant
            </p>
            <p className="mt-1 text-[11px] leading-none text-white/50">
              Manufacturing AP Self-Service &middot; SAP S/4HANA
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-1 rounded-full bg-white/5 p-1 text-sm">
          <Link
            href="/"
            className={`rounded-full px-4 py-1.5 transition ${
              active === "portal" ? "bg-[#C9A227] text-white" : "text-white/60 hover:text-white"
            }`}
          >
            Vendor Portal
          </Link>
          <Link
            href="/admin"
            className={`rounded-full px-4 py-1.5 transition ${
              active === "admin" ? "bg-[#C9A227] text-white" : "text-white/60 hover:text-white"
            }`}
          >
            Business Support
          </Link>
        </nav>
      </div>
    </header>
  );
}
