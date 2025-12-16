/**
 * Message creation and validation utilities
 */

import { uuidv7 } from 'uuidv7'
import type {
  EchoMessage,
  CallFunctionMessage,
  QueryRespMessage,
  ErrorMessage,
  IteratorValueMessage,
  IteratorDoneMessage,
  IteratorErrorMessage,
  IteratorCancelMessage,
} from './types'
import { MessageType } from './types'

// Re-export MessageType for convenience
export { MessageType }

/**
 * Create a function call message
 */
export function createCallMessage(
  method: string,
  params: any[],
  context?: Record<string, any>
): CallFunctionMessage {
  return {
    id: uuidv7(),
    type: MessageType.CallFunction,
    data: {
      method,
      params,
      ...context,
    },
  }
}

/**
 * Create a response message
 */
export function createResponseMessage(
  id: string,
  result: any
): QueryRespMessage {
  return {
    id,
    type: MessageType.QueryResp,
    data: {
      result,
    },
  }
}

/**
 * Create an error message
 */
export function createErrorMessage(
  id: string,
  error: Error | string
): ErrorMessage {
  const message = typeof error === 'string' ? error : error.message
  const stack = typeof error === 'object' ? error.stack : undefined

  return {
    id,
    type: MessageType.Error,
    data: {
      message,
      stack,
    },
  }
}

/**
 * Create an iterator value message
 */
export function createIteratorValueMessage(
  id: string,
  value: any
): IteratorValueMessage {
  return {
    id,
    type: MessageType.IteratorValue,
    data: {
      value,
    },
  }
}

/**
 * Create an iterator done message
 */
export function createIteratorDoneMessage(id: string): IteratorDoneMessage {
  return {
    id,
    type: MessageType.IteratorDone,
    data: {},
  }
}

/**
 * Create an iterator error message
 */
export function createIteratorErrorMessage(
  id: string,
  error: Error | string
): IteratorErrorMessage {
  const message = typeof error === 'string' ? error : error.message
  const stack = typeof error === 'object' ? error.stack : undefined

  return {
    id,
    type: MessageType.IteratorError,
    data: {
      message,
      stack,
    },
  }
}

/**
 * Create an iterator cancel message
 */
export function createIteratorCancelMessage(id: string): IteratorCancelMessage {
  return {
    id,
    type: MessageType.IteratorCancel,
    data: {},
  }
}

/**
 * Check if a message is a call message
 */
export function isCallMessage(message: EchoMessage): message is CallFunctionMessage {
  return message.type === MessageType.CallFunction
}

/**
 * Check if a message is a response message
 */
export function isResponseMessage(message: EchoMessage): message is QueryRespMessage {
  return message.type === MessageType.QueryResp
}

/**
 * Check if a message is an error message
 */
export function isErrorMessage(message: EchoMessage): message is ErrorMessage {
  return message.type === MessageType.Error
}

/**
 * Check if a message is an iterator value message
 */
export function isIteratorValueMessage(
  message: EchoMessage
): message is IteratorValueMessage {
  return message.type === MessageType.IteratorValue
}

/**
 * Check if a message is an iterator done message
 */
export function isIteratorDoneMessage(
  message: EchoMessage
): message is IteratorDoneMessage {
  return message.type === MessageType.IteratorDone
}

/**
 * Check if a message is an iterator error message
 */
export function isIteratorErrorMessage(
  message: EchoMessage
): message is IteratorErrorMessage {
  return message.type === MessageType.IteratorError
}

/**
 * Check if a message is an iterator cancel message
 */
export function isIteratorCancelMessage(
  message: EchoMessage
): message is IteratorCancelMessage {
  return message.type === MessageType.IteratorCancel
}

