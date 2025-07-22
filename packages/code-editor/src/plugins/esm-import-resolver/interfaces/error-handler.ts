/**
 * Error handler interface
 */
export interface ErrorHandler {
  /**
   * Handle network errors
   */
  handleNetworkError(error: NetworkError, context: string): Promise<void>
  
  /**
   * Handle parse errors
   */
  handleParseError(error: ParseError, code: string): void
  
  /**
   * Handle type loading errors
   */
  handleTypeLoadError(error: TypeError, packageUrl: string): void
  
  /**
   * Handle Monaco integration errors
   */
  handleMonacoError(error: MonacoError, context: string): void
  
  /**
   * Report error to logging system
   */
  reportError(error: Error, context: string): void
  
  /**
   * Get error recovery strategy
   */
  getRecoveryStrategy(error: Error): ErrorRecoveryStrategy
  
  /**
   * Check if error is recoverable
   */
  isRecoverable(error: Error): boolean
  
  /**
   * Get retry configuration for error
   */
  getRetryConfig(error: Error): RetryConfig
}

/**
 * Network error types
 */
export interface NetworkError extends Error {
  /** HTTP status code */
  status?: number
  
  /** Response headers */
  headers?: Record<string, string>
  
  /** Request URL */
  url: string
  
  /** Request method */
  method: string
  
  /** Whether error is timeout */
  isTimeout: boolean
  
  /** Whether error is network failure */
  isNetworkFailure: boolean
  
  /** Retry attempt number */
  retryAttempt: number
}

/**
 * Parse error types
 */
export interface ParseError extends Error {
  /** Source code that failed to parse */
  source: string
  
  /** File path */
  filePath: string
  
  /** Line number */
  line: number
  
  /** Column number */
  column: number
  
  /** Error code */
  code: string
  
  /** Error severity */
  severity: 'error' | 'warning'
  
  /** Suggested fix */
  fix?: string
}

/**
 * Type loading error
 */
export interface TypeError extends Error {
  /** Package URL that failed */
  packageUrl: string
  
  /** Type URL that failed */
  typeUrl?: string
  
  /** Error type */
  errorType: 'fetch-failed' | 'invalid-types' | 'parse-failed'
  
  /** HTTP status code */
  status?: number
  
  /** Whether types are required */
  required: boolean
}

/**
 * Monaco integration error
 */
export interface MonacoError extends Error {
  /** Monaco operation that failed */
  operation: string
  
  /** Monaco error code */
  monacoCode?: string
  
  /** Whether error affects functionality */
  critical: boolean
  
  /** Suggested recovery action */
  recoveryAction?: string
}

/**
 * Error recovery strategy
 */
export interface ErrorRecoveryStrategy {
  /** Strategy name */
  name: string
  
  /** Strategy description */
  description: string
  
  /** Recovery action */
  action: () => Promise<void>
  
  /** Whether recovery is automatic */
  automatic: boolean
  
  /** Recovery timeout */
  timeout: number
  
  /** Maximum recovery attempts */
  maxAttempts: number
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number
  
  /** Initial delay in milliseconds */
  initialDelay: number
  
  /** Backoff multiplier */
  backoffMultiplier: number
  
  /** Maximum delay in milliseconds */
  maxDelay: number
  
  /** Jitter factor (0-1) */
  jitter: number
  
  /** Retry condition function */
  shouldRetry: (error: Error, attempt: number) => boolean
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories
 */
export enum ErrorCategory {
  NETWORK = 'network',
  PARSE = 'parse',
  TYPE_LOADING = 'type-loading',
  MONACO_INTEGRATION = 'monaco-integration',
  CONFIGURATION = 'configuration',
  CACHE = 'cache',
  UNKNOWN = 'unknown'
}

/**
 * Error context information
 */
export interface ErrorContext {
  /** Operation being performed */
  operation: string
  
  /** File path (if applicable) */
  filePath?: string
  
  /** Package URL (if applicable) */
  packageUrl?: string
  
  /** User action that triggered error */
  userAction?: string
  
  /** Additional context data */
  data?: Record<string, any>
  
  /** Timestamp when error occurred */
  timestamp: number
}

/**
 * Error reporting interface
 */
export interface ErrorReporter {
  /**
   * Report error
   */
  report(error: Error, context: ErrorContext): void
  
  /**
   * Report warning
   */
  warn(message: string, context: ErrorContext): void
  
  /**
   * Report info
   */
  info(message: string, context: ErrorContext): void
  
  /**
   * Get error statistics
   */
  getStats(): ErrorStats
  
  /**
   * Clear error history
   */
  clearHistory(): void
}

/**
 * Error statistics
 */
export interface ErrorStats {
  /** Total error count */
  totalErrors: number
  
  /** Errors by category */
  errorsByCategory: Record<ErrorCategory, number>
  
  /** Errors by severity */
  errorsBySeverity: Record<ErrorSeverity, number>
  
  /** Most common errors */
  mostCommonErrors: Array<{
    message: string
    count: number
    lastOccurred: number
  }>
  
  /** Error rate (errors per hour) */
  errorRate: number
  
  /** Recovery success rate */
  recoverySuccessRate: number
}

/**
 * Graceful degradation strategy
 */
export interface GracefulDegradationStrategy {
  /** Strategy name */
  name: string
  
  /** Check if strategy applies to error */
  applies(error: Error): boolean
  
  /** Execute degradation strategy */
  execute(error: Error, context: ErrorContext): Promise<void>
  
  /** Get fallback behavior description */
  getDescription(): string
  
  /** Whether strategy maintains core functionality */
  maintainsCoreFunction: boolean
}