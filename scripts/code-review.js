/**
 * CineTune Code Review & Clean Code Inspector
 * Automated quality gate & review report generator for CineTune codebase.
 * Designed to run locally (npm run review) and in GitHub Actions CI ($GITHUB_STEP_SUMMARY).
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const TARGET_FILES = [
  "server.js",
  "public/cinetune/app.js",
  "public/cinetune/theme.css",
  "config/android.json"
];

const issues = [];
let totalLines = 0;
let totalFiles = 0;

function addIssue(file, line, type, severity, message, suggestion) {
  issues.push({ file, line, type, severity, message, suggestion });
}

function analyzeJavaScript(file, content) {
  const lines = content.split("\n");
  totalLines += lines.length;
  totalFiles++;

  lines.forEach((lineText, index) => {
    const lineNum = index + 1;
    const trimmed = lineText.trim();

    // Check for debugger
    if (/\bdebugger\b/.test(trimmed)) {
      addIssue(
        file,
        lineNum,
        "Clean Code",
        "error",
        'Sử dụng lệnh "debugger" trong code production.',
        "Xóa bỏ câu lệnh debugger trước khi commit."
      );
    }

    // Check for eval()
    if (/\beval\s*\(/.test(trimmed)) {
      addIssue(
        file,
        lineNum,
        "Security",
        "error",
        "Sử dụng eval() có nguy cơ bảo mật nghiêm trọng.",
        "Dùng JSON.parse hoặc kiến trúc an toàn hơn."
      );
    }

    // Check for raw console.log (allow in server startup, but flag excessive client logging)
    if (file.includes("public") && /\bconsole\.log\s*\(/.test(trimmed)) {
      addIssue(
        file,
        lineNum,
        "Performance",
        "warning",
        "Tồn tại console.log() trong client code.",
        "Xóa hoặc bọc trong cờ DEBUG để tránh lộ log."
      );
    }

    // Check for empty catch blocks
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) {
      addIssue(
        file,
        lineNum,
        "Reliability",
        "warning",
        "Khối catch rỗng (nuốt lỗi im lặng).",
        "Ghi log lỗi hoặc thông báo người dùng để dễ debug."
      );
    }

    // Check for hardcoded local IP or test URLs
    if (/(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)/.test(trimmed)) {
      addIssue(
        file,
        lineNum,
        "Security/Config",
        "warning",
        "Địa chỉ IP nội bộ bị hardcode trong mã nguồn.",
        "Chuyển IP/URL vào biến môi trường hoặc config."
      );
    }

    // Check for excessively long lines (> 300 chars in non-svg code)
    if (lineText.length > 350 && !lineText.includes("<svg") && !lineText.includes("data:image")) {
      addIssue(
        file,
        lineNum,
        "Readability",
        "info",
        `Dòng code quá dài (${lineText.length} ký tự).`,
        "Tách thành các biểu thức hoặc hàm nhỏ hơn để dễ đọc."
      );
    }
  });

  // Check file length
  if (lines.length > 800) {
    addIssue(
      file,
      1,
      "Architecture",
      "info",
      `File có ${lines.length} dòng, có thể cân nhắc chia module nhỏ hơn.`,
      "Tách các utility hoặc view nhỏ sang module con."
    );
  }
}

function analyzeCss(file, content) {
  const lines = content.split("\n");
  totalLines += lines.length;
  totalFiles++;

  lines.forEach((lineText, index) => {
    const lineNum = index + 1;
    const trimmed = lineText.trim();

    if (/!important/.test(trimmed)) {
      addIssue(
        file,
        lineNum,
        "Clean Code",
        "info",
        "Sử dụng !important làm giảm tính tái sử dụng CSS.",
        "Ưu tiên tăng độ đặc hiệu (specificity) của selector thay vì !important."
      );
    }
  });
}

function analyzeJson(file, content) {
  totalFiles++;
  try {
    JSON.parse(content);
  } catch (err) {
    addIssue(
      file,
      1,
      "Syntax",
      "error",
      `File JSON không hợp lệ: ${err.message}`,
      "Sửa lại cú pháp JSON đúng chuẩn."
    );
  }
}

// Run analysis
TARGET_FILES.forEach((relPath) => {
  const absPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(absPath)) return;
  const content = fs.readFileSync(absPath, "utf8");

  if (relPath.endsWith(".js")) analyzeJavaScript(relPath, content);
  else if (relPath.endsWith(".css")) analyzeCss(relPath, content);
  else if (relPath.endsWith(".json")) analyzeJson(relPath, content);
});

// Scoring system
const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");
const infos = issues.filter((i) => i.severity === "info");

const baseScore = 100;
const penalty =
  errors.length * 20 + warnings.length * 5 + Math.min(15, Math.floor(infos.length * 0.5));
const finalScore = Math.max(0, baseScore - penalty);

const getRating = (score) => {
  if (score >= 90) return "A+ (Rất Tốt - Clean Code Chuẩn)";
  if (score >= 80) return "A (Tốt - Đạt Chuẩn CI/CD)";
  if (score >= 70) return "B (Chấp nhận được)";
  if (score >= 50) return "C (Cần cải thiện)";
  return "D (Không đạt)";
};

// Console output
console.log("=".repeat(65));
console.log("          CINETUNE CODE REVIEW & CLEAN CODE REPORT          ");
console.log("=".repeat(65));
console.log(`Tong so file da quet : ${totalFiles}`);
console.log(`Tong so dong code    : ${totalLines.toLocaleString()}`);
console.log(`Diem Clean Code      : ${finalScore}/100 [Xep loai: ${getRating(finalScore)}]`);
console.log(`Loi nghiem trong     : ${errors.length}`);
console.log(`Canh bao (Warnings)  : ${warnings.length}`);
console.log(`Gop y (Info/Tips)    : ${infos.length}`);
console.log("-".repeat(65));

if (issues.length === 0) {
  console.log(" Tuyet voi! Codebase sach se, khong phat hien van de nao.");
} else {
  issues.forEach((issue, idx) => {
    const badge = issue.severity.toUpperCase().padEnd(7);
    console.log(`[${badge}] #${idx + 1} ${issue.file}:${issue.line}`);
    console.log(`          [${issue.type}] ${issue.message}`);
    console.log(`          => Goi y: ${issue.suggestion}\n`);
  });
}
console.log("=".repeat(65));

// Export to GitHub Actions Step Summary if available
if (process.env.GITHUB_STEP_SUMMARY) {
  let md = `##  CineTune Code Review & Clean Code Report\n\n`;
  md += `| Chi so | Gia tri |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Diem Clean Code** | **${finalScore}/100** (${getRating(finalScore)}) |\n`;
  md += `| **So file quet** | \`${totalFiles}\` |\n`;
  md += `| **Tong so dong** | \`${totalLines.toLocaleString()}\` |\n`;
  md += `| **Errors** | \`${errors.length}\` |\n`;
  md += `| **Warnings** | \`${warnings.length}\` |\n`;
  md += `| **Tips / Info** | \`${infos.length}\` |\n\n`;

  if (issues.length === 0) {
    md += `>  **Mã nguồn sạch, chuẩn Clean Code và sẵn sàng triển khai!**\n\n`;
  } else {
    md += `###  Danh sách phát hiện & Đề xuất cải thiện\n\n`;
    md += `| Mức độ | Vị trí | Phân loại | Vấn đề | Hướng khắc phục |\n`;
    md += `| :---: | :--- | :--- | :--- | :--- |\n`;
    issues.forEach((issue) => {
      const icon = issue.severity === "error" ? "" : issue.severity === "warning" ? "" : "ℹ";
      md += `| ${icon} **${issue.severity}** | \`${issue.file}:${issue.line}\` | ${issue.type} | ${issue.message} | ${issue.suggestion} |\n`;
    });
    md += `\n`;
  }

  md += `> *Báo cáo được tạo tự động bởi CineTune CI/CD Review Engine.*\n`;
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md, "utf8");
  } catch (err) {
    console.error("Khong the ghi vao GITHUB_STEP_SUMMARY:", err.message);
  }
}

if (errors.length > 0) {
  console.error(` Review that bai: Co ${errors.length} loi nghiem trong can khac phuc.`);
  process.exit(1);
} else {
  console.log(" Review thanh cong! San sang de merge va deploy.");
  process.exit(0);
}
