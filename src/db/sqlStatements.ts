/**
 * Split a `.sql` script into individual executable statements.
 *
 * `@tauri-apps/plugin-sql` (sqlx) executes one statement per `execute()` call,
 * so the schema DDL must be fed statement-by-statement. The migration script
 * uses only whole-line and trailing `-- …` comments and has no `;`/`--` inside
 * string literals, so a comment-strip + split-on-`;` is sufficient and safe.
 */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.split("--")[0]) // drop `--` comments (whole-line + trailing)
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
