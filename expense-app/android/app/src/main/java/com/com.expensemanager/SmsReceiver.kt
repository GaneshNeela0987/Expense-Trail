package com.expensemanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isEmpty()) return

    val sender = messages.firstNotNullOfOrNull { it.originatingAddress } ?: return
    if (!SmsStorage.isRecognizedSender(context, sender)) return

    val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }
    if (body.isBlank()) return

    val timestamp = messages.minOfOrNull { it.timestampMillis } ?: System.currentTimeMillis()

    try {
      val id = SmsStorage.enqueue(context, sender, body, timestamp)
      context.sendBroadcast(
        Intent(SmsModule.ACTION_QUEUE_UPDATED)
          .setPackage(context.packageName)
          .putExtra(SmsModule.EXTRA_QUEUE_ID, id),
      )
      SmsProcessingService.start(context)
    } catch (_: Exception) {
      Log.e(TAG, "Unable to securely queue or schedule a recognized SMS.")
    }
  }

  private companion object {
    const val TAG = "ExpenseSmsReceiver"
  }
}
