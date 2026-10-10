# Expense Manager — Project Checkpoints

## 1. Why this file exists

Use this file to preserve project context between work sessions and keep implementation aligned with the product goal. It is an execution log and handoff aid, not a replacement for the requirements or implementation procedure.

## 2. Authority and alignment

1. **Product behavior and priority:** [`expense-app-requirements-v0.3.md`](./expense-app-requirements-v0.3.md).
2. **Engineering sequence and quality gates:** [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md).
3. **Current verified project state and decisions:** this file, updated only with observed facts.

When documents conflict, stop and reconcile them. Do not quietly invent requirements or expand scope.

## 3. North-star goal

Deliver an Android-only, sideloaded, privacy-first expense tracker that processes recognized bank/card SMS on-device, produces accurate transaction history and spending insights, and keeps the user's financial data encrypted and offline.

### Guardrails that must remain true

- No cloud backend, login, analytics, telemetry, ads, or OTA update service.
- Release APK must not declare `INTERNET`.
- Unrecognized SMS are dropped natively and never stored.
- Raw SMS is transient; persist a hash and parsed structured data, not the raw message.
- Transfers do not inflate spending; refunds reduce actual spend; failures, reversals, and duplicates are handled intentionally.
- SMS processing is idempotent and recoverable after background/app failures.
- Use synthetic or anonymized test data only.
- Do not add real SMS, account/card details, encryption keys, keystores, or personal transaction data to version control.

## 4. Current project status

**Status: Dashboard, Analytics, Chat, sender settings, paginated historical import, broader deterministic parsing, encrypted structured transaction storage, one-time automatic history import, and background live-queue processing are implemented in source. Latest verified device import scanned 1,103 allowed-sender messages; earlier counts reflect the prior parser build. The confirmed rebuild-and-re-import flow remains unrun. The temporary debug preview can expose unclear SMS on-device only and clears on dismissal/background. A standalone release APK build and its no-Metro verification are in progress; do not claim offline/realtime behavior is device-verified until that build and device checks complete. No SMS body or transaction amount was copied into this checkpoint.**

The bare React Native app is under [`expense-app/`](./expense-app/). Node/npm, JDK 17.0.12, Android SDK/ADB are available. The connected Nothing AIN065 phone runs Android 16/API 36 and has `READ_SMS`/`RECEIVE_SMS` granted. A native Kotlin SMS receiver stores only exact-allowlisted messages in a Keystore AES-GCM encrypted queue; JavaScript receives queue IDs/counts, not bodies, until the pipeline drains them.

### Phase board

| Phase | Status | Evidence / next action |
|---|---|---|
| 0. Baseline and prerequisites | In progress | Debug APK has been built and installed. A standalone release APK with embedded JavaScript is being built and must be installed/started without ADB reverse or Metro to verify laptop-independent launch. |
| 1. Native SMS feasibility spikes | In progress | Sender filter, AES-GCM queue, registered Headless JS processing service, and retry-on-app-resume are implemented. Real incoming SMS/background and closed-app reliability still require on-device test. |
| 2. Architecture and quality gates | In progress | 13 Jest suites / 100 tests, typecheck, lint, privacy checks passed; verify bundled release manifest/APK and no-Metro launch before marking complete. |
| 3. Schema and persistence | In progress | Exact paise parsing, confirmed-only summaries, AES-GCM encrypted structured transaction storage, and atomic ledger-replacement/pending-queue clearing are implemented. This JSON-backed store is temporary; SQLCipher schema, migrations, repository boundaries, and a review/edit workflow remain. |
| 4. Pure TypeScript domain | In progress | Broadened deterministic classification for common bank/UPI debit, credit, refund, failure, reversal, and transfer wording; supports INR/Rs/₹ amounts, balance exclusion, merchant/category inference, and safe handling of competing rules. Synthetic coverage passes; bank templates and transaction linking remain. |
| 5. Native SMS and import | In progress | Kotlin receiver starts an unexported Headless JS service for exact-allowlisted, encrypted queued SMS. App startup imports paginated allowlisted inbox history once and re-runs after sender-list changes; retries are fingerprint-idempotent. Release build and real background SMS delivery remain to be verified on-device. |
| 6. MVP vertical slices | In progress | Dashboard debit/credit tabs, analytics Month/Week/Day ranges, all-history transactions, and offline Chat use the local encrypted ledger. Latest UI was previously verified on-device; release mode and live message flow remain unverified. |
| 7. Hardening and release | Not started | Measure performance and verify privacy on the release APK. |
| 8. v1.1 and later | Deferred | Start only after MVP gate or an explicit reprioritization decision. |

