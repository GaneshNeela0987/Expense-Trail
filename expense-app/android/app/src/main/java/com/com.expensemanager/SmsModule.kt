package com.expensemanager

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.security.MessageDigest

class SmsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var listenerCount = 0
  private val queueUpdateReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val id = intent?.getStringExtra(EXTRA_QUEUE_ID) ?: return
      if (listenerCount == 0) return

      val event = Arguments.createMap().apply { putString("id", id) }
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_NEW_SMS, event)
    }
  }

  init {
    val filter = IntentFilter(ACTION_QUEUE_UPDATED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(queueUpdateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      reactContext.registerReceiver(queueUpdateReceiver, filter)
    }
  }

  override fun getName(): String = "ExpenseSms"

  @ReactMethod
  fun setRecognizedSenders(senders: ReadableArray, promise: Promise) {
    try {
      val values = (0 until senders.size()).mapNotNull { index ->
        senders.getString(index)
      }
      SmsStorage.setRecognizedSenders(reactContext, values)
      promise.resolve(Arguments.fromList(SmsStorage.getRecognizedSenders(reactContext)))
    } catch (error: Exception) {
      promise.reject("SMS_SENDER_CONFIG", error.message, error)
    }
  }

  @ReactMethod
  fun getRecognizedSenders(promise: Promise) {
    promise.resolve(Arguments.fromList(SmsStorage.getRecognizedSenders(reactContext)))
  }

  @ReactMethod
  fun hasCompletedInitialHistoryImport(promise: Promise) {
    promise.resolve(SmsStorage.hasCompletedInitialHistoryImport(reactContext))
  }

  @ReactMethod
  fun markInitialHistoryImportComplete(promise: Promise) {
    try {
      SmsStorage.markInitialHistoryImportComplete(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject(
        "SMS_HISTORY_STATUS",
        "Could not save initial SMS history import status.",
        error,
      )
    }
  }

  @ReactMethod
  fun getPendingCount(promise: Promise) {
    try {
      promise.resolve(SmsStorage.pendingCount(reactContext))
    } catch (error: Exception) {
      promise.reject("SMS_QUEUE_READ", "Could not read the encrypted SMS queue.", error)
    }
  }

  @ReactMethod
  fun getTransactions(promise: Promise) {
    try {
      val records = Arguments.createArray()
      SmsStorage.transactions(reactContext).forEach { transaction ->
        records.pushMap(
          Arguments.createMap().apply {
            putString("id", transaction.id)
            putString("sender", transaction.sender)
            putDouble("timestamp", transaction.timestamp.toDouble())
            putString("classification", transaction.classification)
            putDouble("confidence", transaction.confidence)
            putDouble("amountPaise", transaction.amountPaise.toDouble())
            if (transaction.merchant == null) {
              putNull("merchant")
            } else {
              putString("merchant", transaction.merchant)
            }
            putString("category", transaction.category)
            putBoolean("confirmed", transaction.confirmed)
          },
        )
      }
      promise.resolve(records)
    } catch (error: Exception) {
      promise.reject("SMS_TRANSACTIONS_READ", "Could not read encrypted transactions.", error)
    }
  }

  @ReactMethod
  fun saveTransactions(transactions: com.facebook.react.bridge.ReadableArray, promise: Promise) {
    try {
      promise.resolve(SmsStorage.saveTransactions(reactContext, readTransactions(transactions)))
    } catch (error: Exception) {
      promise.reject("SMS_TRANSACTIONS_WRITE", "Could not save encrypted transactions.", error)
    }
  }

  @ReactMethod
  fun replaceImportedData(
    transactions: com.facebook.react.bridge.ReadableArray,
    promise: Promise,
  ) {
    try {
      val result = SmsStorage.replaceTransactionsAndClearPending(
        reactContext,
        readTransactions(transactions),
      )
      promise.resolve(
        Arguments.createMap().apply {
          putInt("savedTransactions", result.savedTransactions)
          putInt("clearedPendingMessages", result.clearedPendingMessages)
        },
      )
    } catch (error: Exception) {
      promise.reject(
        "SMS_DATA_REBUILD",
        "Could not replace encrypted transactions and clear the pending queue.",
        error,
      )
    }
  }

  @ReactMethod
  fun countMatchingInboxSms(promise: Promise) {
    if (reactContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("SMS_PERMISSION_DENIED", "SMS history permission has not been granted.")
      return
    }

    val senders = SmsStorage.getRecognizedSenders(reactContext).toSet()
    if (senders.isEmpty()) {
      promise.resolve(0)
      return
    }

    try {
      var count = 0
      val cursor: Cursor? = reactContext.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS),
        null,
        null,
        null,
      )
      cursor?.use { rows ->
        val addressIndex = rows.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        while (rows.moveToNext()) {
          val sender = rows.getString(addressIndex) ?: continue
          if (SmsStorage.normalizeSender(sender) in senders) count += 1
        }
      }
      promise.resolve(count)
    } catch (error: Exception) {
      promise.reject("SMS_HISTORY_COUNT", "Could not count matching SMS history.", error)
    }
  }

  @ReactMethod
  fun getPendingSms(promise: Promise) {
    try {
      val records = Arguments.createArray()
      SmsStorage.pending(reactContext).forEach { queued ->
        records.pushMap(
          Arguments.createMap().apply {
            putString("id", queued.id)
            putString("sender", queued.sender)
            putString("body", queued.body)
            putDouble("timestamp", queued.timestamp.toDouble())
          },
        )
      }
      promise.resolve(records)
    } catch (error: Exception) {
      promise.reject("SMS_QUEUE_DECRYPT", "Could not decrypt pending SMS.", error)
    }
  }

  @ReactMethod
  fun acknowledgeQueuedSms(id: String, promise: Promise) {
    try {
      promise.resolve(SmsStorage.remove(reactContext, id))
    } catch (error: Exception) {
      promise.reject("SMS_QUEUE_ACK", "Could not acknowledge the queued SMS.", error)
    }
  }

  @ReactMethod
  fun importHistory(
    sinceTimestamp: Double,
    offset: Double,
    requestedLimit: Double,
    promise: Promise,
  ) {
    if (reactContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("SMS_PERMISSION_DENIED", "SMS history permission has not been granted.")
      return
    }

    if (
      !sinceTimestamp.isFinite() ||
      !offset.isFinite() ||
      !requestedLimit.isFinite() ||
      offset < 0 ||
      offset % 1.0 != 0.0 ||
      requestedLimit % 1.0 != 0.0 ||
      requestedLimit !in 1.0..500.0
    ) {
      promise.reject("SMS_HISTORY_ARGUMENTS", "History import requires a valid timestamp, offset, and batch size (1–500).")
      return
    }

    val senders = SmsStorage.getRecognizedSenders(reactContext).toSet()
    val records = Arguments.createArray()
    if (senders.isEmpty()) {
      promise.resolve(
        Arguments.createMap().apply {
          putArray("messages", records)
          putDouble("nextOffset", offset)
          putBoolean("hasMore", false)
        },
      )
      return
    }

    val uri: Uri = Telephony.Sms.Inbox.CONTENT_URI
    val projection = arrayOf(
      Telephony.Sms.ADDRESS,
      Telephony.Sms.BODY,
      Telephony.Sms.DATE,
    )
    val batchLimit = requestedLimit.toInt()
    var matched = 0.0
    var hasMore = false
    try {
      val cursor: Cursor? = reactContext.contentResolver.query(
        uri,
        projection,
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(sinceTimestamp.toLong().toString()),
        "${Telephony.Sms.DATE} ASC",
      )

      cursor?.use { rows ->
        val addressIndex = rows.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIndex = rows.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIndex = rows.getColumnIndexOrThrow(Telephony.Sms.DATE)

        while (rows.moveToNext()) {
          val sender = rows.getString(addressIndex) ?: continue
          if (!SmsStorage.isRecognizedSender(reactContext, sender)) continue
          if (matched < offset) {
            matched += 1
            continue
          }
          if (records.size() >= batchLimit) {
            hasMore = true
            break
          }

          val body = rows.getString(bodyIndex) ?: continue
          val timestamp = rows.getLong(dateIndex)
          val normalizedSender = SmsStorage.normalizeSender(sender)
          val record: WritableMap = Arguments.createMap().apply {
            putString(
              "id",
              fingerprint(normalizedSender, timestamp, body),
            )
            putString("sender", normalizedSender)
            putString("body", body)
            putDouble("timestamp", timestamp.toDouble())
          }
          records.pushMap(record)
          matched += 1
        }
      }
      promise.resolve(
        Arguments.createMap().apply {
          putArray("messages", records)
          putDouble("nextOffset", offset + records.size())
          putBoolean("hasMore", hasMore)
        },
      )
    } catch (error: Exception) {
      promise.reject("SMS_HISTORY_IMPORT", "Could not import recognized SMS history.", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    if (eventName == EVENT_NEW_SMS) listenerCount += 1
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = (listenerCount - count).coerceAtLeast(0)
  }

  override fun invalidate() {
    try {
      reactContext.unregisterReceiver(queueUpdateReceiver)
    } finally {
      super.invalidate()
    }
  }

  private fun fingerprint(sender: String, timestamp: Long, body: String): String {
    val input = "$sender|$timestamp|$body".toByteArray(Charsets.UTF_8)
    return MessageDigest.getInstance("SHA-256")
      .digest(input)
      .joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun readTransactions(
    transactions: com.facebook.react.bridge.ReadableArray,
  ): List<StoredSmsTransaction> =
    (0 until transactions.size()).map { index ->
      val record: ReadableMap = transactions.getMap(index)
        ?: throw IllegalArgumentException("Transaction at index $index is invalid.")
      val timestamp = record.getDouble("timestamp")
      val confidence = record.getDouble("confidence")
      val amountPaise = record.getDouble("amountPaise")
        .takeIf { it.isFinite() && it >= 0 && it % 1.0 == 0.0 }
        ?.toLong()
        ?: throw IllegalArgumentException("Transaction amount must be a non-negative integer in paise.")
      require(timestamp.isFinite() && timestamp >= 0 && timestamp % 1.0 == 0.0) {
        "Transaction timestamp is invalid."
      }
      require(confidence.isFinite() && confidence in 0.0..1.0) {
        "Transaction confidence is invalid."
      }
      val id = record.getString("id")?.takeIf(String::isNotBlank)
        ?: throw IllegalArgumentException("Transaction ID is required.")
      val sender = record.getString("sender")?.takeIf(String::isNotBlank)
        ?: throw IllegalArgumentException("Transaction sender is required.")
      val classification = record.getString("classification")?.takeIf(String::isNotBlank)
        ?: throw IllegalArgumentException("Transaction classification is required.")
      val merchant = if (record.isNull("merchant")) null else record.getString("merchant")
      val category = record.getString("category")?.takeIf(String::isNotBlank)
        ?: throw IllegalArgumentException("Transaction category is required.")
      val confirmed = record.getBoolean("confirmed")
      require(confirmed) {
        "Only confirmed transactions may be stored in the transaction ledger."
      }

      StoredSmsTransaction(
        id = id,
        sender = sender,
        timestamp = timestamp.toLong(),
        classification = classification,
        confidence = confidence,
        amountPaise = amountPaise,
        merchant = merchant,
        category = category,
        confirmed = confirmed,
      )
    }

  companion object {
    const val EVENT_NEW_SMS = "ExpenseSmsNewMessage"
    const val ACTION_QUEUE_UPDATED = "com.expensemanager.SMS_QUEUE_UPDATED"
    const val EXTRA_QUEUE_ID = "queue_id"
  }
}

class SmsPackage : com.facebook.react.ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf<NativeModule>(SmsModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<com.facebook.react.uimanager.ViewManager<*, *>> = emptyList()
}
