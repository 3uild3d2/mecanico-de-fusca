import type { FileUIPart } from "ai";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { getFirebaseStorage } from "@/shared/lib/firebase";
import { getCurrentThreadUserId, waitForThreadsReady } from "./api";

const ALLOWED_MEDIA_PREFIXES = ["image/", "audio/"];
const RETENTION_HOURS = 48;

type UploadableChatFile = FileUIPart & { sourceFile?: File };

function isAllowedMediaType(mediaType: string | undefined) {
  return Boolean(
    mediaType && ALLOWED_MEDIA_PREFIXES.some((prefix) => mediaType.startsWith(prefix)),
  );
}

function safeFileName(fileName: string | undefined, fallback: string) {
  return (fileName || fallback).replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");
  const mediaType = header.match(/^data:(.*?);base64$/)?.[1] ?? "application/octet-stream";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mediaType });
}

export async function uploadChatFiles(threadId: string, files: UploadableChatFile[]) {
  await waitForThreadsReady();
  const uid = getCurrentThreadUserId();
  if (!uid) {
    throw new Error("Usuário Firebase não inicializado para upload de anexos.");
  }

  const storage = getFirebaseStorage();

  return Promise.all(
    files.map(async (file, index): Promise<FileUIPart> => {
      const { sourceFile, ...serializableFile } = file;

      if (!isAllowedMediaType(file.mediaType)) {
        throw new Error("Envie apenas imagens ou áudio. Vídeo não é suportado.");
      }

      if (file.url.startsWith("http://") || file.url.startsWith("https://")) {
        return serializableFile;
      }

      if (!file.url.startsWith("data:") && !sourceFile) {
        throw new Error("Não foi possível preparar o anexo para envio. Remova e anexe novamente.");
      }

      const blob = sourceFile ?? dataUrlToBlob(file.url);
      const extension = file.mediaType?.split("/")[1]?.split(";")[0] ?? "bin";
      const fallback = `attachment-${index}.${extension}`;
      const filename = safeFileName(file.filename, fallback);
      const path = `users/${uid}/threads/${threadId}/attachments/${Date.now()}-${index}-${filename}`;
      // A lifecycle rule do bucket é quem apaga de fato; este metadado documenta a intenção.
      const expiresAt = new Date(Date.now() + RETENTION_HOURS * 60 * 60 * 1000).toISOString();

      const snapshot = await uploadBytes(ref(storage, path), blob, {
        contentType: file.mediaType,
        customMetadata: { expiresAt, threadId, uid },
      });

      return {
        ...serializableFile,
        url: await getDownloadURL(snapshot.ref),
      };
    }),
  );
}