Update the table only after inspecting evidence. Mark a phase **In progress**, **Blocked**, **Complete**, or **Deferred** and include a concise evidence/next-action note.

## 5. Decisions and unresolved questions

### Confirmed by requirements

- Bare React Native + TypeScript, Android only, and custom Kotlin SMS module.
- Sideloaded APK; Google Play is not a target.
- Offline parsing, categorization, analytics, and insights.
- No release internet permission, cloud, login, analytics, crash reporting, telemetry, ads, or OTA updates.
- Primary initial senders/banks: Axis, Kotak, Jupiter; design for additional parsers.
- Transfers are excluded from spend; refunds reduce spend while preserving original category.
- Start with explanatory insights rather than a numeric financial health score.
- Support calendar-month and credit-card statement-cycle views.
- MVP/v1.1/later scope is defined in requirements Section 14.

### Open; do not assume a decision

| Question | Current state | Resolution checkpoint |
|---|---|---|
| Sanitized sample SMS formats for Axis, Kotak, Jupiter, including edge cases | Open | Before parser acceptance; use synthetic or anonymized fixtures. |
| Headless JS from receiver under target Android background limits | Open | Phase 1 device/OS spike. |
| Sideload SMS permission and restricted-settings onboarding behavior | Open | Phase 1 device/OS spike. |
| Background access to Keystore-protected DB key without biometric prompt | Open | Phase 1 spike; UI lock remains separate. |
| Default history-import date range | Open | Decide before finalizing onboarding; allow user selection. |
| Local notification library | Open | Decide when v1.1 notification work begins, after compatibility/maintenance review. |
| Target/minimum Android and React Native versions | Not yet verified | Determine in Phase 0 and document compatibility. |
| Final relationship/schema details (one-to-many links, dedup identity, etc.) | Draft only | Review in Phase 3 before migration/schema is treated as stable. |
| JDK command-line configuration | JDK 17.0.12 installed at `C:\Program Files\Java\jdk-17`; global PATH and `JAVA_HOME` are unset | Per-terminal environment setup is documented in `expense-app/README.md`; optionally configure Windows user environment variables to avoid repeating it. |
| Windows native build path length | Full workspace path causes Ninja's 260-character filename failure | Use the temporary `P:` mapping documented in `expense-app/README.md`, or move the project to a shorter path in a separately coordinated change. |
| Application ID `com.expensemanager` | Scaffold placeholder | Confirm/change before distributing APK outside local development. |
| Android 16 SMS permission flow | `READ_SMS` and `RECEIVE_SMS` currently report granted | Permission grant is verified. The count-only probe queried sender addresses for the exact allowlist; no message bodies were read. Ensure future inbox/receiver work remains sender-filtered and explicitly user controlled. |

## 6. Scope discipline

- **First objective:** MVP only, as specified in requirements Sections 14 and 17.
- **Do not pull forward:** Should/Could/Later features solely because they are listed in the requirements.
- Do not begin UI-heavy reporting before transaction semantics, persistence, and the SMS pipeline can support correct totals.
- Follow the current user-approved import policy: auto-confirm only clearly classified expense/income/refund records with one safe amount; exclude ambiguous or low-confidence messages from the ledger and totals until a review workflow exists.
- Do not weaken privacy or reliability requirements to bypass a technical spike. Document the limitation and request a product decision.
- A scope change must record the affected requirement IDs, reason, risks, and new acceptance checks.

