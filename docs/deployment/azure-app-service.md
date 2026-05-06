# Azure App Service Deployment Guide

## Architecture

The app runs as a **single process** on App Service (Linux, Node 22):

```
npm run start:prod
  ├─ scripts/start-prod.ts
  │     ├── registers + starts cron jobs (in-process, node-cron)
  │     └── spawns `next start` as a child process
  └─ shared DB connection pool (postgres-js, max 10 connections)
```

**Why single process?**
App Service supports one startup command. Running both the web server and the
cron scheduler in-process shares the DB connection pool, avoids WebJob
overhead, and keeps the scaling story simple: scale-out = more App Service
instances; Postgres advisory locks ensure only one instance runs each cron job
at a time.

---

## Required Azure Resources

| Resource | Tier | Notes |
|---|---|---|
| App Service Plan | B1 or higher (Linux) | Must enable **Always On** for cron reliability |
| App Service | Node 22 LTS | Linux container |
| Azure Database for PostgreSQL Flexible Server | B1ms | `16` version |
| Azure Key Vault | Standard | Recommended for storing secrets as Key Vault references |
| Container Registry | (optional) | Only needed if deploying via Docker image |

**Cost ballpark:** B1 App Service Plan + PostgreSQL Flexible B1ms ≈ **$30–50/month**.

---

## Required Environment Variables

