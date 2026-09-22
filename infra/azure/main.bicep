targetScope = 'resourceGroup'

@description('Short name used as a prefix for resource names')
@minLength(3)
@maxLength(12)
param namePrefix string = 'maw'

param location string = resourceGroup().location

@description('Container image for the MAW API')
param apiImage string

@description('Container image for the MAW web dashboard')
param webImage string

@description('Microsoft Entra tenant ID that issues tokens for MAW')
param entraTenantId string

@description('Application (client) ID of the MAW API app registration')
param entraApiClientId string

@description('Application (client) ID of the MAW web app registration')
param entraWebClientId string

@description('Scope requested by the web dashboard when calling the API')
param entraApiScope string

@description('Administrator login for PostgreSQL')
param postgresAdminLogin string = 'mawadmin'

@secure()
@description('Administrator password for PostgreSQL')
param postgresAdminPassword string

@description('Deploy Azure API Management in front of the API for Copilot actions')
param deployApiManagement bool = false

param apimPublisherEmail string = ''
param apimPublisherName string = 'MAW'

@allowed([
  'live'
  'demo'
])
param mawMode string = 'live'

param stablecoinProviderEnabled bool = false
param stablecoinProviderName string = ''
param stablecoinProviderBaseUrl string = ''

@secure()
param stablecoinProviderApiKey string = ''

@secure()
param stablecoinProviderWebhookSecret string = ''

var suffix = uniqueString(resourceGroup().id)
var kvName = take('${namePrefix}kv${suffix}', 24)
var pgName = '${namePrefix}-pg-${suffix}'
var logName = '${namePrefix}-logs-${suffix}'
var aiName = '${namePrefix}-ai-${suffix}'
var idName = '${namePrefix}-id-${suffix}'
var envName = '${namePrefix}-env-${suffix}'
var signingKeyName = 'maw-receipt-signing'
var databaseName = 'maw'
var tenantRef = mawMode == 'demo' ? 'demo-tenant' : entraTenantId
var kvSecretsUserRole = '4633458b-17de-408a-b874-0445c86b69e6'
var kvCryptoUserRole = '12338af0-0e69-4776-bea7-57ae8d297424'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: idName
  location: location
}

resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: aiName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

resource signingKey 'Microsoft.KeyVault/vaults/keys@2023-07-01' = {
  parent: vault
  name: signingKeyName
  properties: {
    kty: 'EC'
    curveName: 'P-256'
    keyOps: [
      'sign'
      'verify'
    ]
  }
}

resource secretsUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, kvSecretsUserRole)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRole)
  }
}

resource cryptoUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, kvCryptoUserRole)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvCryptoUserRole)
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: pgName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource postgresAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: {
    value: 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
  }
}

resource providerKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (stablecoinProviderEnabled) {
  parent: vault
  name: 'stablecoin-provider-api-key'
  properties: {
    value: stablecoinProviderApiKey
  }
}

resource providerWebhookSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (stablecoinProviderEnabled) {
  parent: vault
  name: 'stablecoin-provider-webhook-secret'
  properties: {
    value: stablecoinProviderWebhookSecret
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var baseSecrets = [
  {
    name: 'database-url'
    keyVaultUrl: databaseUrlSecret.properties.secretUri
    identity: identity.id
  }
]

var providerSecrets = stablecoinProviderEnabled ? [
  {
    name: 'provider-api-key'
    keyVaultUrl: providerKeySecret.properties.secretUri
    identity: identity.id
  }
  {
    name: 'provider-webhook-secret'
    keyVaultUrl: providerWebhookSecret.properties.secretUri
    identity: identity.id
  }
] : []

var providerEnv = stablecoinProviderEnabled ? [
  {
    name: 'STABLECOIN_PROVIDER_ENABLED'
    value: 'true'
  }
  {
    name: 'STABLECOIN_PROVIDER_NAME'
    value: stablecoinProviderName
  }
  {
    name: 'STABLECOIN_PROVIDER_BASE_URL'
    value: stablecoinProviderBaseUrl
  }
  {
    name: 'STABLECOIN_PROVIDER_API_KEY'
    secretRef: 'provider-api-key'
  }
  {
    name: 'STABLECOIN_PROVIDER_WEBHOOK_SECRET'
    secretRef: 'provider-webhook-secret'
  }
] : []

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-api'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  dependsOn: [
    secretsUserAssignment
    cryptoUserAssignment
    signingKey
    postgresDatabase
  ]
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 4000
        transport: 'auto'
      }
      secrets: concat(baseSecrets, providerSecrets)
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat([
            {
              name: 'MAW_MODE'
              value: mawMode
            }
            {
              name: 'MAW_TENANT_ID'
              value: tenantRef
            }
            {
              name: 'AUTH_MODE'
              value: mawMode == 'demo' ? 'demo' : 'entra'
            }
            {
              name: 'ENTRA_TENANT_ID'
              value: entraTenantId
            }
            {
              name: 'ENTRA_CLIENT_ID'
              value: entraApiClientId
            }
            {
              name: 'API_PORT'
              value: '4000'
            }
            {
              name: 'CORS_ORIGIN'
              value: 'https://${namePrefix}-web.${containerEnv.properties.defaultDomain}'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: identity.properties.clientId
            }
            {
              name: 'RECEIPT_SIGNER'
              value: 'keyvault'
            }
            {
              name: 'AZURE_KEY_VAULT_URL'
              value: vault.properties.vaultUri
            }
            {
              name: 'AZURE_KEY_VAULT_KEY_NAME'
              value: signingKeyName
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ], providerEnv)
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-web'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'MAW_MODE'
              value: mawMode
            }
            {
              name: 'AUTH_MODE'
              value: mawMode == 'demo' ? 'demo' : 'entra'
            }
            {
              name: 'API_BASE_URL'
              value: 'https://${apiApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'ENTRA_TENANT_ID'
              value: entraTenantId
            }
            {
              name: 'ENTRA_CLIENT_ID'
              value: entraWebClientId
            }
            {
              name: 'ENTRA_API_SCOPE'
              value: entraApiScope
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

resource apim 'Microsoft.ApiManagement/service@2023-05-01-preview' = if (deployApiManagement) {
  name: '${namePrefix}-apim-${suffix}'
  location: location
  sku: {
    name: 'Consumption'
    capacity: 0
  }
  properties: {
    publisherEmail: apimPublisherEmail
    publisherName: apimPublisherName
  }
}

resource apimApi 'Microsoft.ApiManagement/service/apis@2023-05-01-preview' = if (deployApiManagement) {
  parent: apim
  name: 'maw-actions'
  properties: {
    displayName: 'MAW Agent Wallet Actions'
    path: 'maw'
    protocols: [
      'https'
    ]
    subscriptionRequired: true
    serviceUrl: 'https://${apiApp.properties.configuration.ingress.fqdn}'
    format: 'openapi'
    value: loadTextContent('../../openapi/maw.openapi.yaml')
  }
}

output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output keyVaultUri string = vault.properties.vaultUri
output managedIdentityClientId string = identity.properties.clientId
output apiManagementGatewayUrl string = deployApiManagement ? apim.properties.gatewayUrl : ''