## 7. Checkpoint update protocol

At a phase boundary, major decision, blocker, or handoff:

1. Record what was actually changed or verified, with paths, commands, and test/build results where useful.
2. Update the phase board status and the next concrete action.
3. Record decisions separately from assumptions; include rationale and affected requirements.
4. Preserve open issues and risks instead of converting them into implied decisions.
5. List relevant uncommitted changes and avoid reverting work that belongs to someone else.
6. Keep the entry short, factual, and sufficient for a fresh session to continue without rereading the entire history.

### Handoff template

Copy and fill this block for a meaningful checkpoint:

```text
### Checkpoint: <short title>
- Phase/status:
- Verified outcome:
- Evidence: <files, commands, tests, build/device result>
- Requirement IDs:
- Decisions made (with rationale):
- Open questions / risks:
- Next action:
- Uncommitted work or coordination notes:
```

## 8. Checkpoint history

### Planning baseline

- **Phase/status:** Phase 0 pending; implementation not verified.
- **Verified outcome:** Read requirements v0.3 and created the end-to-end procedure and this context/checkpoint guide.
- **Evidence:** `expense-app-requirements-v0.3.md`, `IMPLEMENTATION-PLAN.md`, `PROJECT-CHECKPOINTS.md`.
- **Requirement IDs:** Planning covers the full requirements set; no application behavior has been claimed as implemented.
- **Decisions made:** None beyond decisions already stated in the requirements.
- **Open questions / risks:** All items in Section 5 remain open pending repository inspection and technical spikes.
- **Next action:** Inspect the actual application/repository and development environment, then complete Phase 0 baseline checks.

### React Native foundation

- **Phase/status:** Phases 0, 2, 3, and 4 in progress; Phase 1 blocked on Android tooling/device.
- **Verified outcome:** Created a bare React Native 0.87.1 app in `expense-app/`; implemented exact INR-to-paise parsing/formatting and net-spend calculations that exclude income, transfers, duplicates, failed, and reversed transactions and subtract refunds. Release/main manifest no longer declares `INTERNET`; debug manifest retains it for Metro. Android backup is disabled and explicit full-backup/data-extraction exclusions are configured.
- **Evidence:** `npm test` — 3 suites / 24 tests passed; `npm run typecheck` passed; `npm run lint` passed; `npm run check:privacy` passed.
- **Requirement IDs:** F5, F6, F12, F15, F33, P1, P7, P18 foundations. Native behavior and release APK requirements are not yet verified.
- **Decisions made:** React Native CLI 20.2.0 scaffold with React Native 0.87.1; package/application ID `com.expensemanager` is a local placeholder.
- **Open questions / risks:** Android build cannot currently run because Android SDK/ADB are unavailable and JDK environment variables are unset. Bank parser patterns remain intentionally unimplemented pending sanitized sample SMS. Transaction persistence/encryption and the SMS technical spikes are still outstanding.
- **Next action:** Configure JDK 17, install Android SDK/ADB, connect the personal phone with USB debugging, then build the Android baseline and perform Phase 1 SMS/Keystore spikes before implementing the parser and persistent transaction pipeline.

### Android device setup update

