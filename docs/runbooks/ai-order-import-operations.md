# AI Order Import operations runbook

Owner: TeeNova operations and privacy/security owners
Scope: controlled staging and production operation of Jira 10202–10208
Rule: never paste secrets, customer data, source text, private paths, object keys, prompts, or provider responses into tickets, chat, commands, screenshots, or logs.

## Configuration and safe defaults

All stages are server-authoritative and disabled by default:

```text
AiOrderImport__Enabled=false
AiOrderImport__IntakeEnabled=false
AiOrderImport__RecognitionEnabled=false
AiOrderImport__ReviewEnabled=false
AiOrderImport__ConfirmationEnabled=false
AiOrderImport__MaterializationEnabled=false
AiOrderRetention__WorkerEnabled=false
AiOrderRecognition__Enabled=false
```

Use environment-unique provider credentials supplied through the approved secret store:

```text
AiOrderRecognition__Providers__gemini__ApiKey
AiOrderRecognition__Providers__openai__ApiKey
AiOrderRecognition__Providers__claude__ApiKey
```

Never put a real key in JSON, a command example, Admin input, or source control. Provider/model controls are configuration-only because TeeNova has no approved persistent operational-settings store.

## 1. Initial staging enablement

1. Back up the SQL database and private-storage root.
2. Review the migration SQL without applying it to an uncontrolled target.
3. Apply migrations in this order:

   ```text
   20260730044705_AddAiOrderImportPersistence
   20260730055530_AddAiOrderImportIntakeMetadata
   20260730225513_AddAiOrderRecognitionEvidence
   20260731032528_AddAiOrderConfirmationMaterialization
   20260731042341_AddAiOrderOperationsHardening
   ```

4. Keep all feature stages and both workers disabled.
5. Configure a staging-only private root outside `wwwroot` and every Nginx/static alias. Configure every static mapping as an `AiOrderPrivateStorage__ForbiddenPathPrefixes` entry.
6. Grant the service identity only the required read/write/delete permissions. Deny public/web-server access.
7. Open `/admin/ai-order-imports/operations` as Admin. Confirm environment `Staging`, schema `Ready`, and private storage `Ready`; Viewer and anonymous requests must be rejected.
8. Configure one staging-only provider key, exact approved HTTPS base URL, one model, pricing version, structured-output mode, budgets, document classification, and `ApprovedForSanitizedTesting`.
9. Run an explicitly approved sanitized smoke test. Record only provider/model, time, safe outcome, usage, and cost metadata.
10. Enable `Enabled`, then Intake, Recognition, Review, Confirmation, and Materialization separately. Verify each stage before enabling the next.
11. Enable the retention worker only after hold, eligible deletion, failure retry, and evidence-preservation tests pass.

## 2. Production preflight

1. Confirm staging acceptance is recorded; Jira 10209 owns final release acceptance and training sign-off.
2. Confirm a current database backup and a coordinated private-storage backup exist.
3. Confirm provider credentials are production-unique.
4. Require `ApprovedForProductionCustomerData`, exact `ApprovedEnvironment=Production`, approval date, approver note, provider data-use/retention policy reference, and allowed classification.
5. Confirm base URLs match the approved provider hosts and use HTTPS.
6. Confirm storage readiness, minimum free space, ACLs, encryption, monitoring, backup, restore, and Nginx/static exclusions.
7. Confirm quotas, budget timezone, daily provider calls, monthly provider budgets, total budget, and per-import estimated budget.
8. Confirm retention defaults have written approval. They are operator defaults, not legal conclusions.
9. Confirm all feature flags remain disabled during migration and restart.
10. Run Admin/Viewer/anonymous authorization, sanitized provider, quota, hold, deletion, and no-side-effect checks.
11. Enable stages in a change window with rollback ownership and monitoring.

## 3. Provider key rotation

1. Disable the affected provider; if necessary disable `RecognitionEnabled`.
2. Update the key in the approved environment-specific secret store.
3. Restart or reload the API service.
4. Verify safe provider readiness; no key value must appear.
5. Run one approved sanitized smoke test.
6. Re-enable the provider.
7. Revoke the old key at the provider.
8. Record the operational event in the approved change/audit system without the key.

## 4. Provider suspension

1. Set the provider `Enabled=false` or `PrivacyApprovalStatus=Suspended`.
2. Restart/reload and verify status is `Disabled` or `Suspended`.
3. Do not silently fall back to another provider.
4. Preserve attempts, usage, hashes, safe errors, and audit evidence.
5. Assess queued/failed work and retry only after approval is restored.

## 5. Provider 429 or outage

1. Check safe failure counts, provider status, `Retry-After`, queue depth, and cost—not payloads.
2. Leave automatic retries bounded; do not force immediate loops.
3. Disable the provider if the outage or rate limiting persists.
4. Do not switch provider/model implicitly. An Admin must make a deliberate retry selection.
5. Re-enable after provider recovery and a sanitized smoke test.

## 6. Recognition retry backlog

1. Check active and expired leases, retryable failures, daily calls, and monthly budgets.
2. Confirm recognition is enabled and the exact historical provider/model remains approved.
3. Allow due retries to proceed in bounded batches.
4. Reclaim only expired leases; never replace an active lease.
5. Investigate permanent failures individually. There is no force-success action.

## 7. Private-storage low-space response

