/**
 * Polyfills for React Native
 * Import this file before any AWS SDK usage
 */

// Required for AWS SDK crypto operations
import 'react-native-get-random-values';

// Required for URL parsing
import 'react-native-url-polyfill/auto';

// Polyfill crypto.getRandomValues if not available
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    // @ts-ignore
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  };
}

console.log('Polyfills loaded for React Native');