- **Phase/status:** Phase 0 complete; Phase 1 in progress.
- **Verified outcome:** JDK executable reports Java 17.0.12 at `C:\Program Files\Java\jdk-17`. Android Studio SDK is at `C:\Users\Manogna\AppData\Local\Android\Sdk`. ADB reports the connected phone as authorized (`device`). Gradle installed NDK 27.1.12297006 and Build Tools 37.0.0. The debug APK built successfully using a temporary `P:` mapping, installed on the phone, and launched; Metro completed a JS bundle and Android reports `com.expensemanager/.MainActivity` resumed.
- **Evidence:** `:app:assembleDebug` — `BUILD SUCCESSFUL`; `adb devices -l`; `adb install -r` — Success; `adb reverse tcp:8081 tcp:8081`; app activity status via `dumpsys activity`; Metro bundle output.
- **Requirement IDs:** Android development prerequisite for N1–N7 and release verification P18.
- **Decisions made:** Use the personal Android phone as the physical test device; no emulator is needed if the USB connection works.
- **Open questions / risks:** `JAVA_HOME` and SDK variables are not configured globally, so terminals need the documented per-window setup. The full workspace path triggers a Windows Ninja 260-character failure without the temporary drive mapping. The running app is still the default React Native starter screen, not the product UI.
- **Next action:** Begin Phase 1 SMS feasibility spikes on the connected device; keep using the run instructions in `expense-app/README.md`. Implement product UI only after the native SMS/background constraints are understood.

### SMS permission setup screen

- **Phase/status:** Phase 1 in progress.
- **Verified outcome:** Replaced the React Native starter content with a privacy-oriented setup screen. It checks current `READ_SMS` and `RECEIVE_SMS` grant states and requests both only after a user taps Continue. The screen explicitly states that this check does not read/process/store messages. Added the permissions to the main Android manifest. After correcting the missing ADB reverse tunnel, the app rendered the intended screen; Android now reports both permissions granted. Added pure TypeScript classification rules and merchant normalization with synthetic fixture tests.
- **Evidence:** `npm test` — 5 suites / 45 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed; `:app:installDebug` succeeded on device `AIN065 - 16`; launcher activity verified resumed; `uiautomator` showed the intended screen; `dumpsys package` reports `READ_SMS: granted=true` and `RECEIVE_SMS: granted=true`. `adb reverse tcp:8081 tcp:8081` restored Metro connectivity. No SMS content was queried.
- **Requirement IDs:** F10, F11, F25–F27, N1, N2, N4, P11, P12 groundwork; runtime permission grants are verified, but sender filtering, inbox reading, bank parsers, and SMS receiving are not.
- **Decisions made:** Permission request is explicit and user-initiated; this spike does not read the SMS inbox, retain message bodies, or register an SMS receiver.
- **Open questions / risks:** Receiver execution, native sender allowlisting, history import, and background key access are not implemented. The first app launch showed a React Native bundle error because the USB reverse tunnel was absent; this was fixed and the intended setup screen is now visible.
- **Next action:** Continue Phase 1 receiver/background execution and Keystore spikes. Before accessing SMS content, define exact sender allowlisting and bank parser fixtures; classification and normalization rules must remain review-required where ambiguous.

### SMS domain rules

- **Phase/status:** Phase 4 in progress; Phase 1 device permission is verified; native receiver/import is not implemented.
- **Verified outcome:** Added deterministic SMS classification for transaction/ignored/review classes, merchant normalization with built-in and user-rule precedence, and duplicate candidate comparison using message hashes or transaction attributes/time window. These are pure TypeScript functions; no real SMS was read or retained.
- **Evidence:** `npm test` — 6 suites / 51 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed. Existing debug build with permission setup screen remains installed on Android 16 phone; latest domain-only source additions are verified in Jest/typecheck, not separately needed for UI installation.
- **Requirement IDs:** F4, F5, F9–F11, F15, N3, P11, P12 groundwork.
- **Decisions made:** Unsupported or conflicting classification returns `unknown` and requires review; OTP/promotional/balance classifications are marked ignorable. Duplicate rules prioritize matching stored message hash; otherwise use exact amount/bank/time and available reference/account/merchant/mode signals.
- **Open questions / risks:** Classifier is generic groundwork, not a bank-specific parser and not production-validated against Axis/Kotak/Jupiter samples. Native receipt has not yet been exercised using an actual SMS from an allowlisted sender.
- **Next action:** Obtain a bank sender ID (without sharing message body or financial details), configure it in the app, and safely verify receipt/queue behavior; then implement DB-backed parse-and-ack flow.

