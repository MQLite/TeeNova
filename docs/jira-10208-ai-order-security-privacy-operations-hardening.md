# Jira 10208 — AI Order Import security, privacy, and operations hardening

Date: 2026-07-31
Verdict: **PASS WITH NOTES**

## 1. Executive summary

Jira 10208 adds server-authoritative default-off stage controls, environment/provider privacy readiness, safe secret checks, a private-storage probe, configurable retention classes, expiring legal/privacy holds, bounded source/raw-evidence cleanup, append-only deletion events, quotas/budgets, privacy-safe metrics, an Admin status API/page, and operational runbooks.

The implementation adds one narrow AI-only migration. It does not deploy or apply migrations. It does not add a provider/model or weaken the Jira 10201–10207 evidence boundary. Runtime verification against a controlled migrated database and real provider remains outstanding.

## 2. Jira 10201–10207 requirements consumed

All seven reports were read completely before changes. The implementation preserves:

- the separate import aggregate and Admin-only/private-source boundary;
- immutable AI, Validation, Staff, Confirmation, and materialization evidence;
- exact provider/model selection with no fallback;
- `NeedsReview` after recognition and explicit Staff confirmation;
- Confirmed immutability and exact-retry Order linkage;
- `Pending` materialized Order status;
- no automatic email, online payment, catalogue write, inventory change, production work, or PDF generation.

## 3. Security and operations audit

Material pre-implementation gaps:

- only `AiOrderRecognition:Enabled` existed; Intake, Review, Confirmation, and Materialization had no independent server flags;
- provider configuration had no privacy approval, approved environment/classification, approved-host status, provider daily quota, or provider monthly budget;
- private storage rejected `wwwroot`/reparse paths and used atomic writes, but exposed no safe write/read/delete/free-space readiness result;
- raw cleanup ran inside the recognition worker and ignored import holds; source cleanup did not exist;
- the aggregate had one hold boolean but no reason, actor, expiry, or history;
- deletion evidence lacked actor/reason and durable retry backoff;
- recognition had attempt/global estimated budgets but no per-provider daily/monthly, total actual-or-estimated, concurrent-job, per-import, or raw-evidence capacity rules;
- no migration/provider/storage/queue/cost/deletion status endpoint or operations page existed;
- no AI-specific Meter instruments or complete operational/incident/backup runbook existed.

Positive evidence retained: source-access audit was already minimized to IDs, Admin actor, access type/time, success, and safe failure; source content, IP, user agent, path, and object key were absent. Existing AI logs used safe IDs/counts and did not log prompts, source text, filenames, provider bodies, credentials, or object keys.

No secret-like AI provider values are committed: checked-in provider keys are empty. Existing unrelated credential placeholders/configuration were not modified.

## 4. Feature-flag model

`AiOrderImport` contains:

```text
Enabled=false
IntakeEnabled=false
RecognitionEnabled=false
ReviewEnabled=false
ConfirmationEnabled=false
MaterializationEnabled=false
OperationalStatusVisibleToAdmin=true
```

The controller enforces mutation-stage gates. Historical list/detail/source reads remain available when Intake/Recognition is disabled. Recognition workers stop claiming work when Recognition is disabled. Materialization disablement does not unlock or alter Confirmed evidence.

## 5. Environment separation

.NET environment overlays are supported with checked-in safe examples:

- `appsettings.Development.json.example`
- `appsettings.Staging.json.example`
- `appsettings.Production.json.example`

Staging/production examples keep all stages/workers disabled. The Admin operations page displays the runtime environment. Credentials must be environment-unique and supplied through user-secrets/environment/approved secret management.

## 6. Provider readiness

Gemini, OpenAI, and Claude readiness evaluates:

- master and Recognition stage enabled;
- provider and at least one exact model enabled;
- key present without returning it;
- exact approved HTTPS host;
- valid timeouts/retries through recognition option validation;
- pricing version/rates and provider/global budgets;
- API/structured-output metadata and image/PDF capability;
- privacy approval and exact approved environment;
- last sanitized smoke-test success.

Safe statuses: `Ready`, `Disabled`, `Missing Key`, `No Enabled Model`, `Invalid URL`, `Budget Invalid`, `No Structured Output Model`, `Privacy Approval Missing`, `Suspended`, and `Provider Test Outstanding`.

## 7. Provider privacy approval

