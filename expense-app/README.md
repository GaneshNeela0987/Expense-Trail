# Expense Manager

An Android-only, offline-first expense manager built with React Native and TypeScript, with a small Kotlin module for Android SMS access.

## Current status

The app includes Dashboard, Analytics, and Chat pages; a top-right USER profile for SMS permissions and sender settings; exact sender-ID allowlisting; native filtering of incoming SMS; and an encrypted pending queue. Historical SMS import feeds a deterministic parser and an encrypted local transaction store. The Dashboard month dropdown filters its totals, categories, and transactions; it offers up to five years of past months (and older months when stored transactions exist) and never offers future months. Analytics and Chat use the same selected-month summary. The current build remains an MVP: deterministic rules cover common bank/UPI wording and INR formats but cannot understand every bank template, and the transaction store is not yet the planned SQLCipher database.

Only exact sender IDs explicitly saved by the user are accepted. Recognized incoming message bodies are encrypted with an Android Keystore AES-GCM key while pending; messages from all other senders are discarded before JavaScript. Historical import is explicit, paginated, and restricted to those same sender IDs. Message bodies are parsed on-device in memory and are not persisted or logged. After an import, the user may explicitly open an on-device debugging preview of up to ten unclear messages; those bodies are held in JavaScript memory only, cleared when the preview closes, the profile closes, the app backgrounds, or a new import starts, and are never written to storage or logs. OTP, promotional, balance-only, ambiguous, and otherwise unsafe messages are excluded from the transaction ledger. Clear sent/spent/debited activity, received/credited activity, refunds, and specified digital-gold receipt wording are classified into debit/credit categories; salary credits use the Salary category, and common balance suffixes such as `Bal Rs...` are excluded from transaction amounts. A payment receipt towards a credit card is treated as a transfer/repayment—not new spending or income—so credit-card purchases are not double-counted when the bill is paid. Multi-word merchant/payee names are preserved during normalization. Only a safe INR amount and unambiguous transaction type can be automatically confirmed. Structured transaction fields and a SHA-256 fingerprint are stored in a separate Android Keystore AES-GCM encrypted local store. Import reports distinguish newly saved records, duplicate messages, ambiguous messages, and non-transaction messages. This is encrypted JSON-backed staging storage, not SQLCipher.

Tap USER at the top right on any main page to manage SMS permissions, exact sender IDs, and historical import. The Dashboard has Debits and Credits tabs, a month selector beside Transactions, month-specific category totals, and up to ten transactions in the selected month. Transaction rows show the merchant/category and a readable bank/source name when the sender ID identifies one; otherwise they show the sender ID. Analytics has working Month, Week, and Day filters with previous/next range navigation; totals, categories, and debit trends are recalculated for the selected range, and future periods cannot be selected. Month defaults to the Dashboard's selected month, while Week and Day start from the current date or the end of the selected historical month. Chat uses the Dashboard's selected-month summary. Imported transactions are deduplicated by their fingerprint. When SMS permissions are granted and at least one exact sender ID is configured, the app automatically imports matching inbox history once; adding or removing sender IDs requests a fresh idempotent history scan. Matching incoming SMS are encrypted in the native queue, then parsed and stored by a registered Headless JS task without requiring the app screen or a Metro/laptop connection. If Android prevents the background task from starting or processing fails, the encrypted queue remains available and is retried when the app opens or returns to the foreground. Only clearly classified items enter totals; ambiguous alerts are excluded. Sender filtering is done natively before message bodies cross into JavaScript.

For standalone use, install a release APK rather than a Metro-dependent debug build. Create it from Windows PowerShell in the `expense-app` folder mapped to `P:\`:

```powershell
Set-Location P:\android
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME = 'C:\Users\Manogna\AppData\Local\Android\Sdk'
.\gradlew.bat :app:assembleRelease
```

The generated APK is `android\app\build\outputs\apk\release\app-release.apk`. This development release is currently signed with the debug keystore for local installation; create and securely manage a private release keystore before distributing it beyond this device. Verify the merged release manifest/APK has no `INTERNET` permission before sharing.

The parser has not been validated against bank-provided or anonymized sender-specific fixtures. It is impossible to safely auto-classify every arbitrary SMS: unclear messages remain excluded instead of being guessed into financial totals.

If parser rules change and stored classifications need rebuilding, choose **Rebuild & re-import transactions** in USER settings and confirm the prompt. The app first scans every matching allowlisted inbox message; only after the scan succeeds does Android atomically replace the encrypted transaction ledger and clear the encrypted pending queue. This preserves the Android SMS inbox, sender IDs, permissions, and other settings. A failed scan does not start the replacement. This device-side rebuild has not yet been verified; do not treat the previous import as cleared or refreshed until the app reports completion.

## Requirements

- Node.js 22.11 or newer and npm.
- JDK 17.
- Android Studio with Android SDK Platform 37, Build Tools 37.0.0, Platform Tools, and NDK 27.1.12297006.
- Android phone with Developer options and USB debugging enabled.

## Run on the connected Android phone (Windows PowerShell)

The current workspace path is long enough to exceed the Windows native-build tool's path limit. Use a temporary `P:` drive mapping for Android commands.

In PowerShell, create the mapping once:

```powershell
subst P: "C:\Users\Manogna\Desktop\Ganesh Projects\Expense Manager\expense-app"
```

Set the environment for each new PowerShell window (replace the SDK path if Android Studio shows a different location):

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:Path = "$env:JAVA_HOME\bin;C:\Users\Manogna\AppData\Local\Android\Sdk\platform-tools;$env:Path"
$env:ANDROID_HOME = 'C:\Users\Manogna\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

Confirm that the phone is authorized:

```powershell
adb devices
```

The phone should be listed with status `device`. If it says `unauthorized`, unlock the phone and approve its USB debugging prompt.

Open two PowerShell windows. In both, run the environment setup above and:

```powershell
Set-Location P:\
```

In the first window, start Metro:

```powershell
npm.cmd start
```

In the second window, install/build and launch the Android app:

```powershell
npm.cmd run android
```

When finished, remove the temporary drive mapping:

```powershell
subst P: /D
```

Do not remove the mapping while Metro or a Gradle command is using `P:\`.

## Quality checks

Run from `P:\` after setting the Node/npm environment:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run check:privacy
```

The Android app is intentionally offline in release builds. Debug builds declare `INTERNET` only to support Metro. Always verify permissions on the built release APK before distributing it.

## Product references

- [Requirements](../expense-app-requirements-v0.3.md)
- [Implementation procedure](../IMPLEMENTATION-PLAN.md)
- [Project checkpoints](../PROJECT-CHECKPOINTS.md)
