2.5 System Logic & Data Flow Strategy
2.5.1 Orchestration & Sequential Dependency
The two Tier 3 MCP servers are architecturally decoupled microservices to ensure modularity and scalability. However, logically, they operate under a strict Sequential Dependency managed by the Tier 2 LangChain Orchestrator.
The relationship is functional: The output of the Model Interpretation Server (conceptual context) is a mandatory input dependency for the Database Query Server (physical execution).
Without the first server: The query server would function as a generic text-to-SQL bot lacking domain-specific knowledge or business rules defined in the DataSpecer schema.
Without the second server: The interpretation server would remain a static documentation reader incapable of retrieving live data.
The Orchestrator bridges this gap by first resolving what the user is asking about (using the conceptual model) before determining how to retrieve it (using the physical database).
2.5.2 Schema Ingestion & Semantic Pruning
The output of the Model Interpretation Server is derived from the standard JSON-LD or RDF formats exported by DataSpecer. To prevent context overflow and reduce token latency, the system does not pass the raw specification to the LLM. Instead, we implement a preprocessing and pruning pipeline:
Ingestion: Upon receiving a DataSpecer URL (FR-02), the Tier 3 server fetches the raw JSON-LD and parses it into an internal graph representation.
Semantic Pruning: For each user query, the server "prunes" this graph to extract only the Entities, Attributes, and Relationships strictly relevant to the current natural language intent.
Validation:
Syntax: The ingestion process validates the source against standard DataSpecer schemas to ensure integrity (FR-02).
Semantics: The system calculates an "Alignment Score" (FR-03) to validate that the ingested conceptual entities actually exist in the connected physical database.
2.5.3 Retrieval-Augmented Generation (RAG) Workflow
The system employs a Retrieval-Augmented Generation (RAG) workflow where the first MCP server acts as the retriever for the second.
Example Workflow:
User Query: "List students in the Deep Learning course."
Step 1 (Interpretation): The Orchestrator queries the Model Interpretation Server. The server scans the preprocessed schema and returns the Conceptual Definition: "Student has student_id attribute and has a relationship enrolled_in to the Entity Course."
Step 2 (Synthesis): The Orchestrator synthesizes a prompt combining three elements:
The User's Natural Language Query.
The Conceptual Definition (from Step 1).
The Physical Mapping Rules (see 2.5.4).
Step 3 (Execution): This synthesized context is passed to the Database Query Server, which generates the SQL: "Given the user wants 'students in Deep Learning', and 'Student' maps to table t_stud via enrolled_in, generate the SQL."
2.5.4 Conceptual to Physical Mapping Strategy
We acknowledge that the conceptual model (DataSpecer) and the physical relational database structure are rarely 1:1. To handle this, the system relies on the Heuristic Alignment process defined in FR-03.
Mapping Representation: The mapping is calculated once and stored as a persistent JSON configuration file in the Metadata Store (PostgreSQL), linked to the active session.
Example Structure: { "concept_attribute_uri": "urn:student/name", "physical_column": "tbl_students.full_name", "transformation": "direct" }.
Handling Mismatch: If the structure is not mapped (e.g., the schema lists an attribute that has no corresponding column in the DB), the Alignment Score decreases. If this score falls below a safety threshold (e.g., < 20%), the system automatically disables the "Query Database" feature and issues a warning to the user, ensuring the system fails gracefully rather than executing invalid queries.
2.5.5 SQL Validation & Execution Safety
To ensure the correctness and safety of the generated SQL, the system treats the LLM output as untrusted input (NFR-02).
AST Parsing: The generated SQL string is parsed into an Abstract Syntax Tree (AST) using a deterministic library (e.g., node-sql-parser).
Structural Verification: We programmatically traverse the AST to verify that the root node is strictly a SELECT statement. Any mutating commands (e.g., DROP, INSERT, ALTER) are rejected at the parser level.
Performance Safety: As specified in FR-05, the system injects a COUNT(*) estimate or runs an EXPLAIN query prior to full execution. If the query is predicted to return a massive dataset, the execution is paused to prevent browser crashes.
2.5.6 Result Interpretation & Presentation
Raw database results are often cryptic (e.g., column names like t_crs_nm). To improve usability for non-experts, the system utilizes the DataSpecer schema for result re-hydration.
Reverse Mapping: The system applies the mapping rules (from Section 2.5.4) in reverse. If the SQL query returns data from tbl_students.fname, the system looks up the corresponding DataSpecer label (e.g., "First Name").
Presentation: The Frontend renders the data using these Conceptual Labels rather than the physical database column names, ensuring the user interacts with the data in the language of the domain, not the language of the database implementation.