import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transferHeaders } from '../../request-schemas/transfer.schema.js';

describe('Transfer Headers Schema (X-Idempotency-Key Standard)', () => {
    it('should validate successfully when x-idempotency-key is provided', () => {
        const headers = {
            'x-idempotency-key': 'idem-test-12345',
            'content-type': 'application/json',
            'authorization': 'Bearer token'
        };

        const result = transferHeaders.parse(headers);
        assert.strictEqual(result['x-idempotency-key'], 'idem-test-12345');
        assert.strictEqual(result['content-type'], 'application/json');
    });

    it('should throw validation error when x-idempotency-key header is completely missing', () => {
        const headers = {
            'content-type': 'application/json'
        };

        assert.throws(
            () => transferHeaders.parse(headers),
            (err) => {
                const issue = err.issues?.[0];
                return issue?.path[0] === 'x-idempotency-key' &&
                       issue?.message === 'X-Idempotency-Key header is required';
            }
        );
    });

    it('should throw validation error when x-idempotency-key is empty string', () => {
        const headers = {
            'x-idempotency-key': ''
        };

        assert.throws(
            () => transferHeaders.parse(headers),
            (err) => {
                const issue = err.issues?.[0];
                return issue?.path[0] === 'x-idempotency-key' &&
                       issue?.message === 'X-Idempotency-Key header is required';
            }
        );
    });

    it('should reject requests using only legacy idempotency-key without x- prefix', () => {
        const headers = {
            'idempotency-key': 'legacy-idem-123'
        };

        assert.throws(
            () => transferHeaders.parse(headers),
            (err) => {
                const issue = err.issues?.[0];
                return issue?.path[0] === 'x-idempotency-key' &&
                       issue?.message === 'X-Idempotency-Key header is required';
            }
        );
    });
});
