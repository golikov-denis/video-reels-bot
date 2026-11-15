# Ролики

Telegram-бот для создания вертикальных роликов из длинных видео. Next.js-приложение работает на Vercel, а отдельный Docker-обработчик с FFmpeg, faster-whisper и Argos Translate — на Railway.

## Текущий объём

Реализованы этапы 1–5:

- русскоязычная стартовая страница и защищённый Telegram webhook;
- идемпотентная обработка `/start` и сохранение пользователя в Neon PostgreSQL;
- одноразовая ссылка на загрузку, действующая 30 минут;
- прямая загрузка MP4, MOV, MKV или WebM размером до 2 ГБ в приватное S3-совместимое хранилище;
- проверка фактически загруженных размера и MIME-типа;
- транзакционное создание единственной задачи без дублей;
- HTTP-запуск отдельного обработчика с HMAC-подписью;
- lease, heartbeat и не более двух попыток обработки;
- FFprobe-проверка видео и отказ для файлов длиннее 60 минут;
- локальное распознавание речи faster-whisper на CPU без платных AI API;
- автоматический выбор фрагмента 6–30 секунд по границам фраз, плотности речи, паузам, повторам, крючку и рекламным маркерам;
- безопасный вариант при низкой уверенности, отсутствии речи или ошибке распознавания, если субтитры не запрошены; короткие видео сохраняются целиком;
- FFmpeg-монтаж выбранного фрагмента в 720×1280, H.264/AAC, с полным кадром поверх размытого фона;
- субтитры на языке оригинала: обычные фразы или karaoke с таймингами слов, встраивание ASS через libass;
- офлайн-перевод выбранного фрагмента RU→EN и EN→RU через Argos Translate, без внешних API и расхода токенов;
- баннер PNG/JPG до 5 МБ с предпросмотром, выбором положения и масштаба, загрузкой напрямую в B2 и наложением через FFmpeg;
- сохранение настроек монтажа в upload session и snapshot настроек в задаче;
- сохранение границ, уверенности, стратегии выбора и языка в задаче;
- подписанный callback, статусы `queued → processing → completed/failed` и выдача MP4 через Telegram;
- отдельные сообщения при отсутствии речи, несовпадении языка перевода и ошибке перевода;
- защита от повторного уведомления после подтверждённой доставки;
- автоматические тесты и единая команда `npm run check`.

Выбор фрагмента — понятная эвристика, а не гарантия идеального семантического монтажа. Перевод использует обычные фразовые субтитры; karaoke доступно только для исходной речи с точными таймингами слов. Если речь недоступна или язык не соответствует направлению перевода, задача завершается с понятной ошибкой, а оригинал не выдаётся за перевод. Баннер и настройки применяются к текущему ролику; долговременных настроек «на пачку» пока нет. Mini App, платежи и история относятся к следующим этапам.

## Требования

- Node.js 24 или новее, поддерживаемая Next.js версия;
- npm;
- аккаунты GitHub, Vercel, Neon, Backblaze и Railway;
- бот в @BotFather для публикации.

Docker локально не обязателен: короткие медиатесты используют `ffmpeg-static` и `ffprobe-static` и не запускают распознавание или перевод. В production-контейнере установлены системные FFmpeg, FFprobe, Python, DejaVu Sans, закреплённая tiny-модель faster-whisper и офлайн-модели Argos RU↔EN.

## Проверка кода

```bash
npm ci
npm run check
```

Команда последовательно запускает ESLint, TypeScript, Vitest и production build. Тесты включают реальный FFmpeg на коротких сгенерированных файлах, обрезку со смещением, кириллические ASS-субтитры и PNG-overlay, но не заменяют проверку Docker-сборки Argos, faster-whisper, Neon, Backblaze B2, Railway и Telegram после deployment. Локальный Telegram-бот и туннели не используются.

## Настройка после deployment

