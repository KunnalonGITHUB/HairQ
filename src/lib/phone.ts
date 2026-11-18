/**
 * One spelling per phone number, so "+91 98765 43210", "919876543210",
 * "098765 43210" and "9876543210" are recognised as the same customer.
 *
 * HairQ salons operate in India: a +91 / 91 / 0 prefix on a 10-digit number is
 * dropped. Other international numbers keep their leading "+". Older records
 * may still hold the earlier spelling, so compare with `samePhone`, not `===`.
 */
export function canonicalPhone(input: string): string {
  const trimmed = String(input ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function samePhone(a: string, b: string): boolean {
  return canonicalPhone(a) === canonicalPhone(b);
}
