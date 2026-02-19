import { Parser, Quad } from "n3";

// R2RML namespace
const RR = "http://www.w3.org/ns/r2rml#";

interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    tripleCount: number;
    triplesMaps: string[];
    referencedTables: string[];
    referencedColumns: string[];
  };
}

interface DbSchemaForValidation {
  tables: {
    name: string;
    columns: { name: string }[];
  }[];
}

/**
 * Parse Turtle content and return quads or a syntax error.
 */
function parseTurtle(
  ttl: string
): Promise<{ quads: Quad[]; error?: string }> {
  return new Promise((resolve) => {
    const parser = new Parser();
    const quads: Quad[] = [];
    try {
      parser.parse(ttl, (error, quad) => {
        if (error) {
          resolve({ quads, error: error.message });
          return;
        }
        if (quad) {
          quads.push(quad);
        } else {
          // null quad means parsing finished successfully
          resolve({ quads });
        }
      });
    } catch (e) {
      resolve({
        quads,
        error: e instanceof Error ? e.message : "Unknown parse error",
      });
    }
  });
}

/**
 * Extract string values for a given predicate from quads with a specific subject.
 */
function getObjects(
  quads: Quad[],
  subject: string,
  predicate: string
): string[] {
  return quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object.value);
}

/**
 * Get all subjects that have rdf:type or are referenced by a given predicate.
 */
function getSubjectsWithPredicate(
  quads: Quad[],
  predicate: string
): string[] {
  return [...new Set(quads.filter((q) => q.predicate.value === predicate).map((q) => q.subject.value))];
}

/**
 * Validate an R2RML mapping string.
 *
 * Performs three levels of validation:
 * 1. Turtle syntax parsing
 * 2. R2RML vocabulary structure checks
 * 3. (Optional) Cross-reference against a physical database schema
 */