1. Скопируйте `.env.example` в `.env` и заполните переменные локально. Файл `.env` исключён из Git.
2. Подключите Neon к проекту Vercel и добавьте серверные переменные Telegram, приложения, B2 и worker.
3. Используйте приватный B2 bucket и отдельный ключ только с нужными правами. Настройте CORS для точного HTTPS-адреса приложения и удаление объектов через один день.
4. В Vercel установите Build Command override: `npm run db:migrate && npm run build`.
5. Создайте Railway service из того же GitHub-репозитория, выберите `worker/Dockerfile`, healthcheck `/health` и Serverless. Railway передаёт `PORT` автоматически.
6. В Railway задайте `APP_URL`, Neon, B2 и `WORKER_SHARED_SECRET` соответствующего окружения. В Vercel задайте HTTPS `WORKER_URL` и тот же секрет. Preview и Production используют разные секреты и ресурсы.
7. Дождитесь Railway Active и Vercel READY. Зарегистрируйте webhook соответствующего бота:

```bash
npm run webhook:setup
```

8. Проверьте `https://ВАШ-ДОМЕН/api/health`, затем отправьте `/start` тестовому боту, загрузите небольшое видео и дождитесь MP4 в Telegram.

Не переключайте production webhook на Preview. Для Preview используйте стабильный branch alias в `APP_URL`, чтобы CORS и ссылки не зависели от адреса конкретного deployment.

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Серверный токен из @BotFather, только Vercel |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет входящих запросов Telegram, только Vercel |
| `APP_URL` | Публичный HTTPS-адрес Vercel; на Railway используется для callback |
| `DATABASE_URL` | Pooled-строка Neon для приложения и worker |
| `DATABASE_URL_UNPOOLED` | Прямая строка Neon для миграций |
| `S3_ACCESS_KEY_ID` | Идентификатор отдельного ключа B2 |
| `S3_SECRET_ACCESS_KEY` | Секретная часть ключа B2 |
| `S3_ENDPOINT` | S3 endpoint региона B2 |
| `S3_REGION` | Регион B2, например `eu-central-003` |
| `S3_BUCKET` | Имя приватного bucket соответствующего окружения |
| `WORKER_URL` | HTTPS-адрес Railway, только Vercel |
| `WORKER_SHARED_SECRET` | Общий HMAC-секрет Vercel и Railway, минимум 32 символа |
| `PORT` | Порт worker, автоматически задаёт Railway |

Настоящие значения нельзя выводить в чат, коммитить или записывать в журналы. При компрометации соответствующий токен, ключ или секрет нужно перевыпустить и повторить deployment.

## Структура

```text
src/app/api/health/route.ts                 health-check приложения
src/app/api/telegram/webhook/route.ts       входной webhook
src/app/api/uploads/[token]/prepare/       подготовка прямой загрузки видео и баннера
src/app/api/uploads/[token]/complete/      создание задачи и запуск worker
src/app/api/worker/callback/route.ts       подписанный результат worker
src/app/upload/[token]/                    страница загрузки и настроек монтажа
src/db/                                    подключение Neon и схема Drizzle
src/lib/render-options.ts                  общая проверка настроек рендера
src/lib/worker-auth.ts                     HMAC-подписи
src/lib/worker-callback.ts                 переходы и идемпотентные уведомления
src/lib/storage.ts                         signed URL и загрузка результата B2
src/lib/telegram.ts                        сообщения и sendVideo
worker/src/subtitles.ts                    обрезка речи и ASS/karaoke
worker/src/translation.ts                  интерфейс офлайн-переводчика
worker/src/translate.py                    Argos Translate RU↔EN
worker/src/                                HTTP server, lease, FFmpeg и callback
worker/Dockerfile                          production-обработчик и офлайн-модели
drizzle/                                   версионированные SQL-миграции
scripts/                                   webhook и настройка bucket
tests/, worker/tests/                      автоматические тесты
DEVELOPMENT.md                             архитектура и эксплуатация
```

## Deployment

Production-адрес: https://video-reels-bot.vercel.app

Приватный репозиторий `golikov-denis/video-reels-bot` подключён к Vercel. Production-ветка — `main`. Рискованные изменения сначала проходят отдельную ветку, Preview и полный smoke-test. Перед каждым push обязателен `npm run check`.
