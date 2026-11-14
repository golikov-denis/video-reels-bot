# Ролики

Telegram-бот для автоматического создания вертикальных роликов из длинных видео. Репозиторий содержит управляющее Next.js-приложение; обработка видео будет вынесена в отдельный Docker-контейнер.

## Текущий объём

Реализованы первый и второй этапы:

- русскоязычная стартовая страница;
- `GET /api/health` с HTTP 200 и состоянием конфигурации Telegram без секретов;
- `POST /api/telegram/webhook` с проверкой `X-Telegram-Bot-Api-Secret-Token`;
- идемпотентная обработка `/start` и сохранение пользователя в Neon PostgreSQL;
- одноразовая ссылка на загрузку, действующая 30 минут;
- прямая загрузка MP4, MOV, MKV или WebM размером до 2 ГБ в приватное S3-совместимое хранилище;
- проверка фактически загруженных размера и MIME-типа на сервере;
- транзакционное создание задачи со статусом `queued` без повторных задач при повторном запросе;
- автоматические тесты webhook, проверки метаданных и API загрузки;
- единая команда `npm run check`.

Обработка видео, Mini App, распознавание речи, перевод, субтитры, платежи и история ещё не реализованы и не имитируются. Статус `queued` означает только постановку в очередь, а не готовый ролик.

## Требования

- Node.js 24 или новее, поддерживаемая Next.js версия;
- npm;
- аккаунты GitHub, Vercel, Neon и Backblaze;
- бот в @BotFather для публикации.

## Проверка кода

```bash
npm ci
npm run check
```

Команда последовательно запускает ESLint, TypeScript, Vitest и production build. Тесты используют моки и не заменяют проверку реальных Neon, Backblaze B2 и Telegram после deployment. Локальный Telegram-бот, длительный end-to-end сценарий и туннели не используются.

## Настройка после deployment

1. Скопируйте `.env.example` в `.env` и заполните переменные локально. Файл `.env` исключён из Git.
2. Подключите Neon к проекту Vercel и добавьте серверные переменные Telegram, приложения и B2 в Project Settings → Environment Variables.
3. Используйте приватный B2 bucket и отдельный ключ только с нужными правами. Настройте CORS для точного HTTPS-адреса приложения и удаление объектов через один день.
4. В Vercel установите Build Command override: `npm run db:migrate && npm run build`. Миграции применяются до сборки; при ошибке миграции deployment не публикуется.
5. Убедитесь, что deployment имеет статус READY.
6. В `APP_URL` укажите HTTPS-адрес соответствующего окружения без завершающего `/`.
7. Зарегистрируйте webhook локально с серверными настройками соответствующего бота:

```bash
npm run webhook:setup
```

8. Проверьте `https://ВАШ-ДОМЕН/api/health`, затем отправьте `/start` боту в Telegram, откройте полученную ссылку и загрузите небольшой настоящий видеофайл.

Для Preview используйте отдельного тестового бота, отдельный B2 bucket и отдельную Neon branch. Не переключайте production webhook на Preview. Для Preview задайте стабильный branch alias в `APP_URL`, чтобы CORS и ссылки не зависели от адреса конкретного deployment.

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Серверный токен из @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Отдельный секрет для проверки входящих запросов |
| `APP_URL` | Публичный HTTPS-адрес приложения; используется в ссылках загрузки и настройке webhook |
| `DATABASE_URL` | Pooled-строка подключения Neon для приложения и миграций |
| `DATABASE_URL_UNPOOLED` | Прямая строка подключения Neon, создаётся интеграцией |
| `S3_ACCESS_KEY_ID` | Идентификатор отдельного ключа B2 |
| `S3_SECRET_ACCESS_KEY` | Секретная часть ключа B2 |
| `S3_ENDPOINT` | S3 endpoint региона B2 |
| `S3_REGION` | Регион B2, например `eu-central-003` |
| `S3_BUCKET` | Имя приватного bucket соответствующего окружения |

Настоящие значения нельзя выводить в чат, коммитить или записывать в журналы. При компрометации токен нужно перевыпустить через @BotFather, секрет webhook — заменить в Vercel и повторно зарегистрировать webhook, ключи B2 — перевыпустить, пароль базы — сбросить в Neon и повторить deployment.

## Структура

```text
src/app/api/health/route.ts                 health-check
src/app/api/telegram/webhook/route.ts       входной webhook
src/app/api/uploads/[token]/prepare/       подготовка прямой загрузки
src/app/api/uploads/[token]/complete/      проверка файла и создание задачи
src/app/upload/[token]/                    страница загрузки
src/db/                                    подключение Neon и схема Drizzle
src/lib/start.ts                           идемпотентная обработка /start
src/lib/uploads.ts                         состояние ссылки и создание задачи
src/lib/storage.ts                         подписанные URL и проверка объекта B2
src/lib/telegram.ts                        проверка и отправка сообщений Telegram
drizzle/                                   версионированные SQL-миграции
scripts/setup-webhook.mjs                  регистрация webhook на Vercel
scripts/configure-storage.mjs              CORS и lifecycle bucket
tests/                                     автоматические тесты
DEVELOPMENT.md                             архитектура, процесс и следующие этапы
```

## Deployment

Production-адрес: https://video-reels-bot.vercel.app

Приватный репозиторий `golikov-denis/video-reels-bot` подключён к Vercel. Production-ветка — `main`: каждый push в неё запускаёт production deployment автоматически. Рискованные изменения сначала проходят отдельную ветку и полный Preview smoke-test. Перед каждым push обязателен `npm run check`.

Подробности — в `DEVELOPMENT.md`.
