/**
 * Validation middleware
 */

import type { Middleware, CallContext } from '../core/types'

export interface ValidationRule {
  /**
   * Parameter index to validate
   */
  paramIndex?: number

  /**
   * Parameter name to validate (for object params)
   */
  paramName?: string

  /**
   * Validation function
   * Should return true if valid, false or error message if invalid
   */
  validate: (value: any, context: CallContext) => boolean | string | Promise<boolean | string>

  /**
   * Error message (if validate returns false)
   */
  message?: string
}

export interface ValidatorOptions {
  /**
   * Rules to apply
   */
  rules: Record<string, ValidationRule[]>

  /**
   * Whether to stop on first error
   */
  stopOnError?: boolean

  /**
   * Custom error handler
   */
  onError?: (errors: string[], context: CallContext) => void
}

/**
 * Create a validation middleware
 */
export function createValidatorMiddleware(options: ValidatorOptions): Middleware {
  const { rules, stopOnError = true, onError } = options

  return async (context, next) => {
    const methodRules = rules[context.method]
    if (!methodRules || methodRules.length === 0) {
      return next()
    }

    const errors: string[] = []

    for (const rule of methodRules) {
      let value: any

      // Get value to validate
      if (rule.paramIndex !== undefined) {
        value = context.params[rule.paramIndex]
      } else if (rule.paramName !== undefined && typeof context.params[0] === 'object') {
        value = context.params[0][rule.paramName]
      }

      // Run validation
      const result = await rule.validate(value, context)

      if (result !== true) {
        const errorMsg = typeof result === 'string'
          ? result
          : rule.message || `Validation failed for ${context.method}`
        
        errors.push(errorMsg)

        if (stopOnError) break
      }
    }

    if (errors.length > 0) {
      if (onError) {
        onError(errors, context)
      }
      throw new Error(errors.join('; '))
    }

    return next()
  }
}

/**
 * Common validation functions
 */
export const validators = {
  required: (message = 'Value is required'): ((value: any) => boolean | string) => (value: any): boolean | string =>
    value !== null && value !== undefined ? true : message,

  type: (expectedType: string, message?: string): ((value: any) => boolean | string) => (value: any): boolean | string =>
    typeof value === expectedType
      ? true
      : message || `Expected type ${expectedType}, got ${typeof value}`,

  minLength: (min: number, message?: string): ((value: any) => boolean | string) => (value: any): boolean | string =>
    value?.length >= min ? true : message || `Minimum length is ${min}`,

  maxLength: (max: number, message?: string): ((value: any) => boolean | string) => (value: any): boolean | string =>
    value?.length <= max ? true : message || `Maximum length is ${max}`,

  range: (min: number, max: number, message?: string): ((value: any) => boolean | string) => (value: any): boolean | string =>
    value >= min && value <= max
      ? true
      : message || `Value must be between ${min} and ${max}`,

  pattern: (regex: RegExp, message?: string): ((value: any) => boolean | string) => (value: any): boolean | string =>
    regex.test(value) ? true : message || `Value does not match pattern`,

  enum: (allowedValues: any[], message?: string): ((value: any) => boolean | string) => (value: any): boolean | string =>
    allowedValues.includes(value)
      ? true
      : message || `Value must be one of: ${allowedValues.join(', ')}`,

  custom: (fn: (value: any) => boolean | string): ((value: any) => boolean | string) => fn,
}

