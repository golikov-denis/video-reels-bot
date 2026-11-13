# Ролики

Telegram-бот для автоматического создания вертикальных роликов из длинных видео. Репозиторий содержит управляющее Next.js-приложение; обработка видео будет вынесена в отдельный Docker-контейнер.

## Текущий объём

Реализован первый каркас:

- русскоязычная стартовая страница;
- `GET /api/health` с HTTP 200 и состоянием конфигурации без секретов;
- `POST /api/telegram/webhook` с проверкой `X-Telegram-Bot-Api-Secret-Token`;
- базовый ответ на `/start`;
- автоматические тесты webhook и health-check;
- единая команда `npm run check`.

Загрузка и обработка видео, Mini App, база данных, хранилище и платежи на этом этапе не реализованы и не имитируются.

## Требования

- Node.js 24;
- npm;
- аккаунты GitHub, Vercel и бот в @BotFather для публикации.

## Проверка кода

```bash
npm ci
npm run check
```

Команда последовательно запускает ESLint, TypeScript, Vitest и production build. Локальный Telegram-бот, длительный end-to-end сценарий и туннели не используются.

## Настройка после deployment

1. Скопируйте `.env.example` в `.env` и заполните три переменные локально. Файл `.env` исключён из Git.
2. В Vercel добавьте те же значения в Project Settings → Environment Variables → Production.
3. Убедитесь, что production deployment имеет статус READY.
4. В `APP_URL` укажите production HTTPS-адрес без завершающего `/`.
5. Зарегистрируйте webhook:

```bash
npm run webhook:setup
```

6. Проверьте `https://ВАШ-ДОМЕН/api/health`, затем отправьте `/start` боту в Telegram.

Для Preview используйте отдельного тестового бота и отдельные данные. Не переключайте production webhook на Preview.

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Серверный токен из @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Отдельный секрет для проверки входящих запросов |
| `APP_URL` | Публичный production HTTPS-адрес; нужен только скрипту настройки webhook |

Настоящие значения нельзя выводить в чат, коммитить или записывать в журналы. При компрометации токен нужно перевыпустить через @BotFather, секрет webhook — заменить в Vercel и повторно зарегистрировать webhook.

## Структура

```text
src/app/api/health/route.ts             health-check
src/app/api/telegram/webhook/route.ts   входной webhook
src/lib/config.ts                       серверная конфигурация
src/lib/telegram.ts                     проверка и отправка сообщений Telegram
scripts/setup-webhook.mjs               регистрация webhook на Vercel
tests/webhook.test.ts                   автоматические тесты
DEVELOPMENT.md                          архитектура, процесс и следующие этапы
```

## Deployment

Production-адрес: https://video-reels-bot.vercel.app

Приватный репозиторий `golikov-denis/video-reels-bot` подключён к Vercel. Production-ветка — `main`: каждый push в неё запускает production deployment автоматически. Перед каждым push обязателен `npm run check`.

Подробности — в `DEVELOPMENT.md`.