Configuration snapshots status (`NotReviewed`, `ApprovedForSanitizedTesting`, `ApprovedForProductionCustomerData`, `Suspended`), approved environment/date, approver note, provider data-use policy reference, allowed document classification, and sanitized smoke metadata.

Sanitized approval is accepted only for the exact non-production environment. Production requires `ApprovedForProductionCustomerData` plus date, policy reference, classification, and exact `Production` environment. Code makes no legal conclusion.

## 8. Secret handling and rotation

Keys remain server-only under `AiOrderRecognition__Providers__{provider}__ApiKey`. They are excluded from DTOs, database evidence, UI, status, metrics, and logs. No plaintext Admin key editor was added.

Rotation procedure is runbook section 3: disable, replace in secret store, restart/reload, verify safe readiness, sanitized smoke, re-enable, revoke old key, record change.

## 9. Private-storage readiness

The probe validates configured root construction, exclusion from `wwwroot` and configured static mappings, reparse components, free-space threshold, safe opaque atomic write/read/delete, and cleanup. On Unix it rejects unsafe other read/write or group write permissions.

It returns only `Ready`, `Missing`, `Permission Denied`, `Unsafe Location`, `Low Space`, `Write Test Failed`, or `Delete Test Failed`, plus free bytes. No physical path/object key is returned. The probe uses an opaque non-customer object and removes it.

Nginx mappings cannot be discovered reliably inside the process; operators must list them under `ForbiddenPathPrefixes` and verify externally.

## 10. Retention-policy model

Configuration supplies all required classes:

| Class | Default days | Byte behavior |
|---|---:|---|
| UploadedAbandoned | 7 | source eligible |
| ProcessingFailed | 30 | source eligible |
| Cancelled | 30 | source eligible |
| NeedsReview | 90 | source eligible |
| Draft | 90 | source eligible |
| ConfirmedUnmaterialized | 180 | source eligible |
| Materialized | 180 | source eligible; payment override |
| RawProviderEvidence | 30 | raw evidence eligible |
| AccessAudit | 365 | bounded relational cleanup |
| CanonicalRevision | 2555 | not deleted |
| ReviewEvent | 2555 | not deleted |
| ConfirmationEvidence | 2555 | not deleted |

These are configurable first-release defaults for operator/legal/privacy review, not universal legal requirements. Every class explicitly preserves relational metadata, canonical revisions, and review evidence.

## 11. Legal/privacy holds

Admin routes:

```text
POST   /api/admin/ai-order-imports/{id}/retention-hold
DELETE /api/admin/ai-order-imports/{id}/retention-hold
```

A hold stores reason, server actor/time, optional UTC expiry, and current state. Place/release events are append-only. An active hold blocks automatic/manual source and raw deletion without reopening/mutating Confirmed evidence or creating an Order side effect.

## 12. Source retention

Current status/formal linkage selects the policy class. Active processing leases, active holds, non-expired retention, and protected payment-linked materialized imports are excluded. Existing hashes, content type, byte count, upload actor/time, IDs, and relationships remain after bytes are deleted.

## 13. Raw-evidence retention

Raw provider evidence uses its own policy/date and is processed independently of source bytes. After deletion, provider/model, output hash, usage, pricing version, safe outcome, and canonical revision attribution remain.

## 14. Retention worker

`AiOrderRetentionWorker` is separate from recognition cleanup. Defaults: disabled, every 60 minutes when enabled, batch 25, maximum run 30 seconds. It processes sources and raw evidence separately, checks cancellation, excludes holds/active leases, uses indexed due/retry fields, uses an in-process overlap gate, and applies exponential retry from 15 minutes capped at 24 hours.

Serializable recognition/intake quota transactions and database unique indexes cover in-process/database races. Multi-node distributed worker election is not present; deployments must run one retention-worker instance until Jira 10209 adds/accepts distributed coordination.

## 15. Deletion evidence

`AiOrderOperationalEvents` records event type, import/source/attempt IDs, Admin or Worker actor type, optional Admin actor, reason, outcome, safe error, time, and retry/expiry time. It contains no filename, customer value, content, path, key, prompt, or provider response.

Physical failure never marks metadata deleted. Repeated physical deletes are idempotent. Successful metadata marking keeps the first deletion timestamp and protected hashes/relationships.

## 16. Manual retention operations

Admin APIs provide summary, extend, hold/release, delete one eligible source, and delete one eligible raw result. Deletion requires `Confirmed=true`, target ID, and reason. Protected evidence and broad import hard-delete are not exposed.

