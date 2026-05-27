import { Parser, Quad } from "n3";

// R2RML namespace
const RR = "http://www.w3.org/ns/r2rml#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

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

// Parse Turtle content; returns quads or a syntax error.
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

// Return all object values for a given subject + predicate pair.
function getObjects(
  quads: Quad[],
  subject: string,
  predicate: string
): string[] {
  return quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object.value);
}

// Return all unique subjects that have a given predicate (any object).
function getSubjectsWithPredicate(
  quads: Quad[],
  predicate: string
): string[] {
  return [
    ...new Set(
      quads.filter((q) => q.predicate.value === predicate).map((q) => q.subject.value)
    ),
  ];
}

// Extract column names from an rr:template, e.g. "http://example.org/{customer_id}/{name}" → ["customer_id", "name"].
function extractTemplateColumns(template: string): string[] {
  const matches = template.match(/\{([^}]+)\}/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

// Three levels: Turtle syntax → R2RML vocabulary structure → optional DB-schema cross-reference.
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

  // Level 1: Turtle syntax.
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
      issues: [{ level: "error", message: "Parsed successfully but no triples found." }],
      stats,
    };
  }

  // Level 2: R2RML structure.
  const triplesMapSubjects = getSubjectsWithPredicate(quads, `${RR}logicalTable`);
  const typedTriplesMaps = quads
    .filter(
      (q) =>
        q.predicate.value === RDF_TYPE &&
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

  const knownTriplesMapUris = new Set(allTriplesMaps);

  // Track (table → Set<column>) for scoped DB cross-checking later.
  const tableToColumns = new Map<string, Set<string>>();

  const allReferencedTables: string[] = [];
  const allReferencedColumns: string[] = [];

  for (const tm of allTriplesMaps) {

    if (tm.startsWith("_:")) {
      issues.push({
        level: "warning",
        message: `TriplesMap is a blank node ("${tm}"). Ontop requires named TriplesMap subjects (IRIs). Consider giving it an explicit URI.`,
      });
    }

    const logicalTables = getObjects(quads, tm, `${RR}logicalTable`);
    if (logicalTables.length === 0) {
      issues.push({
        level: "error",
        message: `TriplesMap <${tm}> is missing rr:logicalTable.`,
      });
    }

    const tmTableNames: string[] = [];
    for (const lt of logicalTables) {
      const tableNames = getObjects(quads, lt, `${RR}tableName`);
      const sqlQueries = getObjects(quads, lt, `${RR}sqlQuery`);

      if (tableNames.length === 0 && sqlQueries.length === 0) {
        issues.push({
          level: "error",
          message: `LogicalTable of <${tm}> has neither rr:tableName nor rr:sqlQuery.`,
        });
      }

      tmTableNames.push(...tableNames);
      allReferencedTables.push(...tableNames);
    }

    for (const tn of tmTableNames) {
      if (!tableToColumns.has(tn)) {
        tableToColumns.set(tn, new Set());
      }
    }

    // Record a column against the tables of this TriplesMap.
    const recordColumn = (col: string) => {
      allReferencedColumns.push(col);
      for (const tn of tmTableNames) {
        tableToColumns.get(tn)?.add(col);
      }
    };

    const subjectMaps = getObjects(quads, tm, `${RR}subjectMap`);
    if (subjectMaps.length === 0) {
      issues.push({
        level: "error",
        message: `TriplesMap <${tm}> is missing rr:subjectMap. Without a subject map no triples can be generated.`,
      });
    }

    for (const sm of subjectMaps) {
      const classes = getObjects(quads, sm, `${RR}class`);
      if (classes.length === 0) {
        issues.push({
          level: "warning",
          message: `SubjectMap of <${tm}> has no rr:class declaration. Ontop may not be able to map results to ontology classes.`,
        });
      }

      const templates = getObjects(quads, sm, `${RR}template`);
      for (const tpl of templates) {
        extractTemplateColumns(tpl).forEach(recordColumn);
      }

      getObjects(quads, sm, `${RR}column`).forEach(recordColumn);
    }

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

      for (const om of objectMaps) {
        getObjects(quads, om, `${RR}column`).forEach(recordColumn);

        getObjects(quads, om, `${RR}template`).forEach((tpl) =>
          extractTemplateColumns(tpl).forEach(recordColumn)
        );

        const parentRefs = getObjects(quads, om, `${RR}parentTriplesMap`);
        for (const parentUri of parentRefs) {
          if (!knownTriplesMapUris.has(parentUri)) {
            issues.push({
              level: "error",
              message:
                `rr:parentTriplesMap <${parentUri}> referenced from <${tm}> does not exist in this mapping. ` +
                `Check for typos or a missing TriplesMap definition.`,
            });
          }
        }

        const joinConditions = getObjects(quads, om, `${RR}joinCondition`);
        for (const jc of joinConditions) {
          getObjects(quads, jc, `${RR}child`).forEach(recordColumn);
          // Parent columns belong to the parent table — track globally only.
          getObjects(quads, jc, `${RR}parent`).forEach((c) =>
            allReferencedColumns.push(c)
          );
        }
      }
    }
  }

  stats.referencedTables = [...new Set(allReferencedTables)];
  stats.referencedColumns = [...new Set(allReferencedColumns)];

  // Level 3: optional DB-schema cross-check.
  if (dbSchema && dbSchema.tables && dbSchema.tables.length > 0) {
    const dbTableNames = new Set(
      dbSchema.tables.map((t) => t.name.toLowerCase())
    );

    // Table → column lookup for scoped column checking.
    const dbColumnsByTable = new Map<string, Set<string>>();
    for (const table of dbSchema.tables) {
      dbColumnsByTable.set(
        table.name.toLowerCase(),
        new Set(table.columns.map((c) => c.name.toLowerCase()))
      );
    }

    for (const tableName of stats.referencedTables) {
      const cleaned = tableName.replace(/^"|"$/g, "").toLowerCase();
      if (!dbTableNames.has(cleaned)) {
        issues.push({
          level: "error",
          message: `Table "${tableName}" referenced in mapping does not exist in the database. Available tables: ${[...dbTableNames].join(", ")}`,
        });
      }
    }

    // Scoped column→table check: for each table referenced by a TriplesMap, only check columns collected under that TriplesMap's table (avoids cross-table false positives from a global column bag).
    for (const [tableName, columns] of tableToColumns.entries()) {
      const cleanedTable = tableName.replace(/^"|"$/g, "").toLowerCase();
      const dbCols = dbColumnsByTable.get(cleanedTable);

      if (!dbCols) {
        // Table itself doesn't exist — already reported above; skip columns.
        continue;
      }

      for (const colName of columns) {
        const cleanedCol = colName.replace(/^"|"$/g, "").toLowerCase();
        if (!dbCols.has(cleanedCol)) {
          issues.push({
            level: "warning",
            message: `Column "${colName}" referenced in mapping for table "${tableName}" was not found in that table's columns.`,
          });
        }
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
