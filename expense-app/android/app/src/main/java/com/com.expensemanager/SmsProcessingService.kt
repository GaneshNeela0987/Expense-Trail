package com.expensemanager

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.bridge.Arguments

class SmsProcessingService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    if (intent?.action != ACTION_PROCESS_SMS) return null
    return HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TASK_TIMEOUT_MS, true)
  }

  companion object {
    private const val ACTION_PROCESS_SMS = "com.expensemanager.PROCESS_SMS_QUEUE"
    const val TASK_NAME = "ExpenseSmsQueueProcessing"
    private const val TASK_TIMEOUT_MS = 60_000L

    fun start(context: Context) {
      val intent = Intent(context, SmsProcessingService::class.java)
        .setAction(ACTION_PROCESS_SMS)
      context.startService(intent)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    }
  }
}