## 17. Access-audit hardening

The existing minimized record is unchanged. Status exposes bounded 24-hour successful/denied counts only. Viewer/public access remains blocked. The retention worker removes bounded access-audit rows after the configured AccessAudit duration.

## 18. Quotas and budgets

Server rules include:

- Admin import/hour and rolling day;
- existing document/import byte and document count limits;
- recognition attempts/import;
- serializable intake/recognition admission transaction;
- concurrent processing attempts;
- daily calls per provider (provider and global caps);
- monthly provider cost;
- monthly total actual-or-estimated cost;
- estimated cost per attempt and per import;
- conservative raw-evidence capacity using maximum bounded response size;
- explicit `BudgetTimeZoneId`.

Idempotent request replay is resolved before quota admission. Every actual provider attempt/retry is a separate row and count. There is no silent fallback or model escalation.

## 19. Operational status API

Admin-only:

```text
GET /api/admin/ai-order-imports/operations/status
```

It returns feature/environment, expected/applied migration IDs, storage/provider/privacy readiness, queue/lease/retry/deletion/hold/access counts, month calls/cost/budget, last retention run, warnings, and blockers. Counts are capped.

It returns no key, auth header, account/customer/source data, filename, path, object key, prompt, raw provider response, or SQL.

## 20. Admin operations UI

Route:

```text
/admin/ai-order-imports/operations
```

The page shows textual Ready/Disabled/Warning/Blocked-style state, environment, migrations/storage, stage flags, provider/privacy state, queue/retention/access counts, and cost. It is read-only because no approved persistent settings system exists.

## 21. Health and readiness

Operational status is an authorized, non-provider-calling readiness surface. Production startup fails closed if an enabled storage-dependent feature is not storage-ready or Recognition has no Ready provider. Disabled defaults permit schema migration/maintenance without enabling processing.

## 22. Metrics and observability

`TeeNova.AiOrderImport` Meter exposes bounded counters for retention outcome, feature block, and provider quota block. Labels are limited to target/outcome, stage, provider, and period. Status gauges are computed safely on request and capped.

## 23. Safe logging

Allowed: safe IDs, provider/model, state, duration, byte/page/token count, attempt, safe error, retry time, cost, deletion outcome.

Forbidden: customer/source text, filename, source bytes, raw provider response, full prompt, review corrections, payment reference, API key/auth header, private key/path, signed URL, or operation key. Changed-content scans and DTO tests enforce critical exclusions.

## 24. Failure recovery

The runbook covers expired leases, 429/outage, provider credentials/suspension, missing storage, failed persistence/deletion, stale catalogue, confirmation/materialization conflicts, ambiguous network results, and low space. There is no force-success action.

## 25. Stuck-work recovery

Existing lease expiry/reclaim remains authoritative. Status reports active and expired/stuck leases. Recognition disablement stops claims without deleting attempts. Exact materialization retry reuses the operation key and cannot mutate sealed evidence.

## 26. Backup and restore

SQL plus private source/raw storage are one recoverability set. Restore order and a sample existence/SHA-256/import/raw/linkage/deletion/access-audit consistency check are documented. Automatic destructive repair is prohibited.

## 27. Migration sequence

Required order:

```text
20260730044705_AddAiOrderImportPersistence
20260730055530_AddAiOrderImportIntakeMetadata
20260730225513_AddAiOrderRecognitionEvidence
20260731032528_AddAiOrderConfirmationMaterialization
20260731042341_AddAiOrderOperationsHardening
```

## 28. Controlled apply plan

Back up DB/storage, verify target, review SQL, check pre-existing Confirmed imports before Jira 10207, keep flags disabled, apply in order, restart, verify status/storage/authorization, run sanitized smoke tests, then decide enablement.

## 29. Rollback strategy

Prefer stage disablement once real data exists. Jira 10208 Down removes operational event/hold/retry evidence and therefore requires evidence preservation first. Jira 10207 Down intentionally fails with Ad-hoc OrderItems. Database/storage restore must use a consistent backup pair.

## 30. Provider outage runbook

See runbook sections 4–6.

## 31. Storage incident runbook

See runbook sections 7–8.

## 32. Privacy incident runbook

See runbook section 14.

## 33. Feature-disable runbook

See runbook section 15. Historical authorized reads remain available; Confirmed evidence stays sealed.

## 34. Migration decision

