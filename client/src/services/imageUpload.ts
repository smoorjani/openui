/**
 * Shared image paste/drop support for terminal containers.
 * Returns a cleanup function that removes all event listeners.
 */
export function setupImageUpload(
  container: HTMLElement,
  sessionId: string,
  onUploaded: (filePath: string) => void,
): () => void {
  const uploadImage = async (file: File) => {
    const form = new FormData();
    form.append("image", file);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        console.error("[image-upload]", err.error);
        return;
      }
      const { filePath } = await res.json();
      if (filePath) onUploaded(filePath);
    } catch (e) {
      console.error("[image-upload] Network error:", e);
    }
  };

  const getImageFile = (dt: DataTransfer): File | null => {
    for (const file of Array.from(dt.files)) {
      if (file.type.startsWith("image/")) return file;
    }
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        return item.getAsFile();
      }
    }
    return null;
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    const img = getImageFile(e.clipboardData);
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      uploadImage(img);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      container.classList.add("image-drop-active");
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    if (e.relatedTarget && container.contains(e.relatedTarget as Node)) return;
    container.classList.remove("image-drop-active");
  };

  const handleDrop = (e: DragEvent) => {
    container.classList.remove("image-drop-active");
    if (!e.dataTransfer) return;
    const img = getImageFile(e.dataTransfer);
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      uploadImage(img);
    }
  };

  container.addEventListener("paste", handlePaste);
  container.addEventListener("dragover", handleDragOver);
  container.addEventListener("dragleave", handleDragLeave);
  container.addEventListener("drop", handleDrop);

  return () => {
    container.removeEventListener("paste", handlePaste);
    container.removeEventListener("dragover", handleDragOver);
    container.removeEventListener("dragleave", handleDragLeave);
    container.removeEventListener("drop", handleDrop);
  };
}
