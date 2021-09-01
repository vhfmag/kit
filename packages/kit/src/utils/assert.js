import { AssertionError } from 'assert';

/**
 *
 * @template {abstract new (...args: any[]) => any} Class
 * @param {unknown} value
 * @param {Class} clazz
 * @param {ConstructorParameters<typeof AssertionError>[0]} assertionErrorOptions
 * @returns {asserts value is InstanceType<Class>}
 */
export function assertInstanceOf(value, clazz, assertionErrorOptions) {
	if (!(value instanceof clazz)) {
		throw new AssertionError(assertionErrorOptions);
	}
}

/**
 *
 *
 * @param {unknown} error
 * @return {asserts error is Error & { [key: string]: any }}
 */
export function assertError(error) {
	assertInstanceOf(error, Error, {
		message: 'Only Errors are expected to be thrown',
		expected: 'Error',
		actual: error
	});
}
