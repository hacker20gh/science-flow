"""
SciFlow PDF Parser Service

基于 Docling 的 PDF 结构化解析微服务
为 SciFlow AI 提供学术论文 PDF 的高质量文本+表格提取

部署方式：
  本地开发: uvicorn app:app --host 0.0.0.0 --port 8099
  Docker:   docker build -t sciflow-pdf-parser . && docker run -p 8099:8099
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import io
import time

app = FastAPI(title="SciFlow PDF Parser", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "sciflow-pdf-parser"}


@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    """
    解析 PDF 文件，返回结构化 Markdown 文本

    - 保留表格结构（Markdown 表格格式）
    - 保留章节标题层级
    - 保留数学公式（LaTeX 格式）
    - 正确处理多栏布局
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="只支持 PDF 文件")

    start = time.time()

    try:
        # 读取 PDF 为字节
        pdf_bytes = await file.read()
        if len(pdf_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="文件过大（最大 50MB）")

        # 使用 Docling 解析
        from docling.document_converter import DocumentConverter

        converter = DocumentConverter()
        result = converter.convert(io.BytesIO(pdf_bytes))
        doc = result.document

        # 导出为 Markdown（保留表格结构）
        markdown_text = doc.export_to_markdown()

        elapsed = time.time() - start

        return JSONResponse(
            content={
                "success": True,
                "text": markdown_text,
                "textLength": len(markdown_text),
                "parseTimeMs": round(elapsed * 1000),
                "parser": "docling",
            }
        )

    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Docling 未安装，请运行: pip install docling",
        )
    except Exception as e:
        elapsed = time.time() - start
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "parseTimeMs": round(elapsed * 1000),
            },
        )


@app.post("/parse-batch")
async def parse_pdf_batch(files: list[UploadFile] = File(...)):
    """
    批量解析多个 PDF（最多 10 个）
    """
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="最多 10 个文件")

    results = []
    for file in files:
        try:
            pdf_bytes = await file.read()
            from docling.document_converter import DocumentConverter
            import io as _io

            converter = DocumentConverter()
            result = converter.convert(_io.BytesIO(pdf_bytes))
            markdown_text = result.document.export_to_markdown()

            results.append({
                "filename": file.filename,
                "success": True,
                "text": markdown_text,
                "textLength": len(markdown_text),
            })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e),
            })

    return JSONResponse(content={"results": results})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8099)
