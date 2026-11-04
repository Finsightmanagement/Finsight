# FinSight POS — Daraja Sandbox Setup

## Current scope
The M-Pesa engine is installed in Supabase and the Cashier **Order History → Take Payment** panel. This version is **sandbox-only**, and the functions will refuse to send a request until the server-side configuration exists. The user's real Till 8192114 must NOT be used as a sandbox shortcode.

Three Supabase Edge Functions:
- `finsight-mpesa-stk` — PIN-authorized STK Push request, verified user JWT required.
- `finsight-mpesa-callback` — callback receiver, requires a long private token in its callback URL. It only records the callback; it never marks a payment Paid.
- `finsight-mpesa-check` — PIN-authorized status query; requires Daraja result and matching callback before recording a payment.

## Required Supabase Edge Function Secrets

Configure these under **Supabase Dashboard → Project Settings / Edge Function Secrets** (exact menu name may vary). Never put them in HTML, GitHub, or ChatGPT messages.

| Secret | Value |
|---|---|
| `FIN_MPESA_SANDBOX_COMPANY_ID` | Company UUID from FinSight Super Admin for **Test Company** |
| `FIN_MPESA_SANDBOX_CONSUMER_KEY` | Consumer Key of a Daraja sandbox app |
| `FIN_MPESA_SANDBOX_CONSUMER_SECRET` | Consumer Secret of that app |
| `FIN_MPESA_SANDBOX_PASSKEY` | Sandbox STK Push passkey |
| `FIN_MPESA_SANDBOX_SHORTCODE` | Daraja sandbox Business Shortcode (not a real Till) |
| `FIN_MPESA_SANDBOX_CALLBACK_TOKEN` | A newly generated random secret of **at least 32 characters**, unique to this sandbox |

Standard Supabase URL and server API keys are supplied automatically by the hosted environment. The Edge Functions use them only on the server.

The STK function constructs its callback URL automatically from the project URL:
`/functions/v1/finsight-mpesa-callback?token=<server-secret>`

## Testing
1. Create a Daraja sandbox application with M-Pesa Express access; obtain sandbox values from Safaricom.
2. Set the above server secrets yourself. Do not send the values to anyone in chat.
3. Log in to **Test Company → Cashier**, open an existing **unpaid** Guest Bill, select **Take Payment**, enter a sandbox phone number and whole-shilling amount, and click **Send STK Push**.
4. Use **Check Status** or the automatic limited polling while the panel is open.
5. Test a confirmed sandbox payment, rejection, cancellation, repeated request ID, and delayed callback.
6. Check the order balance, receiving cashier attribution, reconciliation, and printed receipt.

**Safety gates:** No configured credentials means no STK request. Receiving a callback alone never confirms payment. Repeated request IDs reuse the original request. The provider payment receipt cannot be reused for another recorded M-Pesa payment within the same company.

## Important unfinished tasks
- **Production access is intentionally disabled**. Live Tills require their own Safaricom onboarding and merchant approvals.
- This stage supports M-Pesa requests against an **already-created unpaid order**. Taking an STK payment before submitting a new order requires a separate, carefully designed pending-checkout workflow.
- A manually entered M-Pesa reference is still an existing manual POS payment, not a verified Daraja payment. Keep those flows distinguishable in reporting before a production launch.
- The present sandbox integration uses a single explicitly allowed Test Company. Client-specific secret storage, client onboarding, operations alerts, timeout reconciliation and certified live rollout come next.
- eTIMS fiscal submission and PDQ terminal integrations are separate subsequent phases.

## Deployment
Edge Function sources are versioned at `supabase/functions/finsight-mpesa-*/index.ts`. The current deployed functions are in Supabase. Do not place merchant secrets inside source-controlled files.
