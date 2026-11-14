import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Получите ссылку",
    text: "Отправьте /start боту в Telegram — он выдаст защищённую ссылку.",
  },
  {
    number: "02",
    title: "Загрузите видео",
    text: "Выберите исходник на телефоне или компьютере и создайте задачу.",
  },
  {
    number: "03",
    title: "Следующий этап — монтаж",
    text: "Сейчас видео ставится в очередь. Обработка ещё не запускается.",
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
        <div className="status"><span aria-hidden="true" />Загрузка видео доступна</div>
        <h1 id="hero-title">Из длинного видео —<br /><em>готовый ролик.</em></h1>
        <p className="hero-copy">
          Начните с команды /start в Telegram, загрузите исходник по защищённой ссылке
          и получите номер задачи. Автоматический монтаж будет подключён следующим этапом.
        </p>
      </section>

      <section className="steps" aria-label="Как работает сервис">
        {steps.map((step) => (
          <article className="step" key={step.number}>
            <span className="step-number">{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </section>

      <footer className="footer">
        <p>Второй этап: загрузка видео и очередь задач.</p>
        <a href="/api/health">Проверить состояние сервиса <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
