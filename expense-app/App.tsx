import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {answerSpendingQuestion} from './src/domain/offlineChat';
import {
  getAnalyticsDateRange,
  shiftAnalyticsAnchor,
  type AnalyticsPeriod,
} from './src/domain/analyticsPeriod';
import {formatMonthLabel, getAvailableMonthOptions} from './src/domain/monthOptions';
import {formatInrAmount} from './src/domain/money';
import {parseSmsCandidate} from './src/domain/smsParser';
import {getSenderDisplayName} from './src/domain/senderDisplayName';
import {
  summarizeDateRange,
  summarizeMonth,
} from './src/domain/transactionSummary';
import {
  countMatchingInboxSms,
  hasCompletedInitialHistoryImport,
  getPendingSmsCount,
  getRecognizedSenders,
  getStoredSmsTransactions,
  importRecognizedSmsHistory,
  isSmsNativeModuleAvailable,
  markInitialHistoryImportComplete,
  replaceImportedSmsData,
  saveStoredSmsTransactions,
  setRecognizedSenders,
  type StoredSmsTransaction,
  subscribeToNewSms,
} from './src/native/sms';
import {processPendingSmsQueue} from './src/native/smsQueueProcessor';

type Page = 'dashboard' | 'analytics' | 'chat';
type SmsPermissionStatus = 'granted' | 'denied' | 'blocked' | 'unknown';
type PermissionSnapshot = {
  read: SmsPermissionStatus;
  receive: SmsPermissionStatus;
};
type ChatMessage = {
  id: number;
  sender: 'user' | 'assistant';
  text: string;
};
type UnclassifiedSmsPreview = {
  id: string;
  sender: string;
  timestamp: number;
  body: string;
};

const MAX_UNCLASSIFIED_SMS_PREVIEWS = 10;

const initialPermissions: PermissionSnapshot = {
  read: 'unknown',
  receive: 'unknown',
};

