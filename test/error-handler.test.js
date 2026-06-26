import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthenticationError,
  AuthorizationError,
  BaseError,
  BusinessError,
  DefaultErrorHandlingStrategy,
  ErrorCategory,
  ErrorHandler,
  ErrorSeverity,
  HandleErrors,
  NetworkError,
  NetworkErrorHandlingStrategy,
  RetryRecoveryStrategy,
  SystemError,
  ToolExecutionError,
  createBusinessError,
  createSystemError
} from '../build/core/error-handler.js';
import { ApiError, ValidationError } from '../build/types/index.js';
import { silenceConsole } from './helpers.js';

test('standardized errors expose severity, category, context, cause, and user messages', () => {
  const cause = new Error('cause');
  const business = new BusinessError('business failed', 'BUSINESS', { operation: 'op' }, cause);
  const system = new SystemError('system failed');
  const network = new NetworkError('network failed');
  const authn = new AuthenticationError('authn failed');
  const authz = new AuthorizationError('authz failed');
  const tool = new ToolExecutionError('tool failed', 'tool-name');

  assert.equal(business.severity, ErrorSeverity.MEDIUM);
  assert.equal(business.category, ErrorCategory.BUSINESS);
  assert.equal(business.context.operation, 'op');
  assert.equal(business.cause, cause);
  assert.equal(business.getUserMessage(), 'business failed');
  assert.equal(system.getUserMessage(), 'An internal system error occurred. Please try again later.');
  assert.equal(network.getUserMessage(), 'Network connection error. Please check your connection and try again.');
  assert.equal(authn.getUserMessage(), 'Authentication failed. Please check your credentials.');
  assert.equal(authz.getUserMessage(), 'Access denied. You do not have permission to perform this action.');
  assert.equal(tool.getUserMessage(), 'Tool execution failed: tool failed');

  const json = business.toJSON();
  assert.equal(json.name, 'BusinessError');
  assert.equal(json.cause.message, 'cause');
});

test('default strategy preserves BaseError and maps validation/API/unknown errors', async () => {
  const strategy = new DefaultErrorHandlingStrategy();
  const existing = new BusinessError('already standard');

  assert.equal(await strategy.handle(existing), existing);

  const validation = await strategy.handle(new ValidationError('bad'), { requestId: 'r1' });
  assert.equal(validation.constructor, BusinessError);
  assert.equal(validation.code, 'VALIDATION_ERROR');
  assert.equal(validation.context.requestId, 'r1');

  const api = await strategy.handle(new ApiError('api bad'), { requestId: 'r2' });
  assert.equal(api.constructor, SystemError);
  assert.equal(api.code, 'API_ERROR');

  const unknown = await strategy.handle(new Error('unknown bad'));
  assert.equal(unknown.constructor, SystemError);
  assert.equal(unknown.code, 'UNKNOWN_ERROR');
});

test('network strategy detects common network failures', async () => {
  const strategy = new NetworkErrorHandlingStrategy();

  assert.equal(strategy.canHandle(new Error('network timeout')), true);
  assert.equal(strategy.canHandle(Object.assign(new Error('boom'), { name: 'NetworkError' })), true);
  assert.equal(strategy.canHandle(new Error('validation failed')), false);

  const handled = await strategy.handle(new Error('connection reset'));
  assert.equal(handled.constructor, NetworkError);
  assert.equal(handled.code, 'NETWORK_CONNECTION_ERROR');
});

test('ErrorHandler uses the first matching strategy and handles missing strategies', async (t) => {
  silenceConsole(t);
  const handler = new ErrorHandler();
  handler.recoveryStrategies = [];

  const handled = await handler.handleError(new Error('timeout from network'), { operation: 'op' });
  assert.equal(handled.constructor, NetworkError);
  assert.equal(handled.context.operation, 'op');

  handler.strategies = [];
  const fallback = await handler.handleError(new Error('no handler'));
  assert.equal(fallback.constructor, SystemError);
  assert.equal(fallback.code, 'NO_HANDLER_ERROR');
});

test('ErrorHandler attempts recovery only with matching recovery strategies', async (t) => {
  silenceConsole(t);
  const handler = new ErrorHandler();
  let recovered = 0;
  handler.recoveryStrategies = [{
    canRecover: (error) => error.category === ErrorCategory.NETWORK,
    recover: async () => {
      recovered += 1;
      return { recovered: true, strategy: 'custom' };
    }
  }];

  await handler.attemptRecovery(new NetworkError('network'));
  await handler.attemptRecovery(new BusinessError('business'));
  assert.equal(recovered, 1);
});

test('ErrorHandler swallows recovery failures after logging', async (t) => {
  silenceConsole(t);
  const handler = new ErrorHandler();
  handler.recoveryStrategies = [{
    canRecover: () => true,
    recover: async () => {
      throw new Error('recovery failed');
    }
  }];

  await assert.doesNotReject(handler.attemptRecovery(new NetworkError('network')));
});

test('RetryRecoveryStrategy recognizes recoverable API/network errors and reports retry', async (t) => {
  silenceConsole(t);
  const strategy = new RetryRecoveryStrategy(1, 0);

  assert.equal(strategy.canRecover(new NetworkError('network')), true);
  assert.equal(strategy.canRecover(new SystemError('api', 'API', {}, undefined)), false);
  const apiError = new (class ApiLikeError extends BaseError {
    constructor() {
      super('api', 'API', ErrorSeverity.MEDIUM, ErrorCategory.API, {}, undefined, true);
    }
  })();
  assert.equal(strategy.canRecover(apiError), true);
  assert.deepEqual(await strategy.recover(apiError), { recovered: true, strategy: 'retry' });
});

test('error context and factory helpers produce expected error types', () => {
  const context = ErrorHandler.createContext({ operation: 'x' });
  assert.equal(context.operation, 'x');
  assert.equal(typeof context.timestamp, 'number');
  assert.equal(createBusinessError('bad', 'BAD', {}).constructor, BusinessError);
  assert.equal(createSystemError('bad', 'BAD', {}).constructor, SystemError);
});

test('HandleErrors decorator converts thrown errors through the supplied handler', async (t) => {
  silenceConsole(t);
  const handler = new ErrorHandler();
  handler.strategies = [new DefaultErrorHandlingStrategy()];
  handler.recoveryStrategies = [];
  const descriptor = {
    value: async function run() {
      throw new ValidationError('invalid');
    }
  };

  HandleErrors(handler)({ constructor: { name: 'Demo' } }, 'run', descriptor);

  await assert.rejects(
    descriptor.value.call({}),
    (error) => error instanceof BusinessError
      && error.code === 'VALIDATION_ERROR'
      && error.context.operation === 'Demo.run'
  );
});
