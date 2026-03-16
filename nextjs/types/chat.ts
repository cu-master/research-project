export type MessageRole = "user" | "assistant";

export type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
};

export type ToolCall = {
  tool: string;
  input: string;
  log: string;
  observation: string;
};

export type ProgressStep = {
  tool: string;
  label: string;
  status: "running" | "done" | "error";
  result?: string;
};

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  progressSteps?: ProgressStep[];
  toolsUsed?: ToolCall[];
  latency?: number;
};

