# Expense Tracker (Android, React Native) — Requirements v0.3

**Status:** Draft  |  **Platform:** Android  |  **Framework:** React Native (TypeScript)

### Changes from v0.2
- Technology decision made: **React Native** (replaces the native Kotlin recommendation).
- New section on the **native SMS module** (the one part React Native cannot do out of the box).
- New React Native–specific privacy rules (manifest, backup, debug builds, OTA updates).
- Library list added; architecture, project structure, and Definition of Done updated.
- Requirement IDs cleaned up (removed duplicates such as F8/F77/F78, F28/F80).

---

## 1. Purpose

Build a privacy-first Android expense tracker that automatically tracks spending across multiple bank accounts and credit cards without manual entry.

The app reads payment SMS on the user's phone, extracts transaction data, categorizes it, detects transfers, refunds, and recurring payments, flags unusual spending, and provides useful insights.

> **Core principle: your financial data never leaves your device.**

Parsing, categorization, analytics, and insights all run fully offline.

The app should answer two questions: **"Where did my money go?"** and **"What should I know about my spending?"**

---

## 2. Platform and Constraints

- Android only (SMS reading is not possible on iOS).
- Installed as a sideloaded APK for personal use. Google Play is not a target because of the `READ_SMS` restriction.
- Fully offline. The release build must **not declare the `INTERNET` permission**.
- No cloud backend, no login or account, no analytics, no ads, no crash-reporting or telemetry SDKs, no OTA update services.
- Primary banks/cards: **Axis, Kotak, Jupiter**. Architecture must allow adding more.
- Built with React Native in TypeScript, plus a small custom native Kotlin module for SMS.

---

## 3. Product Principles

1. Automatic expense tracking
2. Accurate *actual* spend (transfers, refunds, and duplicates handled correctly)
3. Multi-bank and multi-card support
4. Offline-first intelligence
5. Strong privacy
6. Minimal manual work
7. Clear, actionable insights
8. Fast local processing

---

## 4. Functional Requirements

Priority: **Must** = MVP, **Should** = v1.1, **Could** = later.

### 4.1 Data Capture

| ID | Requirement | Priority |
|---|---|---|
| F1 | Read payment SMS from bank/card sender IDs; extract amount, merchant, date/time, account/card last 4, payment mode (UPI, card, net banking) | Must |
| F2 | Import past SMS on first launch; user chooses how far back | Must |
| F3 | Process new SMS as they arrive, including when the app is closed | Must |
| F4 | Detect duplicates (one payment can send several SMS) and merge into one transaction | Must |
| F5 | Handle transaction types: expense, refund/credit, income, transfer, failed, reversed | Must |
| F6 | Exclude transfers (e.g. credit-card bill payment from bank) from spend totals | Must |
| F7 | Send unparsed or low-confidence SMS to a "Needs Review" queue | Must |
| F8 | Manually add, edit, and delete transactions; mark source as manual | Must |
| F9 | Process only SMS from recognized bank/card sender IDs | Must |
| F10 | Ignore OTP, promotional, balance-only, and other non-transactional SMS | Must |
| F11 | Normalize merchant names across SMS formats | Must |
| F12 | Link related transactions: purchase → refund, debit → reversal | Must |
| F13 | Detect and link bank → credit-card bill-payment transfers | Must |
| F14 | Store a parsing confidence score per transaction | Should |
| F15 | Store a hash of the SMS for duplicate detection instead of keeping raw SMS text | Must |

**Merchant normalization example:** `SWIGGY`, `SWIGGY*ORDER123`, `SWIGGY PAYMENTS`, `SWIGGY.IN` → **Swiggy**.

### 4.2 Accounts and Cards

