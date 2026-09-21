import {dinero, add, toDecimal, toSnapshot, subtract} from 'dinero.js/bigint';
import { USD } from 'dinero.js/bigint/currencies';

export const createMoney = (amountMinor, currency = USD) => {
    return dinero({ amount: BigInt(amountMinor), currency });
};

export const sum = (m1, m2) =>{
    return add(m1, m2);
}

export const subtractMoney = (m1, m2) =>{
    return subtract(m1, m2);
}

export const toMajorFormat = (money) =>{
    return toDecimal(money, ({value, currency}) => `${value} ${currency.code}`);
}

export const toMinorFormat = (money) =>{
    let {amount, currency} = toSnapshot(money);
    return `${amount} ${currency.code}MINOR`;
}

export const toAmount = (money) => {
    let {amount} = toSnapshot(money);
    return amount;
}

/**
 * Value object should be a class
 */

export const MONEY_CURRENCY = {
    USD: {
        code: 'USD',
        base: 100,
        decimalPlaces: 2
    },
    NGN: {
        code: 'NGN',
        base: 100,
        decimalPlaces: 2
    },
    YWN: {
        code: 'YWN',
        base: 100,
        decimalPlaces: 0
    }
};

export class Money {
    /**
     * 
     * @param {bigint} amountMinor 
     * @param {typeof MONEY_CURRENCY[keyof typeof MONEY_CURRENCY]} currency 
     */
    constructor(amountMinor, currency = USD) {
        this.amountMinor = amountMinor;
        this.currency = currency;
    }

    static fromMinor(amountMinor, currency = USD) {
        return new Money(amountMinor, currency);
    }

    static fromMajor(amountMajor, currency = USD) {
        return new Money(amountMajor * 100, currency);
    }

        add(other) {
        if (this.currency !== other.currency) {
            throw new Error('Cannot add money in different currencies');
        }
        return new Money(this.amountMinor + other.amountMinor, this.currency);
        }
}




const value = Money.fromMajor(100, MONEY_CURRENCY.USD);
const value2 = Money.fromMinor(10000, MONEY_CURRENCY.USD);

const newMoney = value2.add(value);