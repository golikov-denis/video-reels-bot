# Разработка и эксплуатация

## 1. Архитектура

### Управляющая часть — Vercel

Next.js, TypeScript и App Router. Здесь размещаются Telegram webhook, health-check, страница загрузки, API загрузки и callback обработчика. Vercel не выполняет FFmpeg и не принимает видео в теле serverless-запроса.

### Данные — Neon PostgreSQL и Backblaze B2

Neon хранит пользователей, идемпотентность Telegram updates, upload sessions и задачи. Drizzle ORM управляет схемой и SQL-миграциями. Telegram ID и размеры файлов хранятся как `bigint`; внутренние идентификаторы — UUID.

Приватный B2 bucket хранит исходники и результаты. Браузер загружает исходник напрямую по подписанному PUT URL. Worker читает исходник по подписанному GET URL, не сохраняя его целиком, а результат временно пишет в локальный временный каталог и отправляет в B2 как `results/<jobId>/reel.mp4`. Lifecycle bucket удаляет объекты через один день.

### Обработчик — Railway

Отдельный Node.js HTTP service в Docker с системными FFmpeg и FFprobe. Vercel вызывает `POST /process` после создания задачи; постоянного polling Neon нет. Это позволяет Railway Serverless засыпать при отсутствии работы и просыпаться по входящему запросу. Healthcheck — `GET /health`, порт задаётся через `PORT`.

PostgreSQL lease и heartbeat не дают двум процессам одновременно обрабатывать одну задачу. In-memory `Set` дополнительно отсекает повторный trigger внутри replica. Допускаются не более двух попытки; повреждённое или слишком длинное видео не повторяется. Один replica обрабатывает задачи последовательно в рамках текущего ограничения ресурсов.

## 2. Поток обработки

1. Webhook проверяет секрет Telegram и сохраняет `update_id`; повторный update не создаёт новую сессию.
2. `/start` создаёт пользователя и upload session на 30 минут. В базе сохраняется только SHA-256 хеш токена.
3. `prepare` проверяет срок и метаданные, создаёт server-generated object key и выдаёт PUT URL на 10 минут.
4. Браузер отправляет файл напрямую в B2 и показывает фактический прогресс.
5. `complete` выполняет HeadObject, сверяет размер и Content-Type, затем в транзакции создаёт единственную задачу `queued`.
6. Для новой задачи Vercel подписывает `{jobId}` и вызывает Railway. Сбой trigger не отменяет уже созданную задачу и не ломает идемпотентный `complete`.
7. Worker в транзакции `FOR UPDATE SKIP LOCKED` получает lease, переводит задачу в `processing` и увеличивает `attempts`.
8. FFprobe проверяет наличие видео и длительность не более 3600 секунд. FFmpeg создаёт ролик длительностью до 30 секунд, 720×1280, H.264/AAC, CRF 28, preset `veryfast`, `faststart`. Весь исходный кадр сохраняется поверх размытого фона; звук необязателен.
9. Результат загружается в B2. Worker подписывает callback и отправляет его на `/api/worker/callback`; временные ошибки повторяются до трёх раз.
10. Vercel обновляет `completed` или `failed`, затем отправляет видео либо понятную ошибку в Telegram. После подтверждения записывается `notificationSentAt`; последующие callback не создают дубликат. До подтверждения повторная доставка допускается.

## 3. Правила процесса

Обычное изменение:

```text
изменение → npm run check → git status → проверка секретов → commit → push → READY/Active → smoke-test
```

Рискованное изменение: отдельная ветка, Vercel Preview, тестовый бот, отдельные Neon branch, B2 bucket, Railway service и worker secret, реальная загрузка небольшого файла, затем merge в `main`.

Не использовать localhost.run, Cloudflare Tunnel, VPN-туннели или локальный polling-бот. Полный пользовательский сценарий проверяется только после публичного deployment.

Перед коммитом:

1. Выполнить `npm run check`.
2. Проверить `git status` и `git diff --check`.
3. Убедиться, что `.env`, реальные ключи, видео, архивы и временные снимки не попали в индекс.
4. Не сообщать об успешном deployment до фактического READY/Active и smoke-test.

