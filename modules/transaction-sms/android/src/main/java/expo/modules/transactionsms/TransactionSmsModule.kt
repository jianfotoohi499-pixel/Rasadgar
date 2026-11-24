package expo.modules.transactionsms

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class TransactionSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TransactionSms")

    AsyncFunction("getPendingTransactions") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val prefs = context.getSharedPreferences("rasadgar_sms_transactions", android.content.Context.MODE_PRIVATE)
      val raw = prefs.getString("pending", "[]") ?: "[]"
      val array = JSONArray(raw)
      val results = (0 until array.length()).mapNotNull { index ->
        val obj = array.optJSONObject(index) ?: return@mapNotNull null
        mapOf(
          "id" to obj.optString("id"),
          "sender" to obj.optString("sender"),
          "body" to obj.optString("body"),
          "amount" to obj.optLong("amount"),
          "type" to obj.optString("type"),
          "last4" to obj.optString("last4"),
          "timestamp" to obj.optLong("timestamp"),
          "source" to obj.optString("source")
        )
      }
      prefs.edit().remove("pending").apply()
      results
    }
  }
}
