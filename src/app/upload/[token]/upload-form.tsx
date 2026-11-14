"use client";

import { useState } from "react";
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
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState("");
  const busy = phase === "preparing" || phase === "uploading" || phase === "finalizing";

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
        }),
      });
      const prepared = await responseJson(prepareResponse);
      if (typeof prepared.uploadUrl !== "string") {
        throw new Error("Сервер не выдал адрес загрузки. Попробуйте ещё раз.");
      }

      setPhase("uploading");
      await putFile(prepared.uploadUrl, selected, setProgress);

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
        <p>Задача создана и стоит в очереди. Монтаж появится на следующем этапе.</p>
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

      {(phase === "uploading" || phase === "finalizing") && (
        <div className="upload-progress" aria-live="polite">
          <div>
            <span>{phase === "finalizing" ? "Создаём задачу…" : "Загружаем видео…"}</span>
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
      <p className="upload-note">Загруженный файл автоматически удаляется через 1 день.</p>
    </div>
  );
}