### Native SMS receiver and encrypted queue

- **Phase/status:** Phase 5 in progress; Android debug build/install verified.
- **Verified outcome:** Added a Kotlin `SMS_RECEIVED` broadcast receiver protected by `BROADCAST_SMS`. It compares sender IDs against an exact user-configured allowlist before accessing/forwarding the body; unrecognized senders are dropped. Recognized bodies are encrypted using AES-GCM with a non-biometric Android Keystore key and synchronously committed to a local pending queue. The native bridge supports sender configuration, pending count/read/acknowledgement, queue-ID events, and date-filtered history import in bounded pages (maximum 500). The UI lets the user configure sender IDs and never displays message content.
- **Evidence:** `:app:installDebug` — `BUILD SUCCESSFUL`, installed on `AIN065 - 16`; app main activity launched. `npm test` — 6 suites / 51 tests passed; typecheck, lint, and source privacy checks passed before native queue additions. Kotlin bridge compiled successfully. SMS permission grants remain `true`.
- **Requirement IDs:** N1–N4, N6, N7; F2/F3 groundwork; P6, P11, P12.
- **Decisions made:** Sender allowlist is empty by default; exact IDs are configured by the user to avoid guessed bank/operator sender patterns. Queue holds encrypted raw content until an application transaction pipeline successfully processes and acknowledges it. No incoming message body is sent through broadcast events or logged.
- **Open questions / risks:** Live SMS receipt and closed-app behavior are not yet tested using an actual message. Headless JS processing is not implemented; closed-app arrivals remain encrypted in queue for later processing when the app is open. History API and queue decryption are bridge primitives and are not yet wired to transaction persistence. Axis/Kotak/Jupiter parser fixtures are still needed.
- **Next action:** Validate one real allowlisted message end-to-end without logging/displaying its body, then implement the encrypted DB and parser-backed processing/acknowledgement. Do not configure arbitrary sender IDs or query personal SMS during tests.

### Dashboard, Analytics, and Chat pages

- **Phase/status:** Phase 6 in progress; pages are installed on the physical phone.
- **Verified outcome:** Added bottom navigation for Dashboard, Analytics, and Chat. Dashboard shows setup progress, permission status, queue count, and honest no-transaction state. Analytics shows empty trend/category views until local transactions exist. Chat accepts a question and responds locally; it clearly reports that no data-backed analysis is available until transaction storage and parsing are connected. No fake financial totals are displayed.
- **Evidence:** `npm test` — 7 suites / 54 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed; `:app:installDebug` succeeded on `AIN065 - 16`; `uiautomator` confirmed Dashboard and Analytics page markers; physical taps selected Analytics and Chat; main activity remained resumed.
- **Requirement IDs:** F29–F33 and F43 groundwork; chat follows offline-search principle from F65–F68 but does not yet query transactions.
- **Decisions made:** Until the local transaction database exists, use empty-state UX and do not fabricate analytics/chat results.
- **Open questions / risks:** Real bank SMS has not been tested. The sender ID was configured on-device and is not recorded in source/docs; the encrypted pending count currently reads zero. Parsed transactions are not persisted, so Analytics and Chat cannot provide real spending answers yet.
- **Next action:** When the next ordinary bank transaction alert arrives, verify only that the encrypted pending count increments; do not read, display, or log its body. Follow with DB-backed parse/ack integration.

### Count-only historical inbox probe

