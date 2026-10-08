"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { IconScissors } from "@/components/icons";
import { Labeled, Spinner } from "@/components/ui";
import { authenticateHairQ } from "@/lib/auth-client";

const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const [form, setForm] = useState({
    salonName: "",
    ownerName: "",
    email: "",
    phone: "",
    city: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const passwordInput = e.currentTarget.elements.namedItem("password") as HTMLInputElement;
    const password = passwordInput.value;
    passwordInput.value = "";
    setBusy(true);
    setError(null);
    try {
      await authenticateHairQ(mode, form.email, password, form);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_440px]">
      <section className="relative hidden flex-col justify-between bg-ink px-12 py-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">
            <IconScissors width={16} height={16} />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.02em]">HairQ</span>
        </Link>

        <div className="max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Built with salon owners
          </p>
          <p className="mt-4 text-[27px] font-semibold leading-[1.22] tracking-[-0.03em]">
            &ldquo;Saturday used to be twenty people standing around arguing about who came first. Now they
            see the wait on their phone and come back at the right time.&rdquo;
          </p>
          <p className="mt-5 text-[13.5px] text-white/50">Imran · Fade Theory, Pune</p>
        </div>

        <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
          {[
            ["Avg. wait cut", "38%"],
            ["Walk-outs", "−61%"],
            ["Rebook rate", "2.4×"],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="num text-[22px] font-semibold tracking-[-0.03em]">{value}</p>
              <p className="mt-0.5 text-[11.5px] text-white/45">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-white">
              <IconScissors width={14} height={14} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.02em]">HairQ</span>
          </Link>

          <h1 className="text-[24px] font-semibold tracking-[-0.03em]">
            {mode === "login" ? "Sign in to your console" : "Set up your salon"}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {mode === "login"
              ? "Manage your queue, bookings and customers."
              : "Two minutes. We'll create your services, staff and customer link for you."}
          </p>

          <form onSubmit={submit} method="post" action="/api/auth" className="mt-6 space-y-3">
            {mode === "signup" ? (
              <>
                <Labeled label="Salon name">
                  <input disabled={!hydrated} className="field" value={form.salonName} onChange={set("salonName")} placeholder="ABC Salon" required />
                </Labeled>
                <Labeled label="Your name">
                  <input disabled={!hydrated} className="field" value={form.ownerName} onChange={set("ownerName")} required />
                </Labeled>
                <div className="grid grid-cols-2 gap-3">
                  <Labeled label="Phone">
                    <input disabled={!hydrated} className="field" value={form.phone} onChange={set("phone")} inputMode="tel" />
                  </Labeled>
                  <Labeled label="City">
                    <input disabled={!hydrated} className="field" value={form.city} onChange={set("city")} />
                  </Labeled>
                </div>
              </>
            ) : null}
            <Labeled label="Email">
              <input disabled={!hydrated} className="field" type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
            </Labeled>
            <Labeled label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
              <input
                className="field"
                type="password"
                disabled={!hydrated}
                name="password"
                minLength={mode === "signup" ? 8 : undefined}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Labeled>

            {error ? (
              <p className="rounded-lg border border-[#f0d7d5] bg-rose-soft px-3.5 py-2.5 text-[13px] text-rose">
                {error}
              </p>
            ) : null}

            <button className="btn btn-primary btn-lg w-full" disabled={busy || !hydrated}>
              {busy ? <Spinner /> : null}
              {mode === "login" ? "Sign in" : "Create my salon workspace"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-muted">
            {mode === "login" ? (
              <>
                New to HairQ?{" "}
                <Link href="/signup" className="font-medium text-ink underline underline-offset-2">
                  Set up your salon
                </Link>
              </>
            ) : (
              <>
                Already using HairQ?{" "}
                <Link href="/login" className="font-medium text-ink underline underline-offset-2">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
