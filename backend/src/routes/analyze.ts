/**
 * POST /api/analyze-prd
 *
 * Accepts a multipart file upload (PDF, DOCX, TXT) plus an optional
 * company_name field. Extracts text and sends it to FastRouter (GPT-4o-mini)
 * to identify the types of people described in the document.
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import { analyzePrdText } from "../services/prdAnalyzer";

const router = Router();

// Store uploads in system temp dir — cleaned up immediately after processing
const upload = multer({
  dest: path.join(os.tmpdir(), "leadgen-uploads"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".doc", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: PDF, DOCX, TXT`));
    }
  },
});

async function extractText(filePath: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (ext === ".pdf") {
    // pdf-parse exports the function as the default export (CJS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = await import("pdf-parse") as any;
    const fn = pdfParse.default?.default ?? pdfParse.default ?? pdfParse;
    const buffer = fs.readFileSync(filePath);
    const data = await fn(buffer);
    return data.text as string;
  }

  if (ext === ".docx" || ext === ".doc") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

router.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Send a PDF, DOCX, or TXT file in the 'file' field." });
      return;
    }

    try {
      const text = await extractText(req.file.path, req.file.originalname);

      if (!text || text.trim().length < 30) {
        res.status(400).json({ error: "Could not extract readable text from the file." });
        return;
      }

      const analysis = await analyzePrdText(text);
      res.json({ ...analysis, document_name: req.file.originalname });
    } catch (err) {
      console.error("[analyze-prd] Error:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    } finally {
      // Always clean up temp file
      if (req.file?.path) {
        fs.unlink(req.file.path, () => null);
      }
    }
  },
);

export default router;