| ID | Requirement | Priority |
|---|---|---|
| F16 | Add bank accounts and credit cards: bank, nickname, last 4 digits | Must |
| F17 | Every transaction is linked to an account/card | Must |
| F18 | Per-account/card view: monthly spend and transaction list | Must |
| F19 | Credit card details: limit, statement date, due date, amount used this cycle | Should |
| F20 | Due-date reminders via local notifications | Should |
| F21 | Credit-card utilization percentage | Should |
| F22 | Projected statement amount | Should |
| F23 | Upcoming recurring payments per card | Should |
| F24 | Configurable utilization warning thresholds | Should |

### 4.3 Categorization

| ID | Requirement | Priority |
|---|---|---|
| F25 | Default categories: Food, Groceries, Transport, Fuel, Movies, Entertainment, Bills, Shopping, Health, Travel, Others | Must |
| F26 | Auto-categorize from merchant name using on-device rules | Must |
| F27 | Learn from corrections: recategorizing a merchant once applies to future transactions | Must |
| F28 | Add, rename, and delete custom categories | Should |

**Learning example:** Swiggy → Others; user changes to Food; rule `Swiggy → Food` is saved and applied to all future Swiggy transactions. No cloud ML.

### 4.4 Reports and Charts

| ID | Requirement | Priority |
|---|---|---|
| F29 | Pie chart of spend by category for daily, weekly, monthly ranges | Must |
| F30 | Bar/line chart of spend over time | Must |
| F31 | Monthly summary: total spend, top categories, top merchants, comparison with previous month | Must |
| F32 | Cash-flow summary: income vs. expenses | Must |
| F33 | Actual spending excluding transfers | Must |
| F34 | Filter reports by account/card | Should |
| F35 | Tap a chart slice to see its transactions | Should |
| F36 | Spending trends over configurable periods | Should |

### 4.5 Search and Filtering

| ID | Requirement | Priority |
|---|---|---|
| F37 | Search and filter by date, category, account, merchant, amount | Must |
| F38 | Search by normalized merchant name | Must |
| F39 | Filter by transaction type | Should |
| F40 | Filter by payment mode | Should |
| F41 | Filter by confirmed / needs-review status | Should |
| F42 | Combine multiple filters | Should |

### 4.6 Spend Intelligence

| ID | Requirement | Priority |
|---|---|---|
| F43 | Generate offline spending insights | Must |
| F44 | Compare current spending with previous periods | Must |
| F45 | Identify top categories | Must |
| F46 | Identify top merchants | Must |
| F47 | Detect significant increases/decreases in category spending | Should |
| F48 | Detect unusual transactions vs. historical patterns | Should |
| F49 | Explain spending changes in plain language | Should |

**Insight example:** "Food spending increased by 28% compared with last month: ₹6,420 vs ₹5,020."

**Unusual-spend detection** starts with deterministic local statistics: merchant average/median, category average, standard deviation, merchant frequency, recent trend. Alerts are informational only; the app never makes financial decisions for the user.

### 4.7 Recurring Payments and Subscriptions

| ID | Requirement | Priority |
|---|---|---|
| F50 | Detect recurring payments/subscriptions | Should |
| F51 | Identify recurring merchant patterns | Should |
| F52 | Estimate next expected payment date | Should |
| F53 | Estimate monthly recurring commitment | Should |
| F54 | Display active recurring payments | Should |
| F55 | Flag potentially inactive subscriptions | Could |

### 4.8 Budgets

| ID | Requirement | Priority |
|---|---|---|
| F56 | Monthly budgets, overall and per category | Should |
| F57 | Alert at 80% of budget | Should |
| F58 | Alert when budget is exceeded | Should |
| F59 | Budget progress on dashboard | Should |
| F60 | Compare spending against remaining budget | Should |

### 4.9 Financial Calendar

Shows transactions, recurring payments, statement dates, due dates, and budget periods in one calendar.

| ID | Requirement | Priority |
|---|---|---|
| F61 | Financial calendar | Should |
| F62 | Show upcoming recurring payments | Should |
| F63 | Show credit-card statement and due dates | Should |
| F64 | Tap a calendar event to view associated transactions | Could |

### 4.10 Offline Natural-Language Search

Examples: "How much did I spend on food last month?", "Show Swiggy transactions above ₹500", "How much did I spend using my Axis card this month?"

