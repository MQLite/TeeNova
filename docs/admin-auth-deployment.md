# Admin Authentication — Configuration & Deployment Guide

**Epic 8700 · Tasks 8702–8707, 8711**

---

## Table of Contents

1. [Required Configuration Keys](#1-required-configuration-keys)
2. [Local Development Setup](#2-local-development-setup)
3. [Password Hash Generation](#3-password-hash-generation)
4. [Frontend Environment](#4-frontend-environment)
5. [Cookie Settings](#5-cookie-settings)
6. [CORS Configuration](#6-cors-configuration)
7. [VPS / Test Server Deployment](#7-vps--test-server-deployment)
8. [Verification Checklist](#8-verification-checklist)
9. [Known Limitations](#9-known-limitations)
10. [Rate Limiting](#10-rate-limiting)

---

## 1. Required Configuration Keys

All keys below must be present at runtime. `appsettings.json` contains `#{REPLACE...}#` placeholders — never fill them with real values. Supply real values via user-secrets (local dev) or environment variables (VPS).

### Backend (`Jwt` section)

| Key | Description | Example |
|-----|-------------|---------|
| `Jwt:Secret` | HMAC-SHA256 signing secret — **must be ≥ 32 characters** | `my-dev-secret-key-min-32-chars!!` |
| `Jwt:Issuer` | JWT `iss` claim; must match the backend origin exactly | `http://localhost:5000` |
| `Jwt:Audience` | JWT `aud` claim — keep as `TeeNovaAdminClient` | `TeeNovaAdminClient` |
| `Jwt:ExpiryMinutes` | Token lifetime in minutes | `480` (8 hours) |

> **Important:** `Jwt:Issuer` is embedded in every token and validated on every request. The value in config when the backend *starts* determines what `iss` goes into new tokens. The same value must be present for the validator to accept them. If you change the issuer on a running VPS, all existing tokens issued under the old value will be rejected.

### Backend (`AdminAuth` section)

| Key | Description |
|-----|-------------|
| `AdminAuth:Username` | Admin login username (case-insensitive) |
| `AdminAuth:PasswordHash` | BCrypt hash of the admin password (work factor ≥ 10) |

### Backend (`App` section)

| Key | Description | Example |
|-----|-------------|---------|
| `App:SelfUrl` | Canonical backend base URL (used by ABP for absolute URL generation) | `http://localhost:5000` |
| `App:CorsOrigins` | Comma-separated list of allowed frontend origins | `http://localhost:3000` |

### Frontend

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend URL as seen by Next.js *server-side* code | `http://localhost:5000` |

---

## 2. Local Development Setup

The backend has a `UserSecretsId` configured in `TeeNova.HttpApi.Host.csproj`. Use `dotnet user-secrets` to store local credentials — they are never written to source files.

```bash
cd backend/src/TeeNova.HttpApi.Host

dotnet user-secrets set "Jwt:Secret"       "my-local-dev-jwt-secret-key-at-least-32-chars"
dotnet user-secrets set "Jwt:Issuer"       "http://localhost:5000"
dotnet user-secrets set "Jwt:Audience"     "TeeNovaAdminClient"
dotnet user-secrets set "Jwt:ExpiryMinutes" "480"

dotnet user-secrets set "AdminAuth:Username"     "admin"
dotnet user-secrets set "AdminAuth:PasswordHash" "<bcrypt-hash-of-your-local-password>"

dotnet user-secrets set "App:SelfUrl"      "http://localhost:5000"
dotnet user-secrets set "App:CorsOrigins"  "http://localhost:3000"

dotnet user-secrets set "ConnectionStrings:Default" "Server=...;Database=TeeNova;..."
```

User-secrets are loaded automatically when `ASPNETCORE_ENVIRONMENT=Development`. Start the backend with:

```bash
cd backend
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/TeeNova.HttpApi.Host
# Listens on http://localhost:5000
```

Alternatively, create `appsettings.Development.json` in `src/TeeNova.HttpApi.Host/` (gitignored by `backend/.gitignore`) with all values inline — see existing structure in `appsettings.json` for key names.

---

## 3. Password Hash Generation

`AdminAuth:PasswordHash` must be a BCrypt hash (work factor ≥ 10). The plaintext password is **never stored** anywhere in the project.

### Option A — C# snippet (using the project's BCrypt.Net-Next package)

Run this anywhere you have a C# REPL (LINQPad, `dotnet-script`, a scratch test):

```csharp
using BCrypt.Net;
Console.WriteLine(BCrypt.HashPassword("your-password-here", workFactor: 12));
// Output: $2a$12$...  ← paste this as AdminAuth:PasswordHash
```

### Option B — Linux / Mac command line

```bash
htpasswd -bnBC 12 "" your-password-here | tr -d ':\n'
# Output: $2y$12$...  ← BCrypt-compatible, paste as AdminAuth:PasswordHash
```

> `$2a$` and `$2y$` prefixes are both valid BCrypt variants accepted by BCrypt.Net-Next.

### Option C — Online generator

Any BCrypt generator (search "bcrypt hash generator") with work factor 12 produces a valid hash.

**Rules:**
- The plaintext password must never be committed.
- Work factor must be ≥ 10. Default in `AdminAuthService` is 12.
- Changing the hash immediately changes the admin login password — no backend restart needed for hash comparison, but the backend must be restarted to pick up a config change.

---

## 4. Frontend Environment

Create `frontend/.env.local` (gitignored):

```bash
cp frontend/.env.local.example frontend/.env.local
```

`.env.local` content:

```env
# Backend API base URL — used by Next.js server-side proxy routes and server components
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

For VPS, set this to the backend's reachable URL from the Next.js process:

```env
NEXT_PUBLIC_API_BASE_URL=http://<server-ip>:5000
```

> **Why `NEXT_PUBLIC_`?** Next.js requires the `NEXT_PUBLIC_` prefix to make the variable available at build time. Even though the JWT is never exposed to the browser, the variable is used in server-side route handlers (`/api/proxy/[...path]`, `/api/auth/login`) that run on the Next.js server.

---

## 5. Cookie Settings

The `admin_token` HttpOnly cookie is set by `POST /api/auth/login` (Next.js route handler) and cleared by `POST /api/auth/logout`.

| Attribute | Value | Notes |
|-----------|-------|-------|
| Name | `admin_token` | |
| HttpOnly | `true` | Never readable by client-side JavaScript |
| SameSite | `lax` | Protects against CSRF on cross-site navigations |
| Secure | `true` in production only | Set when `NODE_ENV=production` |
| Path | `/` | |
| Max-Age | Derived from `Jwt:ExpiryMinutes` × 60 | Cookie and token expire together |

The `Secure` flag requires HTTPS in production. If the frontend runs behind nginx with TLS termination, `NODE_ENV=production` must be set when starting Next.js.

---

## 6. CORS Configuration

In the current architecture, the browser never talks directly to the backend for admin operations. All admin API calls flow through the Next.js proxy:

```
Browser → Next.js (/api/proxy/...) → Backend (Bearer token added server-side)
```

Therefore, browser-to-backend CORS for the `admin_token` cookie is **not required**.

The backend CORS policy (`App:CorsOrigins`) is still needed for:
- Public storefront API calls (product catalog, order creation, checkout) made directly from the browser
- Swagger UI access from a browser

Set `App:CorsOrigins` to the frontend origin, comma-separated for multiple:

```
App:CorsOrigins=http://localhost:3000,https://yourproductionfrontend.com
```

The backend's CORS policy allows credentials (`AllowCredentials()`) which covers any future direct browser–backend interactions.

---

## 7. VPS / Test Server Deployment

### 7.1 Backend — Environment Variables

ASP.NET Core reads environment variables with `__` (double underscore) as path separators. Set these in the process environment, systemd unit, or your hosting provider's config panel:

```
ASPNETCORE_ENVIRONMENT=Production

ConnectionStrings__Default=Server=<db-host>;Database=TeeNova;User Id=<user>;Password=<pass>;TrustServerCertificate=True;

Jwt__Secret=<at-least-32-char-random-string>
Jwt__Issuer=http://<server-ip>:5000
Jwt__Audience=TeeNovaAdminClient
Jwt__ExpiryMinutes=480

AdminAuth__Username=<admin-username>
AdminAuth__PasswordHash=<bcrypt-hash>

App__SelfUrl=http://<server-ip>:5000
App__CorsOrigins=http://<server-ip>:3000
```

### 7.2 Example systemd Unit (`/etc/systemd/system/teenova-api.service`)

```ini
[Unit]
Description=TeeNova API
After=network.target

[Service]
WorkingDirectory=/opt/teenova/api
ExecStart=/usr/bin/dotnet TeeNova.HttpApi.Host.dll
Restart=always
RestartSec=10

Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://0.0.0.0:5000
Environment=ConnectionStrings__Default=<connection-string>
Environment=Jwt__Secret=<secret>
Environment=Jwt__Issuer=http://<server-ip>:5000
Environment=Jwt__Audience=TeeNovaAdminClient
Environment=Jwt__ExpiryMinutes=480
Environment=AdminAuth__Username=<admin-username>
Environment=AdminAuth__PasswordHash=<bcrypt-hash>
Environment=App__SelfUrl=http://<server-ip>:5000
Environment=App__CorsOrigins=http://<server-ip>:3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable teenova-api
sudo systemctl start teenova-api
sudo journalctl -u teenova-api -f   # tail logs
```

### 7.3 Frontend — Build and Start

```bash
cd frontend

# Set env before build so NEXT_PUBLIC_* values are baked in
echo "NEXT_PUBLIC_API_BASE_URL=http://<server-ip>:5000" > .env.local

npm install
npm run build
NODE_ENV=production npm start   # or use PM2 / systemd
```

Example PM2 setup:

```bash
pm2 start npm --name "teenova-frontend" -- start
pm2 save
pm2 startup
```

### 7.4 nginx Reverse Proxy (optional)

If you front both services with nginx:

```nginx
# Backend
server {
    listen 80;
    server_name <server-ip>;
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Frontend
server {
    listen 3000;
    server_name <server-ip>;
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

If using nginx, set `Jwt__Issuer` to the public-facing URL (e.g., `http://<server-ip>`) rather than the internal port.

---

## 8. Verification Checklist

Run these checks after deploying or changing credentials.

### Backend healthy

```bash
curl -si http://<host>:5000/api/catalog/products | head -5
# Expected: HTTP/1.1 200
```

### Protected endpoint returns 401 without token

```bash
curl -si http://<host>:5000/api/admin/dashboard/summary | head -5
# Expected: HTTP/1.1 401
```

### Login sets cookie

```bash
curl -si -c cookies.txt -X POST http://<frontend-host>:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<admin>","password":"<password>"}'
# Expected: HTTP/1.1 200, Set-Cookie: admin_token=...; HttpOnly
cat cookies.txt
```

### Protected admin page loads after login

```bash
curl -si -b cookies.txt http://<frontend-host>:3000/admin
# Expected: HTTP/1.1 200 (not 307)
```

### Logout clears cookie

```bash
curl -si -b cookies.txt -X POST http://<frontend-host>:3000/api/auth/logout
# Expected: HTTP/1.1 200, Set-Cookie: admin_token=; Max-Age=0; HttpOnly
```

### /admin redirects to login after logout

```bash
curl -si http://<frontend-host>:3000/admin --max-redirs 0
# Expected: HTTP/1.1 307, Location: /admin/login?returnUrl=%2Fadmin
```

### Public storefront unaffected

```bash
curl -si http://<frontend-host>:3000/products
# Expected: HTTP/1.1 200
```

---

## 9. Known Limitations

### Browser back-button after logout

After logout, clicking the browser back button may visually display a previously rendered admin page from the browser's in-memory page cache (bfcache). This is browser-native behaviour.

**Impact:** Visual only. Any API interaction or page refresh immediately redirects to `/admin/login` because:
- The `admin_token` cookie is gone
- The Next.js middleware blocks all `/admin/*` routes
- The proxy returns `401` for all admin API calls

**Mitigation implemented (Task 8706):** Proxy responses carry `Cache-Control: no-store`, preventing browser caching of API data.

**Mitigation implemented (Task 8708):** Admin HTML responses also carry `Cache-Control: no-store` via a central `headers()` rule in `next.config.mjs`:

```js
async headers() {
  return [
    {
      source: '/admin/:path*',
      headers: [{ key: 'Cache-Control', value: 'no-store' }],
    },
  ]
}
```

Verified: `/admin` and all admin routes return `Cache-Control: no-store, must-revalidate` (Next.js appends `must-revalidate`). This prevents bfcache storage of admin pages.

---

## 10. Rate Limiting

### Overview

`POST /api/auth/login` is protected by a fixed-window rate limiter scoped **only** to that endpoint. All other APIs (public storefront, catalog, orders, file upload, payment webhooks) are unaffected.

The limiter is in-process (in-memory) and requires no additional infrastructure.

### Behavior

| Scenario | Response |
|----------|----------|
| Under limit — wrong credentials | `401 Unauthorized`, existing safe message |
| Under limit — valid credentials | `200 OK`, JWT issued |
| Limit exceeded (6th+ request within window) | `429 Too Many Requests`, `Retry-After` header, safe JSON body |
| After window resets | Requests accepted again normally |

429 body:

```json
{ "message": "Too many login attempts. Please wait before trying again." }
```

### Configuration Keys (`AdminAuth:RateLimit`)

| Key | Default | Description |
|-----|---------|-------------|
| `AdminAuth:RateLimit:Enabled` | `true` | Set to `false` to disable rate limiting without redeploying code |
| `AdminAuth:RateLimit:PermitLimit` | `5` | Maximum login requests allowed per window per IP |
| `AdminAuth:RateLimit:WindowSeconds` | `60` | Duration of each rate-limit window in seconds |
| `AdminAuth:RateLimit:QueueLimit` | `0` | Number of excess requests to queue (0 = reject immediately) |

Environment variable equivalents (VPS):

```
AdminAuth__RateLimit__Enabled=true
AdminAuth__RateLimit__PermitLimit=5
AdminAuth__RateLimit__WindowSeconds=60
AdminAuth__RateLimit__QueueLimit=0
```

### How Client IP Is Resolved

In the production architecture, login requests flow through the Next.js server before reaching the backend:

```
Browser → Next.js (/api/auth/login) → Backend (POST /api/auth/login)
```

Without forwarding headers, the backend would see the Next.js server's loopback address (`127.0.0.1`) as the client IP, making all login attempts appear to come from the same source and triggering the rate limit prematurely.

To resolve this:

1. **Next.js login route** reads the `x-forwarded-for` or `x-real-ip` header from the incoming browser request and forwards it as `X-Forwarded-For` to the backend.
2. **Backend** runs `UseForwardedHeaders` middleware (before routing and rate limiting) and trusts `127.0.0.1` / `::1` as known proxy addresses. This rewrites `RemoteIpAddress` to the real browser IP before the rate limiter partitions by it.

If you add nginx in front of the backend, ensure nginx passes the forwarded header:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

The nginx IP must also be added to `KnownProxies` in `TeeNovaHttpApiHostModule.cs`, or `ForwardLimit` adjusted accordingly.

### Known Limitations

- **In-memory state**: The rate limit window resets if the backend process restarts. This is acceptable for single-VPS deployment.
- **Multi-instance deployment**: If the backend is ever scaled to multiple instances, migrate to a distributed rate limiter backed by Redis (e.g., `AddRedisRateLimiting`). The `AdminLoginPolicy` name and `[EnableRateLimiting]` attribute require no code changes — only the limiter implementation changes.
- **Shared NAT/IP**: If multiple legitimate users shared a single egress IP (not applicable here — TeeNova has one admin account), they would share the same rate limit window.

### JWT expiry handling

Tokens expire after `Jwt:ExpiryMinutes` (default 480 = 8 hours). When a token expires:
- The backend returns `401`
- Admin page and client component handlers redirect to `/admin/login`
- No "session expired" message is shown

Graceful expiry UX (e.g., showing a toast before redirect) is deferred to Task 8708.
