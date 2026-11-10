const periods = {
  "1w": { amount: 7, unit: "DAY" },
  "1m": { amount: 1, unit: "MONTH" },
  "3m": { amount: 3, unit: "MONTH" },
  "1y": { amount: 1, unit: "YEAR" },
  "2y": { amount: 2, unit: "YEAR" },
};

const periodAliases = {
  week: "1w",
  "1week": "1w",
  last7days: "1w",
  month: "1m",
  "1month": "1m",
  "3months": "3m",
  "1year": "1y",
  "2years": "2y",
};

function normalizePeriod(value) {
  if (value === undefined || value === null || value === "") {
    return "1w";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const period = periodAliases[normalized] || normalized;
  return Object.prototype.hasOwnProperty.call(periods, period) ? period : null;
}

function getPeriodCondition(column, period) {
  const normalized = normalizePeriod(period);
  if (!normalized) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }

  const { amount, unit } = periods[normalized];
  return `${column} >= DATE_SUB(CURDATE(), INTERVAL ${amount} ${unit})`;
}

module.exports = {
  normalizePeriod,
  getPeriodCondition,
};
