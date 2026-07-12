export function calculateCAGR(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

export function solveXirr(cashflows: { date: Date; amount: number }[]): number {
  if (cashflows.length === 0) return 0;
  // Bisection algorithm for XIRR
  let minRate = -0.9999;
  let maxRate = 100;
  let result = 0;
  
  const xnpv = (rate: number) => {
    return cashflows.reduce((acc, curr) => {
      const days = (curr.date.getTime() - cashflows[0].date.getTime()) / (1000 * 3600 * 24);
      return acc + curr.amount / Math.pow(1 + rate, days / 365);
    }, 0);
  };

  for (let i = 0; i < 100; i++) {
    result = (minRate + maxRate) / 2;
    const npv = xnpv(result);
    if (Math.abs(npv) < 0.00001) break;
    if (npv > 0) minRate = result;
    else maxRate = result;
  }
  return result * 100;
}