Set these in **App Service → Configuration → Application settings**.
For secrets, use [Key Vault references](https://learn.microsoft.com/azure/app-service/app-service-key-vault-references).

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | ✅ | Set to `production` |
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `AZURE_OPENAI_ENDPOINT` | ✅ | e.g. `https://<resource>.openai.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | ✅ | Model deployment name |
| `AZURE_OPENAI_API_KEY` | Optional | Omit to use Managed Identity (recommended in prod) |
| `AZURE_OPENAI_API_VERSION` | Optional | Defaults to `2024-10-21` |
| `LINKEDIN_CLIENT_ID` | ✅ | From LinkedIn Developer App |
| `LINKEDIN_CLIENT_SECRET` | ✅ | 🔑 Use Key Vault reference |
| `LINKEDIN_REDIRECT_URI` | ✅ | Must match App Service hostname, e.g. `https://<app>.azurewebsites.net/api/auth/linkedin/callback` |
| `LINKEDIN_TOKEN_ENCRYPTION_KEY` | ✅ | 32-byte base64 key. Generate: `openssl rand -base64 32`. 🔑 Key Vault |
| `DASHBOARD_PASSWORD` | ✅ | Min 8 chars. 🔑 Key Vault |
| `SESSION_SECRET` | Optional (recommended) | Min 32 chars. `openssl rand -base64 32`. 🔑 Key Vault |
| `RELEVANCE_THRESHOLD` | Optional | Defaults to `70` (0-100) |
| `APP_BASE_URL` | ✅ | `https://<app>.azurewebsites.net` (or custom domain) |
| `PORT` | Optional | App Service sets this automatically |

> **LinkedIn redirect URI:** Update your LinkedIn app's Authorized Redirect URLs
> to include your App Service URL. This must be done in the
> [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) AND
> set as `LINKEDIN_REDIRECT_URI` in App Service configuration.

---

## Step-by-Step Deployment

### 1. Create Resources

```bash
# Variables — adjust to your naming conventions
RESOURCE_GROUP="rg-social-media-agent"
LOCATION="eastus"
APP_PLAN="asp-social-media-agent"
WEBAPP="social-media-agent"           # must be globally unique
PG_SERVER="pg-social-media-agent"
PG_DB="social_media_agent"
PG_ADMIN="pgadmin"
KV_NAME="kv-sma-prod"                 # must be globally unique

# Resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# App Service Plan (Linux B1 — Always On requires B1+)
az appservice plan create \
  --name $APP_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

# App Service (Node 22)
az webapp create \
  --name $WEBAPP \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_PLAN \
  --runtime "NODE:22-lts"

# PostgreSQL Flexible Server
az postgres flexible-server create \
  --name $PG_SERVER \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --admin-user $PG_ADMIN \
  --admin-password "<strong-password>" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16 \
  --public-access 0.0.0.0

# Create the application database
az postgres flexible-server db create \
  --server-name $PG_SERVER \
  --resource-group $RESOURCE_GROUP \
  --database-name $PG_DB

# Key Vault
az keyvault create \
  --name $KV_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### 2. Configure App Service

```bash
# Enable Always On (required for cron jobs to fire when no requests are in flight)
az webapp config set \
  --name $WEBAPP \
  --resource-group $RESOURCE_GROUP \
  --always-on true

# Set startup command
az webapp config set \
  --name $WEBAPP \
  --resource-group $RESOURCE_GROUP \
  --startup-file "npm run start:prod"

# Enable system-assigned Managed Identity (for Azure OpenAI, Key Vault)
az webapp identity assign \
  --name $WEBAPP \
  --resource-group $RESOURCE_GROUP
# Note the principalId from the output — you'll need it for RBAC below.
```

### 3. Set Environment Variables

```bash
# Store secrets in Key Vault
az keyvault secret set --vault-name $KV_NAME --name "LINKEDIN-CLIENT-SECRET"       --value "<value>"
az keyvault secret set --vault-name $KV_NAME --name "LINKEDIN-TOKEN-ENCRYPTION-KEY" --value "$(openssl rand -base64 32)"
az keyvault secret set --vault-name $KV_NAME --name "DASHBOARD-PASSWORD"            --value "<value>"
az keyvault secret set --vault-name $KV_NAME --name "SESSION-SECRET"                --value "$(openssl rand -base64 32)"
az keyvault secret set --vault-name $KV_NAME --name "DATABASE-URL"                  --value "postgresql://$PG_ADMIN:<pass>@$PG_SERVER.postgres.database.azure.com:5432/$PG_DB?sslmode=require"

# Grant App Service identity access to Key Vault secrets
PRINCIPAL_ID=$(az webapp identity show --name $WEBAPP --resource-group $RESOURCE_GROUP --query principalId -o tsv)
az keyvault set-policy --name $KV_NAME --object-id $PRINCIPAL_ID --secret-permissions get list

# Set App Service application settings (Key Vault references for secrets)
KV_URI="https://$KV_NAME.vault.azure.net/secrets"
az webapp config appsettings set \
  --name $WEBAPP \
  --resource-group $RESOURCE_GROUP \
  --settings \
    NODE_ENV="production" \
    APP_BASE_URL="https://$WEBAPP.azurewebsites.net" \
    AZURE_OPENAI_ENDPOINT="https://<resource>.openai.azure.com/" \
    AZURE_OPENAI_DEPLOYMENT="<deployment-name>" \
    LINKEDIN_CLIENT_ID="<client-id>" \
    LINKEDIN_REDIRECT_URI="https://$WEBAPP.azurewebsites.net/api/auth/linkedin/callback" \
    RELEVANCE_THRESHOLD="70" \
    DATABASE_URL="@Microsoft.KeyVault(SecretUri=$KV_URI/DATABASE-URL/)" \
    LINKEDIN_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=$KV_URI/LINKEDIN-CLIENT-SECRET/)" \
    LINKEDIN_TOKEN_ENCRYPTION_KEY="@Microsoft.KeyVault(SecretUri=$KV_URI/LINKEDIN-TOKEN-ENCRYPTION-KEY/)" \
    DASHBOARD_PASSWORD="@Microsoft.KeyVault(SecretUri=$KV_URI/DASHBOARD-PASSWORD/)" \
    SESSION_SECRET="@Microsoft.KeyVault(SecretUri=$KV_URI/SESSION-SECRET/)"
```

### 4. Set Up GitHub Actions OIDC (No Long-Lived Secrets)

```bash
# Create an Entra ID app registration for GitHub Actions
APP_ID=$(az ad app create --display-name "github-actions-social-media-agent" --query appId -o tsv)
az ad sp create --id $APP_ID