- **Phase/status:** Phase 1/5 in progress; implemented and verified on the Android phone.
- **Verified outcome:** Added a user-initiated native method that scans the inbox using only the sender-address column, compares addresses against exact allowlisted IDs, and returns a count. The UI reports that message bodies were not read. Device check found 222 matching inbox messages; this includes any message from that sender and is not a transaction count.
- **Evidence:** `:app:installDebug` — `BUILD SUCCESSFUL`, installed on `AIN065 - 16`; tapping the count-only control displayed the count. `npm test` — 7 suites / 54 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed.
- **Requirement IDs:** F10/F11 privacy groundwork; Phase 1 history-access feasibility.
- **Decisions made:** Use count-only history verification for this test; do not retrieve, display, or log SMS bodies. Do not treat sender-message count as evidence of parsed transactions.
- **Open questions / risks:** Live SMS broadcast delivery and queue durability remain untested. Existing paged history-import bridge can return bodies to JavaScript, but is not wired to this count-only control or to transaction storage.
- **Next action:** Keep the allowlist as configured; next build a reviewed, on-device parser/import pipeline using synthetic fixtures first, then verify live receipt/queue count without opening message bodies.

### USER profile and consolidated settings

- **Phase/status:** Phase 6 in progress; updated interface installed on the connected Android phone.
- **Verified outcome:** Replaced the top-right SMS shortcut with a USER profile button available from Dashboard, Analytics, and Chat. Moved permission status, exact sender allowlist, count-only history control, pending alert status, and related errors/messages into one profile page. Removed setup steps from Dashboard to keep it focused on financial overview and activity.
- **Evidence:** `npm test` — 7 suites / 54 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed; `:app:installDebug` — `BUILD SUCCESSFUL`; `uiautomator` confirmed USER on Dashboard and Permissions, Read SMS, Receive SMS, SMS capture setup, sender-ID input, and historical count control in profile; back button returned to Dashboard; main activity remained resumed.
- **Requirement IDs:** F29–F33, privacy/setup UX groundwork.
- **Decisions made:** Display the placeholder profile name exactly as `USER`; no account login or personal identity details were introduced.
- **Open questions / risks:** Transaction persistence/parser work remains as above.
- **Next action:** Continue transaction persistence/parser work; maintain this profile as the single home for permission and SMS setup controls.

### Sender ID list management

- **Phase/status:** Phase 6 in progress; updated interface installed and visible on the connected phone.
- **Verified outcome:** Replaced the comma-separated sender editor with an "Allowed sender IDs" list, active status rows, and per-row remove actions. Added a single-ID input and Add control; changes apply immediately, duplicate IDs are rejected, and an empty-list state explains how to begin. Count-only history action remains in the same setup section.
- **Evidence:** `npm test` — 7 suites / 54 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed; `:app:installDebug` — `BUILD SUCCESSFUL`, installed on the connected device; `uiautomator` verified SMS capture setup, allowed-sender list, add control, history-count action, and one active sender row with a remove control.
- **Requirement IDs:** F10/F11 and profile/setup UX groundwork.
- **Decisions made:** Add/remove persists immediately to the existing exact sender allowlist; no broader sender matching was introduced.
- **Open questions / risks:** Transaction persistence/parser work remains; historical count remains message-count-only and body-free.
- **Next action:** Continue transaction persistence/parser work; use the displayed exact-ID list for sender configuration.

### Historical SMS import and financial views