function AppContent() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [showProfile, setShowProfile] = useState(false);
  const [permissions, setPermissions] =
    useState<PermissionSnapshot>(initialPermissions);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [senderInput, setSenderInput] = useState('');
  const [recognizedSenders, setRecognizedSendersState] = useState<string[]>([]);
  const [pendingSmsCount, setPendingSmsCount] = useState(0);
  const [transactions, setTransactions] = useState<StoredSmsTransaction[]>([]);
  const [isNativeSmsStateLoaded, setIsNativeSmsStateLoaded] = useState(false);
  const [initialHistoryImportComplete, setInitialHistoryImportComplete] =
    useState(false);
  const startupImportAttempted = useRef(false);
  const activeQueueProcessing = useRef(false);
  const historyImportInProgress = useRef(false);
  const [historyMatchCount, setHistoryMatchCount] = useState<number | null>(
    null,
  );
  const [isCountingHistory, setIsCountingHistory] = useState(false);
  const [isImportingHistory, setIsImportingHistory] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [unclassifiedSmsPreviews, setUnclassifiedSmsPreviews] = useState<
    UnclassifiedSmsPreview[]
  >([]);
  const [isUnclassifiedSmsModalVisible, setIsUnclassifiedSmsModalVisible] =
    useState(false);
  const [isSavingSenders, setIsSavingSenders] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: 'assistant',
      text: 'Hi! I’m your on-device spending helper. Ask me about spending, merchants, or categories. I’ll only use data stored on this phone.',
    },
  ]);
  const monthSummary = useMemo(
    () => summarizeMonth(transactions, selectedMonth),
    [transactions, selectedMonth],
  );

  const refreshPermissions = useCallback(async () => {
    if (Number(Platform.Version) < 23) {
      setPermissions({read: 'granted', receive: 'granted'});
      return;
    }

    const [readGranted, receiveGranted] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS),
    ]);

    setPermissions({
      read: readGranted ? 'granted' : 'denied',
      receive: receiveGranted ? 'granted' : 'denied',
    });
  }, []);

  useEffect(() => {
    refreshPermissions().catch(() => {
      setErrorMessage('Could not check Android SMS permission status.');
    });
  }, [refreshPermissions]);

  const refreshNativeSmsState = useCallback(async () => {
    if (!isSmsNativeModuleAvailable()) {
      return;
    }

    const [
      senders,
      pendingCount,
      candidates,
      historyImportComplete,
    ] = await Promise.all([
      getRecognizedSenders(),
      getPendingSmsCount(),
      getStoredSmsTransactions(),
      hasCompletedInitialHistoryImport(),
    ]);
    setRecognizedSendersState(senders);
    setPendingSmsCount(pendingCount);
    setTransactions(candidates);
    setInitialHistoryImportComplete(historyImportComplete);
    setIsNativeSmsStateLoaded(true);
  }, []);

  const drainPendingSmsQueue = useCallback(async () => {
    if (!isSmsNativeModuleAvailable() || activeQueueProcessing.current) {
      return;
    }
    activeQueueProcessing.current = true;
    try {
      while (true) {
        const result = await processPendingSmsQueue();
        if (result.processedMessages === 0) {
          break;
        }
        const [pendingCount, storedTransactions] = await Promise.all([
          getPendingSmsCount(),
          getStoredSmsTransactions(),
        ]);
        setPendingSmsCount(pendingCount);
        setTransactions(storedTransactions);
        if (pendingCount === 0) {
          break;
        }
      }
    } catch {
      setErrorMessage(
        'Some encrypted SMS alerts could not be processed yet. They remain queued for retry.',
      );
    } finally {
      activeQueueProcessing.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isSmsNativeModuleAvailable()) {
      return;
    }

    refreshNativeSmsState().catch(() => {
      setErrorMessage('Could not load on-device SMS settings.');
    });
    drainPendingSmsQueue();
    const subscription = subscribeToNewSms(() => {
      getPendingSmsCount()
        .then(setPendingSmsCount)
        .catch(() => setErrorMessage('Could not refresh the pending alert count.'));
      drainPendingSmsQueue();
    });
    return () => subscription.remove();
  }, [drainPendingSmsQueue, refreshNativeSmsState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        setUnclassifiedSmsPreviews([]);
        setIsUnclassifiedSmsModalVisible(false);
      } else {
        refreshPermissions().catch(() => {
          setErrorMessage('Could not refresh Android SMS permission status.');
        });
        refreshNativeSmsState().catch(() => {
          setErrorMessage('Could not refresh on-device SMS settings.');
        });
        drainPendingSmsQueue();
      }
    });
    return () => subscription.remove();
  }, [drainPendingSmsQueue, refreshNativeSmsState, refreshPermissions]);

  const saveSenderAllowlist = async (
    senders: string[],
    successMessage: string,
  ) => {
    setIsSavingSenders(true);
    setErrorMessage(null);
    setSaveMessage(null);

    try {
      const savedSenders = await setRecognizedSenders(senders);
      setRecognizedSendersState(savedSenders);
      const historyImportComplete =
        await hasCompletedInitialHistoryImport();
      setInitialHistoryImportComplete(historyImportComplete);
      if (!historyImportComplete) {
        startupImportAttempted.current = false;
      }
      setHistoryMatchCount(null);
      setSaveMessage(successMessage);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not save recognized sender IDs.',
      );
      return false;
    } finally {
      setIsSavingSenders(false);
    }
  };

  const addSender = async () => {
    const sender = senderInput.trim().toUpperCase();
    if (!sender) {
      setErrorMessage('Enter a sender ID before adding it.');
      return;
    }

    if (recognizedSenders.some(value => value.toUpperCase() === sender)) {
      setErrorMessage('That sender ID is already in your allowlist.');
      return;
    }

    if (await saveSenderAllowlist([...recognizedSenders, sender], 'Sender ID added.')) {
      setSenderInput('');
    }
  };

  const removeSender = async (sender: string) => {
    await saveSenderAllowlist(
      recognizedSenders.filter(value => value !== sender),
      'Sender ID removed. New messages from it will no longer be queued.',
    );
  };

  const countMatchingHistory = async () => {
    setIsCountingHistory(true);
    setErrorMessage(null);
    setHistoryMatchCount(null);

    try {
      setHistoryMatchCount(await countMatchingInboxSms());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not count matching SMS history.',
      );
    } finally {
      setIsCountingHistory(false);
    }
  };

  const importMatchingHistory = async (
    replaceExisting = false,
    automatic = false,
  ) => {
    if (historyImportInProgress.current) {
      return false;
    }
    historyImportInProgress.current = true;
    setIsImportingHistory(true);
    setErrorMessage(null);
    setImportSummary(null);
    setUnclassifiedSmsPreviews([]);
    setIsUnclassifiedSmsModalVisible(false);
    setImportProgress(
      replaceExisting
        ? 'Scanning allowed-sender messages before rebuilding…'
        : automatic
          ? 'Importing matching inbox history on this device…'
          : 'Checking matching inbox messages…',
    );

    try {
      const total = await countMatchingInboxSms();
      setHistoryMatchCount(total);
      let offset = 0;
      let newlySavedTransactions = 0;
      let duplicateTransactions = 0;
      let ignoredMessages = 0;
      let unconfirmedMessages = 0;
      const importedTransactions: StoredSmsTransaction[] = [];
      const unclassifiedPreviews: UnclassifiedSmsPreview[] = [];

      while (true) {
        const pageResult = await importRecognizedSmsHistory(0, offset, 200);
        const candidates = pageResult.messages.flatMap(message => {
          const parsed = parseSmsCandidate(message.body);
          if (!parsed) {
            ignoredMessages += 1;
            return [];
          }
          if (!parsed.confirmed || parsed.amountPaise === null) {
            unconfirmedMessages += 1;
            if (
              unclassifiedPreviews.length < MAX_UNCLASSIFIED_SMS_PREVIEWS
            ) {
              unclassifiedPreviews.push({
                id: message.id,
                sender: message.sender,
                timestamp: message.timestamp,
                body: message.body,
              });
            }
            return [];
          }
          return [
            {
              id: `inbox:${message.id}`,
              sender: message.sender,
              timestamp: message.timestamp,
              classification: parsed.classification,
              confidence: parsed.confidence,
              amountPaise: parsed.amountPaise,
              merchant: parsed.merchant,
              category: parsed.category,
              confirmed: true,
            },
          ];
        });
        importedTransactions.push(...candidates);

        offset = pageResult.nextOffset;
        setImportProgress(
          `${replaceExisting ? 'Scanned' : 'Checked'} ${offset} of ${total} matching messages…`,
        );
        if (!pageResult.hasMore) {
          break;
        }
      }

      if (replaceExisting) {
        const replacement = await replaceImportedSmsData(importedTransactions);
        newlySavedTransactions = replacement.savedTransactions;
        duplicateTransactions =
          importedTransactions.length - replacement.savedTransactions;
        setPendingSmsCount(0);
      } else {
        for (let index = 0; index < importedTransactions.length; index += 200) {
          const batch = importedTransactions.slice(index, index + 200);
          const added = await saveStoredSmsTransactions(batch);
          newlySavedTransactions += added;
          duplicateTransactions += batch.length - added;
        }
      }

      await markInitialHistoryImportComplete();
      setInitialHistoryImportComplete(true);
      setTransactions(await getStoredSmsTransactions());
      setUnclassifiedSmsPreviews(unclassifiedPreviews);
      setImportSummary(
        `${replaceExisting ? 'Rebuild' : 'Import'} complete. Scanned ${total} allowed-sender message${total === 1 ? '' : 's'}: ${newlySavedTransactions} transaction${newlySavedTransactions === 1 ? '' : 's'} saved, ${duplicateTransactions} duplicate${duplicateTransactions === 1 ? '' : 's'} ignored, ${unconfirmedMessages} unclear message${unconfirmedMessages === 1 ? '' : 's'} excluded, and ${ignoredMessages} non-transaction message${ignoredMessages === 1 ? '' : 's'} skipped.${replaceExisting ? ' The encrypted pending queue was cleared; the inbox and sender settings were preserved.' : ''} Raw SMS text was not retained.`,
      );
      setImportProgress(null);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not import matching SMS history.',
      );
      setImportProgress(null);
      return false;
    } finally {
      historyImportInProgress.current = false;
      setIsImportingHistory(false);
    }
  };

  const confirmRebuildImportedData = () => {
    Alert.alert(
      'Rebuild imported data?',
      'This replaces transactions stored in Expense Manager and clears its encrypted pending SMS queue. Your Android SMS inbox, sender IDs, and other settings will not be changed. Matching inbox messages will be scanned again before the replacement is saved.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Rebuild and re-import',
          style: 'destructive',
          onPress: () => importMatchingHistory(true),
        },
      ],
    );
  };

  const clearUnclassifiedSmsPreviews = () => {
    setIsUnclassifiedSmsModalVisible(false);
    setUnclassifiedSmsPreviews([]);
  };

  useEffect(() => {
    if (
      !isNativeSmsStateLoaded ||
      initialHistoryImportComplete ||
      startupImportAttempted.current ||
      recognizedSenders.length === 0 ||
      permissions.read !== 'granted'
    ) {
      return;
    }
    startupImportAttempted.current = true;
    importMatchingHistory(false, true).then(completed => {
      if (!completed) {
        startupImportAttempted.current = false;
      }
    });
  }, [
    initialHistoryImportComplete,
    isNativeSmsStateLoaded,
    permissions.read,
    recognizedSenders,
  ]);

  const sendQuestion = (value = question) => {
    const normalizedQuestion = value.trim();
    if (!normalizedQuestion) {
      return;
    }

    Keyboard.dismiss();
    const summary = summarizeMonth(transactions, selectedMonth);
    const response = answerSpendingQuestion(
      normalizedQuestion,
      summary.debitCount + summary.creditCount,
      {...summary, periodLabel: formatMonthLabel(selectedMonth)},
    );
    setMessages(current => [
      ...current,
      {id: Date.now(), sender: 'user', text: normalizedQuestion},
      {id: Date.now() + 1, sender: 'assistant', text: response},
    ]);
    setQuestion('');
  };

  const allGranted =
    permissions.read === 'granted' && permissions.receive === 'granted';

  return (
    <View style={styles.appRoot}>
      <StatusBar barStyle="dark-content" />
      <View
        style={[
          styles.pageFrame,
          {paddingTop: Math.max(insets.top, 16)},
        ]}>
        {showProfile ? (
          <ProfilePage
            allGranted={allGranted}
            errorMessage={errorMessage}
            onBack={() => {
              clearUnclassifiedSmsPreviews();
              setShowProfile(false);
            }}
            pendingSmsCount={pendingSmsCount}
            recognizedSenders={recognizedSenders}
            isSavingSenders={isSavingSenders}
            senderInput={senderInput}
            setSenderInput={setSenderInput}
            onAddSender={addSender}
            onRemoveSender={removeSender}
            onCountHistory={countMatchingHistory}
            onImportHistory={importMatchingHistory}
            onRebuildImportedData={confirmRebuildImportedData}
            unclassifiedSmsPreviews={unclassifiedSmsPreviews}
            isUnclassifiedSmsModalVisible={isUnclassifiedSmsModalVisible}
            onShowUnclassifiedSms={() =>
              setIsUnclassifiedSmsModalVisible(true)
            }
            onCloseUnclassifiedSms={clearUnclassifiedSmsPreviews}
            saveMessage={saveMessage}
            historyMatchCount={historyMatchCount}
            isCountingHistory={isCountingHistory}
            isImportingHistory={isImportingHistory}
            importProgress={importProgress}
            importSummary={importSummary}
            permissions={permissions}
          />
        ) : page === 'dashboard' ? (
          <DashboardPage
            onOpenProfile={() => setShowProfile(true)}
            pendingSmsCount={pendingSmsCount}
            summary={monthSummary}
            transactions={transactions}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        ) : page === 'analytics' ? (
          <AnalyticsPage
            onOpenProfile={() => setShowProfile(true)}
            transactions={transactions}
            selectedMonth={selectedMonth}
          />
        ) : (
          <ChatPage
            messages={messages}
            onSend={sendQuestion}
            question={question}
            setQuestion={setQuestion}
            onOpenProfile={() => setShowProfile(true)}
            summary={monthSummary}
            selectedMonth={selectedMonth}
          />
        )}
      </View>
      {!showProfile ? (
        <BottomNavigation
          bottomInset={insets.bottom}
          page={page}
          onChange={setPage}
        />
      ) : null}
    </View>
  );
}

