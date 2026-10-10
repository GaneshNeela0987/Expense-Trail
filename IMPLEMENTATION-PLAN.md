# Expense Manager — End-to-End Implementation Procedure

## 1. Purpose

This document turns [`expense-app-requirements-v0.3.md`](./expense-app-requirements-v0.3.md) into a practical, ordered engineering procedure for building the Android application. The requirements document remains the product source of truth; this procedure explains how to implement and verify it.

The product goal is a privacy-first, offline Android expense tracker that reads recognized bank and card SMS, builds accurate transactions, and helps the user understand spending. Financial data must remain on the device.

## 2. Product boundaries and engineering principles

### In scope

- Android-only, sideloaded APK.
- React Native bare CLI with TypeScript and a small Kotlin native SMS module.
- Offline parsing, categorization, storage, reporting, and insights.
- MVP features in Section 14 of the requirements, followed by the explicitly prioritized v1.1 and later scope.

### Out of scope

- iOS, cloud services, user accounts, advertising, telemetry, analytics, crash-reporting SDKs, and OTA updates.
- Network-dependent processing or external AI.
- Features marked **Could** or **Later** until the MVP and v1.1 work is complete and explicitly reprioritized.

### Non-negotiable principles

1. **Privacy by design:** collect only what is needed, discard unrecognized SMS before they cross the native boundary, and never retain raw SMS after parsing.
2. **Correct financial semantics:** distinguish spending from income, transfers, refunds, reversals, failures, and duplicates. Transfers do not count as spend; refunds reduce actual spend.
3. **Reliability:** SMS processing is idempotent, database changes are transactional, and background failures are recoverable through a durable encrypted queue.
4. **Testability:** keep domain logic in plain TypeScript without React Native dependencies; test it with synthetic fixtures.
5. **Traceability:** link requirements to implementation and tests; treat the requirements document as authoritative where wording differs.
6. **Small, reviewable changes:** implement one vertical slice at a time, keep builds and tests green, and avoid unrelated changes.

## 3. Definition of a completed engineering task

Before considering a task complete:

- The relevant requirement IDs and expected behavior are known.
- Input validation, error states, and privacy implications are considered.
- The smallest relevant automated tests pass; new behavior has regression coverage.
- Type checking, linting, formatting, and the relevant Android build pass.
- UI behavior is accessible and handles loading, empty, and failure states where applicable.
- Database changes have migrations and recovery implications are addressed.
- Documentation and the checkpoint log reflect meaningful decisions or completed gates.
- No real SMS, credentials, encryption keys, keystores, or personal transaction data have been added to source control.

## 4. Phase 0 — Establish the baseline and resolve prerequisites

### Procedure

1. Inspect the existing repository before generating or replacing files. Record the current branch/worktree state and preserve unrelated changes.
2. Confirm the development environment: supported React Native toolchain, Android Studio/SDK, JDK 17, emulator or test device, Node package manager, and available Android build commands.
3. Decide and record the target Android SDK/minimum supported Android version and React Native version. Verify each native dependency against those versions.
4. Create a requirement traceability table or issue set mapping requirement IDs to phase, code area, and verification.
5. Resolve or time-box the open questions from requirements Section 16:
   - Obtain sanitized, synthetic or anonymized examples for Axis, Kotak, and Jupiter transaction message formats.
   - Run the three SMS/background/Keystore technical spikes in Phase 1.
   - Choose the notification library only when starting notification work; confirm maintenance and compatibility then.
   - Decide the first-import date range and document the default and user override.
6. Establish coding conventions, formatter/linter/type-check scripts, test scripts, and a repeatable Android debug build before feature work.

### Exit gate

- A clean baseline app can be built and launched on the target Android environment.
- Required tools and supported platform versions are documented.
- Unresolved decisions have owners or explicit time-boxed investigation tasks.
- No technology choice contradicts the offline/privacy constraints.

## 5. Phase 1 — Prove native SMS feasibility before building product features

This is a risk-reduction spike, not a feature-complete implementation. Keep spike code isolated and record device/OS versions, steps, results, limitations, and a decision.

### Procedure

