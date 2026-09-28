import {
	ReasonPhrases,
	StatusCodes,
	getReasonPhrase,
} from 'http-status-codes';

/**
 * Base ServiceLayerError that represents domain and operational errors.
 * Can be thrown with `new ServiceLayerError(...)` or directly `ServiceLayerError(...)`.
 *
 * @param {string} message - Human-readable error message
 * @param {number} [statusCode=StatusCodes.INTERNAL_SERVER_ERROR] - HTTP status code
 * @param {object|null} [details=null] - Optional metadata / context
 * @returns {Error}
 */
export function ServiceLayerError(message, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, details = null) {
	const defaultMessage = getReasonPhrase(statusCode) || ReasonPhrases.INTERNAL_SERVER_ERROR;
	const error = new Error(message || defaultMessage);

	error.name = 'ServiceLayerError';
	error.statusCode = statusCode;
	error.details = details;
	error.isOperational = true;

	if (Error.captureStackTrace) {
		Error.captureStackTrace(error, ServiceLayerError);
	}

	Object.setPrototypeOf(error, ServiceLayerError.prototype);
	return error;
}

ServiceLayerError.prototype = Object.create(Error.prototype);
ServiceLayerError.prototype.constructor = ServiceLayerError;

/**
 * Factory creator to produce named error functions adhering to HTTP status codes.
 */
function createErrorType(name, defaultStatusCode, defaultReason) {
	function DomainError(message, details = null) {
		const resolvedMessage = message || defaultReason || getReasonPhrase(defaultStatusCode);
		const error = ServiceLayerError(resolvedMessage, defaultStatusCode, details);
		error.name = name;
		Object.setPrototypeOf(error, DomainError.prototype);
		return error;
	}

	DomainError.prototype = Object.create(ServiceLayerError.prototype);
	DomainError.prototype.constructor = DomainError;

	return DomainError;
}

// Standard HTTP Service Errors
export const BadRequestError = createErrorType(
	'BadRequestError',
	StatusCodes.BAD_REQUEST,
	ReasonPhrases.BAD_REQUEST
);

export const UnauthorizedError = createErrorType(
	'UnauthorizedError',
	StatusCodes.UNAUTHORIZED,
	ReasonPhrases.UNAUTHORIZED
);

export const ForbiddenError = createErrorType(
	'ForbiddenError',
	StatusCodes.FORBIDDEN,
	ReasonPhrases.FORBIDDEN
);

export function NotFoundError(message, details = null) {
	const defaultMessage = ReasonPhrases.NOT_FOUND;
	let resolvedDetails = details;

	if (details && typeof details === 'object' && !details.reason) {
		resolvedDetails = { reason: getReasonPhrase(StatusCodes.NOT_FOUND), ...details };
	} else if (!details) {
		resolvedDetails = { reason: getReasonPhrase(StatusCodes.NOT_FOUND) };
	}

	const error = ServiceLayerError(message || defaultMessage, StatusCodes.NOT_FOUND, resolvedDetails);
	error.name = 'NotFoundError';
	Object.setPrototypeOf(error, NotFoundError.prototype);
	return error;
}
NotFoundError.prototype = Object.create(ServiceLayerError.prototype);
NotFoundError.prototype.constructor = NotFoundError;

export const ConflictError = createErrorType(
	'ConflictError',
	StatusCodes.CONFLICT,
	ReasonPhrases.CONFLICT
);

export const DuplicateResourceError = createErrorType(
	'DuplicateResourceError',
	StatusCodes.CONFLICT,
	ReasonPhrases.CONFLICT
);

export const UnprocessableEntityError = createErrorType(
	'UnprocessableEntityError',
	StatusCodes.UNPROCESSABLE_ENTITY,
	ReasonPhrases.UNPROCESSABLE_ENTITY
);

export const InternalServerError = createErrorType(
	'InternalServerError',
	StatusCodes.INTERNAL_SERVER_ERROR,
	ReasonPhrases.INTERNAL_SERVER_ERROR
);

// Domain-specific aliases
export function DuplicateAccountError(message = 'Account already exists for this email', details = null) {
	const error = DuplicateResourceError(message, details);
	error.name = 'DuplicateAccountError';
	Object.setPrototypeOf(error, DuplicateAccountError.prototype);
	return error;
}
DuplicateAccountError.prototype = Object.create(DuplicateResourceError.prototype);
DuplicateAccountError.prototype.constructor = DuplicateAccountError;

export function InsufficientFundsError(message = 'Insufficient funds', details = null) {
	const error = BadRequestError(message, details);
	error.name = 'InsufficientFundsError';
	Object.setPrototypeOf(error, InsufficientFundsError.prototype);
	return error;
}
InsufficientFundsError.prototype = Object.create(BadRequestError.prototype);
InsufficientFundsError.prototype.constructor = InsufficientFundsError;

export const TooManyRequestsError = createErrorType(
	'TooManyRequestsError',
	StatusCodes.TOO_MANY_REQUESTS,
	ReasonPhrases.TOO_MANY_REQUESTS
);

export const BadGatewayError = createErrorType(
	'BadGatewayError',
	StatusCodes.BAD_GATEWAY,
	ReasonPhrases.BAD_GATEWAY
);

export function ServiceUnavailableError(message = 'Server is currently busy. Please try again shortly.', details = null) {
	const error = ServiceLayerError(message, StatusCodes.SERVICE_UNAVAILABLE, details);
	error.name = 'ServiceUnavailableError';
	error.isTransient = true;
	Object.setPrototypeOf(error, ServiceUnavailableError.prototype);
	return error;
}
ServiceUnavailableError.prototype = Object.create(ServiceLayerError.prototype);
ServiceUnavailableError.prototype.constructor = ServiceUnavailableError;

export function GatewayTimeoutError(message = 'Upstream service timed out. Please try again shortly.', details = null) {
	const error = ServiceLayerError(message, StatusCodes.GATEWAY_TIMEOUT, details);
	error.name = 'GatewayTimeoutError';
	error.isTransient = true;
	Object.setPrototypeOf(error, GatewayTimeoutError.prototype);
	return error;
}
GatewayTimeoutError.prototype = Object.create(ServiceLayerError.prototype);
GatewayTimeoutError.prototype.constructor = GatewayTimeoutError;

/**
 * Checks if an error is a transient/temporary error (e.g. network timeout, server busy, 502/503/504)
 * that should yield a retry-friendly message rather than leaking internal details.
 */
export function isTransientError(err) {
	if (!err) return false;
	if (err.isTransient) return true;
	const statusCode = err.statusCode || err.status;
	if (statusCode === 502 || statusCode === 503 || statusCode === 504 || statusCode === 429) {
		return true;
	}
	const networkCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'];
	if (networkCodes.includes(err.code)) {
		return true;
	}
	const mongoTransientNames = ['MongoNetworkError', 'MongoServerSelectionError', 'MongoTimeoutError'];
	if (mongoTransientNames.includes(err.name)) {
		return true;
	}
	if (typeof err.message === 'string' && /timeout|socket hang up|connection refused/i.test(err.message)) {
		return true;
	}
	return false;
}