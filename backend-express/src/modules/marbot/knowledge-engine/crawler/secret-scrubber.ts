import ts from 'typescript';

const FORBIDDEN_FILE_PATTERNS = [
  /(?:^|[\\/])\.env(?:\.|$)/i,
  /\.(?:pem|key|pkcs12|pfx|cert|crt)$/i,
  /\.(?:sqlite3?|db|dump|sql)$/i,
  /\.(?:log|stderr|stdout)$/i,
  /(?:^|[\\/])(?:node_modules|\.git|\.pnpm-store|dist|venv|\.tmp)[\\/]/i,
];

const SECRET_PATTERNS = [
  // JWT tokens
  /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
  // AWS access key
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  // Private keys / bearer tokens
  /\bBearer\s+[a-zA-Z0-9_\-\.=:_+/]{20,}\b/gi,
  // High-entropy 32+ char hex strings
  /\b(?:secret|password|token|apikey|api_key|auth_key|private_key)\s*[:=]\s*['"][a-zA-Z0-9_\-\.=:_+/]{16,}['"]/gi,
  // Generic potential keys
  /\b(?:sk_live|sk_test|pk_live|pk_test)_[0-9a-zA-Z]{24,}\b/g,
];

/**
 * Checks if a file path is strictly forbidden from being crawled or ingested.
 */
export function isForbiddenFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Redacts passwords, API keys, bearer tokens, and credentials with [REDACTED_SECRET].
 */
export function scrubSecrets(content: string): string {
  let cleaned = content;
  for (const pattern of SECRET_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match) => {
      if (match.toLowerCase().startsWith('bearer ')) {
        return 'Bearer [REDACTED_SECRET]';
      }
      if (match.includes(':') || match.includes('=')) {
        const delimiter = match.includes(':') ? ':' : '=';
        const keyPart = match.split(delimiter)[0];
        return `${keyPart}${delimiter} '[REDACTED_SECRET]'`;
      }
      return '[REDACTED_SECRET]';
    });
  }
  return cleaned;
}

/**
 * Strips comments from TypeScript/TSX code using the compiler AST printer.
 */
export function stripComments(sourceText: string, fileName = 'temp.ts'): string {
  const isTsx = fileName.endsWith('.tsx');
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const printer = ts.createPrinter({ removeComments: true });
  return printer.printFile(sourceFile);
}

/**
 * Combined sanitizer: strips comments then scrubs any remaining high-entropy secrets.
 */
export function sanitizeSourceCode(sourceText: string, fileName = 'temp.ts'): string {
  try {
    const withoutComments = stripComments(sourceText, fileName);
    return scrubSecrets(withoutComments);
  } catch {
    // Fallback if AST parsing fails
    const fallbackNoComments = sourceText
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    return scrubSecrets(fallbackNoComments);
  }
}

export class SecretScrubber {
  static isForbiddenFile(filePath: string): boolean {
    return isForbiddenFile(filePath);
  }
  static scrubText(content: string): string {
    return scrubSecrets(content);
  }
  static stripComments(sourceText: string, fileName?: string): string {
    return stripComments(sourceText, fileName);
  }
  static sanitizeSourceCode(sourceText: string, fileName?: string): string {
    return sanitizeSourceCode(sourceText, fileName);
  }
}

