4.2 AI Accuracy Benchmarking 
The reliability and stability of the LLM's output are evaluated using a positive functional test suite. To account for the non-deterministic nature of Large Language Models, each test case is executed repeatedly. This approach allows us to measure not just accuracy, but also the stability of the system's responses.
4.2.1 Positive Testing (Functional Accuracy)
Ground truth cases focus on the core "SQL Generation Accuracy":
Simple Retrieval: Direct mapping of one entity to one table.
Complex Joins: Queries requiring relationships defined in the DataSpecer schema.
Aggregations: Natural language requests involving metrics like "total count" or "average".
4.2.2 Evaluation Metrics
The performance of the system is measured using the following quantitative metrics:
Metric Category
Specific Metric
Definition
Execution
Execution Rate
The percentage of generated SQL queries that execute without syntax errors.
Performance
Response Time (Average, P95)
Average and 95th percentile latency of benchmark responses in milliseconds.
Accuracy
Result Accuracy
The percentage of successful queries that return the exact same dataset as the manually verified ground truth.
Stability
Consistency Score
The percentage of repeated runs for a single test case that yield semantically identical SQL or text results. This measures the system's robustness against non-determinism (e.g., ensuring the chatbot doesn't answer correctly once and fail the next time on the same prompt).