- **Phase/status:** Phases 3–6 in progress; the historical import path and page navigation have been exercised on the connected Android phone.
- **Implemented:** Paginated history is restricted to exact configured sender IDs. Bodies are parsed on-device in memory and never displayed/logged/persisted. Expanded deterministic patterns cover common bank/UPI transaction verbs, amount formats, balances, and category hints. Clearly classified expense/income/refund alerts with one safe INR amount are automatically confirmed; ambiguous and non-transaction messages are excluded. Confirmed structured fields and a SHA-256 fingerprint are stored in an Android Keystore AES-GCM encrypted JSON-backed store. Dashboard, Analytics, and Chat use a selected-month summary; the Dashboard transaction list is scoped to that selected month.
- **Device outcome:** On repeat import the app reported 769 matching messages: 298 deduplicated against stored transactions, 470 unclear messages excluded, and one non-transaction message skipped. The updated app was built, installed, and relaunched on the phone. No SMS body or transaction amount was inspected or recorded here.
- **Quality evidence:** `npm test` — 9 suites / 72 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed; latest `:app:assembleDebug :app:installDebug` succeeded. The device was verified on Dashboard with the all-history recent-debit count.
- **Decisions made:** The user chose automatic confirmation for clearly parsed debit/credit items. Do not treat ambiguous or unknown SMS as financial facts. Refunds appear as credits and reduce net spend. Raw bodies remain transient. SQLCipher remains planned; current encrypted JSON storage is temporary.
- **Open risks:** 470 messages were excluded as unclear; some could be transaction alerts with unsupported templates, but they cannot safely enter totals without better bank-specific parsing or a review flow. Incoming live alerts remain encrypted in the pending queue and are not yet imported into the structured ledger. Dashboard/Analytics totals remain month-scoped.
- **Next action:** Build a structured review queue for uncertain parse results (without retaining SMS bodies), add bank-specific parsers only from synthetic/anonymized fixtures, and connect live queue draining with idempotent acknowledgement. Never inspect or disclose SMS bodies or transaction details in chat.

### Transaction classification, month selection, and bank labels

- **Phase/status:** Phases 4–6 in progress; code, tests, and Android build/install are complete. The latest specific SMS format has a synthetic parser regression test; its matching inbox row has not yet been re-imported on-device.
- **Implemented:** Added transaction rules for money sent to a payee, debits/spending, general credited/received activity, and the user's explicit rule that received digital gold is a debit in the Digital Gold category. Dashboard dropdown selects current/previous months only; it offers the previous five years by default and reaches further back when older transactions exist. Dashboard totals/categories/list, Analytics, and Chat use the selected month. Transaction rows show a normalized known bank name from sender IDs, or the sender ID as fallback, alongside merchant/category/date.
- **Parser correction:** `Bal Rs...` without a colon was previously counted as a second monetary amount, making an otherwise clear debit ambiguous. Balance suffix exclusion now handles this form. Merchant normalization also no longer strips the last word from multi-word payee names. A synthetic Federal-style UPI alert fixture verifies the debit amount is selected, the balance excluded, and the full payee preserved.
- **Digital Gold regression:** Added coverage for provider wording where a Digital Gold company says it "has received" money. The domain rule intentionally overrides ordinary `received` → income classification: it is an expense debit in the `Digital Gold` category, with a normalized `Digital Gold` merchant label.
- **Safety:** Transfer/failure/refund/reversal distinctions still take precedence as appropriate; amount must parse safely. The deterministic parser cannot guarantee correct interpretation for every arbitrary message. Unknown/ambiguous SMS must not be promoted into confirmed financial records.
- **Quality evidence:** `npm test` — 11 suites / 87 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed; `:app:assembleDebug :app:installDebug` succeeded. Previous-month selection/no-future-month behavior and a readable bank/source label were verified on-device. No message body or amount was included in verification output.
- **Next action:** Re-import the configured sender history using the installed parser fix, then report only aggregate saved/duplicate/ambiguous counts. Gather further parser examples only as synthetic or anonymized formats, and keep uncertain records out of confirmed totals until a safe review workflow exists. Never inspect or log message bodies.

### Guarded category rebuild and history re-import

