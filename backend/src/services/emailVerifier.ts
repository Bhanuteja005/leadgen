/**
 * Email verifier client — powered by Bouncify.
 *
 * Endpoint: GET https://api.bouncify.io/v1/verify?apikey=KEY&email=EMAIL
 * Bouncify statuses → our statuses:
 *   deliverable   → valid
 *   undeliverable → invalid
 *   accept-all    → catch_all
 *   unknown       → unknown
 */
import axios from "axios";

export type VerificationStatus =
  | "valid" | "invalid" | "unknown" | "catch_all"
  | "risky" | "unverified" | "source_provided";

export interface VerifyEmailResult {
  status:        VerificationStatus;
  confidence:    number;
  hasMxRecords:  boolean;
  isDisposable:  boolean;
  isRoleAccount: boolean;
  isFree:        boolean;
  smtpResponse:  string;
}

const STATUS_MAP: Record<string, VerificationStatus> = {
  deliverable:   "valid",
  undeliverable: "invalid",
  "accept-all":  "catch_all",
  unknown:       "unknown",
};

const CONFIDENCE_MAP: Record<VerificationStatus, number> = {
  valid:           100,
  source_provided:  90,
  catch_all:        60,
  risky:            50,
  unknown:          15,
  invalid:           0,
  unverified:       10,
};

export async function verifyEmail(email: string): Promise<VerifyEmailResult> {
  const apiKey = process.env.BOUNCIFY_API_KEY ?? "";
  if (!apiKey) {
    console.warn("[verifier] BOUNCIFY_API_KEY not set – skipping verification");
    return unverified();
  }

  try {
    const res = await axios.get<Record<string, unknown>>(
      "https://api.bouncify.io/v1/verify",
      { params: { apikey: apiKey, email }, timeout: 20_000 },
    );
    const d      = res.data;
    const raw    = ((d.status as string) ?? "unknown").toLowerCase();
    const status = STATUS_MAP[raw] ?? "unknown";

    console.log(`[verifier:bouncify] ${email} → ${raw} (${status})`);
    return {
      status,
      confidence:    CONFIDENCE_MAP[status] ?? 10,
      hasMxRecords:  status !== "invalid",
      isDisposable:  Boolean(d.disposable ?? d.is_disposable),
      isRoleAccount: Boolean(d.role ?? d.is_role),
      isFree:        Boolean(d.free ?? d.is_free),
      smtpResponse:  JSON.stringify({ account: d.account, domain: d.domain }),
    };
  } catch (err) {
    console.warn("[verifier:bouncify] API call failed:", (err as Error).message);
    return unverified();
  }
}

function unverified(): VerifyEmailResult {
  return {
    status:        "unverified",
    confidence:    0,
    hasMxRecords:  false,
    isDisposable:  false,
    isRoleAccount: false,
    isFree:        false,
    smtpResponse:  "",
  };
}