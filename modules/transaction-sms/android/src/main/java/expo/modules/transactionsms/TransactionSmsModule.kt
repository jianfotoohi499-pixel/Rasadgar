package expo.modules.transactionsms

import android.content.Context
import android.database.Cursor
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class TransactionSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TransactionSms")
    AsyncFunction("getPendingTransactions") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val prefs = context.getSharedPreferences("rasadgar_sms_transactions", Context.MODE_PRIVATE)
      val array = JSONArray(prefs.getString("pending", "[]") ?: "[]")
      val processed = JSONArray(prefs.getString("processed", "[]") ?: "[]")
      val seen = mutableSetOf<String>()
      for (i in 0 until processed.length()) seen.add(processed.optString(i))
      val results = (0 until array.length()).mapNotNull { index ->
        val obj = array.optJSONObject(index) ?: return@mapNotNull null
        val id = obj.optString("id")
        if (!seen.add(id)) return@mapNotNull null
        processed.put(id)
        mapOf("id" to id, "sender" to obj.optString("sender"),
          "amount" to obj.optLong("amount"), "type" to obj.optString("type"),
          "last4" to obj.optString("last4"), "timestamp" to obj.optLong("timestamp"),
          "source" to obj.optString("source"))
      }
      prefs.edit().putString("processed", processed.toString()).remove("pending").apply()
      results
    }
    AsyncFunction("scanInbox") { maxMessages: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction 0
      val limit = maxMessages.coerceIn(1, 10000)
      val prefs = context.getSharedPreferences("rasadgar_sms_transactions", Context.MODE_PRIVATE)
      val pending = JSONArray(prefs.getString("pending", "[]") ?: "[]")
      val known = mutableSetOf<String>()
      for (i in 0 until pending.length()) known.add(pending.optJSONObject(i)?.optString("id").orEmpty())
      val processed = JSONArray(prefs.getString("processed", "[]") ?: "[]")
      for (i in 0 until processed.length()) known.add(processed.optString(i))
      var added = 0
      var scanned = 0
      var cursor: Cursor? = null
      try {
        cursor = context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI,
          arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
          null, null, "${Telephony.Sms.DATE} DESC")
        cursor?.use { c ->
          val addressCol = c.getColumnIndex(Telephony.Sms.ADDRESS)
          val bodyCol = c.getColumnIndex(Telephony.Sms.BODY)
          val dateCol = c.getColumnIndex(Telephony.Sms.DATE)
          while (c.moveToNext() && scanned < limit) {
            scanned++
            val sender = if (addressCol >= 0) c.getString(addressCol).orEmpty() else ""
            val body = if (bodyCol >= 0) c.getString(bodyCol).orEmpty() else ""
            val timestamp = if (dateCol >= 0) c.getLong(dateCol) else 0L
            val parsed = parseTransaction(sender, body, timestamp) ?: continue
            if (known.add(parsed.getString("id"))) { pending.put(parsed); added++ }
          }
        }
      } finally { cursor?.close() }
      prefs.edit().putString("pending", pending.toString()).apply()
      added
    }
  }

  private fun parseTransaction(sender: String, body: String, timestamp: Long): JSONObject? {
    if (!isTransaction(body)) return null
    val normalized = normalizeDigits(body)
    val rawAmount = extractAmount(normalized) ?: return null
    val amount = if (body.contains("تومان")) rawAmount * 10L else rawAmount
    val direction = if (Regex("واریز|واریزی|دریافت|بستانکار|افزایش موجودی").containsMatchIn(body)) "واریز" else "برداشت"
    val card = Regex("(?:کارت|card)?\\D*(\\d{16})").find(normalized)?.groupValues?.getOrNull(1)
    return JSONObject().apply {
      put("id", sha256("$sender|$timestamp|$body")); put("sender", sender); put("amount", amount)
      put("type", direction); put("last4", card?.takeLast(4).orEmpty())
      put("timestamp", timestamp); put("source", "پیامک قدیمی")
    }
  }
  private fun isTransaction(body: String): Boolean {
    val text = body.lowercase()
    if (Regex("رمز پویا|رمز یکبار|کد تایید|کد تأیید|رمز ورود|otp|یکبار مصرف|اعتبارسنجی").containsMatchIn(text)) return false
    val words = Regex("تراکنش|برداشت|واریز|خرید|انتقال|پرداخت|کسر|واریزی|دریافت|مانده حساب|موجودی حساب")
    val hasAmount = Regex("[۰-۹٠-٩0-9][۰-۹٠-٩0-9,٬،.]{2,}").containsMatchIn(normalizeDigits(body))
    return words.containsMatchIn(text) && hasAmount
  }
  private fun extractAmount(text: String): Long? {
    val normalized = normalizeDigits(text)
    val patterns = listOf(
      Regex("(?:مبلغ تراکنش|مبلغ خرید|مبلغ)[^0-9]{0,12}([0-9][0-9,٬،.]*)"),
      Regex("(?:برداشت|واریز|خرید|انتقال|پرداخت|کسر)[^0-9]{0,8}([0-9][0-9,٬،.]*)"),
      Regex("([0-9][0-9,٬،.]*)\\s*(?:ریال|تومان)")
    )
    for (pattern in patterns) {
      val candidate = pattern.find(normalized)?.groupValues?.getOrNull(1) ?: continue
      val digits = candidate.replace(Regex("[,٬،.]"), "")
      if (digits.length > 12) continue
      val amount = digits.toLongOrNull()
      if (amount != null && amount >= 1000L) return amount
    }
    return null
  }
  private fun normalizeDigits(value: String): String {
    val fa = "۰۱۲۳۴۵۶۷۸۹"; val ar = "٠١٢٣٤٥٦٧٨٩"
    return value.map { ch -> when {
      fa.indexOf(ch) >= 0 -> ('0'.code + fa.indexOf(ch)).toChar()
      ar.indexOf(ch) >= 0 -> ('0'.code + ar.indexOf(ch)).toChar()
      else -> ch
    }}.joinToString("")
  }
  private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
