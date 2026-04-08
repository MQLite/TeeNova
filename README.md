# TeeNova — Custom T-Shirt Printing Platform

A production-oriented monorepo skeleton for a custom printing e-commerce platform.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | ABP Framework 8.x · ASP.NET Core 9 · EF Core 9 · SQL Server |
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS |
| State | Zustand (cart, persisted to localStorage) |
| Storage | Local disk (dev) → swap `IFileStorageService` for Azure Blob / S3 |

## Quick Start

### Prerequisites
- .NET 9 SDK
- SQL Server (local or Docker)
- Node.js 20+

### Backend

```bash
cd backend

# Restore packages
dotnet restore

# Update connection string in:
# src/TeeNova.HttpApi.Host/appsettings.json

# Create and seed the database
dotnet ef migrations add Init \
  --project src/TeeNova.EntityFrameworkCore \
  --startup-project src/TeeNova.HttpApi.Host

dotnet ef database update \
  --project src/TeeNova.EntityFrameworkCore \
  --startup-project src/TeeNova.HttpApi.Host

# Run the API
dotnet run --project src/TeeNova.HttpApi.Host
# → https://localhost:44300
# → Swagger: https://localhost:44300/swagger
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local: set NEXT_PUBLIC_API_BASE_URL=https://localhost:44300

# Run dev server
npm run dev
# → http://localhost:3000
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/catalog/products | Paginated product list |
| GET | /api/catalog/products/{id} | Product detail |
| POST | /api/files/upload | Upload design image |
| GET | /api/customization/print-positions | Available print positions |
| POST | /api/orders | Create order |
| GET | /api/orders | List orders (admin) |
| GET | /api/orders/{id} | Order detail |
| PUT | /api/orders/{id}/status | Update order status |

## User Flow (Frontend)

```
/ (homepage) → /products (catalog) → /products/{id} (pick variant + upload design)
→ /cart (review) → /checkout (shipping form) → /orders/{id} (confirmation)
```

Admin portal: `/admin/orders`, `/admin/products`

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

### Admin Portal Split
- The `(admin)` route group in Next.js can be extracted to a separate app
- Share the `@/api/*` and `@/types` packages via an internal npm package or symlink
- Add authentication middleware to the ABP host (JWT / OpenIddict)
