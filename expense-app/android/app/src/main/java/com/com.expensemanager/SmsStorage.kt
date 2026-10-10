package com.expensemanager

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.telephony.SmsMessage
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class QueuedSms(
  val id: String,
  val sender: String,
  val body: String,
  val timestamp: Long,
)

internal data class StoredSmsTransaction(
  val id: String,
  val sender: String,
  val timestamp: Long,
  val classification: String,
  val confidence: Double,
  val amountPaise: Long,
  val merchant: String?,
  val category: String,
  val confirmed: Boolean,
)

internal data class TransactionReplacementResult(
  val savedTransactions: Int,
  val clearedPendingMessages: Int,
)

internal object SmsStorage {
  private const val PREFERENCES_NAME = "expense_sms_settings"
  private const val SENDERS_KEY = "recognized_senders"
  private const val INITIAL_HISTORY_IMPORT_COMPLETE_KEY = "initial_history_import_complete"
  private const val QUEUE_KEY = "encrypted_sms_queue"
  private const val KEY_ALIAS = "expense_sms_queue_key"
  private const val TRANSACTIONS_KEY = "encrypted_sms_transactions"
  private const val TRANSACTIONS_KEY_ALIAS = "expense_sms_transactions_key"
  private const val MAX_QUEUE_SIZE = 1000
  private const val MAX_TRANSACTIONS = 10000

  fun normalizeSender(sender: String): String =
    sender.trim().uppercase(Locale.ROOT)

  @Synchronized
  fun setRecognizedSenders(context: Context, senders: List<String>) {
    val normalized = senders
      .map(::normalizeSender)
      .filter(String::isNotBlank)
      .distinct()

    require(normalized.all { it.matches(Regex("[A-Z0-9._-]{1,32}")) }) {
      "Sender IDs must contain only letters, digits, dots, underscores, or hyphens."
    }

    val preferences = preferences(context)
    val senderSet = normalized.toSet()
    val editor = preferences.edit().putStringSet(SENDERS_KEY, senderSet)
    if (getRecognizedSenders(context).toSet() != senderSet) {
      editor.putBoolean(INITIAL_HISTORY_IMPORT_COMPLETE_KEY, false)
    }
    check(editor.commit()) {
      "Could not commit recognized sender configuration."
    }
  }

  fun getRecognizedSenders(context: Context): List<String> =
    preferences(context).getStringSet(SENDERS_KEY, emptySet())
      .orEmpty()
      .map(::normalizeSender)
      .sorted()

  fun hasCompletedInitialHistoryImport(context: Context): Boolean =
    preferences(context).getBoolean(INITIAL_HISTORY_IMPORT_COMPLETE_KEY, false)

  fun markInitialHistoryImportComplete(context: Context) {
    check(
      preferences(context).edit()
        .putBoolean(INITIAL_HISTORY_IMPORT_COMPLETE_KEY, true)
        .commit(),
    ) {
      "Could not save initial SMS history import status."
    }
  }

  fun isRecognizedSender(context: Context, sender: String): Boolean =
    normalizeSender(sender) in getRecognizedSenders(context)