# Add federated credential for the main branch
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<YOUR_ORG>/<YOUR_REPO>:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Grant "Website Contributor" on the App Service
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SP_OBJECT_ID=$(az ad sp show --id $APP_ID --query id -o tsv)
az role assignment create \
  --assignee $SP_OBJECT_ID \
  --role "Website Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Web/sites/$WEBAPP"
```

Then add these to your GitHub repository:
- **Variables** (non-secret): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_WEBAPP_NAME`
- **Secrets** (environment `production`): `DATABASE_URL` (for the migration job)

### 5. Deploy Code

**Via GitHub Actions** (recommended):
Push to `main` — the `deploy.yml` workflow runs automatically:
1. Lint + build + test
2. Run database migrations
3. Deploy to App Service

**Manual deploy (one-off):**
```bash
SKIP_ENV_VALIDATION=1 npm run build
zip -r release.zip .next public node_modules package.json scripts src/db/migrations src tsconfig.json next.config.ts
az webapp deploy \
  --name $WEBAPP \
  --resource-group $RESOURCE_GROUP \
  --src-path release.zip \
  --type zip
```

### 6. Run Migrations (First Deploy / One-Off)

```bash
# From your local machine (DATABASE_URL must be reachable from your IP)
# You may need to temporarily allow your IP in the Postgres firewall:
az postgres flexible-server firewall-rule create \
  --name $PG_SERVER \
  --resource-group $RESOURCE_GROUP \
  --rule-name "local-dev" \
  --start-ip-address <your-ip> \
  --end-ip-address <your-ip>

DATABASE_URL="postgresql://..." npm run db:migrate:prod

# Remove the firewall rule after migration
az postgres flexible-server firewall-rule delete \
  --name $PG_SERVER \
  --resource-group $RESOURCE_GROUP \
  --rule-name "local-dev"
```

Alternatively, use the **SSH into container** feature in Azure Portal:
```bash
# In App Service → SSH console:
npm run db:migrate:prod
```

### 7. Configure Custom Domain + TLS

```bash
# Add custom domain (requires DNS CNAME pointing to <webapp>.azurewebsites.net)
az webapp config hostname add \
  --webapp-name $WEBAPP \
  --resource-group $RESOURCE_GROUP \
  --hostname "yourdomain.com"

# Create + bind a managed TLS certificate (free on B1+)
az webapp config ssl create \
  --name $WEBAPP \
  --resource-group $RESOURCE_GROUP \
  --hostname "yourdomain.com"
```

After binding the custom domain, update `APP_BASE_URL` and `LINKEDIN_REDIRECT_URI`
to use the custom domain, and update the LinkedIn app's Authorized Redirect URLs.

---

## Health Check

App Service health checks and uptime monitors should probe:

```
GET https://<app>.azurewebsites.net/api/health
```

Expected healthy response:
```json
{ "status": "ok", "uptime": 1234.5, "db": "reachable" }
```

Status 503 with `"db": "unreachable"` indicates a database connectivity problem.

Configure in App Service:
- **Health check path:** `/api/health`
- Azure will restart instances that fail repeated health checks.

---

## Azure OpenAI with Managed Identity (Production)

Omit `AZURE_OPENAI_API_KEY` and instead assign the Cognitive Services roles:

```bash
PRINCIPAL_ID=$(az webapp identity show --name $WEBAPP --resource-group $RESOURCE_GROUP --query principalId -o tsv)
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Cognitive Services OpenAI User" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<openai-resource>"
```

The `openai` SDK's `AzureOpenAI` constructor auto-detects Managed Identity when
`AZURE_OPENAI_API_KEY` is absent.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| App fails to start | Missing env var | Check App Service logs; env.ts throws early with a clear message |
| Cron jobs don't fire | Always On disabled | Enable Always On in App Service config |
| DB connection refused | Postgres firewall | Add App Service outbound IPs to Postgres firewall rules |
| Key Vault reference errors | Missing access policy / RBAC | Check Managed Identity has `get` + `list` on secrets |
| LinkedIn auth fails | Wrong redirect URI | Ensure `LINKEDIN_REDIRECT_URI` matches the LinkedIn app settings exactly |
