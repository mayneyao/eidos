export function timeit(threshold: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value
    descriptor.value = function (...args: any[]) {
      const start = performance.now()
      const result = originalMethod.apply(this, args)
      const end = performance.now()
      const duration = end - start
      if (duration > threshold) {
        console.debug(
          `%cCall to ${propertyKey} took ${duration} milliseconds with args:`,
          "color: purple; font-weight: bold;",
          args
        )
      } else {
        // console.debug(
        //   `%cCall to ${propertyKey} took ${duration} milliseconds with args:`,
        //   "color: green; font-weight: bold;",
        //   args
        // )
      }
      return result
    }
    return descriptor
  }
}
