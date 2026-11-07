import { dayToDate } from "./calendar";
import { CHAIR, DAYS_PER_YEAR } from "./config";
import type { Economy, Wallet } from "./types";

/**
 * The Chair's personal finances. Passive by design (Fed ethics rules forbid
 * active trading), so the only way the Chair moves their own net worth is
 * through the economy itself.
 */
export function newWallet(e: Economy, homePrice: number): Wallet {
  const s = CHAIR.start;
  return {
    cash: s.cash,
    stockUnits: s.stocks / e.stockIndex,
    bonds: s.bonds,
    homeUnits: s.home / homePrice,
    mortgage: s.mortgage,
    priceLevel: 1,
    month: dayToDate(e.day).getUTCMonth(),
    lastY10: e.yield10y,
    lastPay: 0,
    lastBills: 0,
    lastPayDay: -1e9, // "never" — kept finite so it survives JSON saves
  };
}

export interface Holdings {
  cash: number;
  stocks: number;
  bonds: number;
  home: number;
  mortgage: number;
  total: number;
}

export function holdings(w: Wallet, e: Economy, homePrice: number): Holdings {
  const stocks = w.stockUnits * e.stockIndex;
  const home = w.homeUnits * homePrice;
  return { cash: w.cash, stocks, bonds: w.bonds, home, mortgage: w.mortgage, total: w.cash + stocks + w.bonds + home - w.mortgage };
}

/** At each open: interest and dividends accrue; on the first trading day of a month, payday and bills. */
export function walletOpen(w: Wallet, e: Economy, cpi: number): void {
  w.cash += (w.cash * Math.max(0, e.policyRate)) / 100 / DAYS_PER_YEAR;
  w.stockUnits *= 1 + CHAIR.dividendYield / 100 / DAYS_PER_YEAR;

  const month = dayToDate(e.day).getUTCMonth();
  if (month === w.month) return;
  w.month = month;
  w.priceLevel *= Math.pow(1 + cpi / 100, 1 / 12);
  const pay = (CHAIR.salary / 12) * (1 - CHAIR.taxRate);
  const interest = (w.mortgage * CHAIR.mortgageRate) / 100 / 12;
  const payment = Math.min(CHAIR.mortgagePayment, w.mortgage + interest);
  w.mortgage = Math.max(0, w.mortgage + interest - payment);
  const bills = CHAIR.livingCosts * w.priceLevel + payment;
  w.cash += pay - bills;
  w.lastPay = pay;
  w.lastBills = bills;
  w.lastPayDay = e.day;
}

/** Every trading hour: revalue the bond fund for yield moves (plus coupon carry). */
export function walletMark(w: Wallet, e: Economy, hoursPerDay: number): void {
  const dy = e.yield10y - w.lastY10;
  w.bonds *= 1 - (CHAIR.bondDuration * dy) / 100 + e.yield10y / 100 / DAYS_PER_YEAR / hoursPerDay;
  w.lastY10 = e.yield10y;
}
