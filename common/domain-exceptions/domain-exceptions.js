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
	return error;
}

export function InsufficientFundsError(message = 'Insufficient funds', details = null) {
	const error = BadRequestError(message, details);
	error.name = 'InsufficientFundsError';
	return error;
}