export async function validateR2rmlMapping(
  ttl: string,
  dbSchema?: DbSchemaForValidation | null
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const stats = {
    tripleCount: 0,
    triplesMaps: [] as string[],
    referencedTables: [] as string[],
    referencedColumns: [] as string[],
  };

  if (!ttl || !ttl.trim()) {
    return {
      valid: false,
      issues: [{ level: "error", message: "R2RML mapping is empty." }],
      stats,
    };
  }

  // ── Level 1: Turtle Syntax ─────────────────────────────────────────
  const { quads, error } = await parseTurtle(ttl);

  if (error) {
    return {
      valid: false,
      issues: [{ level: "error", message: `Turtle syntax error: ${error}` }],
      stats,
    };
  }

  stats.tripleCount = quads.length;

  if (quads.length === 0) {
    return {
      valid: false,
      issues: [
        { level: "error", message: "Parsed successfully but no triples found." },
      ],
      stats,
    };
  }

  // ── Level 2: R2RML Structure ───────────────────────────────────────

  // Find all TriplesMap subjects (anything with rr:logicalTable)
  const triplesMapSubjects = getSubjectsWithPredicate(quads, `${RR}logicalTable`);

  // Also check for subjects typed as rr:TriplesMap
  const typedTriplesMaps = quads
    .filter(
      (q) =>
        q.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
        q.object.value === `${RR}TriplesMap`
    )
    .map((q) => q.subject.value);

  const allTriplesMaps = [...new Set([...triplesMapSubjects, ...typedTriplesMaps])];
  stats.triplesMaps = allTriplesMaps;

  if (allTriplesMaps.length === 0) {
    issues.push({
      level: "error",
      message:
        "No rr:TriplesMap found. An R2RML mapping must contain at least one TriplesMap with a rr:logicalTable.",
    });
  }

  // Collect all referenced tables and columns
  const allReferencedTables: string[] = [];
  const allReferencedColumns: string[] = [];

  for (const tm of allTriplesMaps) {
    // Check rr:logicalTable
    const logicalTables = getObjects(quads, tm, `${RR}logicalTable`);
    if (logicalTables.length === 0) {
      issues.push({
        level: "error",
        message: `TriplesMap <${tm}> is missing rr:logicalTable.`,
      });
    }

    // For each logicalTable, check for rr:tableName or rr:sqlQuery
    for (const lt of logicalTables) {
      const tableNames = getObjects(quads, lt, `${RR}tableName`);
      const sqlQueries = getObjects(quads, lt, `${RR}sqlQuery`);

      if (tableNames.length === 0 && sqlQueries.length === 0) {
        issues.push({
          level: "error",
          message: `LogicalTable of <${tm}> has neither rr:tableName nor rr:sqlQuery.`,
        });
      }
      allReferencedTables.push(...tableNames);
    }

    // Check rr:subjectMap
    const subjectMaps = getObjects(quads, tm, `${RR}subjectMap`);
    if (subjectMaps.length === 0) {
      issues.push({
        level: "warning",
        message: `TriplesMap <${tm}> is missing rr:subjectMap.`,
      });
    }

    // Check predicateObjectMaps
    const poms = getObjects(quads, tm, `${RR}predicateObjectMap`);
    for (const pom of poms) {
      const predicates = [
        ...getObjects(quads, pom, `${RR}predicate`),
        ...getObjects(quads, pom, `${RR}predicateMap`),
      ];
      if (predicates.length === 0) {
        issues.push({
          level: "warning",
          message: `PredicateObjectMap <${pom}> in <${tm}> has no rr:predicate or rr:predicateMap.`,
        });
      }

      const objectMaps = [
        ...getObjects(quads, pom, `${RR}objectMap`),
        ...getObjects(quads, pom, `${RR}object`),
      ];
      if (objectMaps.length === 0) {
        issues.push({
          level: "warning",
          message: `PredicateObjectMap <${pom}> in <${tm}> has no rr:objectMap or rr:object.`,
        });
      }

      // Collect columns from objectMaps
      for (const om of objectMaps) {
        const columns = getObjects(quads, om, `${RR}column`);
        allReferencedColumns.push(...columns);
      }
    }

    // Collect columns from subjectMap templates
    for (const sm of subjectMaps) {
      const templates = getObjects(quads, sm, `${RR}template`);
      for (const tpl of templates) {
        // Extract column references from template like "http://example.org/{id}"
        const matches = tpl.match(/\{([^}]+)\}/g);
        if (matches) {
          allReferencedColumns.push(
            ...matches.map((m) => m.slice(1, -1))
          );
        }
      }
      const columns = getObjects(quads, sm, `${RR}column`);
      allReferencedColumns.push(...columns);
    }
  }

  stats.referencedTables = [...new Set(allReferencedTables)];
  stats.referencedColumns = [...new Set(allReferencedColumns)];

  // ── Level 3: Database Schema Cross-Check ───────────────────────────
  if (dbSchema && dbSchema.tables && dbSchema.tables.length > 0) {
    const dbTableNames = new Set(
      dbSchema.tables.map((t) => t.name.toLowerCase())
    );
    const dbColumnsByTable = new Map<string, Set<string>>();
    for (const table of dbSchema.tables) {
      dbColumnsByTable.set(
        table.name.toLowerCase(),
        new Set(table.columns.map((c) => c.name.toLowerCase()))
      );
    }

    // Check tables
    for (const tableName of stats.referencedTables) {
      // Handle quoted table names (e.g., "\"employees\"" → "employees")
      const cleaned = tableName.replace(/^"|"$/g, "").toLowerCase();
      if (!dbTableNames.has(cleaned)) {
        issues.push({
          level: "error",
          message: `Table "${tableName}" referenced in mapping does not exist in the database. Available tables: ${[...dbTableNames].join(", ")}`,
        });
      }
    }

    // Check columns against their respective tables
    // For a more precise check we'd need to know which column belongs to which table,
    // but as a best-effort we check against all columns across all tables
    const allDbColumns = new Set<string>();
    for (const cols of dbColumnsByTable.values()) {
      for (const c of cols) {
        allDbColumns.add(c);
      }
    }

    for (const colName of stats.referencedColumns) {
      const cleaned = colName.replace(/^"|"$/g, "").toLowerCase();
      if (!allDbColumns.has(cleaned)) {
        issues.push({
          level: "warning",
          message: `Column "${colName}" referenced in mapping was not found in any database table.`,
        });
      }
    }
  }

  const hasErrors = issues.some((i) => i.level === "error");

  return {
    valid: !hasErrors,
    issues,
    stats,
  };
}
