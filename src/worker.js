/**
 * Cloudflare Worker: Telegram Bot + MiniApp API Backend
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // CORS заголовки для вызова из WebApp
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // 1. Обработка Webhook от Telegram
        if (url.pathname === `/webhook/${env.BOT_TOKEN}`) {
            try {
                const update = await request.json();
                if (update.message && update.message.text === '/start') {
                    await handleStartCommand(update.message, env);
                }
                return new Response('OK');
            } catch (err) {
                return new Response('Error', { status: 500 });
            }
        }

        // 2. API: Прием новой заявки из Mini App
        if (url.pathname === '/api/lead' && request.method === 'POST') {
            try {
                const data = await request.json();

                // Формируем красивое уведомление для админа в Telegram
                const usernameText = data.user?.username ? `@${data.user.username}` : 'Не указан';
                const message = 
                    `🚨 <b>НОВАЯ ЗАЯВКА [ГАИ НОВОСИБИРСК]</b>\n\n` +
                    `📌 <b>Услуга:</b> ${data.service}\n` +
                    `👤 <b>Имя:</b> ${data.name}\n` +
                    `📞 <b>Телефон:</b> <code>${data.phone}</code>\n` +
                    `💬 <b>Комментарий:</b> ${data.comment || 'Отсутствует'}\n` +
                    `✈️ <b>TG профиль:</b> ${usernameText}\n` +
                    `🕒 <b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Novosibirsk' })}`;

                // Отправка в Telegram админу
                await sendTelegramMessage(env.BOT_TOKEN, env.ADMIN_ID, message, {
                    inline_keyboard: [
                        [
                            { text: "📞 Позвонить", url: `tel:${data.phone}` },
                            ...(data.user?.username ? [{ text: "✈️ Написать в TG", url: `https://t.me/${data.user.username}` }] : [])
                        ]
                    ]
                });

                // Сохранение в KV (если привязан) для админ-панели
                if (env.LEADS_KV) {
                    const id = Date.now().toString();
                    await env.LEADS_KV.put(`lead_${id}`, JSON.stringify({ ...data, date: new Date().toISOString() }));
                }

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        // 3. API: Получение списка заявок для встроенной админки
        if (url.pathname === '/api/admin/leads') {
            let leads = [];
            if (env.LEADS_KV) {
                const list = await env.LEADS_KV.list({ prefix: 'lead_' });
                for (const key of list.keys) {
                    const raw = await env.LEADS_KV.get(key.name);
                    if (raw) leads.push(JSON.parse(raw));
                }
                leads.sort((a, b) => new Date(b.date) - new Date(a.date));
            }
            return new Response(JSON.stringify({ leads, today: leads.length }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response('GAI Novosibirsk Bot API is running.');
    }
};

// Функция ответа на /start с кнопкой Mini App
async function handleStartCommand(msg, env) {
    const chatId = msg.chat.id;
    const text = 
        `👋 <b>Добро пожаловать в сервис помощи ГАИ Новосибирск!</b>\n\n` +
        `Решаем любые вопросы быстро, надежно и без очередей:\n` +
        `• Постановка на учёт без присутствия\n` +
        `• Сохранение и перевес номеров\n` +
        `• Красивые гос. номера\n` +
        `• Сопровождение на техосмотр\n` +
        `• Помощь со штрафстоянкой\n\n` +
        `Нажмите кнопку ниже, чтобы открыть каталог услуг:`;

    await sendTelegramMessage(env.BOT_TOKEN, chatId, text, {
        inline_keyboard: [
            [
                {
                    text: "🚀 Открыть Сервис ГАИ",
                    web_app: { url: env.WEBAPP_URL }
                }
            ],
            [
                { text: "👨‍💻 Связаться с оператором", url: "https://t.me/p_marlow" }
            ]
        ]
    });
}

// Отправка сообщений в Telegram API
async function sendTelegramMessage(token, chatId, text, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
    };

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}