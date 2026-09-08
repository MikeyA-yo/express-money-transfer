export const toAccountResponse = (account) => ({
  id: account.id,
  name: account.name,
  email: account.email,
  balance: Number(account.balance.toString())
});

export const toAccountsResponse = (accounts) => accounts.map(toAccountResponse);