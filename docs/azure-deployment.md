# Azure deployment

`infra/azure/main.bicep` deploys a practical showcase environment into an existing resource group:

- Azure Container Apps environment with the MAW API and web dashboard
- Azure Database for PostgreSQL Flexible Server
- Azure Key Vault (RBAC authorization, purge protection) holding the database connection string, provider secrets and an ECDSA P-256 receipt signing key
- A user-assigned managed identity with `Key Vault Secrets User` and `Key Vault Crypto User`
- Log Analytics and Application Insights
- Optional Azure API Management (Consumption) importing `openapi/maw.openapi.yaml`

The application keeps hosting concerns at the edge. The same containers run on App Service or Kubernetes with the same environment variables.

## Prerequisites

1. An Entra app registration for the API that exposes a scope such as `access_as_user` and defines the app roles `MAW.Admin`, `MAW.PolicyAdmin`, `MAW.WalletOperator`, `MAW.Approver`, `MAW.Auditor` and `MAW.Agent`.
2. An Entra single-page application registration for the dashboard with the web app URL as a redirect URI and permission to call the API scope.
3. A container registry that Container Apps can pull from.

## Deploy

```bash
az group create --name maw-rg --location westeurope

az acr build --registry <registry> --image maw-api:1.0.0 --file infra/docker/api.Dockerfile .
az acr build --registry <registry> --image maw-web:1.0.0 --file infra/docker/web.Dockerfile .

az deployment group create \
  --resource-group maw-rg \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/main.parameters.example.json \
  --parameters postgresAdminPassword=<strong password>
```

Copy `main.parameters.example.json` and replace the placeholders before use. Pass secrets on the command line or from a secret store; never commit them.

## Runtime behavior

- The API container applies database migrations on start.
- Receipts are signed by Key Vault (`RECEIPT_SIGNER=keyvault`). The API authenticates to Key Vault with the managed identity through `DefaultAzureCredential`.
- The API runs with `MAW_MODE=live` and `AUTH_MODE=entra`. Demo authentication is rejected in live mode.
- The stablecoin provider is enabled with `stablecoinProviderEnabled=true` plus its name, base URL, API key and webhook secret. Provider secrets are stored in Key Vault and referenced by the container app.
- The PostgreSQL firewall allows Azure services. Use private networking for production deployments.

## Azure billing association

MAW stores Azure charge metadata (subscription, resource, cost category, invoice reference, amount) and links it to the payment intent and settlement transaction. The dashboard shows the conventional charge next to the provider or demo-ledger settlement reference. This is reconciliation metadata; it does not mean Azure invoices are settled on-chain.