Implementation: intent detection, keyword/rule matching, date extraction, amount extraction, merchant/category/account matching, then local SQL queries. **No external LLM or API.**

| ID | Requirement | Priority |
|---|---|---|
| F65 | Natural-language transaction search | Should |
| F66 | Convert supported queries into local database filters | Should |
| F67 | Return transaction-level results | Should |
| F68 | Return aggregates (totals, averages) | Should |

### 4.11 Financial Health Snapshot

Informational overview: spending vs. budget, category overspending, trend, recurring commitments, card utilization, savings/income ratio. It is **not** a credit or financial score.

| ID | Requirement | Priority |
|---|---|---|
| F69 | Financial health snapshot | Should |
| F70 | Key spending indicators | Should |
| F71 | Explain factors behind the snapshot | Should |

### 4.12 Export and Backup

| ID | Requirement | Priority |
|---|---|---|
| F72 | Export transactions to CSV | Should |
| F73 | Encrypted backup and restore to a user-managed file | Should |
| F74 | Backups never upload automatically | Must |
| F75 | User chooses where backup files are stored | Must |
| F76 | Backups are encrypted before export | Must |
| F77 | Restore requires the user's password/key | Should |

### 4.13 Optional Features

| ID | Requirement | Priority |
|---|---|---|
| F78 | Notes and tags on transactions | Could |
| F79 | Home-screen widget with today's spend | Could |
| F80 | Widget shows monthly progress | Could |
| F81 | Widget hides sensitive details by default | Could |
| F82 | UPI app notification listener as a secondary data source | Could |
| F83 | Detect duplicates between SMS and notifications | Could |
| F84 | Prefer the higher-confidence source when duplicates exist | Could |

---

## 5. Transaction Intelligence

### 5.1 Relationships
The system understands links between transactions to avoid inflating totals:
`Purchase → Refund`, `Purchase → Reversal`, `Bank Account → Credit Card Payment`, `Bank Account A → Bank Account B`.

Relationship types: `REFUND`, `REVERSAL`, `TRANSFER`, `CREDIT_CARD_PAYMENT`, `DUPLICATE`.

### 5.2 Lifecycle
- `Detected → Parsed → Classified → Confirmed`
- `Detected → Low Confidence → Needs Review`
- `Expense → Refund → Linked / Adjusted`

### 5.3 Deduplication
Use a combination of amount, account/card last 4, merchant, timestamp window, transaction reference, payment mode, and bank. Processing must be idempotent: reprocessing the same SMS never creates a second transaction.

---

## 6. SMS Pipeline

```text
Incoming SMS
   ↓
Recognized sender?  ── no ──▶ ignore (never stored)
   ↓ yes
SMS classification (Expense / Refund / Income / Transfer / Failed /
                    Reversed / OTP / Promotional / Balance / Unknown)
   ↓ OTP / Promo / Balance? ── yes ──▶ ignore
   ↓ no
Bank parser (Axis / Kotak / Jupiter / future)
   ↓
Merchant normalization
   ↓
Deduplication
   ↓
Transaction linking
   ↓
Categorization
   ↓
Confidence check ──▶ Confirmed  or  Needs Review
   ↓
Encrypted DB ──▶ Reports / Insights
```

Each bank has its own parser module (`AxisParser`, `KotakParser`, `JupiterParser`, ...). Each extracts: type, amount, merchant, account/card last 4, date/time, payment mode, reference number, balance (where useful), and confidence.

The parsers and the rest of the pipeline are **plain TypeScript with no React Native dependencies**, so they can be unit tested with Jest using synthetic SMS fixtures.

---

## 7. Native SMS Module (React Native–specific)

React Native has no reliable, maintained SMS library, so the app includes a small custom Kotlin native module.

