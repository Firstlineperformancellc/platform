# Stripe setup and operation

How FLP's payments are wired, and how to stand them up in a new environment. Part of the handover package.

## What Stripe does here

| Flow | Stripe product | Where in code |
| --- | --- | --- |
| Parent pays for a breakdown, a Film Room session, or a Season Arc pack | Checkout | `services/api/src/routes/orders.ts`, `sessions.ts` |
| Mentor identity, bank account, tax details | Connect, Express accounts | `services/api/src/routes/mentors.ts` |
| Paying a mentor | Transfer to the connected account, tied to the parent's charge | `services/api/src/billing.ts` |
| Refunds | Refund on the payment | `billing.ts`, `routes/admin.ts` |
| Keeping FLP in step with Stripe | Webhooks | `services/api/src/routes/webhooks.ts` |

FLP is the merchant of record. Stripe holds the money; FLP's database records what happened.

## Environment keys (`services/api/.env.dev`, `.env.prod`, never in git)

| Key | What it is |
| --- | --- |
| `STRIPE_SECRET_KEY` | Secret key. `sk_test_...` on Development, `sk_live_...` on Production. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the account webhook endpoint. Written by the script below. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret of the connected-accounts endpoint. Written by the script below. |

## Standing up an environment

1. In the Stripe dashboard (FLP's account), turn on **Connect** and choose the platform model with **Express** accounts.
2. Paste the secret key into the env file for that environment.
3. Create the webhook endpoints and store their secrets:

   ```bash
   cd services/api && ./deploy/stripe-webhook.sh https://api-dev.firstlineperform.com .env.dev
   ```

   For Production use `https://api.firstlineperform.com` and `.env.prod`. The script replaces any endpoint it created before, so it is safe to run again.
4. Deploy the API so it picks up the keys (`services/api/deploy/deploy-dev.sh`, or the release script for Production).
5. In the app, Admin, Settings: set **Payments** to Stripe.

The Service Health page shows Stripe as connected once the key is accepted.

## Events the API listens for

Account endpoint: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`.
Connected-accounts endpoint: `account.updated`.

Each event id is stored in `stripe_events` and handled once. If handling fails the API answers 500 and Stripe retries.

## Day to day

- **Refund an order:** Admin, Orders & jobs, Refund order. Blank amount means everything not yet refunded.
- **Pay a mentor:** Admin, Ledger, Pay. Or switch **Mentor payouts** to Automatic in Settings and set the waiting period.
- **A payout will not send:** the ledger row shows the reason from the last attempt. The usual causes are a mentor who has not finished Stripe setup, or a sale that was never charged through Stripe.
- **A card dispute:** the mentor's payout is put on hold and the admins are emailed. Answer the dispute in the Stripe dashboard, then release or void the payout on the ledger.
- **Refunds made directly in the Stripe dashboard** flow back into FLP on their own.

## Testing without real money

Development uses Stripe test mode. Card `4242 4242 4242 4242`, any future expiry, any CVC. Stripe's test onboarding for a mentor accepts its documented test values.
