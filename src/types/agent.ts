export type FileOrigin = 'sample' | 'uploaded' | 'agent';

export interface WorkspaceFile {
  path: string;
  content: string;
  language: string;
  size: number;
  updatedAt: number;
  origin: FileOrigin;
}

export interface FileSnapshot {
  id: string;
  path: string;
  beforeContent: string | null;
  afterContent: string | null;
  timestamp: number;
  summary: string;
  toolCallId?: string;
}

export type PermissionMode = 'ask' | 'auto';
export type ToolStatus = 'pending' | 'approved' | 'auto' | 'denied' | 'error';
export type AgentRolePreset = 'coder' | 'termux' | 'reviewer';
export type TermuxCategory = 'file' | 'device' | 'dev' | 'network';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: Record<string, unknown>;
  diffPreview?: string;
  snapshotId?: string;
  executedAt?: number;
}

export interface ImageAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
  base64: string;
}

export interface TerminalMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  thoughtSummary?: string;
  image?: ImageAttachment;
  toolCalls?: ToolCallRecord[];
  modelUsed?: string;
  highThinking?: boolean;
  timestamp: number;
  error?: boolean;
}

export interface TermuxScript {
  id: string;
  title: string;
  description: string;
  category: TermuxCategory;
  packages: string[];
  command: string;
  scriptBody: string;
  createdAt: number;
  origin: 'template' | 'agent';
}

export interface AgentSettings {
  permissionMode: PermissionMode;
  askOnReadTools: boolean;
  highThinking: boolean;
  rolePreset: AgentRolePreset;
  workspaceName: string;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface AgentStepResponse {
  text: string;
  thoughtSummary: string;
  functionCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  rawModelContent: GeminiContent | null;
  modelUsed: string;
}
