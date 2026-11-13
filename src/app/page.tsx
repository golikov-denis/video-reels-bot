import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Загрузите видео",
    text: "Отправьте исходник в Telegram — без сложного редактора.",
  },
  {
    number: "02",
    title: "Выберите настройки",
    text: "Язык титров, перевод и баннер — в коротком сценарии.",
  },
  {
    number: "03",
    title: "Получите ролик",
    text: "Готовый вертикальный результат вернётся прямо в Telegram.",
  },
];

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Ролики — на главную">
          <span className="brand-mark" aria-hidden="true">Р</span>
          <span>Ролики</span>
        </Link>
        <span className="topbar-label">Автоматический монтаж в Telegram</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="status"><span aria-hidden="true" />Сервис запускается</div>
        <h1 id="hero-title">Из длинного видео —<br /><em>готовый ролик.</em></h1>
        <p className="hero-copy">
          Находим законченные интересные моменты, добавляем титры и ваш баннер.
          Без обещаний идеального монтажа — с понятными настройками и результатом в Telegram.
        </p>
      </section>

      <section className="steps" aria-label="Как будет работать сервис">
        {steps.map((step) => (
          <article className="step" key={step.number}>
            <span className="step-number">{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </section>

      <footer className="footer">
        <p>Первый этап: каркас сервиса и защищённая связь с Telegram.</p>
        <a href="/api/health">Проверить состояние сервиса <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