1. **Broadcast/background execution:** verify how an incoming SMS `BroadcastReceiver` can start processing under the target Android versions. Test the Headless JS path and the encrypted fallback queue when JS startup or database access fails.
2. **Sideload permission flow:** verify SMS permission behavior on supported Android versions, including restricted-settings flows where applicable. Define precise onboarding instructions and denial/retry behavior.
3. **Background key access:** verify that background processing can obtain the database key from Android Keystore without a biometric prompt, while UI app lock remains enforced separately.
4. Verify native sender filtering before data crosses into JavaScript. Unrecognized messages must be dropped, not queued or logged.
5. Confirm the native bridge can expose permission requests, history import with a date boundary and progress, and a new-message subscription.
6. Exercise interruption and recovery: process death during import, app closed on message arrival, permission revoked, and fallback queue drain on next launch.

### Exit gate

- Each risk has a reproducible test result and an accepted implementation decision.
- The no-loss behavior is demonstrated: successful processing or durable encrypted queueing followed by eventual drain.
- No unresolved platform limitation makes a Must requirement infeasible. If a limitation exists, stop and revise scope explicitly rather than silently weakening it.

## 6. Phase 2 — Set up architecture, quality gates, and privacy controls

### Procedure

1. Set up the architecture boundaries:
   - **Presentation:** navigation, screens, shared UI, and view state.
   - **Domain:** pure TypeScript transaction rules and analytics.
   - **Data:** encrypted SQLite access, schema, migrations, and repositories.
   - **Native:** Kotlin SMS capture/import, sender allowlist, Headless JS integration, and encrypted fallback queue.
2. Establish the proposed `src/` layout in requirements Section 11, adjusting only when there is a documented reason.
3. Configure TypeScript strictness, ESLint, Prettier, Jest, React Native Testing Library, and Android build validation.
4. Add privacy-safe logging rules. Never log SMS bodies, account numbers, card numbers, database keys, backup keys, or transaction details.
5. Configure Android manifest/build variants:
   - Release merged manifest must not contain `INTERNET`.
   - Debug-only network permission, if needed for Metro, must not leak into release.
   - Disable Android auto-backup and configure data-extraction rules.
   - Exclude prohibited analytics, crash reporting, cloud, and OTA dependencies.
6. Add a release/privacy verification script or documented repeatable checks for the merged manifest and built APK.

### Exit gate

- Architecture boundaries are enforced by imports and review conventions.
- Automated quality commands work on a clean checkout.
- Release privacy checks can detect an accidentally introduced network permission or prohibited dependency.
- Debug and release configurations are demonstrably distinct.

## 7. Phase 3 — Define transaction semantics, schema, and persistence

### Procedure

1. Convert the draft model in requirements Section 12 into typed domain entities and a normalized relational schema.
2. Before committing the schema, explicitly design and review:
   - Transaction types and lifecycle/status values.
   - Account/card identity and optional card-cycle fields.
   - Refund, reversal, transfer, credit-card payment, and duplicate relationships.
   - Multiple links per transaction and link confidence; avoid relying on a single linked-transaction field where one-to-many relationships are possible.
   - Stable identifiers, unique constraints, indexes, timestamps, currency/amount representation, and deletion behavior.
   - Whether raw SMS hashes are salted/keyed or otherwise scoped to avoid unnecessary cross-dataset correlation.
3. Use integer minor units for money (for INR, paise) or another explicitly justified exact representation; never use binary floating point as the source of truth for persisted currency.
4. Define schema migrations and a migration test strategy before adding data-dependent screens.
5. Configure SQLCipher and key storage. Ensure key generation, access, rotation/recovery expectations, and failure states are explicit; do not silently create an inaccessible replacement database if key retrieval fails.
6. Build repositories with parameterized queries, transaction boundaries, validated inputs, and typed results/errors.
7. Add database tests for migrations, constraints, encrypted open/close, rollback, indexes, and representative repository operations.

### Exit gate

- Schema represents every transaction relationship required for correct totals.
- Migrations can create and upgrade the database safely in tests.
- Money calculations are exact and persisted data is encrypted at rest.
- Key and database failures surface actionable errors without data loss or unsafe fallback.

## 8. Phase 4 — Implement and verify the pure TypeScript transaction domain

Implement small deterministic functions and explicit types. Keep platform, database, and UI dependencies out of this layer.

### Procedure

