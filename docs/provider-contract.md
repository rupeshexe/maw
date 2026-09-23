# Stablecoin provider contract

The `stablecoin-provider` adapter talks to any HTTPS gateway that implements the contract below. It is enabled only when all of these are set:

```text
STABLECOIN_PROVIDER_ENABLED=true
STABLECOIN_PROVIDER_NAME=<label stored on transactions>
STABLECOIN_PROVIDER_BASE_URL=https://provider.example
STABLECOIN_PROVIDER_API_KEY=<bearer credential>
STABLECOIN_PROVIDER_WEBHOOK_SECRET=<shared secret for webhook signatures>
```

If the provider is enabled with incomplete configuration the API refuses to start. There is no fallback to placeholder credentials.

Every request carries `Authorization: Bearer <api key>`. State-changing requests carry an `Idempotency-Key` header.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/capabilities` | Supported assets and networks, conversion, cancellation, webhooks and custody |
| POST | `/v1/accounts` | Resolve or create an account reference for a wallet |
| GET | `/v1/accounts/{ref}/balances/{asset}` | Balance |
| POST | `/v1/quotes` | Conversion quote |
| POST | `/v1/conversions` | Execute a conversion for a quote |
| POST | `/v1/transfers` | Submit a transfer |
| GET | `/v1/transfers/{reference}` | Transfer status |
| POST | `/v1/transfers/{reference}/cancel` | Cancel when supported |

### Capabilities

```json
{
  "assets": [{ "asset": "USDC", "networks": ["ethereum", "polygon"] }],
  "supportsConversion": false,
  "supportsCancel": false,
  "supportsWebhooks": true,
  "custody": false
}
```

MAW rejects a transfer whose asset and network are not listed before calling the provider. Capabilities are cached for five minutes.

### Transfer

Request:

```json
{
  "fromAccountRef": "acct_123",
  "destination": { "type": "blockchain_address", "addressOrReference": "0x...", "network": "polygon" },
  "amount": "42",
  "asset": "USDC",
  "network": "polygon",
  "memo": "Hosting invoice"
}
```

Response:

```json
{ "status": "settled", "reference": "0xabc...", "settledAt": "2026-09-23T05:00:00Z" }
```

`status` is one of `submitted`, `settled`, `failed`, `cancelled`. A `settled` response without a `reference` is treated as a provider error.

### Webhooks

The provider posts events to `/v1/webhooks/stablecoin-provider` with an `x-signature` header containing the hex HMAC-SHA-256 of the raw body using the webhook secret.

```json
{ "eventId": "evt_1", "reference": "0xabc...", "status": "settled" }
```

Events are deduplicated by `eventId` and applied to transactions in the `submitted` state.

## Conversion

Quotes carry an expiry and explicit fee and target amount. An expired or failed quote can never settle. MAW never reports a conversion as executed unless the provider returns a confirmed reference.