| ID | Requirement | Priority |
|---|---|---|
| N1 | `SmsReceiver` (BroadcastReceiver, `RECEIVE_SMS`) captures incoming SMS | Must |
| N2 | `SmsInboxReader` (ContentResolver) reads past SMS for the first import, filtered by sender ID and date range | Must |
| N3 | Native-side sender filtering: messages from unrecognized senders are dropped before reaching JS | Must |
| N4 | JS bridge API: `requestPermissions()`, `importHistory(sinceTimestamp)`, `onNewSms(callback)` | Must |
| N5 | Background handling when the app is closed (Headless JS task) | Must |
| N6 | Fallback queue: if background processing fails, store the candidate SMS in Android encrypted storage and drain it on next app open, so no payment is lost | Must |
| N7 | Import runs in batches off the UI thread; reports progress to the UI | Must |

**Technical risks to verify early (spike before building features):**
1. Starting a Headless JS task from a broadcast receiver on the target Android version (background-start limits).
2. Granting SMS permission to a sideloaded APK: recent Android versions may require the user to allow "restricted settings" in App Info first. Onboarding must explain this step.
3. Background access to the DB key: the key is stored in Android Keystore **without** per-use biometric prompts so background processing can open the DB; app lock is enforced at the UI level.

---

## 8. Privacy and Security Requirements

| ID | Requirement |
|---|---|
| P1 | Release build does not declare `INTERNET` permission (the debug build may, for Metro) |
| P2 | No analytics |
| P3 | No crash-reporting or telemetry SDKs |
| P4 | No cloud backend, no account, no ads, no behavioral profiling |
| P5 | Local DB encrypted at rest (SQLite + SQLCipher) |
| P6 | DB encryption key stored in Android Keystore (via `react-native-keychain`) |
| P7 | Android auto-backup disabled (`android:allowBackup="false"` plus data-extraction rules) |
| P8 | Biometric or PIN app lock, with auto-lock after inactivity |
| P9 | Sensitive content hidden in recent-apps screen (`FLAG_SECURE`) |
| P10 | Parsing and categorization fully on-device |
| P11 | Only recognized sender IDs are processed; unrecognized SMS are never stored |
| P12 | Raw SMS text is not retained beyond what parsing needs (store a hash) |
| P13 | Backup files are encrypted |
| P14 | No OTA update service (no CodePush, no `expo-updates`) |
| P15 | Notifications and widgets hide sensitive details unless explicitly enabled |
| P16 | Dependency audit: no library may perform network calls; verify with the merged-manifest check below |
| P17 | Privacy screen shows current status (internet OFF, cloud sync OFF, analytics OFF, DB encryption ON, backup OFF, app lock ON) |
| P18 | Release verification step: `aapt dump permissions app-release.apk` must not list `INTERNET` |

---

## 9. Non-Functional Requirements

**Performance**
- New SMS processed within 1 second under normal conditions.
- Initial import of ~5,000 SMS runs in the background without freezing the UI.
- Lists and charts stay smooth with 10,000+ transactions (virtualized lists, indexed queries, aggregation in SQL).

**Reliability**
- SMS processing is idempotent.
- DB writes are transactional.
- Safe recovery after unexpected app termination.
- No payment SMS is lost (see N6).

**Offline:** no API calls, no cloud auth, no external AI.

**UI:** clean, minimal, responsive, light and dark themes, accessible typography, clear financial hierarchy.

---

## 10. Technology Stack (React Native)

