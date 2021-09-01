/**
 * @template {abstract new (...args: any[]) => any} Class
 * @param {unknown} value
 * @param {Class} clazz
 * @param {string} message
 * @returns {asserts value is InstanceType<Class>}
 */
export function assertInstanceOf(value, clazz, message) {
	if (!(value instanceof clazz)) {
		throw new Error(`${message}\n\nExpected class:\t${clazz}\nActual value:\t${value}`);
	}
}

/**
 * @param {unknown} error
 * @return {asserts error is Error & { [key: string]: any }}
 */
export function assertError(error) {
	assertInstanceOf(error, Error, 'Only Errors are expected to be thrown');
}
