# Copilot integration

`openapi/maw.openapi.yaml` describes a focused set of actions suitable for Microsoft Copilot Studio and other agent runtimes:

| Operation | Purpose |
| --- | --- |
| `getWalletBalance` | Balance of an agent wallet |
| `createPaymentIntent` | Request a payment; returns the decision, reasons and receipt reference |
| `getPaymentIntent` | Status and policy explanation |
| `approvePaymentIntent`, `rejectPaymentIntent` | Approver actions |
| `getSpendingPolicy` | Read a policy |
| `previewPolicyEvaluation` | Check a spend without creating a payment |
| `createSubscription` | Recurring payment |
| `createEscrow`, `releaseEscrow` | Escrow funding and release |
| `getReceipt`, `verifyReceipt` | Signed receipts |

## Behavior

The agent never decides its own permissions. It asks; MAW authorizes or denies with reasons and returns a plain-language `summary` the agent can relay.

Example prompts and the actions behind them:

- "Pay the approved hosting supplier $42 in USDC." calls `createPaymentIntent`.
- "Can I spend $80 more on cloud services this month?" calls `previewPolicyEvaluation` with `category: "cloud"`.
- "Show me why payment 123 was denied." calls `getPaymentIntent` and reads `reasons`.
- "Create a monthly $25 subscription for supplier X." calls `createSubscription`.
- "Release escrow E-104 if it is eligible." calls `releaseEscrow`; MAW enforces the release condition.

State-changing payment and escrow actions require an `Idempotency-Key`. Agents should derive a stable key from the business event so retries cannot duplicate a payment.

## Connecting Copilot Studio

1. Register the MAW API and a client application in Microsoft Entra ID and assign the `MAW.Agent` app role to the agent's identity.
2. Import `openapi/maw.openapi.yaml` as a custom connector or action, using OAuth 2.0 with the API scope.
3. Optionally publish the API through Azure API Management. The Bicep template can deploy an APIM instance that imports the same definition.
4. Assign the agent's identity a wallet and a spending policy in MAW.