| Area | Choice |
|---|---|
| Framework | React Native (bare CLI) + TypeScript |
| Native code | Kotlin module for SMS (see section 7) |
| Navigation | `@react-navigation/native`, `bottom-tabs`, `native-stack`, `react-native-screens`, `react-native-safe-area-context` |
| Database | `@op-engineering/op-sqlite` with SQLCipher |
| ORM / migrations | `drizzle-orm`, `drizzle-kit` |
| Key storage | `react-native-keychain` |
| App lock | `react-native-biometrics` + custom PIN screen |
| State | `zustand` |
| UI kit | `react-native-paper` (Material 3) |
| Animation / gestures | `react-native-reanimated`, `react-native-gesture-handler` |
| Charts | `react-native-gifted-charts`, `react-native-svg` |
| Dates | `date-fns` |
| Calendar | `react-native-calendars` |
| NL search | `chrono-node`, `fuse.js` |
| Anomaly stats | `simple-statistics` |
| Local notifications | `@notifee/react-native` or `expo-notifications` (check maintenance at install time) |
| Forms | `react-hook-form`, `zod` |
| CSV | `papaparse` |
| Backup encryption | `@noble/ciphers`, `@noble/hashes` |
| Files | `react-native-blob-util`, `@react-native-documents/picker`, `react-native-share` |
| Widget (later) | `react-native-android-widget` |
| Permissions | Built-in `PermissionsAndroid` |
| Testing | Jest, `@testing-library/react-native` |
| Tooling | ESLint, Prettier, Android Studio, JDK 17 |

Check each library's latest release and React Native compatibility before installing.

**Excluded on purpose:** Firebase, Sentry, analytics SDKs, CodePush, `expo-updates`, any ad SDK.

---

## 11. Architecture and Project Structure

```text
Presentation   React Native screens, React Navigation, Zustand stores, Paper UI
Domain         Pure TypeScript: parsers, classification, merchant normalization,
               dedup, linking, categorization, recurring, anomaly, insights, NL search
Data           op-sqlite + SQLCipher, Drizzle schema/migrations, repositories
Native         Kotlin: SmsReceiver, SmsInboxReader, SmsModule, Headless task,
               FLAG_SECURE, encrypted fallback queue
```

```text
expense-app/
├── android/app/src/main/java/.../sms/    # Kotlin SMS module
├── src/
│   ├── app/            # navigation, providers, theme
│   ├── features/       # dashboard, transactions, review, reports, calendar,
│   │                   # accounts, budgets, insights, settings, onboarding
│   ├── domain/         # parsers/, classification/, merchants/, dedup/,
│   │                   # linking/, categorization/, recurring/, anomaly/,
│   │                   # insights/, nlq/
│   ├── data/           # db/, schema/, migrations/, repositories/
│   ├── native/         # TypeScript wrapper for the SMS module
│   └── ui/             # shared components
└── __tests__/          # parser fixtures (synthetic SMS only)
```

---

## 12. Data Model (draft)

```text
Transaction:      id, amount, type, merchant, normalized_merchant, category_id,
                  account_id, mode, timestamp, note, source (sms/manual),
                  raw_sms_hash, status, confidence, linked_transaction_id,
                  created_at, updated_at
Account:          id, kind (bank/credit_card), bank_name, nickname, last4,
                  credit_limit, statement_day, due_day, created_at, updated_at
Category:         id, name, icon, color, is_default, created_at, updated_at
MerchantRule:     id, merchant_pattern, normalized_merchant, category_id,
                  created_at, updated_at
Budget:           id, category_id (nullable = overall), month, amount,
                  created_at, updated_at
RecurringPayment: id, merchant, average_amount, frequency, last_payment_date,
                  next_expected_date, account_id, confidence, status
TransactionLink:  id, source_transaction_id, target_transaction_id,
                  relationship_type, confidence
```

---

## 13. Screens

1. **Onboarding:** privacy explanation, SMS permission (including the sideload "restricted settings" step if needed), notification permission, app-lock setup, import range.
2. **Home / Dashboard:** this month's and today's spend, budget progress, category pie, recent transactions, top categories/merchants, insights, unusual-spend alerts, upcoming recurring payments.
3. **Transactions:** search and filters (date, category, account/card, merchant, amount, type, mode, review status).
4. **Transaction Detail:** amount, merchant, category, account/card, mode, date/time, source, confidence, notes, tags, linked refund/reversal/transfer, edit/delete.
5. **Needs Review:** low confidence, unknown account, unknown merchant, unknown category, ambiguous type; one-tap correction that updates future rules.
6. **Reports:** daily / weekly / monthly; category pie, trend, category comparison, merchant ranking, income vs. expense, budget vs. actual.
7. **Financial Calendar:** transactions, subscriptions, statement and due dates, budget periods.
8. **Accounts and Cards:** spend, utilization, limit, statement/due dates, projected statement, transactions.
9. **Budgets:** overall and per category, used, remaining, percentage, alerts.
10. **Insights:** spending changes, unusual spending, top merchants/categories, recurring payments, month-over-month, financial snapshot, natural-language search.
11. **Settings:** accounts, categories, SMS sources, app lock, privacy screen, backup/restore, CSV export, notifications, theme, data management.

