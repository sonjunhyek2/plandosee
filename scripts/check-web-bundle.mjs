import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve("apps/web/out");
const forbidden = [
  "postgresql://",
  "postgres://",
  "DATABASE_URL",
  "DIRECT_URL",
  "PrismaClient",
  "@prisma/client",
  ".neon.tech",
];

if (!fs.existsSync(outputDir)) {
  throw new Error("apps/web/out이 없습니다. 먼저 웹 정적 빌드를 실행해 주세요.");
}

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(?:html|js|json|txt|css|map)$/i.test(entry.name)) files.push(fullPath);
  }
}
walk(outputDir);

const findings = [];
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const marker of forbidden) {
    if (content.includes(marker)) findings.push(`${path.relative(outputDir, file)}: ${marker}`);
  }
}

if (findings.length > 0) {
  throw new Error(`웹 번들에서 서버 전용 문자열을 발견했습니다:\n${findings.join("\n")}`);
}

console.log(`웹 번들 비밀값 경계 검사 통과 (${files.length}개 파일 검사)`);
