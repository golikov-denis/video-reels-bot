import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getUploadSessionState } from "@/lib/uploads";
import { UploadForm } from "./upload-form";

const messages = {
  invalid: {
    title: "Ссылка недействительна",
    text: "Получите новую защищённую ссылку командой /start в Telegram-боте.",
  },
  expired: {
    title: "Ссылка устарела",
    text: "Срок действия ссылки — 30 минут. Отправьте /start в боте, чтобы получить новую.",
  },
  unavailable: {
    title: "Сервис временно недоступен",
    text: "Не удалось проверить ссылку. Подождите немного и обновите страницу.",
  },
};

async function UploadContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;
  const state = await getUploadSessionState(token);

  if (state.status === "ready") return <UploadForm token={token} />;
  if (state.status === "completed") {
    return (
      <section className="upload-success">
        <h2>Задача уже создана</h2>
        <p>Эта ссылка использована. Повторно загружать видео не нужно.</p>
        <div className="job-number">
          <span>Номер задачи</span>
          <code>{state.jobId}</code>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-message" role="alert">
      <h2>{messages[state.status].title}</h2>
      <p>{messages[state.status].text}</p>
    </section>
  );
}

export default function UploadPage(props: PageProps<"/upload/[token]">) {
  return (
    <main className="upload-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Ролики — на главную">
          <span className="brand-mark" aria-hidden="true">Р</span>
          <span>Ролики</span>
        </Link>
        <span className="topbar-label">Защищённая загрузка</span>
      </header>

      <section className="upload-layout">
        <div className="upload-intro">
          <span className="upload-step">Новая задача</span>
          <h1>Загрузите<br />исходное видео.</h1>
          <p>
            Файл попадёт прямо в защищённое хранилище. После загрузки мы создадим задачу и пришлём её номер в Telegram.
          </p>
        </div>

        <div className="upload-panel">
          <Suspense fallback={<p className="upload-loading" role="status">Проверяем ссылку…</p>}>
            <UploadContent params={props.params} />
          </Suspense>
        </div>
      </section>

      <footer className="footer">
        <p>Не передавайте эту ссылку другим людям.</p>
        <span>MP4 · MOV · MKV · WebM</span>
      </footer>
    </main>
  );
}
