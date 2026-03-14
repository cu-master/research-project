workspace "AI Chatbot System" "AI Chatbot for DataSpecer and Database Query" {

    model {
        # actors
        user = person "User" "Non-expert users who need to interpret data schemas and query databases using natural language"
        
        # software system
        aiChatbotSystem = softwareSystem "AI Chatbot System" "Enables non-expert users to interpret data specifications and query real-world databases using natural language" {
            # Tier 1: Presentation Layer
            webApp = container "Next.js Web Application" "Responsive web-based chat interface for user interaction" "Web Front-End" {
                # UI Components
                chatSurface = component "Chat Surface" "Renders message history and manages scroll"
                messageBubble = component "Message Bubble" "Displays user and AI messages with formatting"
                chatInput = component "Chat Input" "Captures user input, handles public URL input for data specifications, and sends messages"
                loadingIndicator = component "Loading Indicator" "Shows processing state during API calls"
                appLayout = component "App Layout" "Main application layout with sidebar and content area"
                sidebar = component "Sidebar" "Navigation and context sidebar"
                
                # API Routes (Session Management)
                sessionAPI = component "Session API" "Next.js API routes for session management (create, get, archive, restore sessions)"
                chatAPI = component "Chat API" "Next.js API route that orchestrates chat flow, calls LangChain Agent, and persists messages"
            }
            
            # Tier 2: Orchestration Layer
            langchainAgent = container "LangChain Agent API" "Orchestrates conversation flow, routes queries, and manages tool calls with sequential dependency (RAG workflow)" "Next.js API Route" {
                agentCore = component "Agent Core" "Initializes LLM model, creates agent instance, and manages system prompts"
                toolRegistry = component "Tool Registry" "Registers and combines all available tools (model interpretation and database query tools)"
                errorHandler = component "Error Handler" "Handles errors and formats user-friendly messages"
                contextSynthesizer = component "Context Synthesizer" "Synthesizes prompts combining user query, conceptual definitions, and physical mapping rules (RAG Step 2)"
                
                # Tool categories
                modelInterpretationTools = component "Model Interpretation Tools" "Tools provided by the Model Interpretation MCP Server"
                databaseQueryTools = component "Database Query Tools" "Tools provided by the Database Query MCP Server"
                
                # Client wrappers
                modelInterpretationClient = component "Model Interpretation Client" "HTTP client for Model Interpretation MCP Server"
                databaseQueryClient = component "Database Query Client" "HTTP client for Database Query MCP Server"
                
                # Utilities
                configManager = component "Config Manager" "Manages LLM provider configuration and MCP server base URLs"
            }
            
            # Tier 3: Backend Services
            modelInterpretationServer = container "Model Interpretation MCP Server" "Interprets data schemas, models, and specifications using AI (RAG retriever)" "Express.js" {
                modelInterpretationExpressServer = component "Express Server" "HTTP server with CORS and request handling"
                modelInterpretationToolHandlers = component "Tool Handlers" "Handles all MCP tool requests"
                dataStore = component "Data Store" "In-memory cache for URL content and active schema processing context (session-scoped, cleared on new sessions)"
                modelInterpretationAIProvider = component "AI Provider" "Interface to LLM providers (Google, Anthropic, OpenAI)"
                urlFetcher = component "URL Fetcher" "Fetches and parses web content from DataSpecer URLs"
                
                # Schema Ingestion & Semantic Pruning Pipeline
                schemaIngestion = component "Schema Ingestion" "Fetches JSON-LD/RDF from DataSpecer URLs and parses into internal graph representation"
                semanticPruner = component "Semantic Pruner" "Prunes graph to extract only Entities, Attributes, and Relationships relevant to current query intent"
                syntaxValidator = component "Syntax Validator" "Validates ingested schemas against standard DataSpecer schemas for integrity"
                alignmentScoreCalculator = component "Alignment Score Calculator" "Calculates alignment score to validate conceptual entities exist in physical database"
                
                # FR-04: Conceptual Query Interpretation Components
                schemaContextRetriever = component "Schema Context Retriever" "Retrieves relevant schema context and source metadata (URL origin) from Persistent Metadata Store for conceptual queries"
                sourceAttributionHandler = component "Source Attribution Handler" "Manages URL origin tracking and generates source citations referencing specific sections/entities from DataSpecer model"
                explanationGenerator = component "Explanation Generator" "Generates natural language explanations of data structures, entities, and relationships using LLM with schema context"
                relatedEntityAnalyzer = component "Related Entity Analyzer" "Analyzes current context against full schema to identify related entities/attributes not yet discussed"
                suggestionGenerator = component "Suggestion Generator" "Generates interactive follow-up topic suggestions to guide users toward unexplored parts of the data model"
            }
            
            databaseQueryServer = container "Database Query MCP Server" "Provides AI-powered SQL generation and execution (RAG generator)" "Express.js" {
                databaseQueryExpressServer = component "Express Server" "HTTP server with CORS and request handling"
                databaseQueryToolHandlers = component "Tool Handlers" "Handles all MCP tool requests"
                databaseManager = component "Database Manager" "Manages multiple database connections"
                sqlGenerator = component "SQL Generator" "Translates natural language to SQL using LLM with conceptual context and mapping rules"
                queryValidator = component "Query Validator" "Validates SQL queries for safety (read-only)"
                schemaExplorer = component "Schema Explorer" "Explores database schemas and metadata"
                databaseQueryAIProvider = component "AI Provider" "Interface to LLM providers (Google, Anthropic, OpenAI)"
                
                # SQL Validation & Execution Safety
                astParser = component "AST Parser" "Parses generated SQL string into Abstract Syntax Tree using deterministic library"
                structuralVerifier = component "Structural Verifier" "Traverses AST to verify root node is strictly SELECT statement, rejects mutating commands"
                performanceSafety = component "Performance Safety" "Injects COUNT(*) estimate or EXPLAIN query before execution to prevent browser crashes"
                
                # Result Interpretation
                reverseMapper = component "Reverse Mapper" "Applies mapping rules in reverse to convert physical column names to conceptual labels"
                resultFormatter = component "Result Formatter" "Formats database results using conceptual labels from DataSpecer schema"
                
                # Database adapters
                database1Adapter = component "Database 1 Adapter" "General-purpose adapter for database connections"
                database2Adapter = component "Database 2 Adapter" "General-purpose adapter for database connections"
            }
            
            # Application Database (Metadata Store + Session Management)
            metadataStore = container "Application Database" "PostgreSQL database storing sessions, chat history, schemas, conceptual-to-physical mappings, and alignment scores" "PostgreSQL" "Database" {
                # Session & Chat History Management
                sessionManager = component "Session Manager" "Manages chat sessions (create, archive, restore) and links sessions to schemas"
                messageStore = component "Message Store" "Stores and retrieves chat message history (user and assistant messages) linked to sessions"
                schemaStore = component "Schema Store" "Stores DataSpecer schemas (JSON-LD/RDF) uploaded via URLs, linked to sessions"
                
                # Conceptual-to-Physical Mapping
                mappingManager = component "Mapping Manager" "Stores and retrieves conceptual-to-physical mapping JSON configurations linked to active sessions"
                heuristicAlignment = component "Heuristic Alignment" "Calculates and manages heuristic alignment between DataSpecer conceptual model and physical database structure"
            }

            !docs docs
        }
        
        # external systems
        llmProviders = softwareSystem "LLM Providers" "AI services providing natural language understanding and generation" "External System" {
            googleGemini = container "Google Gemini" "Google's Generative AI service" "" "External API"
            anthropicClaude = container "Anthropic Claude" "Anthropic's Claude AI service" "" "External API"
            openaiGPT = container "OpenAI GPT" "OpenAI's GPT service" "" "External API"
        }
        
        databases = softwareSystem "Databases" "External database systems storing actual data" "External System,Database" {
            postgresql = container "PostgreSQL Database" "PostgreSQL relational database" "" "Database"
        }
        
        dataspecer = softwareSystem "DataSpecer" "External service providing data specifications in JSON-LD/RDF format" "External System" {
            dataspecerAPI = container "DataSpecer API" "Provides data specification schemas via public URLs" "" "External API"
        }
        
        # relationships between users and system
        user -> webApp "Sends natural language queries and public URLs for data specifications"
        webApp -> user "Displays responses and conversation history"
        
        # relationships between containers (Tier 1 -> Tier 2)
        webApp -> langchainAgent "Chat API calls LangChain Agent for AI orchestration"
        langchainAgent -> webApp "Returns AI responses to Chat API"
        
        # relationships to Application Database
        webApp -> metadataStore "Session API and Chat API store/retrieve sessions, messages, and schemas"
        
        # relationships between containers (Tier 2 -> Tier 3)
        # Sequential Dependency: Model Interpretation (conceptual context) -> Database Query (physical execution)
        langchainAgent -> modelInterpretationServer "HTTP calls to Model Interpretation tools (RAG Step 1: retrieve conceptual definitions)"
        modelInterpretationServer -> langchainAgent "Returns conceptual definitions (entities, attributes, relationships)"
        langchainAgent -> databaseQueryServer "HTTP calls to Database Query tools (RAG Step 3: execute with synthesized context)"
        databaseQueryServer -> langchainAgent "Returns formatted query results with conceptual labels"
        
        # relationships to external systems
        langchainAgent -> llmProviders "API calls for LLM inference"
        modelInterpretationServer -> llmProviders "API calls for schema analysis"
        databaseQueryServer -> llmProviders "API calls for NL-to-SQL translation"
        databaseQueryServer -> databases "Executes SQL queries"
        modelInterpretationServer -> dataspecer "Fetches JSON-LD/RDF schemas from DataSpecer URLs"
        modelInterpretationServer -> metadataStore "Stores alignment scores, mapping metadata, and schemas"
        
        # relationships within Web Application
        appLayout -> chatSurface "Renders chat interface"
        appLayout -> sidebar "Renders navigation"
        chatSurface -> messageBubble "Renders messages"
        chatSurface -> loadingIndicator "Shows loading state"
        chatInput -> chatSurface "Sends new messages"
        chatInput -> chatAPI "POST requests to /api/chat"
        sidebar -> sessionAPI "Calls session management APIs (create, get, archive, restore)"
        chatSurface -> sessionAPI "Creates sessions and loads message history"
        chatAPI -> langchainAgent "Delegates AI processing to LangChain Agent"
        chatAPI -> metadataStore "Persists user and assistant messages to database"
        sessionAPI -> metadataStore "Manages sessions (create, get, archive, restore) and retrieves message history"
        
        # relationships within LangChain Agent
        agentCore -> toolRegistry "Registers all tools"
        agentCore -> llmProviders "Uses LLM for inference"
        agentCore -> configManager "Reads LLM provider and model configuration"
        toolRegistry -> modelInterpretationTools "Includes model interpretation tools"
        toolRegistry -> databaseQueryTools "Includes database query tools"
        modelInterpretationTools -> modelInterpretationClient "Calls Model Interpretation MCP Server (RAG retriever)"
        databaseQueryTools -> databaseQueryClient "Calls Database Query MCP Server (RAG generator)"
        modelInterpretationClient -> modelInterpretationServer "HTTP requests"
        databaseQueryClient -> databaseQueryServer "HTTP requests"
        agentCore -> errorHandler "Handles errors from agent operations"
        # RAG Workflow: Synthesize context after retrieving conceptual definitions
        modelInterpretationTools -> contextSynthesizer "Passes conceptual definitions for synthesis"
        contextSynthesizer -> databaseQueryTools "Provides synthesized context (query + conceptual + mapping)"
        contextSynthesizer -> metadataStore "Retrieves physical mapping rules"
        # Note: Session management and message persistence are handled by Next.js Chat API, not LangChain Agent
        
        # relationships within Model Interpretation Server
        modelInterpretationExpressServer -> modelInterpretationToolHandlers "Routes tool requests"
        modelInterpretationToolHandlers -> dataStore "Caches URL content and loads schemas into active processing context"
        modelInterpretationToolHandlers -> modelInterpretationAIProvider "Calls LLM for analysis"
        modelInterpretationToolHandlers -> urlFetcher "Fetches web content"
        urlFetcher -> dataStore "Caches fetched URL content to avoid re-fetching"
        modelInterpretationAIProvider -> llmProviders "API calls"
        
        # Schema Ingestion & Semantic Pruning Pipeline
        urlFetcher -> schemaIngestion "Passes fetched DataSpecer content"
        schemaIngestion -> syntaxValidator "Validates schema syntax against DataSpecer standards"
        schemaIngestion -> dataStore "Stores parsed graph representation (in-memory cache)"
        schemaIngestion -> metadataStore "Persists schemas to database via Schema Store"
        modelInterpretationToolHandlers -> semanticPruner "Requests pruned schema for query"
        semanticPruner -> dataStore "Retrieves full graph, returns pruned entities/attributes/relationships"
        semanticPruner -> alignmentScoreCalculator "Calculates alignment score for pruned entities"
        alignmentScoreCalculator -> metadataStore "Stores alignment scores and validation results"
        
        # FR-04: Conceptual Query Interpretation Flow
        modelInterpretationToolHandlers -> schemaContextRetriever "Requests schema context for conceptual queries"
        schemaContextRetriever -> metadataStore "Retrieves relevant schema context and source metadata (URL origin)"
        schemaContextRetriever -> sourceAttributionHandler "Passes schema context with source information"
        sourceAttributionHandler -> explanationGenerator "Provides source attribution data for citations"
        schemaContextRetriever -> explanationGenerator "Provides retrieved schema context"
        explanationGenerator -> modelInterpretationAIProvider "Calls LLM with natural language query and schema context"
        explanationGenerator -> relatedEntityAnalyzer "Passes current explanation context for analysis"
        relatedEntityAnalyzer -> dataStore "Analyzes full schema to identify unexplored entities/attributes"
        relatedEntityAnalyzer -> suggestionGenerator "Provides list of related entities for suggestion generation"
        suggestionGenerator -> modelInterpretationToolHandlers "Returns explanation, citations, and follow-up suggestions"
        
        # relationships within Database Query Server
        databaseQueryExpressServer -> databaseQueryToolHandlers "Routes tool requests"
        databaseQueryToolHandlers -> databaseManager "Manages connections"
        databaseQueryToolHandlers -> sqlGenerator "Generates SQL queries with synthesized context"
        databaseQueryToolHandlers -> schemaExplorer "Explores database schemas"
        sqlGenerator -> databaseQueryAIProvider "Calls LLM for SQL generation"
        sqlGenerator -> queryValidator "Validates generated SQL"
        # Note: Mapping rules are received via synthesized context from LangChain Agent, not retrieved directly
        queryValidator -> astParser "Parses SQL into AST for structural verification"
        astParser -> structuralVerifier "Verifies SELECT-only statements, rejects mutating commands"
        structuralVerifier -> performanceSafety "Runs COUNT/EXPLAIN before execution"
        performanceSafety -> databaseManager "Executes validated and safe queries"
        databaseManager -> database1Adapter "Database connections"
        databaseManager -> database2Adapter "Database connections"
        database1Adapter -> databases "Connects to database"
        database2Adapter -> databases "Connects to database"
        databaseQueryAIProvider -> llmProviders "API calls"
        
        # Result Interpretation Pipeline
        databaseManager -> reverseMapper "Passes raw query results"
        # Note: Mapping rules for reverse lookup are from synthesized context (provided by LangChain Agent)
        reverseMapper -> resultFormatter "Maps physical columns to conceptual labels using mapping rules from context"
        resultFormatter -> databaseQueryToolHandlers "Returns formatted results with conceptual labels"
        
        # deployment 
        deploymentEnvironment "production" {
            deploymentNode "Application Server" "" "Node.js Runtime" {
                deploymentNode "Next.js Server" "" "Next.js 14+" {
                    webAppInstance = containerInstance webApp
                    langchainAgentInstance = containerInstance langchainAgent
                }
            }
            
            deploymentNode "Backend Server 1" "" "Node.js Runtime" {
                deploymentNode "Express Server" "" "Express.js" {
                    modelInterpretationServerInstance = containerInstance modelInterpretationServer
                }
            }
            
            deploymentNode "Backend Server 2" "" "Node.js Runtime" {
                deploymentNode "Express Server" "" "Express.js" {
                    databaseQueryServerInstance = containerInstance databaseQueryServer
                }
            }
            
            deploymentNode "Database Server" "" "Cloud/On-premise" {
                deploymentNode "PostgreSQL" "" "PostgreSQL 13+" {
                    postgresqlInstance = containerInstance postgresql
                }
                deploymentNode "Metadata Store" "" "PostgreSQL 13+" {
                    metadataStoreInstance = containerInstance metadataStore
                }
            }
        }
    }

    views {
        systemContext aiChatbotSystem "SystemContext" "System Context Diagram" {
            include *
            autolayout lr
        }

        container aiChatbotSystem "Containers" "Container Diagram" {
            include *
        }

        component webApp "WebAppComponents" "Web Application Components" {
            include *
            autolayout lr
        }
        
        component langchainAgent "LangChainComponents" "LangChain Agent Components" {
            include *
            autolayout lr
        }
        
        component modelInterpretationServer "ModelInterpretationComponents" "Model Interpretation Server Components" {
            include *
            autolayout lr
        }
        
        component databaseQueryServer "DatabaseQueryComponents" "Database Query Server Components" {
            include *
            autolayout tb
        }
        
        component metadataStore "ApplicationDatabaseComponents" "Application Database Components" {
            include *
            autolayout lr
        }
        
        deployment aiChatbotSystem "production" "deployment" "Deployment Diagram" {
            include *
        }

        theme default
        
        styles {
            element "External System" {
                background #999999
                color #ffffff
            }
            element "Web Front-End" {
                shape WebBrowser
            }
            element "Database" {
                shape cylinder
            }
            element "External API" {
                shape WebBrowser
            }
            element "Next.js API Route" {
                background #1168bd
                color #ffffff
            }
            element "Express.js" {
                background #6c757d
                color #ffffff
            }
        }
    }
}

