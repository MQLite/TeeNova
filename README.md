# TeeNova — Custom T-Shirt Printing Platform

A production-oriented monorepo for a custom printing e-commerce platform.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | ABP Framework 10.6 · ASP.NET Core on .NET 10 · EF Core · SQL Server |
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS |
| State | Zustand (cart, persisted to localStorage) |
| Storage | Local disk (dev) → swap `IFileStorageService` for Azure Blob / S3 |

---

## Quick Start

### Prerequisites

- .NET 10 SDK
- SQL Server (local or remote)
- Node.js 20+

### Backend

```bash
cd backend

# Restore packages
dotnet restore

# Configure local credentials via user-secrets (see Admin Auth section below)
# OR create src/TeeNova.HttpApi.Host/appsettings.Development.json (gitignored)

# Create and seed the database
dotnet ef database update \
  --project src/TeeNova.EntityFrameworkCore \
  --startup-project src/TeeNova.HttpApi.Host

# Run the API
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/TeeNova.HttpApi.Host
# → http://localhost:5000
# → Swagger: http://localhost:5000/swagger
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# .env.local already has NEXT_PUBLIC_API_BASE_URL=http://localhost:5000

# Run dev server
npm run dev
# → http://localhost:3000
```

---

## Admin Authentication

The Admin portal (`/admin`) is protected by JWT authentication. All JWT and credential config is supplied at runtime via user-secrets or environment variables — no secrets are committed.

### Local dev — user-secrets

```bash
cd backend/src/TeeNova.HttpApi.Host

dotnet user-secrets set "Jwt:Secret"            "my-local-dev-jwt-secret-min-32-chars!!"
dotnet user-secrets set "Jwt:Issuer"            "http://localhost:5000"
dotnet user-secrets set "Jwt:Audience"          "TeeNovaAdminClient"
dotnet user-secrets set "Jwt:ExpiryMinutes"     "480"
dotnet user-secrets set "AdminAuth:Username"    "admin"
dotnet user-secrets set "AdminAuth:PasswordHash" "<bcrypt-hash>"
dotnet user-secrets set "App:SelfUrl"           "http://localhost:5000"
dotnet user-secrets set "App:CorsOrigins"       "http://localhost:3000"
dotnet user-secrets set "ConnectionStrings:Default" "Server=...;Database=TeeNova;..."
```

Alternatively, create `src/TeeNova.HttpApi.Host/appsettings.Development.json` (gitignored by `backend/.gitignore`).

### Generating a BCrypt password hash

`AdminAuth:PasswordHash` must be a BCrypt hash (work factor ≥ 10). **Never commit the plaintext password.**

**C# (using the project's BCrypt.Net-Next package):**

```csharp
Console.WriteLine(BCrypt.Net.BCrypt.HashPassword("your-password", workFactor: 12));
// Paste the output ($2a$12$...) as AdminAuth:PasswordHash
```

**Linux/Mac:**

```bash
htpasswd -bnBC 12 "" your-password | tr -d ':\n'
```

Any online BCrypt generator at work factor 12 also works.

### Admin login

Navigate to `http://localhost:3000/admin/login`.  
Credentials: whatever you set in `AdminAuth:Username` / `AdminAuth:PasswordHash`.  
On success a `admin_token` HttpOnly cookie is set (never exposed to JavaScript).

For full deployment and VPS configuration, see **[docs/admin-auth-deployment.md](docs/admin-auth-deployment.md)**.

---

## API Endpoints

### Public (storefront)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/catalog/products | Paginated product list |
| GET | /api/catalog/products/{id} | Product detail |
| POST | /api/files/upload | Upload design image |
| POST | /api/orders | Create order |
| GET | /api/orders/{id} | Order detail (customer) |

### Protected (Admin — requires Bearer token)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Admin login → JWT |
| GET | /api/auth/me | Validate token, return identity |
| GET | /api/admin/dashboard/summary | Dashboard stats |
| GET | /api/orders | All orders (admin) |
| PUT | /api/orders/{id}/status | Update order status |
| GET | /api/admin/assets | Uploaded asset list |
| GET | /api/print-config/admin/areas | Print areas (admin) |

---

## User Flow (Frontend)

```
/ (homepage) → /products (catalog) → /products/{id} (pick variant + upload design)
→ /cart (review) → /checkout (shipping form) → /orders/{id} (confirmation)
```

Admin portal: `/admin` (login at `/admin/login`)

---

## Future Extension Points

### Design Studio
- Mount a canvas editor in `src/app/customize/page.tsx`
- Recommended: Fabric.js or Konva for 2D canvas
- Add `DesignProject` entity in `TeeNova.Domain/Customization/`
- Store layer data as JSON blob (see commented roadmap in `UploadedAsset`)

### Template Studio
- Add `Template` and `TemplateLayout` entities to `TeeNova.Domain/`
- `SubjectSlot` + `CropFrame` define where user content is placed
- Backend: new `TemplateAppService` with `GET /api/templates`
- Frontend: template picker component in the customize flow

### AI Design Generation
- Add `AIGenerationService` interface in `TeeNova.Domain/AI/`
- Implement with OpenAI DALL·E, Stable Diffusion, or Azure OpenAI
- Expose `POST /api/ai/generate-design` → returns `UploadedAsset`
- Surface as a sidebar in the Design Studio

### Multi-Product Support (Hoodie, Banner, Badge)
- `ProductType` field already exists on `Product`
- Route canvas template selection based on `productType`
- Print positions per product type: extend `PrintPosition` enum or use a DB table

### Cloud File Storage
- Implement `AzureBlobStorageService : IFileStorageService`
- Register in `TeeNovaDomainModule` based on configuration
- No other code changes needed — all consumers depend on `IFileStorageService`
