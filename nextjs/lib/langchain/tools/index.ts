// Combined tools array for agent
import {
  listTablesTool,
  getTableSchemaTool,
  getSampleQueriesTool,
} from "./database-query-tools";
import { obdaQueryWithOntopTool } from "./obda-query-tool";
import { generateR2rmlMappingTool } from "./r2rml-mapping-tool";
import {
  answerQueryTool,
  summarizeContentTool,
  explainMappingTool,
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
  // Database query tools
  listTablesTool,
  getTableSchemaTool,
  getSampleQueriesTool,
];