1. Create SMS classification for expense, refund/credit, income, transfer, failed, reversed, OTP, promotional, balance-only, and unknown messages.
2. Add recognized-sender metadata and bank-specific parser interfaces. Start with separate Axis, Kotak, and Jupiter parsers; do not build one opaque bank-specific regex collection.
3. Parse amount, type, merchant, account/card last four, timestamp, payment mode, reference number, optional balance, and confidence where available.
4. Normalize merchant names through deterministic rules and user overrides.
5. Implement idempotent deduplication using available reference, amount, account/card suffix, normalized merchant, payment mode, bank, and a documented timestamp window. Test near-collisions and repeated imports.
6. Link purchases with refunds/reversals and identify bank-to-bank and bank-to-card payments. Do not count failed, reversed, duplicate, or internal-transfer records as expenses.
7. Implement categorization defaults, merchant rules, and the correction-learning behavior.
8. Define confidence thresholds. In the current product decision, automatically confirm only clearly classified expense, income, or refund messages with exactly one safe transaction amount; exclude ambiguous/unknown results from totals and do not guess silently. Add a review workflow before retaining uncertain records for user action.
9. Add synthetic Jest fixtures for every bank and transaction class, including malformed, partial, reordered, duplicate, locale/format variation, and non-transaction messages.

### Exit gate

- Each parser and classifier has unit tests with synthetic fixtures and expected structured results.
- Reprocessing the same inputs is idempotent.
- Transfer, refund, reversal, duplicate, and failure cases have explicit tested effects on spend totals.
- Only eligible, clearly parsed transactions can affect totals; ambiguous and ignored messages never become financial facts or enter totals.

## 9. Phase 5 — Implement the native SMS module and import pipeline

### Procedure

1. Implement the Kotlin `SmsReceiver`, `SmsInboxReader`, and React Native module API specified by N1–N7.
2. Apply the recognized-sender allowlist natively before forwarding any candidate to JavaScript.
3. Keep raw message text transient: pass only the minimum needed for parsing and persist a message hash plus structured result, not the raw body.
4. Import history in bounded batches on a background thread; expose stable progress, cancellation/retry behavior, and the selected date range.
5. Make import and live receive use the same idempotent domain/data pipeline.
6. Persist recoverable candidates in encrypted Android storage when background processing cannot complete, then drain safely on app startup. Define acknowledgement/removal only after successful durable processing.
7. Ensure receiver work respects Android execution limits; use the spike decision and platform-appropriate scheduling/Headless JS approach.
8. Test permission granted/denied/revoked, unrecognized senders, app foreground/background/closed, queue failure and recovery, import interruption, and repeated import.

### Exit gate

- Permission, historical import, and live receive work on supported Android versions.
- Closed-app receipt results in processing or durable encrypted queueing without message loss.
- The sender allowlist and raw-SMS retention requirements are verified.
- A synthetic import of approximately 5,000 messages completes without blocking the UI; progress and recovery work.

## 10. Phase 6 — Build the MVP vertical slices

Build in end-to-end slices, with each slice including domain logic, persistence, UI, tests, and error/empty states.

### 6.1 Onboarding and privacy setup

- Explain local-only processing and SMS permission, including sideload restricted-settings steps when applicable.
- Request permissions contextually; handle denial and later retry.
- Select the import range and show import progress.
- Configure app lock and privacy protections.

### 6.2 Accounts and transactions

- Add/edit bank accounts and cards (bank, nickname, last four).
- Provide transaction list/detail, manual add/edit/delete, source labeling, and Needs Review.
- Make corrections persist and teach future merchant categorization rules.
- Clearly show transaction type, account, confidence/review state, and linked records.

### 6.3 Dashboard, reports, and search

- Implement monthly summary, top categories/merchants, prior-month comparison, and actual spend excluding transfers and appropriately accounting for refunds.
- Add category pie charts and spending-over-time charts for required periods.
- Add date/category/account/merchant/amount search and filters, including normalized merchant search.
- Query and aggregate in SQL where appropriate; use indexed queries and virtualized lists.

### 6.4 Privacy and app safety

- Implement biometric/PIN lock and auto-lock behavior.
- Hide sensitive recent-app content with `FLAG_SECURE`.
- Verify backup disabled and release manifest requirements.
- Make privacy settings/status visible and accurate.

### Exit gate

- All MVP rows in requirements Section 14 and MVP Definition of Done are implemented and checked against their requirement IDs.
- Core transaction totals agree with hand-verified synthetic scenarios.
- Navigation, forms, loading, empty, permission-denied, and error states are usable and accessible.
- Domain, persistence, native integration, and UI tests cover the principal data flow.

