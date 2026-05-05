import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BOT_TOKEN = "8483206778:AAGzc0fy8JWIP5uZ24EK2Zv7iiSmM_ETD3M"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

serve(async (req) => {
  try {
    const { message } = await req.json()
    if (!message || !message.text) return new Response("ok")

    const chat_id = message.chat.id
    const text = message.text.trim()
    const username = message.from?.username?.toLowerCase()

    if (text === "/start") {
      if (!username) {
        await sendMessage(chat_id, "Ошибка: У вас не настроен username в Telegram.")
        return new Response("ok")
      }

      // Find pending user
      const { data: user, error } = await supabase
        .table("users")
        .select("*")
        .eq("telegram", username)
        .eq("status", "pending")
        .maybeSingle()

      if (user && user.tgCode) {
        // Save chatId to user record for future notifications
        await supabase.table("users").update({ chatId: chat_id }).eq("id", user.id)
        await sendMessage(chat_id, `Ваш код: ${user.tgCode}`)
      } else {
        await sendMessage(chat_id, "Привет! Пожалуйста, сначала начните регистрацию на сайте и укажите ваш никнейм.")
      }
    }

    return new Response("ok")
  } catch (err) {
    console.error(err)
    return new Response("error", { status: 500 })
  }
})

async function sendMessage(chat_id: number, text: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  })
}