A narrow migration is justified because the old boolean hold could not persist reason/actor/expiry/history and source/raw records lacked durable retry evidence. It changes only `AiOrderImports`, `AiOrderSourceDocuments`, `AiOrderProcessingAttempts`, and new `AiOrderOperationalEvents`.

Generated SQL was inspected at `C:\Users\admin\AppData\Local\Temp\jira-10208-migration.sql`. It contains only those AI tables/indexes and the migration-history insert. It was not applied.

## 35. Tests and build results

Completed gates:

- Debug backend build: PASS, 0 warnings, 0 errors.
- Release backend build: PASS, 1 pre-existing nullable warning in `ShippingAddress.cs`, 0 errors.
- focused Jira 10208 backend/storage tests: PASS, 25 tests.
- all AI Order Import backend tests: PASS, 208 tests.
- full Debug backend suite: PASS, 895 passed, 6 Linux-only skipped, 0 failed.
- full Release backend suite: PASS, 895 passed, 6 Linux-only skipped, 0 failed.
- focused AI Order Import frontend tests: PASS, 19 tests.
- full frontend suite: PASS, 372 tests across 32 files.
- frontend lint: PASS, 0 warnings/errors.
- frontend type-check: PASS.
- frontend production build: PASS; the operations route is included.
- EF pending-model check: PASS.
- Jira 10208 generated SQL scope inspection: PASS.
- JSON/default-off/key-absence checks: PASS for base, Staging, and Production configuration.
- dangerous logging/telemetry pattern scans: PASS.
- operations UI sensitive-field scan: PASS; its only matches are explanatory text stating that secrets/paths are not shown and that keys must be rotated in the server-side secret store.
- `git diff --check`: PASS; Git emitted only existing LF-to-CRLF normalization notices.

## 36. Responsive verification

The page uses single-column defaults and responsive grid breakpoints without fixed content widths. Automated component/accessibility checks pass. Authenticated live 1440/768/375 runtime checks are outstanding because no controlled migrated Admin environment is available.

## 37. Runtime verification

**OUTSTANDING.** No controlled migrated database, Admin/Viewer credentials, or approved provider credentials/sanitized documents were supplied. No storage permission, provider, or migration readiness is claimed for a deployed environment.

## 38. Changed-file inventory

Jira 10208 adds or modifies exactly these files:

```text
backend/src/TeeNova.Application.Contracts/AiOrderImports/AiOrderImportErrorCodes.cs
backend/src/TeeNova.Application.Contracts/AiOrderImports/Dtos/AiOrderOperationsDtos.cs
backend/src/TeeNova.Application/AiOrderImports/AiOrderImportFoundationService.cs
backend/src/TeeNova.Application/AiOrderImports/AiOrderImportIntakeAppService.cs
backend/src/TeeNova.Application/AiOrderImports/Recognition/AiOrderRecognitionAppService.cs
backend/src/TeeNova.Application/AiOrderImports/Recognition/AiOrderRecognitionOptions.cs
backend/src/TeeNova.Application/AiOrderImports/Recognition/AiOrderRecognitionWorker.cs
backend/src/TeeNova.Application/AiOrderImports/Operations/AiOrderOperationalTelemetry.cs
backend/src/TeeNova.Application/AiOrderImports/Operations/AiOrderOperationsAppService.cs
backend/src/TeeNova.Application/AiOrderImports/Operations/AiOrderOperationsOptions.cs
backend/src/TeeNova.Application/AiOrderImports/Operations/AiOrderProviderReadiness.cs
backend/src/TeeNova.Application/AiOrderImports/Operations/AiOrderRetentionService.cs
backend/src/TeeNova.Application/AiOrderImports/Operations/AiOrderRetentionWorker.cs
backend/src/TeeNova.Application/AiOrderImports/Operations/AiOrderStartupReadinessValidator.cs
backend/src/TeeNova.Application/TeeNovaApplicationModule.cs
backend/src/TeeNova.Domain.Shared/AiOrderImports/AiOrderImportEnums.cs
backend/src/TeeNova.Domain/AiOrderImports/AiOrderImport.cs
backend/src/TeeNova.Domain/AiOrderImports/AiOrderOperationalEvent.cs
backend/src/TeeNova.Domain/AiOrderImports/AiOrderProcessingAttempt.cs
backend/src/TeeNova.Domain/AiOrderImports/AiOrderSourceDocument.cs
backend/src/TeeNova.Domain/AiOrderImports/IAiOrderMigrationReadinessProbe.cs
backend/src/TeeNova.Domain/AiOrderImports/PrivateStorage/IPrivateObjectStorage.cs
backend/src/TeeNova.Domain/AiOrderImports/PrivateStorage/LocalPrivateObjectStorage.cs
backend/src/TeeNova.Domain/AiOrderImports/PrivateStorage/PrivateObjectStorageOptions.cs
backend/src/TeeNova.EntityFrameworkCore/AiOrderImports/AiOrderImportEntityTypeConfiguration.cs
backend/src/TeeNova.EntityFrameworkCore/AiOrderImports/AiOrderMigrationReadinessProbe.cs
backend/src/TeeNova.EntityFrameworkCore/Migrations/20260731042341_AddAiOrderOperationsHardening.cs
backend/src/TeeNova.EntityFrameworkCore/Migrations/20260731042341_AddAiOrderOperationsHardening.Designer.cs
backend/src/TeeNova.EntityFrameworkCore/Migrations/TeeNovaDbContextModelSnapshot.cs
backend/src/TeeNova.EntityFrameworkCore/TeeNovaDbContext.cs
backend/src/TeeNova.HttpApi.Host/TeeNovaHttpApiHostModule.cs
backend/src/TeeNova.HttpApi.Host/appsettings.json
backend/src/TeeNova.HttpApi.Host/appsettings.Staging.json.example
backend/src/TeeNova.HttpApi.Host/appsettings.Production.json.example
backend/src/TeeNova.HttpApi/AiOrderImports/AiOrderImportsController.cs
backend/test/TeeNova.Application.Tests/AiOrderImports/AiOrderOperationsHardeningTests.cs
backend/test/TeeNova.Application.Tests/AiOrderImports/LocalPrivateObjectStorageTests.cs
frontend/src/api/ai-order-imports.ts
frontend/src/app/admin/ai-order-imports/AiOrderImportListClient.test.tsx
frontend/src/app/admin/ai-order-imports/AiOrderImportListClient.tsx
frontend/src/app/admin/ai-order-imports/[id]/AiOrderImportIntakeClient.test.tsx
frontend/src/app/admin/ai-order-imports/[id]/AiOrderImportIntakeClient.tsx
frontend/src/app/admin/ai-order-imports/operations/AiOrderOperationsClient.test.tsx
frontend/src/app/admin/ai-order-imports/operations/AiOrderOperationsClient.tsx
frontend/src/app/admin/ai-order-imports/operations/page.tsx
frontend/src/components/admin/AdminSidebar.tsx
docs/jira-10208-ai-order-security-privacy-operations-hardening.md
docs/runbooks/ai-order-import-operations.md
```

The worktree also contains pre-existing Jira 10207 changes and additions. They were preserved, and `.gitignore` was not changed.

## 39. No-side-effect verification

Retention/status services have no email, online-payment, inventory, production, PDF, catalogue-write, or `OrderAppService` dependency. The only Order-area dependency is read-only payment-footprint detection used to prevent deletion. The migration touches no downstream business table.

## 40. Known limitations

- No controlled database/provider/runtime acceptance was available.
- Multi-node distributed retention-worker election is not implemented; operate one retention-worker instance pending Jira 10209.
- Raw-evidence capacity is conservative because the existing attempt schema stores no raw byte count.
- Nginx/static mappings require explicit configuration/external verification.
- No persistent runtime provider/model toggle is added because the repository lacks an approved secure settings store.
- `docs/` is ignored by the existing repository rule; `.gitignore` was not modified.

## 41. Deferred Jira 10209 work

Final migrated end-to-end acceptance, multi-node concurrency/election matrix, performance/load, live viewport evidence, rollout acceptance, monitoring integration/exporter choice, and operator training sign-off remain Jira 10209.

## 42. Operator actions

Review/approve retention defaults, privacy metadata, provider accounts/models/prices, budgets/timezone, private root/ACL/static exclusions, backups/restores, migration SQL/target, and the runbook. Apply migrations only to a controlled target, then execute the runtime matrix before enabling stages.

## 43. Final verdict

**PASS WITH NOTES**

The implementation is code-ready for controlled migration and runtime acceptance. The notes are the unapplied migrations, unavailable controlled runtime/provider evidence, explicit single-worker multi-node constraint, and Jira 10209 release gate.