## 11. Phase 7 — Performance, reliability, and release hardening

### Procedure

1. Profile representative low/mid-range Android hardware with 5,000-message import and 10,000+ transactions.
2. Keep list rendering virtualized; inspect query plans and add or adjust indexes based on measured access patterns.
3. Measure new-SMS processing against the one-second normal-condition target and record the device/test conditions.
4. Test termination during SMS handling, import, and database writes; verify transactional rollback and queue recovery.
5. Perform a privacy review of source, dependency tree, Android manifests, native logs, crash output, and release artifact.
6. Build a release APK and verify:
   - `aapt dump permissions app-release.apk` does not list `INTERNET`.
   - Merged release manifest has backup disabled and appropriate data-extraction rules.
   - No analytics, telemetry, cloud, ads, or OTA update SDK is present.
   - APK installs and core offline flows work with network unavailable.
7. Exercise encrypted export/restore only when implementing v1.1; verify wrong-key and corrupted-file failure paths before release of that feature.
8. Document build/install/update steps for a sideloaded APK and a user-facing data safety/recovery process.

### Exit gate

- MVP Definition of Done is fully verified on a release build.
- Performance targets are measured, not assumed.
- Privacy and recovery checks pass on the built artifact, not only in source configuration.
- Known limitations and supported Android versions are documented.

## 12. Phase 8 — v1.1 and later scope

Only begin after the MVP gate is complete, or after an explicit product decision changes the sequence. Use the same vertical-slice and verification discipline.

### v1.1 candidates (requirements priority governs order)

- Card limits, statement/due dates, utilization, and local reminders.
- Custom categories, cash-flow reporting, report filters, trends, and richer transaction filters.
- Spending-change explanations, unusual-spend analysis, and recurring payments.
- Budgets and alerts.
- Financial calendar.
- Rule-based offline natural-language search.
- Financial health snapshot with explanations, not a numeric credit/financial score.
- CSV export and user-managed encrypted backup/restore.
- Remaining privacy requirements P13–P17.

### Later / Could

Notes/tags, widgets, UPI notification listener, cross-source deduplication, and local ML remain deferred unless explicitly reprioritized. They must preserve the offline/privacy boundary.

## 13. Quality strategy

Use a layered test strategy:

1. **Unit tests:** classifiers, parsers, merchant normalization, deduplication, linking, categorization, money arithmetic, report aggregates, and insights.
2. **Persistence tests:** migrations, repository contracts, unique constraints, transaction rollback, encryption integration, and query behavior.
3. **Native tests / device checks:** sender filtering, permission behavior, receiver/background operation, batching, queue durability, and lifecycle recovery.
4. **Component tests:** forms, lists, review actions, charts' data states, permissions, and privacy-related UI behavior.
5. **End-to-end tests:** onboarding → import → review/correction → dashboard/report/search; closed-app SMS → queue/process → transaction.
6. **Non-functional checks:** import time, SMS processing time, large-list responsiveness, offline behavior, and release permission/dependency audits.

Every bug fix should add a regression test at the narrowest layer that can reproduce the failure. Use synthetic or anonymized financial data only.

## 14. Change control and requirement traceability

- Reference requirement IDs in work items and, where practical, test names (for example `F4`, `N6`, `P18`).
- A change to a Must requirement, privacy boundary, transaction accounting rule, or phase priority requires an explicit documented decision before implementation.
- Do not treat an open question as a settled requirement. Record its decision, rationale, impact, and date in [`PROJECT-CHECKPOINTS.md`](./PROJECT-CHECKPOINTS.md).
- When implementation and requirements appear inconsistent, stop and reconcile them; do not silently choose one.
- Update the checkpoint file at phase gates, major decisions, blockers, or meaningful handoffs—not after every small code edit.

## 15. Source requirement map

| Implementation concern | Requirements sections |
|---|---|
| Product goals, platform, privacy boundaries | 1–3 |
| Feature behavior and priority | 4 |
| Transaction relationships, lifecycle, and deduplication | 5 |
| SMS processing pipeline | 6 |
| Kotlin bridge and background risks | 7 |
| Privacy/security | 8, 15 |
| Performance/reliability | 9 |
| Stack and architecture | 10–11 |
| Data and screens | 12–13 |
| Release scope and acceptance criteria | 14, 17 |
| Decisions and unresolved questions | 16 |
| Product vision | 18 |