function DashboardPage({
  onOpenProfile,
  pendingSmsCount,
  summary,
  transactions,
  selectedMonth,
  onSelectMonth,
}: {
  onOpenProfile: () => void;
  pendingSmsCount: number;
  summary: ReturnType<typeof summarizeMonth>;
  transactions: StoredSmsTransaction[];
  selectedMonth: Date;
  onSelectMonth: (month: Date) => void;
}) {
  const [activeTab, setActiveTab] = useState<'debits' | 'credits'>('debits');
  const [isMonthPickerVisible, setMonthPickerVisible] = useState(false);
  const categories =
    activeTab === 'debits' ? summary.debitCategories : summary.creditCategories;
  const monthOptions = getAvailableMonthOptions(
    transactions.map(transaction => transaction.timestamp),
  );
  const recentTransactions =
    activeTab === 'debits' ? summary.debits : summary.credits;
  const monthLabel = formatMonthLabel(selectedMonth);

  return (
    <ScrollView
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topLine}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>₹</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>Expense Manager</Text>
          <Text style={styles.brandCaption}>PRIVATE • ON THIS DEVICE</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open USER profile"
          onPress={onOpenProfile}
          style={styles.profileButton}>
          <Text style={styles.profileButtonText}>USER</Text>
        </Pressable>
      </View>

      <Text style={styles.greeting}>Your finances, at a glance</Text>
      <Text style={styles.secondaryText}>A clear picture, kept private.</Text>

      <View style={styles.mainCard}>
        <View style={styles.mainCardTop}>
          <Text style={styles.mainCardLabel}>{monthLabel.toUpperCase()}</Text>
          <View style={styles.privatePill}>
            <Text style={styles.privatePillText}>ON-DEVICE</Text>
          </View>
        </View>
        <Text style={styles.emptyAmount}>
          {formatInrAmount(summary.netSpendPaise)}
        </Text>
        <Text style={styles.cardHint}>
          Confirmed net spending for {monthLabel}, after refunds.
        </Text>
        <View style={styles.cardDivider} />
        <View style={styles.cardBottomRow}>
          <View>
            <Text style={styles.metricLabel}>DEBIT TRANSACTIONS</Text>
            <Text style={styles.metricValue}>{summary.debitCount}</Text>
          </View>
          <View style={styles.cardBottomRight}>
            <Text style={styles.metricLabel}>CREDITS</Text>
            <Text style={styles.metricValue}>{summary.creditCount}</Text>
          </View>
        </View>
      </View>

      {pendingSmsCount > 0 ? (
        <View style={styles.noticeCard}>
          <View style={styles.noticeDot} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Encrypted alerts waiting</Text>
            <Text style={styles.noticeText}>
              {pendingSmsCount} recognized alert
              {pendingSmsCount === 1 ? ' is' : 's are'} safely queued on this
              device and waiting to be imported.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Transactions</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Select transaction month, ${monthLabel}`}
          accessibilityHint="Choose a current or previous month"
          onPress={() => setMonthPickerVisible(true)}
          style={styles.monthPickerButton}>
          <Text style={styles.monthPickerLabel}>{monthLabel}</Text>
          <Text style={styles.monthPickerChevron}>⌄</Text>
        </Pressable>
      </View>
      <View style={styles.transactionTabs}>
        {(['debits', 'credits'] as const).map(tab => {
          const selected = activeTab === tab;
          const label = tab === 'debits' ? 'Debits' : 'Credits';
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityLabel={`${label} transactions`}
              accessibilityState={{selected}}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.transactionTab,
                selected && styles.transactionTabSelected,
              ]}>
              <Text
                style={[
                  styles.transactionTabText,
                  selected && styles.transactionTabTextSelected,
                ]}>
                {label} · {tab === 'debits' ? summary.debitCount : summary.creditCount}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.categoryHeading}>
        {activeTab === 'debits' ? 'Debit categories' : 'Credit categories'}
      </Text>
      {categories.length > 0 ? (
        <View style={styles.categoryList}>
          {categories.map(category => (
            <View key={category.name} style={styles.categoryRow}>
              <View style={styles.categoryRowCopy}>
                <Text style={styles.categoryRowName}>{category.name}</Text>
                <Text style={styles.categoryRowCount}>
                  {category.count} transaction{category.count === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.categoryRowAmount}>
                {formatInrAmount(category.amountPaise)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            No {activeTab} recorded for {monthLabel}
          </Text>
          <Text style={styles.emptyBody}>
            Imported, clearly classified transactions will appear here.
          </Text>
        </View>
      )}

      <Text style={styles.categoryHeading}>
        {activeTab === 'debits' ? 'Debits' : 'Credits'} in {monthLabel}
      </Text>
      {recentTransactions.length > 0 ? (
        recentTransactions.slice(0, 10).map(transaction => (
          <View key={transaction.id} style={styles.transactionRow}>
            <View style={styles.transactionMerchantCopy}>
              <Text style={styles.transactionMerchant}>
                {transaction.merchant ??
                  (transaction.category !== 'Other'
                    ? transaction.category
                    : transaction.classification === 'income'
                      ? 'Credit received'
                      : transaction.classification === 'refund'
                        ? 'Refund received'
                        : 'Debit transaction')}
              </Text>
              <Text style={styles.transactionMeta}>
                {getSenderDisplayName(transaction.sender ?? '')} ·{' '}
                {transaction.category} ·{' '}
                {new Date(transaction.timestamp).toLocaleDateString('en-IN')}
              </Text>
            </View>
            <Text style={styles.transactionAmount}>
              {formatInrAmount(transaction.amountPaise ?? 0)}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyBody}>
          No confirmed {activeTab} are recorded for {monthLabel}.
        </Text>
      )}
      <MonthPicker
        visible={isMonthPickerVisible}
        months={monthOptions}
        selectedMonth={selectedMonth}
        onClose={() => setMonthPickerVisible(false)}
        onSelect={month => {
          onSelectMonth(month);
          setMonthPickerVisible(false);
        }}
      />
    </ScrollView>
  );
}

function ProfilePage({
  allGranted,
  errorMessage,
  onBack,
  pendingSmsCount,
  recognizedSenders,
  isSavingSenders,
  senderInput,
  setSenderInput,
  onAddSender,
  onRemoveSender,
  onCountHistory,
  onImportHistory,
  onRebuildImportedData,
  unclassifiedSmsPreviews,
  isUnclassifiedSmsModalVisible,
  onShowUnclassifiedSms,
  onCloseUnclassifiedSms,
  saveMessage,
  historyMatchCount,
  isCountingHistory,
  isImportingHistory,
  importProgress,
  importSummary,
  permissions,
}: {
  allGranted: boolean;
  errorMessage: string | null;
  onBack: () => void;
  pendingSmsCount: number;
  recognizedSenders: string[];
  isSavingSenders: boolean;
  senderInput: string;
  setSenderInput: (value: string) => void;
  onAddSender: () => void;
  onRemoveSender: (sender: string) => void;
  onCountHistory: () => void;
  onImportHistory: (replaceExisting?: boolean) => void;
  onRebuildImportedData: () => void;
  unclassifiedSmsPreviews: UnclassifiedSmsPreview[];
  isUnclassifiedSmsModalVisible: boolean;
  onShowUnclassifiedSms: () => void;
  onCloseUnclassifiedSms: () => void;
  saveMessage: string | null;
  historyMatchCount: number | null;
  isCountingHistory: boolean;
  isImportingHistory: boolean;
  importProgress: string | null;
  importSummary: string | null;
  permissions: PermissionSnapshot;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.profilePageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to dashboard"
          onPress={onBack}
          style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={styles.profilePageHeading}>
          <Text style={styles.headerEyebrow}>ACCOUNT & SETTINGS</Text>
          <Text style={styles.pageTitle}>Profile</Text>
        </View>
      </View>
      <View style={styles.profileIdentityCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>U</Text>
        </View>
        <View style={styles.profileIdentityCopy}>
          <Text style={styles.profileIdentityName}>USER</Text>
          <Text style={styles.profileIdentityCaption}>
            Your private on-device profile
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <Text style={styles.sectionNote}>
          {allGranted ? 'ALL SET' : 'ACTION NEEDED'}
        </Text>
      </View>
      <View style={styles.settingsCard}>
        <Text style={styles.cardHint}>
          Control whether Expense Manager can read your inbox for matching
          sender IDs and receive new bank alerts.
        </Text>
        <View style={styles.permissionStatus}>
          <PermissionBadge label="Read SMS" status={permissions.read} />
          <PermissionBadge label="Receive SMS" status={permissions.receive} />
        </View>
        {!allGranted ? (
          <Text style={styles.caption}>
            Allow SMS access in Android app settings to enable bank alerts.
          </Text>
        ) : null}
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>SMS capture setup</Text>
        <Text style={styles.sectionNote}>ON THIS DEVICE</Text>
      </View>
      <View style={styles.settingsCard}>
        <Text style={styles.cardHint}>
          Only alerts from these exact sender IDs can be queued. Other senders
          are discarded on this device. Once SMS access and a sender ID are
          configured, matching inbox history imports automatically; new alerts
          are processed on-device in the background.
        </Text>
        <View style={styles.senderListHeader}>
          <Text style={styles.senderListTitle}>Allowed sender IDs</Text>
          <Text style={styles.senderListCount}>
            {recognizedSenders.length}
          </Text>
        </View>
        {recognizedSenders.length > 0 ? (
          <View style={styles.senderList}>
            {recognizedSenders.map(sender => (
              <View key={sender} style={styles.senderRow}>
                <View style={styles.senderStatusDot} />
                <Text style={styles.senderIdText}>{sender}</Text>
                <Text style={styles.senderActiveLabel}>ACTIVE</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove sender ID ${sender}`}
                  disabled={isSavingSenders}
                  onPress={() => onRemoveSender(sender)}
                  style={({pressed}) => [
                    styles.removeSenderButton,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.removeSenderButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptySenderList}>
            <Text style={styles.emptySenderTitle}>No sender IDs added</Text>
            <Text style={styles.emptySenderCopy}>
              Add the exact sender shown in your bank alert details.
            </Text>
          </View>
        )}
        <Text style={styles.addSenderLabel}>Add a sender ID</Text>
        <View style={styles.addSenderRow}>
          <TextInput
            accessibilityLabel="New bank SMS sender ID"
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setSenderInput}
            onSubmitEditing={onAddSender}
            placeholder="e.g. AXISBK"
            placeholderTextColor="#929D96"
            returnKeyType="done"
            style={styles.senderInput}
            value={senderInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add sender ID"
            disabled={isSavingSenders || !senderInput.trim()}
            onPress={onAddSender}
            style={({pressed}) => [
              styles.addSenderButton,
              (pressed || isSavingSenders || !senderInput.trim()) &&
                styles.buttonPressed,
            ]}>
            {isSavingSenders ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.addSenderButtonText}>Add</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.senderHint}>
          Changes apply immediately. Enter a sender ID only—never paste a
          message or code here.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Count matching historical SMS"
          disabled={
            isCountingHistory ||
            recognizedSenders.length === 0 ||
            permissions.read !== 'granted'
          }
          onPress={onCountHistory}
          style={({pressed}) => [
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}>
          {isCountingHistory ? (
            <ActivityIndicator color="#1D5B48" />
          ) : (
            <Text style={styles.secondaryButtonText}>
              Count matching inbox messages
            </Text>
          )}
        </Pressable>
        {historyMatchCount !== null ? (
          <Text style={styles.caption}>
            {`Found ${historyMatchCount} inbox message${historyMatchCount === 1 ? '' : 's'} from allowed sender IDs. Message contents were not read.`}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Import matching historical SMS"
          disabled={
            isImportingHistory ||
            recognizedSenders.length === 0 ||
            permissions.read !== 'granted'
          }
          onPress={() => onImportHistory()}
          style={({pressed}) => [
            styles.primaryButton,
            (pressed || isImportingHistory) && styles.buttonPressed,
          ]}>
          {isImportingHistory ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              Import matching messages
            </Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rebuild imported transactions and re-import SMS"
          disabled={
            isImportingHistory ||
            recognizedSenders.length === 0 ||
            permissions.read !== 'granted'
          }
          onPress={onRebuildImportedData}
          style={({pressed}) => [
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}>
          <Text style={styles.secondaryButtonText}>
            Rebuild & re-import transactions
          </Text>
        </Pressable>
        {importProgress ? (
          <Text accessibilityLiveRegion="polite" style={styles.caption}>
            {importProgress}
          </Text>
        ) : null}
        {importSummary ? (
          <Text style={styles.successText}>{importSummary}</Text>
        ) : null}
        {unclassifiedSmsPreviews.length > 0 ? (
          <>
            <Text style={styles.caption}>
              Up to {MAX_UNCLASSIFIED_SMS_PREVIEWS} unclear message samples are
              held temporarily in memory for on-device debugging. They are not
              saved or logged.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review unclear SMS samples"
              onPress={onShowUnclassifiedSms}
              style={({pressed}) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}>
              <Text style={styles.secondaryButtonText}>
                Review unclear SMS ({unclassifiedSmsPreviews.length})
              </Text>
            </Pressable>
          </>
        ) : null}
        <Text style={styles.caption}>
          {recognizedSenders.length
            ? `${recognizedSenders.length} exact sender ID${recognizedSenders.length === 1 ? '' : 's'} active`
            : 'No senders enabled. No incoming SMS will be queued.'}
        </Text>
        {pendingSmsCount > 0 ? (
          <Text style={styles.caption}>
            {pendingSmsCount} encrypted alert
            {pendingSmsCount === 1 ? ' is' : 's are'} waiting on this device.
          </Text>
        ) : null}
        {saveMessage ? (
          <Text style={styles.successText}>{saveMessage}</Text>
        ) : null}
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}
      </View>
      <UnclassifiedSmsModal
        visible={isUnclassifiedSmsModalVisible}
        messages={unclassifiedSmsPreviews}
        onClose={onCloseUnclassifiedSms}
      />
    </ScrollView>
  );
}

function UnclassifiedSmsModal({
  visible,
  messages,
  onClose,
}: {
  visible: boolean;
  messages: UnclassifiedSmsPreview[];
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View style={styles.monthPickerBackdrop}>
        <View style={styles.monthPickerSheet}>
          <View style={styles.monthPickerHeader}>
            <View style={styles.unclassifiedModalHeading}>
              <Text style={styles.monthPickerTitle}>Unclear SMS samples</Text>
              <Text style={styles.monthPickerSubtitle}>
                On-device preview only · not saved or logged
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close and clear SMS samples"
              onPress={onClose}
              style={styles.monthPickerClose}>
              <Text style={styles.monthPickerCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.unclassifiedSmsOptions}
            showsVerticalScrollIndicator={false}>
            {messages.map((message, index) => (
              <View
                key={message.id}
                style={styles.unclassifiedSmsCard}
                testID={`unclassified-sms-${index + 1}`}>
                <Text style={styles.unclassifiedSmsMeta}>
                  {message.sender} · {new Date(message.timestamp).toLocaleString()}
                </Text>
                <Text selectable style={styles.unclassifiedSmsBody}>
                  {message.body}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done and clear SMS samples"
            onPress={onClose}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Done · clear samples</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AnalyticsPage({
  onOpenProfile,
  transactions,
  selectedMonth,
}: {
  onOpenProfile: () => void;
  transactions: StoredSmsTransaction[];
  selectedMonth: Date;
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  useEffect(() => {
    const now = new Date();
    const selectedMonthIsCurrent =
      selectedMonth.getFullYear() === now.getFullYear() &&
      selectedMonth.getMonth() === now.getMonth();
    setAnchorDate(
      selectedMonthIsCurrent
        ? now
        : new Date(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth() + 1,
            0,
          ),
    );
  }, [selectedMonth]);

  const range = getAnalyticsDateRange(period, anchorDate);
  const summary = summarizeDateRange(
    transactions,
    range.start.getTime(),
    range.endExclusive.getTime(),
  );
  const nextAnchor = shiftAnalyticsAnchor(period, anchorDate, 1);
  const dailyDebits = Array.from(
    summary.debits.reduce((daily, transaction) => {
      const date = new Date(transaction.timestamp);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const entry = daily.get(key) ?? {
        date,
        amountPaise: 0,
      };
      entry.amountPaise += transaction.amountPaise ?? 0;
      daily.set(key, entry);
      return daily;
    }, new Map<string, {date: Date; amountPaise: number}>()).values(),
  )
    .sort((left, right) => right.date.getTime() - left.date.getTime())
    .slice(0, 7);
  const maxDailyDebit = Math.max(
    ...dailyDebits.map(day => day.amountPaise),
    1,
  );

  return (
    <ScrollView
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}>
      <PageHeader
        eyebrow="SPENDING OVERVIEW"
        title="Analytics"
        subtitle="Understand patterns in your spending, privately."
        onOpenProfile={onOpenProfile}
      />
      <View style={styles.periodSelector}>
        {(['month', 'week', 'day'] as const).map(option => {
          const selected = period === option;
          const label = option[0].toUpperCase() + option.slice(1);
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`Analytics period ${label}`}
              accessibilityState={{selected}}
              onPress={() => setPeriod(option)}
              style={[
                styles.periodOption,
                selected && styles.periodSelected,
              ]}>
              <Text
                style={[
                  styles.periodOptionText,
                  selected && styles.periodSelectedText,
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.analyticsRangeNavigator}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous analytics period"
          onPress={() => {
            const previous = shiftAnalyticsAnchor(period, anchorDate, -1);
            if (previous) {
              setAnchorDate(previous);
            }
          }}
          style={styles.analyticsRangeArrow}>
          <Text style={styles.analyticsRangeArrowText}>‹</Text>
        </Pressable>
        <Text style={styles.analyticsRangeLabel}>{range.label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next analytics period"
          accessibilityState={{disabled: nextAnchor === null}}
          disabled={nextAnchor === null}
          onPress={() => {
            if (nextAnchor) {
              setAnchorDate(nextAnchor);
            }
          }}
          style={[
            styles.analyticsRangeArrow,
            nextAnchor === null && styles.analyticsRangeArrowDisabled,
          ]}>
          <Text style={styles.analyticsRangeArrowText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.analyticsHero}>
        <Text style={styles.mainCardLabel}>
          SPENDING · {period.toUpperCase()}
        </Text>
        <Text style={styles.analyticsDash}>
          {formatInrAmount(summary.netSpendPaise)}
        </Text>
        <Text style={styles.cardHint}>
          {summary.debitCount + summary.creditCount === 0
            ? `No confirmed transactions are recorded for ${range.label}.`
            : `${summary.debitCount} debits · ${summary.creditCount} credits. Confirmed local records only.`}
        </Text>
      </View>
      <View style={styles.analyticsTotalsRow}>
        <View style={styles.analyticsTotalCard}>
          <Text style={styles.metricLabel}>DEBITS</Text>
          <Text style={styles.analyticsTotalValue}>
            {formatInrAmount(summary.debitTotalPaise)}
          </Text>
        </View>
        <View style={styles.analyticsTotalCard}>
          <Text style={styles.metricLabel}>CREDITS</Text>
          <Text style={styles.analyticsTotalValue}>
            {formatInrAmount(summary.creditTotalPaise)}
          </Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Debit categories</Text>
      {summary.debitCategories.length > 0 ? (
        <View style={styles.categoryList}>
          {summary.debitCategories.map(category => (
            <View key={category.name} style={styles.categoryRow}>
              <View style={styles.categoryRowCopy}>
                <Text style={styles.categoryRowName}>{category.name}</Text>
                <Text style={styles.categoryRowCount}>
                  {category.count} transaction{category.count === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.categoryRowAmount}>
                {formatInrAmount(category.amountPaise)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyBody}>No confirmed debit categories yet.</Text>
      )}
      <Text style={styles.analyticsSectionTitle}>
        {period === 'day' ? 'Debits for this day' : 'Daily debits'}
      </Text>
      {dailyDebits.length > 0 ? (
        <View style={styles.dailyTrendCard}>
          {dailyDebits.map(day => (
            <View
              key={`${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}`}
              style={styles.dailyTrendRow}>
              <Text style={styles.dailyTrendDate}>
                {day.date.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
              <View style={styles.dailyTrendTrack}>
                <View
                  style={[
                    styles.dailyTrendBar,
                    {
                      width: `${Math.max(
                        (day.amountPaise / maxDailyDebit) * 100,
                        3,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.dailyTrendAmount}>
                {formatInrAmount(day.amountPaise)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyBody}>No confirmed debit trend yet.</Text>
      )}
      <Text style={styles.analyticsSectionTitle}>Credit categories</Text>
      {summary.creditCategories.length > 0 ? (
        <View style={styles.categoryList}>
          {summary.creditCategories.map(category => (
            <View key={category.name} style={styles.categoryRow}>
              <View style={styles.categoryRowCopy}>
                <Text style={styles.categoryRowName}>{category.name}</Text>
                <Text style={styles.categoryRowCount}>
                  {category.count} transaction{category.count === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.categoryRowAmount}>
                {formatInrAmount(category.amountPaise)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyBody}>No confirmed credit categories yet.</Text>
      )}
      <View style={styles.privacyFootnote}>
        <Text style={styles.privacyFootnoteText}>
          All summaries are designed to run on-device. No sample financial
          amounts are shown as if they were your own.
        </Text>
      </View>
    </ScrollView>
  );
}

function MonthPicker({
  visible,
  months,
  selectedMonth,
  onClose,
  onSelect,
}: {
  visible: boolean;
  months: Date[];
  selectedMonth: Date;
  onClose: () => void;
  onSelect: (month: Date) => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View style={styles.monthPickerBackdrop}>
        <View style={styles.monthPickerSheet}>
          <View style={styles.monthPickerHeader}>
            <View>
              <Text style={styles.monthPickerTitle}>Choose a month</Text>
              <Text style={styles.monthPickerSubtitle}>
                Current and previous months only
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close month selector"
              onPress={onClose}
              style={styles.monthPickerClose}>
              <Text style={styles.monthPickerCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.monthPickerOptions}
            showsVerticalScrollIndicator={false}>
            {months.map(month => {
              const selected =
                month.getFullYear() === selectedMonth.getFullYear() &&
                month.getMonth() === selectedMonth.getMonth();
              const label = formatMonthLabel(month);
              return (
                <Pressable
                  key={`${month.getFullYear()}-${month.getMonth()}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Month option ${label}`}
                  accessibilityState={{selected}}
                  onPress={() => onSelect(month)}
                  style={[
                    styles.monthPickerOption,
                    selected && styles.monthPickerOptionSelected,
                  ]}>
                  <Text
                    style={[
                      styles.monthPickerOptionText,
                      selected && styles.monthPickerOptionTextSelected,
                    ]}>
                    {label}
                  </Text>
                  {selected ? (
                    <Text style={styles.monthPickerCheck}>Selected</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ChatPage({
  messages,
  onSend,
  question,
  setQuestion,
  onOpenProfile,
  summary,
  selectedMonth,
}: {
  messages: ChatMessage[];
  onSend: (value?: string) => void;
  question: string;
  setQuestion: (value: string) => void;
  onOpenProfile: () => void;
  summary: ReturnType<typeof summarizeMonth>;
  selectedMonth: Date;
}) {
  const monthLabel = formatMonthLabel(selectedMonth);
  const suggestions = [
    `How much did I spend in ${monthLabel}?`,
    'What are my top categories?',
    'Show recent transactions',
  ];

  return (
    <View style={styles.chatPage}>
      <PageHeader
        eyebrow="ON-DEVICE ASSISTANT"
        title="Ask your money"
        subtitle="Private answers from your local transaction history."
        onOpenProfile={onOpenProfile}
      />
      <ScrollView
        contentContainerStyle={styles.chatMessages}
        showsVerticalScrollIndicator={false}>
        <View style={styles.chatPrivacyPill}>
          <Text style={styles.chatPrivacyText}>
            LOCAL ONLY • NO CLOUD AI
          </Text>
        </View>
        {summary.debitCount + summary.creditCount > 0 ? (
          <View style={styles.chatReviewNotice}>
            <Text style={styles.chatReviewNoticeTitle}>
              {monthLabel} confirmed activity
            </Text>
            <Text style={styles.chatReviewNoticeBody}>
              {formatInrAmount(summary.netSpendPaise)} net spend ·{' '}
              {summary.debitCount} debits · {summary.creditCount} credits
            </Text>
          </View>
        ) : null}
        {messages.map(message => (
          <View
            key={message.id}
            style={[
              styles.messageRow,
              message.sender === 'user' && styles.userMessageRow,
            ]}>
            <View
              style={[
                styles.messageBubble,
                message.sender === 'user'
                  ? styles.userBubble
                  : styles.assistantBubble,
              ]}>
              <Text
                style={[
                  styles.messageText,
                  message.sender === 'user' && styles.userMessageText,
                ]}>
                {message.text}
              </Text>
            </View>
          </View>
        ))}
        <Text style={styles.suggestionLabel}>TRY ASKING</Text>
        {suggestions.map(suggestion => (
          <Pressable
            key={suggestion}
            onPress={() => onSend(suggestion)}
            style={styles.suggestion}>
            <Text style={styles.suggestionText}>{suggestion}</Text>
            <Text style={styles.suggestionArrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Ask about your spending"
          onChangeText={setQuestion}
          onSubmitEditing={() => onSend()}
          placeholder="Ask a question..."
          placeholderTextColor="#929D96"
          returnKeyType="send"
          style={styles.composerInput}
          value={question}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send question"
          disabled={!question.trim()}
          onPress={() => onSend()}
          style={[
            styles.sendButton,
            !question.trim() && styles.sendButtonDisabled,
          ]}>
          <Text style={styles.sendButtonText}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  onOpenProfile,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onOpenProfile: () => void;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderTopLine}>
        <Text style={styles.headerEyebrow}>{eyebrow}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open USER profile"
          onPress={onOpenProfile}
          style={styles.profileButton}>
          <Text style={styles.profileButtonText}>USER</Text>
        </Pressable>
      </View>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.secondaryText}>{subtitle}</Text>
    </View>
  );
}

function PermissionBadge({
  label,
  status,
}: {
  label: string;
  status: SmsPermissionStatus;
}) {
  const granted = status === 'granted';
  const description = granted
    ? 'Allowed'
    : status === 'unknown'
      ? 'Checking'
      : 'Not allowed';

  return (
    <View style={styles.permissionBadge}>
      <Text style={styles.permissionBadgeLabel}>{label}</Text>
      <Text
        style={[
          styles.permissionBadgeStatus,
          granted && styles.successText,
          !granted && styles.errorText,
        ]}>
        {description}
      </Text>
    </View>
  );
}

function BottomNavigation({
  bottomInset,
  page,
  onChange,
}: {
  bottomInset: number;
  page: Page;
  onChange: (page: Page) => void;
}) {
  const items: Array<{key: Page; label: string; mark: string}> = [
    {key: 'dashboard', label: 'Home', mark: 'H'},
    {key: 'analytics', label: 'Analytics', mark: 'A'},
    {key: 'chat', label: 'Chat', mark: 'C'},
  ];

  return (
    <View style={[styles.bottomNav, {paddingBottom: Math.max(bottomInset, 10)}]}>
      {items.map(item => {
        const selected = page === item.key;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{selected}}
            onPress={() => onChange(item.key)}
            style={[
              styles.tabButton,
              selected && styles.tabButtonSelected,
            ]}>
            <View style={[styles.tabMark, selected && styles.tabMarkSelected]}>
              <Text
                style={[
                  styles.tabMarkText,
                  selected && styles.tabMarkTextSelected,
                ]}>
                {item.mark}
              </Text>
            </View>
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
              {item.label}
            </Text>
            <View
              style={[
                styles.tabSelectionIndicator,
                !selected && styles.tabSelectionIndicatorHidden,
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#F5F7F4',
  },
  pageFrame: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 22,
    paddingBottom: 26,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  brandMark: {
    height: 43,
    width: 43,
    borderRadius: 14,
    backgroundColor: '#1F5C48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '700',
  },
  brandCopy: {
    flex: 1,
    marginLeft: 11,
  },
  brandName: {
    color: '#20322A',
    fontSize: 14,
    fontWeight: '700',
  },
  brandCaption: {
    color: '#84948B',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 4,
  },
  profileButton: {
    minWidth: 66,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#E8F0EB',
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonText: {
    color: '#315D49',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  profilePageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 13,
    paddingBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#E8F0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backButtonText: {
    color: '#315D49',
    fontSize: 30,
    lineHeight: 33,
    marginTop: -3,
  },
  profilePageHeading: {
    flex: 1,
  },
  profileIdentityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECE8',
    borderRadius: 18,
    padding: 16,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#E8F0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: '#286147',
    fontSize: 21,
    fontWeight: '700',
  },
  profileIdentityCopy: {
    marginLeft: 13,
  },
  profileIdentityName: {
    color: '#20322A',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  profileIdentityCaption: {
    color: '#849089',
    fontSize: 11,
    marginTop: 4,
  },
  greeting: {
    color: '#1D2B24',
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  secondaryText: {
    color: '#77847D',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },
  mainCard: {
    marginTop: 21,
    backgroundColor: '#1D5B48',
    borderRadius: 23,
    padding: 20,
    shadowColor: '#143F31',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.13,
    shadowRadius: 15,
    elevation: 4,
  },
  mainCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainCardLabel: {
    color: '#D0E2D8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  privatePill: {
    backgroundColor: '#FFFFFF1F',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  privatePillText: {
    color: '#E6F0EA',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptyAmount: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '600',
    marginTop: 9,
    lineHeight: 48,
  },
  cardHint: {
    color: '#D0E1D8',
    fontSize: 11,
    lineHeight: 17,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#FFFFFF33',
    marginVertical: 17,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardBottomRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    color: '#C7DCD1',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricEmpty: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 25,
    marginBottom: 11,
  },
  sectionTitle: {
    color: '#26372F',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionNote: {
    color: '#89968F',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  monthPickerButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: '#E8F0EB',
  },
  monthPickerLabel: {
    color: '#315D49',
    fontSize: 10,
    fontWeight: '700',
  },
  monthPickerChevron: {
    color: '#315D49',
    fontSize: 17,
    lineHeight: 19,
    marginLeft: 8,
    marginTop: -4,
  },
  monthPickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#10251C88',
  },
  monthPickerSheet: {
    maxHeight: '72%',
    paddingTop: 21,
    paddingHorizontal: 20,
    paddingBottom: 25,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#F8FAF8',
  },
  monthPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  monthPickerTitle: {
    color: '#20322A',
    fontSize: 19,
    fontWeight: '700',
  },
  monthPickerSubtitle: {
    color: '#77847D',
    fontSize: 11,
    marginTop: 4,
  },
  unclassifiedModalHeading: {
    flex: 1,
  },
  unclassifiedSmsOptions: {
    flexGrow: 0,
    maxHeight: 430,
  },
  unclassifiedSmsCard: {
    padding: 13,
    marginBottom: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E3E9E4',
    backgroundColor: '#FFFFFF',
  },
  unclassifiedSmsMeta: {
    color: '#64746A',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 8,
  },
  unclassifiedSmsBody: {
    color: '#26372F',
    fontSize: 13,
    lineHeight: 20,
  },
  monthPickerClose: {
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#E8F0EB',
  },
  monthPickerCloseText: {
    color: '#315D49',
    fontSize: 25,
    lineHeight: 28,
    marginTop: -2,
  },
  monthPickerOptions: {
    flexGrow: 0,
  },
  monthPickerOption: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E7ECE8',
  },
  monthPickerOptionSelected: {
    borderRadius: 12,
    backgroundColor: '#E8F0EB',
    borderBottomColor: '#E8F0EB',
  },
  monthPickerOptionText: {
    color: '#34453B',
    fontSize: 14,
    fontWeight: '600',
  },
  monthPickerOptionTextSelected: {
    color: '#245D45',
    fontWeight: '700',
  },
  monthPickerCheck: {
    color: '#578067',
    fontSize: 10,
    fontWeight: '700',
  },
  transactionTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 13,
    backgroundColor: '#E9EEEA',
    marginBottom: 15,
  },
  transactionTab: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  transactionTabSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#25392D',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  transactionTabText: {
    color: '#738178',
    fontSize: 11,
    fontWeight: '600',
  },
  transactionTabTextSelected: {
    color: '#245D45',
    fontWeight: '700',
  },
  categoryHeading: {
    color: '#34453B',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 9,
  },
  categoryList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E7ECE8',
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 18,
  },
  categoryRow: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1EE',
  },
  categoryRowCopy: {
    flex: 1,
  },
  categoryRowName: {
    color: '#34453B',
    fontSize: 11,
    fontWeight: '700',
  },
  categoryRowCount: {
    color: '#87928B',
    fontSize: 9,
    marginTop: 3,
  },
  categoryRowAmount: {
    color: '#374A3E',
    fontSize: 11,
    fontWeight: '700',
  },
  transactionRow: {
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1EE',
  },
  transactionMerchantCopy: {
    flex: 1,
  },
  transactionMerchant: {
    color: '#34453B',
    fontSize: 11,
    fontWeight: '700',
  },
  transactionMeta: {
    color: '#87928B',
    fontSize: 9,
    marginTop: 4,
  },
  transactionAmount: {
    color: '#374A3E',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 10,
  },
  stepTitle: {
    color: '#2D3B34',
    fontSize: 12,
    fontWeight: '700',
  },
  stepDescription: {
    color: '#849089',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  stepDivider: {
    height: 1,
    backgroundColor: '#EEF1EE',
    marginLeft: 42,
  },
  textAction: {
    paddingVertical: 9,
    paddingHorizontal: 7,
  },
  textActionLabel: {
    color: '#27644C',
    fontSize: 11,
    fontWeight: '700',
  },
  noticeCard: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 13,
    borderRadius: 15,
    backgroundColor: '#FFF8E9',
    borderWidth: 1,
    borderColor: '#F5EACD',
  },
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D59D34',
    marginTop: 4,
    marginRight: 10,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    color: '#715722',
    fontSize: 11,
    fontWeight: '700',
  },
  noticeText: {
    color: '#8B774F',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 19,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9EDEA',
  },
  emptyIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: '#EFF4F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: {
    color: '#47745C',
    fontSize: 21,
    fontWeight: '700',
  },
  emptyTitle: {
    color: '#34453B',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 11,
  },
  emptyBody: {
    color: '#849089',
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
  },
  reviewSection: {
    marginTop: 3,
  },
  reviewRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE8',
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  reviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#FFF4DD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewIconText: {
    color: '#9A752F',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewCopy: {
    flex: 1,
    marginHorizontal: 10,
  },
  reviewTitle: {
    color: '#34453B',
    fontSize: 11,
    fontWeight: '700',
  },
  reviewSubtitle: {
    color: '#89958E',
    fontSize: 8,
    marginTop: 4,
  },
  reviewAmount: {
    color: '#45564C',
    fontSize: 10,
    fontWeight: '700',
  },
  settingsCard: {
    marginTop: 22,
    padding: 17,
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E7ECE8',
  },
  senderListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 17,
    marginBottom: 9,
  },
  senderListTitle: {
    color: '#34453B',
    fontSize: 12,
    fontWeight: '700',
  },
  senderListCount: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#E8F0EB',
    color: '#315D49',
    fontSize: 10,
    fontWeight: '700',
  },
  senderList: {
    borderWidth: 1,
    borderColor: '#E7ECE8',
    borderRadius: 13,
    overflow: 'hidden',
  },
  senderRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    backgroundColor: '#FBFCFB',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1EE',
  },
  senderStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4B9A69',
    marginRight: 9,
  },
  senderIdText: {
    flex: 1,
    color: '#2D3B34',
    fontSize: 12,
    fontWeight: '700',
  },
  senderActiveLabel: {
    color: '#578067',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginRight: 7,
  },
  removeSenderButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  removeSenderButtonText: {
    color: '#A44D43',
    fontSize: 10,
    fontWeight: '600',
  },
  emptySenderList: {
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#F6F8F6',
    borderWidth: 1,
    borderColor: '#E7ECE8',
  },
  emptySenderTitle: {
    color: '#45564C',
    fontSize: 11,
    fontWeight: '700',
  },
  emptySenderCopy: {
    color: '#849089',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  addSenderLabel: {
    color: '#34453B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 17,
  },
  addSenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  senderInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#E0E7E2',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#26372F',
    fontSize: 12,
    marginTop: 9,
  },
  addSenderButton: {
    minWidth: 67,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1D5B48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSenderButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  senderHint: {
    color: '#849089',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 7,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#1D5B48',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B8C9BF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#1D5B48',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.74,
  },
  caption: {
    color: '#839087',
    fontSize: 10,
    marginTop: 10,
  },
  successText: {
    color: '#2C6C4F',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  errorText: {
    color: '#A7443A',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  permissionStatus: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  permissionBadge: {
    flex: 1,
    backgroundColor: '#F6F8F6',
    borderRadius: 10,
    padding: 10,
  },
  permissionBadgeLabel: {
    color: '#64746A',
    fontSize: 9,
    fontWeight: '600',
  },
  permissionBadgeStatus: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 5,
  },
  pageHeader: {
    paddingTop: 13,
    paddingBottom: 19,
  },
  pageHeaderTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerEyebrow: {
    color: '#658373',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 0,
  },
  pageTitle: {
    color: '#1D2B24',
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  periodSelector: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    backgroundColor: '#EBEFEC',
    borderRadius: 12,
    padding: 4,
    marginBottom: 17,
  },
  periodOption: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  periodSelected: {
    backgroundColor: '#276249',
  },
  periodOptionText: {
    color: '#758179',
    fontSize: 10,
    fontWeight: '600',
  },
  periodSelectedText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  analyticsRangeNavigator: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -8,
    marginBottom: 14,
  },
  analyticsRangeArrow: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#E8F0EB',
  },
  analyticsRangeArrowDisabled: {
    opacity: 0.4,
  },
  analyticsRangeArrowText: {
    color: '#315D49',
    fontSize: 27,
    lineHeight: 30,
    marginTop: -3,
  },
  analyticsRangeLabel: {
    flex: 1,
    textAlign: 'center',
    color: '#34453B',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  analyticsHero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    marginBottom: 24,
  },
  analyticsTotalsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: -13,
    marginBottom: 23,
  },
  analyticsTotalCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E8ECE8',
  },
  analyticsTotalValue: {
    color: '#2B4435',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 7,
  },
  analyticsSectionTitle: {
    color: '#26372F',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 10,
  },
  dailyTrendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E8ECE8',
  },
  dailyTrendRow: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dailyTrendDate: {
    width: 43,
    color: '#738178',
    fontSize: 9,
  },
  dailyTrendTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EDF2EE',
    overflow: 'hidden',
  },
  dailyTrendBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#398160',
  },
  dailyTrendAmount: {
    width: 77,
    textAlign: 'right',
    color: '#374A3E',
    fontSize: 9,
    fontWeight: '600',
  },
  analyticsDash: {
    color: '#274936',
    fontSize: 35,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 3,
  },
  analyticsEmpty: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    marginTop: 11,
    marginBottom: 22,
  },
  chartPlaceholder: {
    height: 155,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    overflow: 'hidden',
  },
  chartGridLine: {
    height: 1,
    backgroundColor: '#EEF1EE',
    width: '100%',
  },
  chartDash: {
    position: 'absolute',
    color: '#89958E',
    fontSize: 11,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  categoryEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    marginTop: 11,
  },
  categoryRing: {
    height: 63,
    width: 63,
    borderRadius: 32,
    borderWidth: 8,
    borderColor: '#E8EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRingDash: {
    color: '#759080',
    fontSize: 16,
  },
  categoryEmptyCopy: {
    flex: 1,
    marginLeft: 13,
  },
  privacyFootnote: {
    marginTop: 18,
    backgroundColor: '#EAF0EC',
    borderRadius: 13,
    padding: 13,
  },
  privacyFootnoteText: {
    color: '#64756B',
    fontSize: 10,
    lineHeight: 16,
  },
  chatPage: {
    flex: 1,
    paddingHorizontal: 22,
  },
  chatMessages: {
    paddingBottom: 16,
  },
  chatPrivacyPill: {
    alignSelf: 'center',
    backgroundColor: '#E9F0EB',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 14,
    marginBottom: 18,
  },
  chatPrivacyText: {
    color: '#52715E',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  chatReviewNotice: {
    backgroundColor: '#FFF8E9',
    borderColor: '#F5EACD',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  chatReviewNoticeTitle: {
    color: '#715722',
    fontSize: 11,
    fontWeight: '700',
  },
  chatReviewNoticeBody: {
    color: '#8B774F',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 5,
    borderWidth: 1,
    borderColor: '#E9EDEA',
  },
  userBubble: {
    backgroundColor: '#1F5C48',
    borderTopRightRadius: 5,
  },
  messageText: {
    color: '#3B4A41',
    fontSize: 12,
    lineHeight: 18,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  suggestionLabel: {
    color: '#89958D',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 10,
    marginBottom: 9,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECE8',
    marginBottom: 8,
  },
  suggestionText: {
    color: '#516158',
    fontSize: 10,
  },
  suggestionArrow: {
    color: '#61816D',
    fontSize: 19,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E9E4',
    borderRadius: 17,
    padding: 6,
    marginBottom: 11,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    color: '#26372F',
    fontSize: 12,
    paddingHorizontal: 11,
  },
  sendButton: {
    width: 40,
    height: 40,
    backgroundColor: '#1F5C48',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#A9B9AE',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 24,
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E9EDEA',
    paddingTop: 8,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
    minHeight: 54,
    borderRadius: 13,
    paddingTop: 2,
  },
  tabButtonSelected: {
    backgroundColor: '#F3F7F4',
  },
  tabMark: {
    height: 25,
    minWidth: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabMarkSelected: {
    backgroundColor: '#E7F0EA',
  },
  tabMarkText: {
    color: '#8A968F',
    fontSize: 10,
    fontWeight: '700',
  },
  tabMarkTextSelected: {
    color: '#286147',
  },
  tabLabel: {
    color: '#8B9690',
    fontSize: 9,
    marginTop: 3,
    marginBottom: 2,
  },
  tabLabelSelected: {
    color: '#286147',
    fontWeight: '700',
  },
  tabSelectionIndicator: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#286147',
    marginTop: 4,
  },
  tabSelectionIndicatorHidden: {
    backgroundColor: 'transparent',
  },
});

export default App;
