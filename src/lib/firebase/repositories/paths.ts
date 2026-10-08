import "server-only";

/** Prevent caller-supplied IDs from changing the intended collection path. */
export function assertDocumentId(value: string): void {
  if (
    typeof value !== "string" || !value.trim() || value.includes("/") ||
    value === "." || value === ".." || /^__.*__$/.test(value) ||
    Buffer.byteLength(value, "utf8") > 1500
  ) {
    throw new Error("Invalid Firestore document ID.");
  }
}
