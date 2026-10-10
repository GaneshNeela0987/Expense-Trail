const fs = require('node:fs');
const path = require('node:path');

const androidAppPath = path.join(__dirname, '..', 'android', 'app');
const mainManifestPath = path.join(
  androidAppPath,
  'src',
  'main',
  'AndroidManifest.xml',
);
const debugManifestPath = path.join(
  androidAppPath,
  'src',
  'debug',
  'AndroidManifest.xml',
);
const manifest = fs.readFileSync(mainManifestPath, 'utf8');
const debugManifest = fs.readFileSync(debugManifestPath, 'utf8');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);
const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
const errors = [];

if (/android\.permission\.INTERNET/.test(manifest)) {
  errors.push('The main manifest must not declare INTERNET permission.');
}

for (const permission of [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
]) {
  if (!manifest.includes(permission)) {
    errors.push(`The main manifest must declare ${permission}.`);
  }
}

if (!/android\.permission\.INTERNET/.test(debugManifest)) {
  errors.push('The debug manifest must declare INTERNET for Metro development.');
}

if (!/android:allowBackup="false"/.test(manifest)) {
  errors.push('Android backup must be disabled in the main manifest.');
}

if (!/android:fullBackupContent="@xml\/backup_rules"/.test(manifest)) {
  errors.push('The main manifest must reference explicit full-backup rules.');
}

if (!/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(manifest)) {
  errors.push('The main manifest must reference data-extraction rules.');
}

if (
  !/<receiver[\s\S]*?android:name="\.SmsReceiver"[\s\S]*?android:exported="true"[\s\S]*?android:permission="android\.permission\.BROADCAST_SMS"[\s\S]*?<\/receiver>/.test(
    manifest,
  )
) {
  errors.push(
    'The SMS receiver must be exported only to receive broadcasts protected by BROADCAST_SMS.',
  );
}

if (!manifest.includes('android.provider.Telephony.SMS_RECEIVED')) {
  errors.push('The SMS receiver must subscribe to the Android SMS_RECEIVED action.');
}

if (!manifest.includes('android.permission.WAKE_LOCK')) {
  errors.push('Background SMS processing must be able to hold a wake lock.');
}

if (
  !/<service\b(?=[^>]*android:name="\.SmsProcessingService")(?=[^>]*android:exported="false")[^>]*\/>/.test(
    manifest,
  )
) {
  errors.push('The unexported headless SMS processing service is missing.');
}

const smsProcessingServicePath = path.join(
  androidAppPath,
  'src',
  'main',
  'java',
  'com',
  'com.expensemanager',
  'SmsProcessingService.kt',
);

if (!fs.existsSync(smsProcessingServicePath)) {
  errors.push('The Android headless SMS processing service implementation is missing.');
}

const queueProcessorPath = path.join(
  __dirname,
  '..',
  'src',
  'native',
  'smsQueueProcessor.ts',
);

if (
  !fs.existsSync(queueProcessorPath) ||
  !fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
    .includes('registerHeadlessTask')
) {
  errors.push('The JavaScript headless SMS queue processor is not registered.');
}

const smsStoragePath = path.join(
  androidAppPath,
  'src',
  'main',
  'java',
  'com',
  'com.expensemanager',
  'SmsStorage.kt',
);

if (!fs.existsSync(smsStoragePath)) {
  errors.push('The native encrypted SMS storage implementation is missing.');
} else {
  const smsStorage = fs.readFileSync(smsStoragePath, 'utf8');
  if (!smsStorage.includes('AES/GCM/NoPadding')) {
    errors.push('Pending SMS must be encrypted with AES-GCM before local storage.');
  }
  if (
    !smsStorage.includes('TRANSACTIONS_KEY_ALIAS') ||
    !smsStorage.includes('saveTransactions') ||
    !smsStorage.includes('fun transactions(')
  ) {
    errors.push(
      'Imported transactions must use the separate Android Keystore-backed encrypted store.',
    );
  }
}

for (const rulesFile of ['backup_rules.xml', 'data_extraction_rules.xml']) {
  const rulesPath = path.join(
    androidAppPath,
    'src',
    'main',
    'res',
    'xml',
    rulesFile,
  );

  if (!fs.existsSync(rulesPath)) {
    errors.push(`Required Android backup rules are missing: ${rulesFile}.`);
    continue;
  }

  const rules = fs.readFileSync(rulesPath, 'utf8');

  for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
    const excludeRule = new RegExp(
      `<exclude\\s+domain="${domain}"\\s+path="\\."\\s*\\/>`,
    );

    if (!excludeRule.test(rules)) {
      errors.push(`${rulesFile} must exclude the "${domain}" backup domain.`);
    }
  }
}

for (const dependency of ['firebase', 'sentry', 'codepush', 'expo-updates']) {
  if (Object.keys(dependencies).some(name => name.toLowerCase().includes(dependency))) {
    errors.push(`Prohibited dependency matching "${dependency}" is declared.`);
  }
}

if (errors.length > 0) {
  console.error(errors.map(error => `ERROR: ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Source privacy checks passed. Verify the merged release manifest and APK before release.');
}
