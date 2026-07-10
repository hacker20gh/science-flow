"use client";

import { useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { Upload, FileText, Check, AlertCircle, Loader2 } from "lucide-react";

interface UploadedFile {
  fileName: string;
  title: string;
  pageCount: number;
  textLength: number;
  preview: string;
  paperId: string;
  status: "uploaded" | "extracting" | "done" | "error";
  extractionCount?: number;
  error?: string;
}

export function PdfUploader() {
  const { projectId } = useParams<{ projectId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(async (selectedFiles: FileList) => {
    setUploading(true);
    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(selectedFiles)) {
      if (file.type !== "application/pdf") continue;

      const tempEntry: UploadedFile = {
        fileName: file.name,
        title: file.name.replace(/\.pdf$/i, ""),
        pageCount: 0,
        textLength: 0,
        preview: "",
        paperId: "",
        status: "uploaded",
      };
      newFiles.push(tempEntry);
      setFiles((prev) => [...prev, tempEntry]);

      try {
        // 1. 上传 PDF
        const formData = new FormData();
        formData.append("projectId", projectId);
        formData.append("file", file);

        const uploadRes = await fetch(`/api/projects/${projectId}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) throw new Error("上传失败");
        const uploadData = await uploadRes.json();

        // 更新状态
        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === file.name
              ? {
                  ...f,
                  paperId: uploadData.paperId,
                  pageCount: uploadData.pageCount,
                  textLength: uploadData.textLength,
                  preview: uploadData.preview,
                  title: uploadData.title,
                  status: "extracting",
                }
              : f
          )
        );

        // 2. 调用 LLM 提取
        const extractRes = await fetch(`/api/projects/${projectId}/upload/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            paperId: uploadData.paperId,
            fileName: uploadData.fileName,
          }),
        });

        if (!extractRes.ok) throw new Error("提取失败");
        const extractData = await extractRes.json();

        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === file.name
              ? { ...f, status: "done", extractionCount: extractData.count }
              : f
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === file.name
              ? { ...f, status: "error", error: err instanceof Error ? err.message : "处理失败" }
              : f
          )
        );
      }
    }

    setUploading(false);
  }, [projectId]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-4">
      {/* 上传区域 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload size={32} className="mx-auto text-gray-400 mb-3" />
        <p className="text-sm font-medium text-gray-600">
          拖拽 PDF 文件到这里，或点击选择
        </p>
        <p className="text-xs text-gray-400 mt-1">
          支持批量上传，每篇文献会自动提取结构化数据
        </p>
      </div>

      {/* 上传进度 */}
      {uploading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          正在处理...
        </div>
      )}

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
            >
              <FileText size={18} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.title}</p>
                <p className="text-xs text-gray-400">
                  {file.pageCount > 0 && `${file.pageCount} 页 · `}
                  {file.textLength > 0 && `${Math.round(file.textLength / 1000)}K 字符 · `}
                  {file.status === "done" && `${file.extractionCount} 条提取结果`}
                  {file.status === "error" && file.error}
                </p>
              </div>
              <div className="shrink-0">
                {file.status === "uploaded" && (
                  <span className="text-xs text-gray-400">已上传</span>
                )}
                {file.status === "extracting" && (
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                )}
                {file.status === "done" && (
                  <Check size={16} className="text-green-500" />
                )}
                {file.status === "error" && (
                  <AlertCircle size={16} className="text-red-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