- **Phase/status:** Phases 3–6 in progress; implementation, automated checks, Android build, install, and launch are verified. Device-side rebuild completion is pending.
- **Implemented:** Added a destructive confirmation in USER settings. The app scans and parses the entire exact-allowlist history before changing stored data, then calls a single native operation that replaces only the encrypted transaction key and removes only the encrypted pending-queue key in one `SharedPreferences` commit. Sender allowlist/settings, Android inbox messages, permissions, and both Keystore keys are preserved. Scan failures leave the existing ledger and queue untouched. The summary contains aggregate counts only.
- **Quality evidence:** `npm test` — 11 suites / 88 tests passed; `npm run typecheck`, `npm run lint`, and `npm run check:privacy` passed; `:app:assembleDebug` succeeded; the APK installed and launched on connected device `8290b269`.
- **Device outcome:** The rebuild operation has not been run. A separate additive import later completed, and its aggregate result is documented below. Do not claim data was cleared/re-imported or infer current transaction state from the earlier import counts. The app exposes the rebuild action in USER settings; complete it there and report only aggregate import results and whether sender configuration remains intact.
- **Next action:** On the phone, open USER > SMS capture setup > **Rebuild & re-import transactions**, confirm the warning, wait for the app’s **Rebuild complete** message, then verify the sender list remains configured. Do not inspect or disclose message bodies, transaction values, or sender IDs in chat or logs.

### Temporary unclear-message debug preview

- **Phase/status:** Implemented, tested, installed, and opened on the connected phone.
- **Implemented:** A successful import keeps at most ten unclear (not confidently classified) message bodies in JavaScript memory and offers a user-initiated on-device preview in USER settings. The preview shows sender/date and original message text, but does not change classification, save bodies, or log them. It is cleared when dismissed, leaving the profile, the app backgrounds, or a new import begins. Non-transaction messages rejected by the ignore rules are not included.
- **Decision:** User explicitly requested showing original messages on the phone for debugging only, without persistence or logging.
- **Verification:** `npm test` — 11 suites / 88 tests passed; typecheck, lint, privacy checks, and Android debug build/install passed. A device-side additive import scanned 1,103 allowlisted messages: 767 duplicates, 336 unclear messages excluded, zero new transactions, and zero non-transaction messages skipped. Opened the unclear-message preview on the phone and confirmed it contains sample cards; SMS body contents were suppressed from all tool output.
- **Current device state:** The preview is left open on the phone for the user to inspect. Closing it clears the samples from memory. The separately confirmed ledger rebuild remains unverified.

### Salary credits and credit-card repayments

- **Phase/status:** Phase 4 parser rules and regression tests updated; quality checks and Android build pending.
- **Implemented:** Synthetic anonymized fixture for an account credit with a salary reference is classified as confirmed `income` in the `Salary` category, so it belongs in Credits. A message indicating a payment was received towards a credit card is classified as a `transfer` repayment, not expense or income; card purchases, rather than the later bill repayment, represent spending.
- **Privacy:** Tests contain only synthetic values and a generic bank/card label, not the user's original message or identifiers.
- **Next action:** Run parser/classifier/summary and quality tests, build/install the app. Existing saved transaction rows are not automatically recategorized by an additive import; use the confirmed rebuild flow if the user wants to apply updated rules to all historical rows.

### Navigation selection and Analytics periods

- **Phase/status:** Phase 6 UI refinement implemented, tested, built, installed, and verified on the connected phone.
- **Implemented:** Bottom navigation applies a clear selected-page background/indicator from the page key; unselected tabs remain neutral. Analytics Month/Week/Day are accessible buttons that recompute all range summaries, categories, and daily debit trends over calendar-month, Monday-based week, and calendar-day windows. Previous/next controls navigate each interval; next is disabled when it would move into the future. Week/Day default to today or the last day of the selected historical month; Month follows the Dashboard's selected month.
- **Quality evidence:** 12 Jest suites / 97 tests passed; typecheck, lint, and source privacy checks passed; Android debug build/install succeeded. Device UI hierarchy confirmed Home selected while Analytics and Chat are unselected, then confirmed the Week control becomes selected after tapping it. Future-period navigation is disabled at the current date.
- **Next action:** Pause implementation/testing here as requested; resume tomorrow when the user returns.
