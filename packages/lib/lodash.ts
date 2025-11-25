/**
 * Custom implementations of lodash utility functions
 * These replace lodash dependencies to reduce bundle size
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    return function (this: any, ...args: Parameters<T>) {
        const context = this;

        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

/**
 * Creates an array of elements, sorted in ascending or descending order by the results
 * of running each element through each iteratee.
 */
export function orderBy<T>(
    array: T[],
    iteratees: (keyof T | ((item: T) => any))[] | keyof T | ((item: T) => any),
    orders?: ('asc' | 'desc')[] | 'asc' | 'desc'
): T[] {
    if (!array || array.length === 0) {
        return [];
    }

    // Normalize iteratees and orders to arrays
    const iterateesArray = Array.isArray(iteratees) ? iteratees : [iteratees];
    const ordersArray = orders
        ? (Array.isArray(orders) ? orders : [orders])
        : iterateesArray.map(() => 'asc');

    return [...array].sort((a, b) => {
        for (let i = 0; i < iterateesArray.length; i++) {
            const iteratee = iterateesArray[i];
            const order = ordersArray[i] || 'asc';

            let aValue: any;
            let bValue: any;

            if (typeof iteratee === 'function') {
                aValue = iteratee(a);
                bValue = iteratee(b);
            } else {
                aValue = a[iteratee];
                bValue = b[iteratee];
            }

            if (aValue < bValue) {
                return order === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return order === 'asc' ? 1 : -1;
            }
        }
        return 0;
    });
}

/**
 * Creates an array of elements split into groups the length of size.
 */
export function chunk<T>(array: T[], size: number): T[][] {
    if (!array || array.length === 0 || size < 1) {
        return [];
    }

    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

/**
 * Creates an array of grouped elements, the first of which contains the first elements
 * of the given arrays, the second of which contains the second elements of the given arrays, and so on.
 */
export function zip<T1, T2, T3>(
    arr1: T1[],
    arr2: T2[],
    arr3: T3[]
): [T1 | undefined, T2 | undefined, T3 | undefined][];
export function zip<T1, T2>(
    arr1: T1[],
    arr2: T2[]
): [T1 | undefined, T2 | undefined][];
export function zip<T>(...arrays: T[][]): (T | undefined)[][];
export function zip(...arrays: any[][]): any[][] {
    if (!arrays || arrays.length === 0) {
        return [];
    }

    const maxLength = Math.max(...arrays.map(arr => arr?.length || 0));
    const result: any[][] = [];

    for (let i = 0; i < maxLength; i++) {
        result.push(arrays.map(arr => arr?.[i]));
    }

    return result;
}

/**
 * Creates an array of elements, sorted in ascending order by the results of
 * running each element through iteratee.
 */
export function sortBy<T>(
    array: T[],
    iteratee: keyof T | ((item: T) => any)
): T[] {
    if (!array || array.length === 0) {
        return [];
    }

    return [...array].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (typeof iteratee === 'function') {
            aValue = iteratee(a);
            bValue = iteratee(b);
        } else {
            aValue = a[iteratee];
            bValue = b[iteratee];
        }

        if (aValue < bValue) return -1;
        if (aValue > bValue) return 1;
        return 0;
    });
}

/**
 * Creates an array of numbers progressing from start up to, but not including, end.
 */
export function range(start: number, end?: number, step: number = 1): number[] {
    if (end === undefined) {
        end = start;
        start = 0;
    }

    if (step === 0) {
        return [];
    }

    const result: number[] = [];
    const isIncreasing = end > start;

    if (isIncreasing && step < 0) {
        return [];
    }
    if (!isIncreasing && step > 0) {
        return [];
    }

    if (isIncreasing) {
        for (let i = start; i < end; i += step) {
            result.push(i);
        }
    } else {
        for (let i = start; i > end; i += step) {
            result.push(i);
        }
    }

    return result;
}

/**
 * Converts string to kebab-case.
 */
export function kebabCase(str: string): string {
    if (!str) {
        return '';
    }

    return str
        // Replace spaces and underscores with hyphens
        .replace(/[\s_]+/g, '-')
        // Insert hyphen before uppercase letters (for camelCase)
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        // Convert to lowercase
        .toLowerCase()
        // Remove any non-alphanumeric characters except hyphens
        .replace(/[^a-z0-9-]/g, '')
        // Replace multiple consecutive hyphens with a single hyphen
        .replace(/-+/g, '-')
        // Remove leading and trailing hyphens
        .replace(/^-+|-+$/g, '');
}
