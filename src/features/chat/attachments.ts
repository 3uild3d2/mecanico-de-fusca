import type { FileUIPart } from "ai";

import { garantirSessao } from "@/features/auth/supabase-auth";
import { getSupabase } from "@/shared/lib/supabase";

const ALLOWED_MEDIA_PREFIXES = ["image/", "audio/"];
const BUCKET = "anexos";

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
  const user = await garantirSessao();
  const supabase = getSupabase();

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
      const path = `${user.id}/${threadId}/${crypto.randomUUID()}-${filename}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: file.mediaType,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { error: rowError } = await supabase.from("attachments").insert({
        user_id: user.id,
        caminho: path,
        media_type: file.mediaType ?? "application/octet-stream",
        bytes: blob.size,
      });
      if (rowError) throw rowError;

      return {
        ...serializableFile,
        url: data.publicUrl,
      };
    }),
  );
}