---

## 14. Phases

### MVP
- Data capture: F1–F18 (F14 optional), F25–F27
- Reports and search: F29–F31, F33, F37–F38
- Native SMS module: N1–N7
- Privacy: P1–P12, P18
- Core intelligence: merchant normalization, linking, transfer/refund/reversal detection, basic insights (F43–F46)
- Performance: 5,000+ SMS import, 10,000+ transactions

### v1.1
F19–F24, F28, F32, F34–F36, F39–F42, F47–F49, F50–F55, F56–F60, F61–F64 (F64 optional), F65–F68, F69–F71, F72–F77, P13–P17

### Later
F78–F84, F55 (inactive subscriptions), local ML models

### Future extensibility
More banks and cards, UPI notifications, receipt OCR, forecasting, local voice queries, investment and net-worth tracking. None may compromise the privacy architecture.

---

## 15. Development Security Rules

Do not:
- Upload real SMS data to GitHub
- Commit DB keys, keystores, or personal transaction data
- Use real financial data in public screenshots
- Add cloud logging or telemetry

Test data must be synthetic or anonymized.

---

## 16. Decisions and Open Questions

**Decided**
- Framework: React Native (bare CLI, TypeScript) with a custom Kotlin SMS module.
- Refunds reduce actual spending; the original category is preserved (purchase ₹2,000 + refund ₹500 = net ₹1,500).
- Start with insights rather than a numeric financial health score.
- Support both calendar-month and statement-cycle views for credit cards.

**Open**
1. Sanitized sample SMS from Axis, Kotak, and Jupiter (debit, credit, UPI, card spend, refund, card-bill payment, failed) to build and test the parsers.
2. Outcome of the three technical spikes in section 7 (Headless JS from receiver, restricted-settings permission flow, background DB key access).
3. Which notification library to use (`@notifee/react-native` vs. `expo-notifications`), based on maintenance status when installing.
4. Exact import range default for first launch (e.g. last 6 months).

---

## 17. Definition of Done (MVP)

- [ ] Native SMS module: permission, history import, and live receive all work
- [ ] New SMS processed while the app is closed (or queued and drained, with no loss)
- [ ] Axis, Kotak, and Jupiter parsing work (Jest fixtures pass)
- [ ] Duplicates detected; transfers excluded; refunds and reversals handled
- [ ] Needs Review queue works
- [ ] Manual transaction add / edit / delete works
- [ ] Accounts/cards work; merchant normalization and categorization work
- [ ] Learned category rules work
- [ ] Dashboard, category charts, spending trends, and monthly summary work
- [ ] Search and filtering work
- [ ] Database encryption works; key stored in Keystore
- [ ] App lock works; recent-apps privacy (`FLAG_SECURE`) works
- [ ] Android backup disabled
- [ ] Release APK has no `INTERNET` permission (`aapt dump permissions` check passes)
- [ ] No analytics, telemetry, or OTA update library in the dependency tree
- [ ] 5,000+ SMS import without UI freeze
- [ ] 10,000+ transactions remain usable

---

## 18. Product Vision

Not a spreadsheet for expenses, but a **private, offline financial intelligence assistant**. Install the APK, grant SMS access, add your accounts and cards, and largely forget about manual tracking, while the entire financial history stays encrypted on your device.

```text
Raw SMS → Transactions → Categories → Accounts → Spending Patterns
        → Subscriptions → Anomalies → Insights → Financial Understanding
```