## 4. Безопасность

- Секреты Telegram, B2, Neon и worker используются только на сервере.
- Worker и callback используют HMAC-SHA256 от `${timestamp}.${rawBody}`, окно пять минут и `timingSafeEqual`.
- JSON ограничен по размеру; UUID, статусы, result key, размер и длительность проверяются.
- FFmpeg запускается через `spawn` с массивом аргументов, без shell. Подписанные URL не пишутся в журналы.
- Upload token содержит 32 случайных байта и хранится только как хеш.
- Object key генерируется сервером; исходное имя файла не управляет путём в bucket.
- Bucket приватный; CORS разрешает только PUT с точного origin приложения.
- Ошибки пользователю не содержат FFmpeg stderr, stack trace, строки подключения или внутренние детали.
- Временный каталог результата удаляется после успеха или ошибки.

Подписанная ссылка — bearer credential. На этом этапе нет антивирусного сканирования, rate limiting, Mini App-авторизации и автоматического восстановления queued задачи после полного отказа trigger.

## 5. Миграции, deployment и откат

1. Изменения схемы вносить в `src/db/schema.ts` и генерировать SQL через `npm run db:generate`.
2. Проверять SQL и включать `drizzle/meta/` в тот же commit.
3. Vercel Build Command: `npm run db:migrate && npm run build`.
4. Railway использует `worker/Dockerfile`; production dependencies устанавливаются через `npm ci --omit=dev`.
5. Миграции должны быть обратно совместимы. Добавление статусов и nullable/с default-полей не удаляет старые данные.
6. Сначала дождаться успешного Preview и проверить реальные переходы и MP4, только затем merge в `main`.

Откат deployment не откатывает схему. Исправление схемы — отдельная forward-миграция; destructive changes требуют плана и резервной копии.

## 6. Мониторинг и smoke-test

- Vercel: `/api/health`, deployment READY, Function Logs без секретов.
- Railway: service Active, `/health`, отсутствие постоянного polling и повторяющихся сбоев callback.
- Neon: `queued → processing → completed/failed`, attempts, lease, heartbeat и notificationSentAt.
- B2: исходник и `results/<jobId>/reel.mp4`, размер, Content-Type и lifecycle.
- Telegram: `/start`, загрузка небольшого файла, получение одного вертикального MP4.
- FFprobe результата: 720×1280, длительность ≤ 30 секунд, H.264, AAC при наличии исходного звука.
- Повторный `complete` возвращает тот же job ID; повторный подтверждённый callback не отправляет дубликат.

## 7. Известные ограничения

- Берутся первые максимум 30 секунд, а не автоматически выбранный интересный фрагмент.
- Исходники длиннее 60 минут отклоняются. Максимальный результат по callback — 200 МБ.
- Нет Mini App, распознавания речи, перевода, субтитров, баннеров, истории, подписки и административной диагностики.
- Нет отдельного scheduler для восстановления задачи, если первый HTTP trigger не достиг worker.
- Telegram получает результат по временной signed URL; доставка зависит от доступности B2 для Telegram.
- Платные AI API и реальные платные превышения не активируются без отдельного разрешения владельца.

## 8. Стоимость

Vercel, Neon и Backblaze используются в выбранных бесплатных лимитах. Railway worker должен оставаться на Free/Trial с Serverless и одной replica; платный Hobby и дополнительные ресурсы без разрешения не включаются. Перед увеличением длительности, числа replica или нагрузки нужно заново проверить RAM, CPU, egress и стоимость.

## 9. Официальные источники

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Vercel Git deployments: https://vercel.com/docs/git
- Neon Vercel integration: https://neon.com/docs/guides/vercel
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- Backblaze B2 S3-compatible API: https://www.backblaze.com/docs/cloud-storage-s3-compatible-api
- Telegram Bot API: https://core.telegram.org/bots/api
- Railway Serverless: https://docs.railway.com/reference/serverless
- Railway pricing: https://railway.com/pricing