1. Disable Intake and Recognition; historical viewing remains available if storage reads still work.
2. Keep the retention worker enabled only if safe deletion can reduce pressure and policy allows it.
3. Verify free space, filesystem health, mount state, permissions, and backup completion outside the Admin UI.
4. Do not expose or copy private paths into tickets.
5. Expand/migrate storage through an approved maintenance procedure, verify hashes, then run the readiness probe.
6. Re-enable stages only after `Ready`.

## 8. Source or raw-evidence deletion failure

1. Check the safe error category and next retry time.
2. Verify storage availability and delete permission.
3. Do not mark metadata deleted unless the physical delete succeeded.
4. Use the explicit retry/manual deletion action with a reason and confirmation only when eligible.
5. Confirm the event records outcome and that source hash/size/upload metadata or provider/model/usage/hash/canonical revision remains.
6. Never delete canonical Staff/Confirmation or financial evidence through this procedure.

## 9. Retention hold

Place:

1. Confirm the import identifier and scope.
2. Provide a non-sensitive operational reason and optional UTC expiry.
3. `POST /api/admin/ai-order-imports/{id}/retention-hold`.
4. Verify the hold is active and automatic source/raw deletion is blocked.

Release:

1. Confirm the release is authorized.
2. Provide a reason.
3. `DELETE /api/admin/ai-order-imports/{id}/retention-hold`.
4. Verify a release event exists. Release makes future eligible cleanup possible; it does not delete immediately.

A hold does not make data public, reopen Confirmed evidence, permit Staff edits, or create an Order side effect.

## 10. Materialization ambiguous network result

1. Do not create a new operation key.
2. Reopen the import and check `FormalOrderId`/preflight.
3. Retry the exact request with the exact materialization operation key.
4. Treat a different key or request hash as a conflict.
5. Never force success or reopen sealed confirmation evidence.

## 11. Duplicate-operation conflict

1. Compare only safe operation metadata.
2. If the retry is exact, reuse the original operation key.
3. If inputs changed, return to the permitted Draft review path before confirmation; never mutate a Confirmed import.
4. Escalate repeated database uniqueness conflicts with safe IDs and constraint category only.

## 12. Database migration and rollback

Preflight:

1. Identify the exact target without printing credentials.
2. Back up SQL and private storage.
3. Review pending migration IDs and generated SQL.
4. Before Jira 10207, verify no existing `Confirmed` imports.
5. Keep all features disabled.

Controlled apply template:

```powershell
dotnet ef database update 20260731042341_AddAiOrderOperationsHardening `
  --project src/TeeNova.EntityFrameworkCore `
  --startup-project src/TeeNova.HttpApi.Host `
  --context TeeNovaDbContext
```

Post-apply: restart, verify operational status, storage, authorization, and sanitized smoke tests before stage enablement.

Rollback:

- Prefer disabling features over schema rollback once real data exists.
- Jira 10208 Down removes operational events and hold/retry detail; export/preserve required audit evidence first.
- Jira 10207 Down intentionally refuses when Ad-hoc OrderItems exist.
- Restore database and matching private-storage backup together when destructive rollback is unavoidable.

## 13. Backup and restore validation

A database-only backup is incomplete while source/raw bytes are retained.

Restore order:

1. restore SQL to an isolated target;
2. restore private source and raw-evidence storage;
3. restore environment-specific provider secrets from the approved secret manager;
4. keep features/workers disabled;
5. sample source metadata and verify object existence and SHA-256;
6. verify import/source and attempt/raw-evidence relationships;
7. verify deletion markers agree with object absence;
8. verify materialized import/Order linkage and operation keys;
9. verify access audit and operational events;
10. enable workers only after retention dates/holds are reviewed.

Do not run destructive automatic repair. Record missing-object/hash mismatches for investigation.

## 14. Privacy incident response

For a wrong route, unexpected provider submission, compromised provider account, unsafe storage permission, excessive retention, unauthorized access, raw-evidence policy breach, or sensitive log entry:

1. disable the relevant stage/provider; disable the whole feature if scope is unknown;
2. preserve access, operational, revision, attempt, and service audit evidence;
3. stop new processing;
4. assess affected imports using safe identifiers;
5. rotate credentials where required;
6. correct route/storage/permission/provider configuration;
7. delete eligible evidence only under approved policy and respecting holds;
8. notify the internal privacy/security owner;
9. review and contain logs/access evidence;
10. document validation and approval before re-enable.

Follow counsel-approved notification procedures. This runbook intentionally states no jurisdiction-specific deadline.

## 15. Disable the entire AI Order feature safely

1. Set every `AiOrderImport` stage flag false.
2. Set `AiOrderRecognition__Enabled=false` and disable providers.
3. Set `AiOrderRetention__WorkerEnabled=false` only if retention processing must also stop; normally privacy cleanup should continue.
4. Restart/reload.
5. Verify the operations page shows every stage Disabled.
6. Confirm historical import/source access still works for authorized Admins.
7. Confirm no processing or materialization begins.
8. Do not delete, unlock, or reopen Confirmed evidence.

## Observability and safe escalation

Allowed telemetry dimensions are bounded: stage, provider, model, outcome, target type, and environment. Never label metrics with import IDs, customer/file names, text, paths, object/operation keys, or credentials.

Allowed log evidence: safe IDs, provider/model, state, duration, byte/page/token counts, attempt number, safe error, retry time, and cost. Use the operations page for current status; it never applies migrations or calls a provider.
