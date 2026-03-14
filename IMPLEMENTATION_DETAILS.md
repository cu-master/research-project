# Implementation Details

This document provides comprehensive implementation details for the AI Chatbot system, including data structures, API specifications, and validation algorithms.

---

## Table of Contents

1. [Data Structures](#data-structures)
2. [API Specifications](#api-specifications)
3. [LLM Output Validation](#llm-output-validation)
4. [Module Architecture](#module-architecture)

---

## Data Structures

### Core Message Types

#### ChatMessage
Represents a message in the conversation flow between user and assistant.

```typescript
interface ChatMessage {
  role: "user" | "assistant";
  content: unknown;  // Can be string, array of content blocks, or structured data
  attachments?: Attachment[];
}
```

**Fields:**
- `role`: Message sender ("user" or "assistant")
- `content`: Message content (string, array, or structured object)
- `attachments`: Optional array of file attachments

#### Attachment
Represents a file attachment in a chat message.

```typescript
interface Attachment {
  name?: string;      // Original filename
  type?: string;      // MIME type (e.g., "application/json")
  size?: number;      // File size in bytes
  content?: string;   // Base64-encoded content or data URI
}
```

**Usage:**
- Attachments are automatically converted to data URIs for processing
- Format: `data:application/json;base64,<base64-encoded-content>`

#### AgentMessage
Represents a message from the LangChain agent, including tool calls.

```typescript
interface AgentMessage {
  content: unknown;           // Response content from agent
  tool_calls?: ToolCall[];    // Array of tool invocations
  tool_call_id?: string;      // ID for tool call responses
}
```

#### ToolCall
Represents a tool invocation by the agent.

```typescript
interface ToolCall {
  id: string;          // Unique identifier for the tool call
  name: string;        // Tool name (e.g., "model_interpretation_ask_question")
  args: unknown;       // Tool arguments (validated against Zod schema)
}
```

### MCP Response Types

#### McpResponse
Standard response format from MCP (Model Context Protocol) servers.

```typescript
interface McpResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;  // Additional metadata
}
```

**Structure:**
- `content`: Array of content blocks (currently only text type supported)
- `isError`: Boolean flag indicating error state
- Additional fields can be added for structured responses

#### McpToolResponse
Extended response type used in LangChain client wrappers.

```typescript
interface McpToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  structuredContent?: unknown;  // Optional structured data
}
```

### Database Types

#### TableColumn
Represents a database table column schema.

```typescript
interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;              // "YES" | "NO"
  column_default: string | null;
  character_maximum_length: number | null;
}
```

#### TableInfo
Represents basic table metadata.

```typescript
interface TableInfo {
  table_name: string;
  table_schema: string;    // Schema name (e.g., "public")
  table_type: string;      // "BASE TABLE" | "VIEW"
}
```

#### ForeignKey
Represents a foreign key relationship.

```typescript
interface ForeignKey {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}
```

#### Constraint
Represents a table constraint.

```typescript
interface Constraint {
  constraint_name: string;
  constraint_type: string;  // "PRIMARY KEY" | "UNIQUE" | "CHECK" | "FOREIGN KEY"
  column_name: string;
}
```

#### QueryResult
Represents the result of a database query execution.

```typescript
interface QueryResult {
  rows: Record<string, unknown>[];  // Array of row objects
  rowCount: number;                 // Total number of rows
  error?: string;                    // Error message if query failed
}
```

#### SchemaCache
In-memory cache for database schema information.

```typescript
interface SchemaCache {
  tables: TableInfo[];
  columns: Map<string, TableColumn[]>;        // Key: table name
  foreignKeys: Map<string, ForeignKey[]>;     // Key: table name
  lastUpdated: number;                        // Timestamp
}
```

### Database Configuration Types

#### DatabaseConfig
Union type for different database connection configurations.

```typescript
type DatabaseConfig = 
  | PostgreSQLConfig 
  | MySQLConfig;

interface PostgreSQLConfig {
  type: "postgresql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

interface MySQLConfig {
  type: "mysql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}
```

### LLM Output Structures

#### LLM Response (Raw)
Raw response from LLM providers before processing.

**Google Gemini:**
```typescript
{
  response: {
    text(): string;
    candidates?: Array<{
      finishReason?: "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION";
      content: { parts: Array<{ text: string }> };
    }>;
  };
}
```

**Anthropic Claude:**
```typescript
{
  content: Array<{
    type: "text";
    text: string;
  }>;
  stop_reason?: "end_turn" | "max_tokens" | "stop_sequence";
}
```

**OpenAI GPT:**
```typescript
{
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason?: "stop" | "length" | "content_filter";
  }>;
}
```

#### Processed LLM Output
After extraction and validation:

```typescript
interface ProcessedLLMOutput {
  text: string;                    // Extracted text content
  finishReason?: string;            // Why generation stopped
  wasTruncated: boolean;            // Whether output was cut off
  safetyBlocked: boolean;           // Whether blocked by safety filters
  tokenCount?: number;              // Estimated token usage
}
```

### Tool Definition Structure

#### ToolDefinition
Represents a tool available to the agent.

```typescript
interface ToolDefinition {
  name: string;                     // Unique tool identifier
  description: string;               // Human-readable description
  inputSchema: Record<string, unknown>;  // JSON Schema for validation
  handler: (args: Record<string, unknown>) => Promise<McpResponse>;
}
```

**Example:**
```typescript
{
  name: "model_interpretation_ask_question",
  description: "Ask any question about the uploaded schema or model data",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "Question about the uploaded data"
      }
    },
    required: ["question"]
  },
  handler: async (args) => { /* ... */ }
}
```

### Upload and Storage Types

#### UploadResult
Result of file upload operation.

```typescript
interface UploadResult {
  uploaded: boolean;     // Whether upload succeeded
  result?: string;      // Upload confirmation message
  overview?: string;    // Auto-generated schema overview
}
```

#### StoredContent
In-memory storage structure for uploaded schemas.

```typescript
interface StoredContent {
  content: string;      // Raw schema content
  uploadedAt: number;   // Timestamp
  format?: string;      // Detected format (JSON, XML, etc.)
}
```

---

## API Specifications

### Tier 1: Next.js Web Application

#### POST /api/chat
Main chat endpoint for processing user messages.

**Request:**
```typescript
{
  message: string;                    // User's message text
  history?: ChatMessage[];            // Conversation history
  attachments?: Attachment[];          // File attachments
}
```

**Response:**
```typescript
{
  message: string;                    // Assistant's response
  toolsUsed?: ToolUsedEntry[];        // Tools invoked during processing
  latency?: number;                   // Processing time in ms
}
```

**Flow:**
1. Auto-upload attachments if present
2. Convert history to LangChain message format
3. Invoke agent with message and history
4. Extract response and tool calls
5. Format and return response

**Error Handling:**
- 400: Invalid request format
- 500: Agent execution error
- Returns error message in response body

### Tier 2: LangChain Agent (Internal)

The agent is not directly exposed via HTTP but is used internally by the Next.js API route.

**Agent Configuration:**
```typescript
{
  model: BaseChatModel;               // LLM instance (Google/Anthropic/OpenAI)
  tools: Tool[];                      // Array of available tools
  systemPrompt: string;              // System instructions
}
```

**Tool Registration:**
- Tools are registered using LangChain's `tool()` function
- Each tool has a Zod schema for input validation
- Tools are automatically available to the agent

### Tier 3: Model Interpretation MCP Server

**Base URL:** `http://localhost:3001`

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "server": "model-interpretation",
  "version": "2.1.0",
  "provider": "google" | "anthropic",
  "toolCount": 9
}
```

#### GET /tools
List all available tools.

**Response:**
```json
{
  "tools": [
    {
      "name": "upload-files",
      "description": "Upload a schema or model file for analysis",
      "inputSchema": { /* JSON Schema */ }
    },
    // ... more tools
  ]
}
```

#### GET /tools/:name
Get information about a specific tool.

**Response:**
```json
{
  "name": "upload-files",
  "description": "Upload a schema or model file for analysis",
  "inputSchema": { /* JSON Schema */ }
}
```

**Error:**
- 404: Tool not found

#### POST /tools/:name/call
Call a tool directly (non-MCP format).

**Request:**
```json
{
  "arguments": {
    "content": "data:application/json;base64,..."
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "File uploaded successfully..."
    }
  ],
  "isError": false
}
```

#### POST /mcp/call-tool
MCP-compatible tool invocation endpoint.

**Request:**
```json
{
  "name": "upload-files",
  "arguments": {
    "content": "data:application/json;base64,..."
  }
}
```

**Response:**
Same as `/tools/:name/call`

**Error Handling:**
- 400: Missing tool name
- 404: Tool not found
- 500: Tool execution error

#### POST /mcp/list-tools
MCP-compatible tool listing.

**Response:**
Same as `GET /tools`

### Model Interpretation Tools

#### upload-files
Upload and parse a schema/model file.

**Input Schema:**
```typescript
{
  content: string;      // Required: Full content or data URI
  format?: string;      // Optional: Format hint (JSON, XML, etc.)
}
```

**Validation:**
- Content must be non-empty string
- Data URI format: `data:[mime-type];base64,[base64-data]`
- Base64 decoding is attempted automatically

**Response:**
- Success: Confirmation with character count and preview
- Error: Error message with details

#### get-files-overview
Get a brief overview of uploaded schema.

**Input Schema:**
```typescript
{}  // No arguments required
```

**Validation:**
- Ensures data has been uploaded first
- Returns error if no data available

**Response:**
- 2-4 sentence overview of schema purpose and main entities

#### ask-question
Ask a question about the uploaded schema.

**Input Schema:**
```typescript
{
  question: string;     // Required: Question about the data
}
```

**Validation:**
- Question must be non-empty string
- Requires uploaded data

**Response:**
- Natural language answer based on schema analysis

#### explain-fields
Explain fields/properties in the schema.

**Input Schema:**
```typescript
{
  fieldNames?: string;        // Optional: Comma-separated field names
  includeDetails?: boolean;   // Optional: Include detailed info (default: true)
}
```

**Response:**
- Structured explanation of fields with:
  - Data types and constraints
  - Validation rules
  - Default values
  - Relationships

#### explain-entity
Explain entities/tables in the schema.

**Input Schema:**
```typescript
{
  entityNames?: string;           // Optional: Comma-separated entity names
  includeRelationships?: boolean; // Optional: Include relationships (default: true)
  includeFields?: boolean;         // Optional: Include field details (default: true)
}
```

**Response:**
- Detailed entity explanation with:
  - Purpose and description
  - Key characteristics
  - Fields (if requested)
  - Relationships (if requested)

#### explain-relationships
Explain all relationships between entities.

**Input Schema:**
```typescript
{}  // No arguments required
```

**Response:**
- Comprehensive relationship mapping:
  - Foreign keys
  - Relationship types (1:1, 1:N, N:M)
  - Dependencies
  - Referential integrity rules

#### generate-examples
Generate example data instances.

**Input Schema:**
```typescript
{
  count?: number;           // Optional: 1-10 (default: 1)
  entityNames?: string;      // Optional: Comma-separated entity names
  format?: "json" | "json-array";  // Optional: Output format (default: "json")
}
```

**Validation:**
- Count must be between 1 and 10
- Format must be valid enum value

**Response:**
- JSON examples conforming to schema constraints

### Tier 3: Database Query MCP Server

**Base URL:** `http://localhost:3002`

#### GET /health
Health check with database status.

**Response:**
```json
{
  "status": "ok",
  "server": "database-query",
  "version": "2.0.0",
  "provider": "google" | "anthropic",
  "databases": 2,
  "connectedDatabases": 1
}
```

#### GET /databases
List all registered databases.

**Response:**
```json
{
  "databases": [
    {
      "id": "db1",
      "name": "Production DB",
      "type": "postgresql",
      "connected": true,
      "isDefault": true
    }
  ]
}
```

#### POST /mcp/call-tool
MCP-compatible tool invocation (same format as Model Interpretation server).

### Database Query Tools

#### generate-sql
Generate SQL from natural language.

**Input Schema:**
```typescript
{
  query: string;                 // Required: Natural language query
  databaseId?: string;            // Optional: Database ID (uses default if omitted)
}
```

**Validation:**
- Query must be non-empty
- Database must be connected

**Response:**
- Generated SQL query with explanation

#### list-tables
List all tables in the database.

**Input Schema:**
```typescript
{
  includeViews?: boolean;         // Optional: Include views (default: true)
  schemaName?: string;            // Optional: Schema name (default: "public")
  databaseId?: string;           // Optional: Database ID
}
```

**Response:**
- Table listing with names and types

#### get-table-schema
Get detailed schema for a table.

**Input Schema:**
```typescript
{
  tableName: string;              // Required: Table name
  includeConstraints?: boolean;   // Optional: Include constraints (default: true)
  includeForeignKeys?: boolean;    // Optional: Include FKs (default: true)
  databaseId?: string;            // Optional: Database ID
}
```

**Validation:**
- Table name must be non-empty
- Table must exist in database

**Response:**
- Detailed schema with:
  - Columns (name, type, nullable, default)
  - Constraints (if requested)
  - Foreign keys (if requested)

#### execute-query
Execute a SQL query.

**Input Schema:**
```typescript
{
  sql: string;                    // Required: SQL query
  limit?: number;                 // Optional: Max rows (1-1000, default: 100)
  explain?: boolean;              // Optional: Return execution plan (default: false)
  databaseId?: string;            // Optional: Database ID
}
```

**Validation:**
- SQL must be non-empty
- Dangerous operations are blocked (see Security Validation)
- Limit must be between 1 and 1000

**Response:**
- Query results as markdown table
- Error message if query fails

#### get-sample-queries
Generate sample SQL queries.

**Input Schema:**
```typescript
{
  tableName?: string;             // Optional: Specific table
  queryType?: "select" | "insert" | "update" | "delete" | "aggregate" | "join" | "all";
  databaseId?: string;            // Optional: Database ID
}
```

**Response:**
- Collection of sample queries with descriptions

---

## LLM Output Validation

### Validation Pipeline

The system implements a multi-stage validation pipeline for LLM outputs:

```
LLM Response → Extraction → Content Validation → Safety Check → Format Validation → Final Output
```

### Stage 1: Response Extraction

#### Algorithm: Extract Text from LLM Response

**Purpose:** Extract text content from provider-specific response formats.

**Implementation:**

```typescript
function extractTextFromLLMResponse(
  response: ProviderResponse,
  provider: LLMProvider
): string {
  switch (provider) {
    case "google":
      const text = response.response.text();
      if (!text || text.trim().length === 0) {
        throw new ValidationError("Empty response from Google AI");
      }
      return text;
    
    case "anthropic":
      const firstContent = response.content[0];
      if (!firstContent || firstContent.type !== "text") {
        throw new ValidationError("Invalid response structure from Anthropic");
      }
      return firstContent.text;
    
    case "openai":
      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new ValidationError("Invalid response structure from OpenAI");
      }
      return choice.message.content;
  }
}
```

**Validation Rules:**
- Response must contain text content
- Text must be non-empty after trimming
- Response structure must match provider format

### Stage 2: Safety and Blocking Detection

#### Algorithm: Detect Safety Blocks

**Purpose:** Identify when LLM responses are blocked by safety filters.

**Implementation:**

```typescript
function detectSafetyBlock(
  response: ProviderResponse,
  provider: LLMProvider
): boolean {
  switch (provider) {
    case "google":
      const candidate = response.response.candidates?.[0];
      return candidate?.finishReason === "SAFETY";
    
    case "anthropic":
      // Anthropic doesn't explicitly block, but may return empty content
      return false;
    
    case "openai":
      const choice = response.choices[0];
      return choice?.finish_reason === "content_filter";
  }
}
```

**Handling:**
- If safety block detected, return user-friendly error message
- Log the incident for monitoring
- Do not expose raw error to user

### Stage 3: Truncation Detection

#### Algorithm: Detect Truncated Responses

**Purpose:** Identify when responses are cut off due to token limits.

**Implementation:**

```typescript
function detectTruncation(
  response: ProviderResponse,
  provider: LLMProvider
): { truncated: boolean; reason: string } {
  switch (provider) {
    case "google":
      const candidate = response.response.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") {
        return { truncated: true, reason: "MAX_TOKENS" };
      }
      break;
    
    case "anthropic":
      if (response.stop_reason === "max_tokens") {
        return { truncated: true, reason: "max_tokens" };
      }
      break;
    
    case "openai":
      if (response.choices[0]?.finish_reason === "length") {
        return { truncated: true, reason: "length" };
      }
      break;
  }
  
  return { truncated: false, reason: "" };
}
```

**Handling:**
- Log truncation for monitoring
- Return partial response with warning if applicable
- Suggest user to request smaller output

### Stage 4: SQL Query Validation

#### Algorithm: Validate SQL Query Output

**Purpose:** Ensure generated SQL queries are safe and valid.

**Implementation:**

```typescript
function validateSQLQuery(sql: string): ValidationResult {
  // 1. Extract SQL from response
  const extractedSQL = extractSQLFromResponse(sql);
  
  // 2. Check for dangerous operations
  if (isDangerousSQL(extractedSQL)) {
    return {
      valid: false,
      error: "Dangerous SQL operation detected",
      blocked: true
    };
  }
  
  // 3. Validate SQL syntax (basic)
  if (!isValidSQLSyntax(extractedSQL)) {
    return {
      valid: false,
      error: "Invalid SQL syntax",
      blocked: false
    };
  }
  
  // 4. Check for required clauses
  if (isSelectQuery(extractedSQL) && !hasLimit(extractedSQL)) {
    // Auto-add limit for safety
    extractedSQL = addLimit(extractedSQL, 100);
  }
  
  return {
    valid: true,
    sql: extractedSQL,
    blocked: false
  };
}
```

#### Dangerous SQL Detection

**Pattern Matching Algorithm:**

```typescript
const DANGEROUS_SQL_PATTERNS = [
  /^\s*DROP\s+/i,           // DROP TABLE, DROP DATABASE, etc.
  /^\s*TRUNCATE\s+/i,        // TRUNCATE TABLE
  /^\s*ALTER\s+/i,            // ALTER TABLE, ALTER DATABASE
  /^\s*CREATE\s+/i,          // CREATE TABLE, CREATE DATABASE
  /^\s*GRANT\s+/i,           // GRANT permissions
  /^\s*REVOKE\s+/i,          // REVOKE permissions
  /;\s*(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\s+/i  // Multiple statements
];

function isDangerousSQL(sql: string): boolean {
  const cleanedSQL = sql.trim();
  
  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(cleanedSQL)) {
      return true;
    }
  }
  
  return false;
}
```

**Validation Rules:**
- Block DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE
- Allow SELECT, INSERT, UPDATE, DELETE (with caution)
- Check for multiple statements with semicolons
- Case-insensitive matching

#### SQL Extraction Algorithm

**Purpose:** Extract SQL from LLM response that may contain markdown or explanations.

**Implementation:**

```typescript
function extractSQLFromResponse(response: string): string {
  let sql: string;
  
  // 1. Try to extract from SQL code block
  const sqlBlockMatch = response.match(/```sql\s*([\s\S]*?)\s*```/i);
  if (sqlBlockMatch) {
    sql = sqlBlockMatch[1];
  } 
  // 2. Try generic code block
  else {
    const codeBlockMatch = response.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      sql = codeBlockMatch[1];
    }
    // 3. Try to find SQL statement directly
    else {
      const sqlMatch = response.match(
        /(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\s+[\s\S]+?(?:;|$)/i
      );
      if (sqlMatch) {
        sql = sqlMatch[0];
      } else {
        sql = response;  // Fallback: use entire response
      }
    }
  }
  
  // 4. Clean SQL
  return cleanSQL(sql);
}

function cleanSQL(sql: string): string {
  return sql
    .trim()
    .replace(/\r\n/g, "\n")      // Normalize line endings
    .replace(/\r/g, "\n")
    .replace(/;+\s*$/, "")        // Remove trailing semicolons
    .trim();
}
```

**Extraction Priority:**
1. SQL code block (```sql ... ```)
2. Generic code block (``` ... ```)
3. Direct SQL statement match
4. Entire response (fallback)

### Stage 5: JSON Schema Validation

#### Algorithm: Validate Generated Examples

**Purpose:** Ensure generated example data conforms to schema constraints.

**Implementation:**

```typescript
function validateGeneratedExamples(
  examples: string,
  schema: SchemaDefinition
): ValidationResult {
  try {
    // 1. Parse JSON
    const parsed = JSON.parse(examples);
    
    // 2. Validate structure
    if (Array.isArray(parsed)) {
      // Validate each item
      for (const item of parsed) {
        const result = validateAgainstSchema(item, schema);
        if (!result.valid) {
          return {
            valid: false,
            error: `Item validation failed: ${result.error}`,
            item: item
          };
        }
      }
    } else {
      // Validate single object
      const result = validateAgainstSchema(parsed, schema);
      if (!result.valid) {
        return result;
      }
    }
    
    // 3. Check required fields
    const requiredFields = getRequiredFields(schema);
    for (const field of requiredFields) {
      if (!hasField(parsed, field)) {
        return {
          valid: false,
          error: `Missing required field: ${field}`
        };
      }
    }
    
    // 4. Check data types
    const typeErrors = validateDataTypes(parsed, schema);
    if (typeErrors.length > 0) {
      return {
        valid: false,
        error: `Type validation failed: ${typeErrors.join(", ")}`
      };
    }
    
    return { valid: true, data: parsed };
  } catch (error) {
    return {
      valid: false,
      error: `JSON parsing failed: ${error.message}`
    };
  }
}
```

**Validation Checks:**
- JSON syntax validity
- Required fields presence
- Data type conformance
- Constraint satisfaction (min/max, patterns, etc.)
- Enum value validity
- Referential integrity (if relationships exist)

### Stage 6: Content Quality Validation

#### Algorithm: Validate Response Quality

**Purpose:** Ensure LLM responses meet quality standards.

**Implementation:**

```typescript
function validateResponseQuality(
  response: string,
  expectedFormat: "text" | "json" | "sql" | "markdown"
): QualityResult {
  const checks: QualityCheck[] = [];
  
  // 1. Length check
  if (response.length < 10) {
    checks.push({
      passed: false,
      issue: "Response too short",
      severity: "error"
    });
  }
  
  // 2. Format-specific validation
  switch (expectedFormat) {
    case "json":
      if (!isValidJSON(response)) {
        checks.push({
          passed: false,
          issue: "Invalid JSON format",
          severity: "error"
        });
      }
      break;
    
    case "sql":
      if (!containsSQLKeywords(response)) {
        checks.push({
          passed: false,
          issue: "Response doesn't appear to contain SQL",
          severity: "warning"
        });
      }
      break;
    
    case "markdown":
      // Check for basic markdown structure
      if (!hasMarkdownStructure(response)) {
        checks.push({
          passed: false,
          issue: "Response lacks markdown structure",
          severity: "warning"
        });
      }
      break;
  }
  
  // 3. Coherence check (basic)
  if (hasRepeatedPhrases(response, 3)) {
    checks.push({
      passed: false,
      issue: "Response contains excessive repetition",
      severity: "warning"
    });
  }
  
  const errors = checks.filter(c => c.severity === "error");
  const warnings = checks.filter(c => c.severity === "warning");
  
  return {
    passed: errors.length === 0,
    errors,
    warnings,
    score: calculateQualityScore(checks)
  };
}
```

### Validation Error Handling

#### Error Response Format

```typescript
interface ValidationError {
  code: string;              // Error code (e.g., "SAFETY_BLOCK", "INVALID_SQL")
  message: string;           // User-friendly message
  details?: unknown;         // Additional error details
  recoverable: boolean;      // Whether user can retry
  suggestion?: string;       // Suggested action
}
```

#### Error Codes

- `EMPTY_RESPONSE`: LLM returned empty response
- `SAFETY_BLOCK`: Response blocked by safety filters
- `TRUNCATED`: Response truncated due to token limits
- `INVALID_SQL`: Generated SQL is invalid or dangerous
- `INVALID_JSON`: Generated JSON is malformed
- `SCHEMA_MISMATCH`: Generated data doesn't match schema
- `VALIDATION_FAILED`: General validation failure

### Retry Logic

#### Algorithm: Retry with Backoff

**Purpose:** Retry failed LLM calls with exponential backoff.

**Implementation:**

```typescript
async function retryLLMCall<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay;
      const totalDelay = delay + jitter;
      
      if (attempt < maxRetries - 1) {
        await sleep(totalDelay);
      }
    }
  }
  
  throw lastError!;
}

function isNonRetryableError(error: Error): boolean {
  const nonRetryableCodes = [
    "SAFETY_BLOCK",
    "INVALID_INPUT",
    "AUTHENTICATION_ERROR"
  ];
  
  return nonRetryableCodes.some(code => 
    error.message.includes(code)
  );
}
```

**Retry Strategy:**
- Max 3 retries by default
- Exponential backoff: 1s, 2s, 4s
- Jitter added to prevent synchronized retries
- Non-retryable errors fail immediately

---

## Module Architecture

### Module Communication Flow

```
┌─────────────┐
│   Next.js   │
│   Frontend  │
└──────┬──────┘
       │ HTTP POST /api/chat
       ▼
┌─────────────┐
│  LangChain   │
│    Agent     │
└──────┬──────┘
       │ Tool Invocation
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│   Model     │   │  Database   │
│Interpretation│   │   Query     │
│   MCP       │   │    MCP       │
│  Server     │   │   Server    │
└──────┬──────┘   └──────┬──────┘
       │                 │
       │ HTTP            │ HTTP
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│   LLM API   │   │  Database   │
│  Providers  │   │ Connections │
└─────────────┘   └─────────────┘
```

### Data Flow Example: Schema Query

1. **User Input:**
   ```json
   {
     "message": "What fields are in the Student entity?",
     "history": []
   }
   ```

2. **Agent Processing:**
   - Classifies intent: "Schema Query"
   - Selects tool: `model_interpretation_ask_question`
   - Invokes tool with: `{ question: "What fields are in the Student entity?" }`

3. **MCP Server Processing:**
   - Validates input schema
   - Retrieves uploaded schema from store
   - Constructs prompt with schema context
   - Calls LLM API

4. **LLM Response Validation:**
   - Extracts text from response
   - Checks for safety blocks
   - Validates content quality
   - Returns processed response

5. **Response Formatting:**
   - Formats as markdown
   - Returns to agent
   - Agent formats for frontend
   - Frontend displays to user

### Module Dependencies

```
nextjs/
├── lib/langchain/
│   ├── agent.ts          → Depends on: tools, LLM providers
│   ├── tools/            → Depends on: MCP clients
│   └── clients/          → Depends on: MCP servers (HTTP)
│
mcp-servers/
├── model-interpretation/
│   ├── server.ts         → Depends on: tools, AI providers
│   ├── tools/            → Depends on: AI providers, store
│   └── ai/               → Depends on: LLM SDKs
│
└── database-query/
    ├── server.ts         → Depends on: tools, manager
    ├── tools/            → Depends on: AI providers, adapters
    └── adapters/         → Depends on: Database drivers
```

### Configuration Management

**Environment Variables:**

```typescript
// LLM Configuration
LLM_PROVIDER=google|anthropic|openai
GOOGLE_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_MODEL=gemini-2.0-flash
ANTHROPIC_MODEL=claude-3-5-haiku-latest
OPENAI_MODEL=gpt-4o-mini

// Server Configuration
MODEL_INTERPRETATION_PORT=3001
DATABASE_QUERY_PORT=3002
NEXTJS_PORT=3000

// Database Configuration (optional)
DATABASE_URL=...
DATABASE_HOST=...
DATABASE_NAME=...
```

**Configuration Loading:**

```typescript
function loadConfig(): AppConfig {
  return {
    provider: (process.env.LLM_PROVIDER || "google") as LLMProvider,
    googleKey: process.env.GOOGLE_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    googleModel: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
    port: parseInt(process.env.PORT || "3001", 10)
  };
}
```

---

## Summary

This document provides comprehensive implementation details for:

1. **Data Structures**: Complete type definitions for all message types, responses, database structures, and LLM outputs
2. **API Specifications**: Detailed endpoint documentation with request/response formats for all modules
3. **Validation Algorithms**: Multi-stage validation pipeline with specific algorithms for SQL, JSON, and content quality validation
4. **Module Architecture**: Communication flows, dependencies, and configuration management

The system implements robust validation at multiple levels to ensure safety, correctness, and quality of LLM-generated outputs while maintaining a clean, modular architecture.

---

*Document Version: 1.0*  
*Last Updated: 2025-01-27*
