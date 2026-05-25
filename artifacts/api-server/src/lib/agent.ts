import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

export interface ParsedCodeBlock {
  file: string;
  language: string;
  functionName: string;
  changedLines: number[];
  fullCodeBlock: string;
}

export interface Finding {
  findingType: "security" | "performance" | "style" | "bug";
  cweId: string | null;
  confidence: number;
  severity: "critical" | "high" | "medium" | "low";
  lineRef: string;
  description: string;
  owaspSource: string | null;
  fixSuggestion: string;
}

const DIFF_PARSER_PROMPT = `You are a code diff parser. Given a unified diff, extract every changed function or code block.
Return ONLY a JSON array: [{file, language, functionName, changedLines: [int], fullCodeBlock: string}]
If no meaningful code blocks found, return [].
Skip binary files, lock files, minified files, and generated files.`;

const SECURITY_ANALYZER_PROMPT = `You are an expert security code reviewer specializing in OWASP Top 10 and CWE vulnerabilities.
Analyze the following code block for security vulnerabilities including:
- SQL Injection (CWE-89), XSS (CWE-79), Path Traversal (CWE-22)
- Insecure deserialization, hardcoded secrets, command injection (CWE-78)
- Broken authentication, insecure direct object references
- CSRF, XXE, SSRF vulnerabilities
Return ONLY a JSON object: {"findings": [Finding]} where Finding matches exactly:
{"findingType":"security", "cweId":"CWE-XX"|null, "confidence":float, "severity":"critical"|"high"|"medium"|"low",
 "lineRef":"file:line", "description":string, "owaspSource":string|null, "fixSuggestion":"same language, same function scope, fenced code block"}
Filter out findings with confidence < 0.55. If no vulnerabilities found, return {"findings":[]}.
Fix suggestions must be in the same file, same language, same function scope. Do not explain. Only JSON.`;

const QUALITY_CHECKER_PROMPT = `You are a senior code reviewer. Analyze for: code smells, N+1 query patterns,
unused variables, dangerous defaults, performance bottlenecks, error handling issues, resource leaks.
Return ONLY {"findings":[Finding]} with findingType in ["performance","style","bug"].
Same schema: {"findingType":string, "cweId":null, "confidence":float, "severity":string, "lineRef":string, "description":string, "owaspSource":null, "fixSuggestion":string}
Filter out findings with confidence < 0.55. Only JSON.`;

function skipBinaryOrGenerated(filename: string): boolean {
  const skipPatterns = [
    /\.lock$/i,
    /\.min\.(js|css)$/i,
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i,
    /dist\//i,
    /node_modules\//i,
    /\.pyc$/i,
    /generated\//i,
  ];
  return skipPatterns.some((p) => p.test(filename));
}

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    java: "java",
    cs: "csharp",
    php: "php",
    rs: "rust",
    cpp: "cpp",
    c: "c",
    sh: "bash",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
  };
  return langMap[ext] ?? "text";
}

function parseDiff(diff: string): ParsedCodeBlock[] {
  const blocks: ParsedCodeBlock[] = [];
  const fileChunks = diff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const fileMatch = chunk.match(/a\/(.+?) b\/(.+?)(?:\n|$)/);
    if (!fileMatch) continue;
    const filename = fileMatch[2];
    if (skipBinaryOrGenerated(filename)) continue;

    const language = detectLanguage(filename);
    const lines = chunk.split("\n");
    const addedLines: string[] = [];
    const changedLineNumbers: number[] = [];
    let lineNum = 0;

    for (const line of lines) {
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        lineNum = parseInt(hunkMatch[1], 10);
        continue;
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines.push(line.slice(1));
        changedLineNumbers.push(lineNum);
        lineNum++;
      } else if (!line.startsWith("-")) {
        lineNum++;
      }
    }

    if (addedLines.length > 0) {
      blocks.push({
        file: filename,
        language,
        functionName: "unknown",
        changedLines: changedLineNumbers,
        fullCodeBlock: addedLines.join("\n"),
      });
    }
  }

  return blocks;
}

async function callGemini(systemPrompt: string, userContent: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\n${userContent}` }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  });
  return response.text ?? "{}";
}

function parseFindings(raw: string): Finding[] {
  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```json\n?/m, "").replace(/```$/m, "").trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : parsed.findings ?? [];
    return arr.filter(
      (f: Finding) =>
        f &&
        typeof f.confidence === "number" &&
        f.confidence >= 0.55 &&
        ["security", "performance", "style", "bug"].includes(f.findingType) &&
        ["critical", "high", "medium", "low"].includes(f.severity)
    );
  } catch {
    return [];
  }
}

function computeRiskScore(findings: Finding[]): "critical" | "high" | "medium" | "low" | "clean" {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  if (findings.some((f) => f.severity === "low")) return "low";
  return "clean";
}

export async function analyzeDiff(
  diff: string,
  repo: string,
  prNumber: number,
  onEvent?: (event: string) => void
): Promise<{ findings: Finding[]; riskScore: string; provider: string }> {
  const emit = (msg: string) => {
    if (onEvent) onEvent(msg);
  };

  emit(`Starting analysis for ${repo}#${prNumber}`);

  const codeBlocks = parseDiff(diff);
  emit(`Parsed ${codeBlocks.length} code blocks from diff`);

  if (codeBlocks.length === 0) {
    emit("No meaningful code changes found");
    return { findings: [], riskScore: "clean", provider: "gemini" };
  }

  const allFindings: Finding[] = [];

  for (const block of codeBlocks.slice(0, 10)) {
    // Cap at 10 blocks to avoid runaway costs
    const codeContent = `File: ${block.file} (${block.language})\nChanged lines: ${block.changedLines.slice(0, 5).join(", ")}\n\nCode:\n\`\`\`${block.language}\n${block.fullCodeBlock.slice(0, 3000)}\n\`\`\``;

    emit(`Analyzing ${block.file} for security issues...`);
    try {
      const secRaw = await callGemini(SECURITY_ANALYZER_PROMPT, codeContent);
      const secFindings = parseFindings(secRaw);
      allFindings.push(...secFindings);
      emit(`Found ${secFindings.length} security issues in ${block.file}`);
    } catch (err) {
      logger.warn({ err, file: block.file }, "Security analysis failed for block");
      emit(`Security analysis failed for ${block.file}`);
    }

    emit(`Analyzing ${block.file} for quality issues...`);
    try {
      const qualRaw = await callGemini(QUALITY_CHECKER_PROMPT, codeContent);
      const qualFindings = parseFindings(qualRaw);
      allFindings.push(...qualFindings);
      emit(`Found ${qualFindings.length} quality issues in ${block.file}`);
    } catch (err) {
      logger.warn({ err, file: block.file }, "Quality analysis failed for block");
      emit(`Quality analysis failed for ${block.file}`);
    }
  }

  const deduplicated = allFindings.filter(
    (f, idx, arr) =>
      idx === arr.findIndex((g) => g.lineRef === f.lineRef && g.description === f.description)
  );

  const riskScore = computeRiskScore(deduplicated);
  emit(`Analysis complete: ${deduplicated.length} findings, risk: ${riskScore}`);

  return { findings: deduplicated, riskScore, provider: "gemini" };
}

// Lightweight mock diff for manual trigger when no GitHub token
export function buildMockDiff(repoFullName: string, prNumber: number): string {
  return `diff --git a/src/auth.py b/src/auth.py
--- a/src/auth.py
+++ b/src/auth.py
@@ -10,6 +10,12 @@
+def authenticate(username, password):
+    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
+    cursor.execute(query)
+    user = cursor.fetchone()
+    return user is not None
+
`;
}
