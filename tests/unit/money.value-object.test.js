import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMoney,
  sum,
  subtractMoney,
  toAmount,
  toMajorFormat,
  toMinorFormat
} from '../../common/money-value-object/index.js';

describe('MoneyValueObject', () => {
  it('createMoney - should store the amount as bigint minor units', () => {
    const money = createMoney(100000);
    assert.strictEqual(toAmount(money), 100000n);
  });

  it('toMajorFormat - should render USD major units with two decimal places and currency code', () => {
    assert.strictEqual(toMajorFormat(createMoney(100000)), '1000.00 USD');
    assert.strictEqual(toMajorFormat(createMoney(1)), '0.01 USD');
    assert.strictEqual(toMajorFormat(createMoney(0)), '0.00 USD');
  });

  it('toMinorFormat - should render bigint minor units with USDMINOR suffix', () => {
    assert.strictEqual(toMinorFormat(createMoney(100000)), '100000 USDMINOR');
    assert.strictEqual(toMinorFormat(createMoney(1n)), '1 USDMINOR');
  });

  it('sum - should add two money values in minor units', () => {
    const total = sum(createMoney(20000), createMoney(35000));
    assert.strictEqual(toAmount(total), 55000n);
    assert.strictEqual(toMajorFormat(total), '550.00 USD');
    assert.strictEqual(toMinorFormat(total), '55000 USDMINOR');
  });

  it('subtractMoney - should subtract two money values in minor units', () => {
    const remaining = subtractMoney(createMoney(100000), createMoney(35000));
    assert.strictEqual(toAmount(remaining), 65000n);
    assert.strictEqual(toMajorFormat(remaining), '650.00 USD');
    assert.strictEqual(toMinorFormat(remaining), '65000 USDMINOR');
  });
});
