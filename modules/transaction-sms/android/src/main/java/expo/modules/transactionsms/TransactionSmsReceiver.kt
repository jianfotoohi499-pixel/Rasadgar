package expo.modules.transactionsms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class TransactionSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isEmpty()) return
    val sender = messages.firstOrNull()?.originatingAddress.orEmpty()
    val body = messages.joinToString("") { it.messageBody.orEmpty() }.trim()
    if (!isTransaction(body)) return

    val normalized = normalizeDigits(body)
    val rawAmount = extractAmount(normalized) ?: return
    val amount = if (body.contains("تومان")) rawAmount * 10L else rawAmount
    val direction = if (Regex("واریز|واریزی|دریافت|بستانکار|افزایش موجودی").containsMatchIn(body)) "واریز" else "برداشت"
    val card = Regex("(?:کارت|card)?\\D*(\\d{16})").find(normalized)?.groupValues?.getOrNull(1)
    val last4 = card?.takeLast(4).orEmpty()
    val timestamp = messages.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
    val id = sha256("$sender|$timestamp|$body")
    val item = JSONObject().apply {
      put("id", id)
      put("sender", sender)
      put("amount", amount)
      put("type", direction)
      put("last4", last4)
      put("timestamp", timestamp)
      put("source", "پیامک خودکار")
    }

    synchronized(TransactionSmsReceiver::class.java) {
      val prefs = context.getSharedPreferences("rasadgar_sms_transactions", Context.MODE_PRIVATE)
      val current = JSONArray(prefs.getString("pending", "[]") ?: "[]")
      if ((0 until current.length()).none { current.optJSONObject(it)?.optString("id") == id }) {
        current.put(item)
        prefs.edit().putString("pending", current.toString()).apply()
      }
    }
  }

  private fun isTransaction(body: String): Boolean {
    val text = body.lowercase()
    if (Regex("رمز پویا|رمز یکبار|کد تایید|کد تأیید|رمز ورود|otp|یکبار مصرف|اعتبارسنجی").containsMatchIn(text)) return false
    val transactionWords = Regex("تراکنش|برداشت|واریز|خرید|انتقال|پرداخت|کسر|واریزی|دریافت|مانده حساب|موجودی حساب")
    val hasAmount = Regex("[۰-۹٠-٩0-9][۰-۹٠-٩0-9,٬،.]{2,}").containsMatchIn(normalizeDigits(body))
    return transactionWords.containsMatchIn(text) && hasAmount
  }

  private fun extractAmount(text: String): Long? {
    val normalized = normalizeDigits(text)
    val contextual = Regex("(?:مبلغ|برداشت|واریز|خرید|انتقال|پرداخت|کسر)[^0-9]{0,18}([0-9][0-9,٬،.]*)")
    val candidate = contextual.find(normalized)?.groupValues?.getOrNull(1)
      ?: Regex("([0-9][0-9,٬،.]*)\\s*(?:ریال|تومان)").find(normalized)?.groupValues?.getOrNull(1)
    val amount = candidate?.replace(Regex("[,٬،.]"), "")?.toLongOrNull()
    return amount?.takeIf { it >= 1000L }
  }

  private fun normalizeDigits(value: String): String {
    val fa = "۰۱۲۳۴۵۶۷۸۹"
    val ar = "٠١٢٣٤٥٦٧٨٩"
    return value.map { ch ->
      when {
        fa.indexOf(ch) >= 0 -> ('0'.code + fa.indexOf(ch)).toChar()
        ar.indexOf(ch) >= 0 -> ('0'.code + ar.indexOf(ch)).toChar()
        else -> ch
      }
    }.joinToString("")
  }

  private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
