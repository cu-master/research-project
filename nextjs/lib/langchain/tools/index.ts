// Combined tools array for agent
import {
  listTablesTool,
  getTableSchemaTool,
} from "./database-query-tools";
import { obdaQueryWithOntopTool } from "./obda-query-tool";
import { generateR2rmlMappingTool } from "./r2rml-mapping-tool";
import {
  answerQueryTool,
  summarizeContentTool,
  explainMappingTool,
  compareSchemaMappingTool,
  suggestQueriesTool,
} from "./model-interpretation-tools";

export const allTools = [
  // OBDA / Ontop tools
  obdaQueryWithOntopTool,
  // R2RML mapping tool
  generateR2rmlMappingTool,
  // Model interpretation tools
  answerQueryTool,
  summarizeContentTool,
  explainMappingTool,
  compareSchemaMappingTool,
  suggestQueriesTool,
  // Database query tools
  listTablesTool,
  getTableSchemaTool,
];