  @Synchronized
  fun enqueue(context: Context, sender: String, body: String, timestamp: Long): String {
    val preferences = preferences(context)
    val queue = JSONArray(preferences.getString(QUEUE_KEY, "[]"))
    val normalizedSender = normalizeSender(sender)
    val id = "inbox:${fingerprint(normalizedSender, timestamp, body)}"
    if ((0 until queue.length()).any { index ->
        queue.getJSONObject(index).optString("id") == id
      }
    ) {
      return id
    }
    check(queue.length() < MAX_QUEUE_SIZE) {
      "Encrypted SMS queue is full; pending entries must be drained before more are accepted."
    }

    val payload = JSONObject()
      .put("sender", normalizedSender)
      .put("body", body)
      .put("timestamp", timestamp)
      .toString()
      .toByteArray(StandardCharsets.UTF_8)

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(KEY_ALIAS))
    val encrypted = cipher.doFinal(payload)
    val entry = JSONObject()
      .put("id", id)
      .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))

    queue.put(entry)
    check(preferences.edit().putString(QUEUE_KEY, queue.toString()).commit()) {
      "Could not commit encrypted SMS queue entry."
    }
    return id
  }

  @Synchronized
  fun pendingCount(context: Context): Int =
    JSONArray(preferences(context).getString(QUEUE_KEY, "[]")).length()

  @Synchronized
  fun saveTransactions(
    context: Context,
    incoming: List<StoredSmsTransaction>,
  ): Int {
    val allTransactions = transactions(context).associateBy { it.id }.toMutableMap()
    val existingCount = allTransactions.size
    incoming.forEach { transaction ->
      validateTransaction(transaction)
      if (transaction.id !in allTransactions) {
        allTransactions[transaction.id] = transaction
      }
    }
    check(allTransactions.size <= MAX_TRANSACTIONS) {
      "Transaction storage is full."
    }

    val stored = encryptTransactions(allTransactions.values.toList())
    check(preferences(context).edit().putString(TRANSACTIONS_KEY, stored).commit()) {
      "Could not commit encrypted transactions."
    }
    return allTransactions.size - existingCount
  }

  @Synchronized
  fun replaceTransactionsAndClearPending(
    context: Context,
    incoming: List<StoredSmsTransaction>,
  ): TransactionReplacementResult {
    val uniqueTransactions = linkedMapOf<String, StoredSmsTransaction>()
    incoming.forEach { transaction ->
      validateTransaction(transaction)
      uniqueTransactions.putIfAbsent(transaction.id, transaction)
    }
    check(uniqueTransactions.size <= MAX_TRANSACTIONS) {
      "Transaction storage is full."
    }

    val preferences = preferences(context)
    val pendingCount = JSONArray(preferences.getString(QUEUE_KEY, "[]")).length()
    val stored = encryptTransactions(uniqueTransactions.values.toList())
    check(
      preferences.edit()
        .putString(TRANSACTIONS_KEY, stored)
        .remove(QUEUE_KEY)
        .commit(),
    ) {
      "Could not replace encrypted transactions and clear the pending queue."
    }
    return TransactionReplacementResult(
      savedTransactions = uniqueTransactions.size,
      clearedPendingMessages = pendingCount,
    )
  }

  @Synchronized
  fun transactions(context: Context): List<StoredSmsTransaction> {
    val stored = preferences(context).getString(TRANSACTIONS_KEY, null) ?: return emptyList()
    val encrypted = JSONObject(stored)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(
      Cipher.DECRYPT_MODE,
      getOrCreateKey(TRANSACTIONS_KEY_ALIAS),
      GCMParameterSpec(
        128,
        Base64.decode(encrypted.getString("iv"), Base64.NO_WRAP),
      ),
    )
    val payload = cipher.doFinal(
      Base64.decode(encrypted.getString("data"), Base64.NO_WRAP),
    )
    val records = JSONArray(String(payload, StandardCharsets.UTF_8))
    return (0 until records.length()).map { index ->
      val transaction = records.getJSONObject(index)
      StoredSmsTransaction(
        id = transaction.getString("id"),
        sender = transaction.getString("sender"),
        timestamp = transaction.getLong("timestamp"),
        classification = transaction.getString("classification"),
        confidence = transaction.getDouble("confidence"),
        amountPaise = transaction.getLong("amountPaise"),
        merchant = if (transaction.isNull("merchant")) null else transaction.getString("merchant"),
        category = transaction.getString("category"),
        confirmed = transaction.getBoolean("confirmed"),
      )
    }
  }

  @Synchronized
  fun pending(context: Context): List<QueuedSms> {
    val queue = JSONArray(preferences(context).getString(QUEUE_KEY, "[]"))
    val key = getOrCreateKey(KEY_ALIAS)

    return (0 until queue.length()).map { index ->
      val entry = queue.getJSONObject(index)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(
        Cipher.DECRYPT_MODE,
        key,
        GCMParameterSpec(
          128,
          Base64.decode(entry.getString("iv"), Base64.NO_WRAP),
        ),
      )
      val plaintext = cipher.doFinal(
        Base64.decode(entry.getString("data"), Base64.NO_WRAP),
      )
      val payload = JSONObject(String(plaintext, StandardCharsets.UTF_8))
      QueuedSms(
        id = entry.getString("id"),
        sender = payload.getString("sender"),
        body = payload.getString("body"),
        timestamp = payload.getLong("timestamp"),
      )
    }
  }

  @Synchronized
  fun remove(context: Context, id: String): Boolean {
    val preferences = preferences(context)
    val existing = JSONArray(preferences.getString(QUEUE_KEY, "[]"))
    val remaining = JSONArray()
    var removed = false

    for (index in 0 until existing.length()) {
      val entry = existing.getJSONObject(index)
      if (entry.optString("id") == id) {
        removed = true
      } else {
        remaining.put(entry)
      }
    }

    if (removed) {
      check(preferences.edit().putString(QUEUE_KEY, remaining.toString()).commit()) {
        "Could not acknowledge encrypted SMS queue entry."
      }
    }
    return removed
  }

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  private fun fingerprint(sender: String, timestamp: Long, body: String): String {
    val input = "$sender|$timestamp|$body".toByteArray(StandardCharsets.UTF_8)
    return MessageDigest.getInstance("SHA-256")
      .digest(input)
      .joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun validateTransaction(transaction: StoredSmsTransaction) {
    require(transaction.confirmed) {
      "Only confirmed transactions may be stored in the transaction ledger."
    }
    require(transaction.amountPaise >= 0) {
      "Confirmed transactions require a non-negative amount in paise."
    }
  }

  private fun encryptTransactions(transactions: List<StoredSmsTransaction>): String {
    val payload = JSONArray().apply {
      transactions.forEach { transaction ->
        put(
          JSONObject()
            .put("id", transaction.id)
            .put("sender", normalizeSender(transaction.sender))
            .put("timestamp", transaction.timestamp)
            .put("classification", transaction.classification)
            .put("confidence", transaction.confidence)
            .put("amountPaise", transaction.amountPaise)
            .put("merchant", transaction.merchant ?: JSONObject.NULL)
            .put("category", transaction.category)
            .put("confirmed", transaction.confirmed),
        )
      }
    }.toString().toByteArray(StandardCharsets.UTF_8)

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(TRANSACTIONS_KEY_ALIAS))
    val encrypted = cipher.doFinal(payload)
    return JSONObject()
      .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
      .toString()
  }

  private fun getOrCreateKey(alias: String): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }

    val generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES,
      "AndroidKeyStore",
    )
    generator.init(
      KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }
}
