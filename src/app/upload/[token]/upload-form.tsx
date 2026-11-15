"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  isAllowedBannerContentType,
  MAX_BANNER_BYTES,
  resolveBannerContentType,
  type BannerPosition,
  type SubtitleMode,
  type SubtitleStyle,
  type TranslationDirection,
} from "@/lib/render-options";
import {
  isAllowedContentType,
  MAX_FILE_BYTES,
  resolveContentType,
} from "@/lib/upload-rules";

type Phase = "idle" | "preparing" | "uploading" | "finalizing" | "success";

type SelectedFile = {
  file: File;
  contentType: string;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Не удалось выполнить запрос. Попробуйте ещё раз.",
    );
  }
  return body;
}

function putFile(
  uploadUrl: string,
  selected: SelectedFile,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", selected.contentType);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("Хранилище не приняло файл. Проверьте сеть и повторите попытку."));
    });
    request.addEventListener("error", () => {
      reject(new Error("Не удалось загрузить файл. Проверьте подключение к интернету."));
    });
    request.addEventListener("abort", () => {
      reject(new Error("Загрузка отменена. Попробуйте ещё раз."));
    });
    request.send(selected.file);
  });
}

export function UploadForm({ token }: { token: string }) {
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [banner, setBanner] = useState<SelectedFile | null>(null);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("off");
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>("standard");
  const [translationDirection, setTranslationDirection] =
    useState<TranslationDirection>("ru_en");
  const [bannerPosition, setBannerPosition] = useState<BannerPosition>("top_right");
  const [bannerScale, setBannerScale] = useState(0.25);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState("");
  const busy = phase === "preparing" || phase === "uploading" || phase === "finalizing";
  const bannerPreviewUrl = useMemo(
    () => (banner ? URL.createObjectURL(banner.file) : null),
    [banner],
  );

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
    };
  }, [bannerPreviewUrl]);

  function chooseFile(file: File | null) {
    setError("");
    if (!file) {
      setSelected(null);
      return;
    }
    if (file.size <= 0) {
      setSelected(null);
      setError("Выбранный файл пуст.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setSelected(null);
      setError("Файл больше 2 ГБ. Выберите видео меньшего размера.");
      return;
    }

    const contentType = resolveContentType(file.name, file.type);
    if (!isAllowedContentType(contentType)) {
      setSelected(null);
      setError("Поддерживаются видео MP4, MOV, MKV и WebM.");
      return;
    }
    setSelected({ file, contentType });
  }

  function chooseBanner(file: File | null) {
    setError("");
    if (!file) {
      setBanner(null);
      return;
    }
    if (file.size <= 0) {
      setBanner(null);
      setError("Выбранный баннер пуст.");
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setBanner(null);
      setError("Баннер больше 5 МБ. Выберите изображение меньшего размера.");
      return;
    }
    const contentType = resolveBannerContentType(file.name, file.type);
    if (!isAllowedBannerContentType(contentType)) {
      setBanner(null);
      setError("Баннер должен быть изображением PNG или JPG.");
      return;
    }
    setBanner({ file, contentType });
  }

  function changeSubtitleMode(mode: SubtitleMode) {
    setSubtitleMode(mode);
    if (mode !== "original") setSubtitleStyle("standard");
  }

  async function submit() {
    if (!selected || busy) return;
    setError("");
    setProgress(0);

    try {
      setPhase("preparing");
      const prepareResponse = await fetch(`/api/uploads/${token}/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: selected.file.name,
          size: selected.file.size,
          contentType: selected.contentType,
          renderOptions: {
            subtitleMode,
            subtitleStyle,
            translationDirection:
              subtitleMode === "translated" ? translationDirection : null,
            bannerPosition,
            bannerScale,
          },
          banner: banner
            ? {
                fileName: banner.file.name,
                size: banner.file.size,
                contentType: banner.contentType,
              }
            : null,
        }),
      });
      const prepared = await responseJson(prepareResponse);
      if (typeof prepared.uploadUrl !== "string") {
        throw new Error("Сервер не выдал адрес загрузки. Попробуйте ещё раз.");
      }
      if (banner && typeof prepared.bannerUploadUrl !== "string") {
        throw new Error("Сервер не выдал адрес загрузки баннера. Попробуйте ещё раз.");
      }

      setPhase("uploading");
      await putFile(prepared.uploadUrl, selected, setProgress);
      if (banner && typeof prepared.bannerUploadUrl === "string") {
        await putFile(prepared.bannerUploadUrl, banner, () => undefined);
      }
      setProgress(100);

      setPhase("finalizing");
      const completeResponse = await fetch(`/api/uploads/${token}/complete`, {
        method: "POST",
      });
      const completed = await responseJson(completeResponse);
      if (typeof completed.jobId !== "string") {
        throw new Error("Сервер не вернул номер задачи. Попробуйте ещё раз.");
      }

      setJobId(completed.jobId);
      setPhase("success");
    } catch (caught) {
      setPhase("idle");
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось загрузить видео. Попробуйте ещё раз.",
      );
    }
  }

  if (phase === "success") {
    return (
      <section className="upload-success" aria-live="polite">
        <svg className="success-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>Видео загружено</h2>
        <p>Задача создана и стоит в очереди. Готовый ролик появится в Telegram после обработки.</p>
        <div className="job-number">
          <span>Номер задачи</span>
          <code>{jobId}</code>
        </div>
        <p className="upload-note">Можно закрыть эту страницу и вернуться в Telegram.</p>
      </section>
    );
  }

  return (
    <div className="upload-controls">
      <label className="file-picker">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M5 15v4h14v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{selected ? "Выбрать другой файл" : "Выбрать видео"}</span>
        <small>MP4, MOV, MKV или WebM · до 2 ГБ</small>
        <input
          type="file"
          accept=".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/x-matroska,video/webm"
          disabled={busy}
          onClick={(event) => {
            event.currentTarget.value = "";
          }}
          onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
        />
      </label>

      {selected && (
        <div className="selected-file" aria-live="polite">
          <span className="file-name">{selected.file.name}</span>
          <span>{formatBytes(selected.file.size)}</span>
        </div>
      )}

      <fieldset className="render-settings" disabled={busy}>
        <legend>Субтитры</legend>
        <div className="setting-grid">
          <label className="setting-field">
            <span>Текст на ролике</span>
            <select
              value={subtitleMode}
              onChange={(event) => changeSubtitleMode(event.target.value as SubtitleMode)}
            >
              <option value="off">Без субтитров</option>
              <option value="original">На языке видео</option>
              <option value="translated">Переведённые</option>
            </select>
          </label>

          {subtitleMode === "translated" && (
            <label className="setting-field">
              <span>Направление перевода</span>
              <select
                value={translationDirection}
                onChange={(event) =>
                  setTranslationDirection(event.target.value as TranslationDirection)
                }
              >
                <option value="ru_en">Русский → английский</option>
                <option value="en_ru">Английский → русский</option>
              </select>
            </label>
          )}
        </div>

        {subtitleMode === "original" && (
          <div className="style-options" role="group" aria-label="Стиль субтитров">
            <label>
              <input
                type="radio"
                name="subtitle-style"
                value="standard"
                checked={subtitleStyle === "standard"}
                onChange={() => setSubtitleStyle("standard")}
              />
              Обычные фразы
            </label>
            <label>
              <input
                type="radio"
                name="subtitle-style"
                value="karaoke"
                checked={subtitleStyle === "karaoke"}
                onChange={() => setSubtitleStyle("karaoke")}
              />
              Караоке по словам
            </label>
          </div>
        )}
        <p className="setting-help">
          {subtitleMode === "translated"
            ? "Перевод выполняется локально на сервере. Язык видео должен совпадать с выбранным направлением. Для перевода используются обычные фразовые субтитры."
            : "Речь распознаётся локально, без платных API. Если речь не найдена, бот сообщит об ошибке, а не подставит другой текст."}
        </p>
      </fieldset>

      <fieldset className="render-settings" disabled={busy}>
        <legend>Баннер</legend>
        <label className="banner-picker">
          <span>{banner ? "Заменить изображение" : "Добавить PNG или JPG"}</span>
          <small>До 5 МБ · будет наложен на этот ролик</small>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => chooseBanner(event.currentTarget.files?.[0] ?? null)}
          />
        </label>

        {banner && bannerPreviewUrl && (
          <div className="banner-details">
            <div className="banner-preview">
              <img src={bannerPreviewUrl} alt="Предпросмотр выбранного баннера" />
            </div>
            <div className="selected-file">
              <span className="file-name">{banner.file.name}</span>
              <span>{formatBytes(banner.file.size)}</span>
            </div>
            <div className="setting-grid">
              <label className="setting-field">
                <span>Положение</span>
                <select
                  value={bannerPosition}
                  onChange={(event) =>
                    setBannerPosition(event.target.value as BannerPosition)
                  }
                >
                  <option value="top_left">Сверху слева</option>
                  <option value="top_center">Сверху по центру</option>
                  <option value="top_right">Сверху справа</option>
                  <option value="bottom_left">Снизу слева</option>
                  <option value="bottom_center">Снизу по центру</option>
                  <option value="bottom_right">Снизу справа</option>
                </select>
              </label>
              <label className="setting-field">
                <span>Ширина: {Math.round(bannerScale * 100)}% кадра</span>
                <input
                  className="scale-input"
                  type="range"
                  min="10"
                  max="50"
                  step="5"
                  value={Math.round(bannerScale * 100)}
                  onChange={(event) => setBannerScale(Number(event.target.value) / 100)}
                />
              </label>
            </div>
            <button className="text-button" type="button" onClick={() => setBanner(null)}>
              Убрать баннер
            </button>
          </div>
        )}
      </fieldset>

      {(phase === "uploading" || phase === "finalizing") && (
        <div className="upload-progress" aria-live="polite">
          <div>
            <span>{phase === "finalizing" ? "Создаём задачу…" : "Загружаем файлы…"}</span>
            <span>{phase === "finalizing" ? "100%" : `${progress}%`}</span>
          </div>
          <progress max="100" value={phase === "finalizing" ? 100 : progress}>
            {progress}%
          </progress>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <button
        className="primary-button"
        type="button"
        disabled={!selected || busy}
        onClick={submit}
      >
        {phase === "preparing"
          ? "Подготавливаем…"
          : busy
            ? "Пожалуйста, подождите…"
            : "Загрузить и создать задачу"}
      </button>
      <p className="upload-note">
        Настройки применяются к этому ролику. Загруженные файлы автоматически удаляются через 1 день.
      </p>
    </div>
  );
}
