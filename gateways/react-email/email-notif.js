import React from 'react';
import {
  Html,
  Head,
  Preview,
  Tailwind,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Row,
  Column,
  Link
} from 'react-email';
import { createMoney, toMajorFormat } from '../../common/money-value-object/index.js';
import { USD, NGN } from 'dinero.js/bigint/currencies';

/**
 * Format minor amount using Money Value Object
 * @param {number|string|bigint} amountMinor 
 * @param {string} currencyCode 
 * @returns {string} Formatted major string e.g. "2.00 USD"
 */
export function formatAmount(amountMinor, currencyCode = 'USD') {
  if (amountMinor === undefined || amountMinor === null) return '';
  if (typeof amountMinor === 'string' && amountMinor.includes(' ')) {
    return amountMinor;
  }
  try {
    const currency = (currencyCode || 'USD').toUpperCase() === 'NGN' ? NGN : USD;
    const money = createMoney(BigInt(amountMinor), currency);
    return toMajorFormat(money);
  } catch {
    return `${amountMinor} ${currencyCode || 'USD'}`;
  }
}

/**
 * Format ISO date string into friendly readable format
 * @param {string} isoString 
 * @returns {string}
 */
export function formatFriendlyDate(isoString) {
  try {
    const date = isoString ? new Date(isoString) : new Date();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString || new Date().toISOString();
  }
}

/**
 * Premium Transaction Receipt Email Component
 */
export function EmailNotification({
  subject = 'Transfer Notification',
  message,
  amount,
  currency = 'USD',
  reference,
  fromAccountId,
  toAccountId,
  completedAt,
  status = 'COMPLETED'
}) {
  const formattedAmount = amount !== undefined && amount !== null
    ? formatAmount(amount, currency)
    : null;

  const formattedDate = formatFriendlyDate(completedAt);
  const previewText = formattedAmount
    ? `Transfer of ${formattedAmount} successful • Ref: ${reference || 'Receipt'}`
    : subject;

  // Helper for metadata table row
  const renderDetailRow = (label, value, isMono = false) => {
    if (!value) return null;
    return React.createElement(
      Row,
      { className: 'py-2 border-b border-slate-100 last:border-b-0' },
      React.createElement(
        Column,
        { className: 'text-xs font-medium text-slate-500 uppercase tracking-wider' },
        label
      ),
      React.createElement(
        Column,
        {
          className: `text-right text-xs font-semibold text-slate-800 ${
            isMono ? 'font-mono' : ''
          }`
        },
        value
      )
    );
  };

  return React.createElement(
    Html,
    null,
    React.createElement(
      Tailwind,
      null,
      React.createElement(Head, null),
      React.createElement(Preview, null, previewText),
      React.createElement(
        Body,
        { className: 'bg-slate-50 font-sans p-4 sm:p-8 m-0' },
        React.createElement(
          Container,
          {
            className:
              'max-w-lg mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden my-8'
          },
          // Header / Brand Banner
          React.createElement(
            Section,
            { className: 'bg-slate-900 px-8 py-6 text-center' },
            React.createElement(
              Heading,
              { className: 'text-lg font-bold tracking-tight text-white m-0' },
              '⚡ Express Money Transfer'
            ),
            React.createElement(
              Text,
              { className: 'text-xs text-slate-400 mt-1 mb-0' },
              'Instant & Secure Transfers'
            )
          ),
          // Main Body
          React.createElement(
            Section,
            { className: 'p-8 text-center' },
            // Status Badge
            React.createElement(
              'div',
              {
                className:
                  'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3'
              },
              '✓ ' + (status === 'COMPLETED' ? 'Transfer Successful' : status)
            ),
            // Amount Hero (Money Value Object formatted)
            formattedAmount
              ? React.createElement(
                  Heading,
                  {
                    className:
                      'text-4xl font-extrabold text-slate-900 tracking-tight my-2'
                  },
                  formattedAmount
                )
              : React.createElement(
                  Heading,
                  { className: 'text-2xl font-bold text-slate-900 my-2' },
                  subject
                ),
            React.createElement(
              Text,
              { className: 'text-xs text-slate-500 m-0' },
              `Completed on ${formattedDate}`
            ),
            // Optional custom message
            message
              ? React.createElement(
                  Section,
                  {
                    className:
                      'mt-6 p-4 rounded-xl bg-slate-50 border border-slate-100 text-left'
                  },
                  React.createElement(
                    Text,
                    { className: 'text-xs text-slate-600 m-0 leading-relaxed' },
                    message
                  )
                )
              : null,
            // Transaction Breakdown Card
            React.createElement(
              Section,
              {
                className:
                  'mt-6 p-5 rounded-xl bg-slate-50 border border-slate-200/80 text-left'
              },
              React.createElement(
                Text,
                {
                  className:
                    'text-xs font-bold text-slate-900 uppercase tracking-wider mb-3'
                },
                'Transaction Summary'
              ),
              reference && renderDetailRow('Reference', reference, true),
              fromAccountId && renderDetailRow('From Account', fromAccountId),
              toAccountId && renderDetailRow('To Account', toAccountId),
              formattedAmount && renderDetailRow('Total Amount', formattedAmount),
              renderDetailRow('Status', status === 'COMPLETED' ? 'Completed' : status)
            ),
            // Security / Help Note
            React.createElement(
              Section,
              { className: 'mt-8 pt-6 border-t border-slate-100 text-center' },
              React.createElement(
                Text,
                { className: 'text-xs text-slate-400 m-0 leading-relaxed' },
                'Need assistance? Contact our team at ',
                React.createElement(
                  Link,
                  {
                    href: 'mailto:support@expressmoney.com',
                    className: 'text-indigo-600 font-medium underline'
                  },
                  'support@expressmoney.com'
                ),
                '.'
              ),
              React.createElement(
                Text,
                { className: 'text-xs text-slate-400 mt-2 mb-0' },
                '© 2026 Express Money Transfer. All rights reserved.'
              )
            )
          )
        )
      )
    )
  );
}
