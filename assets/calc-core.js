/* roboticscost.com calculator core.
 * Pure functions only: no page access, so it can be tested in Node.
 * Money convention inside this file: positive numbers are costs (cash going out),
 * negative numbers are money coming back (resale, tax relief).
 * Time runs in months: month 0 is day one, month N is the end of the term.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RobotCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    termYears: 5,
    hoursPerYear: 2000,
    costOfCapital: 0.10,
    tasksPerHour: 0,          // 0 = not entered
    labourPerHour: 0,         // 0 = not entered
    taxRate: 0,               // 0 = pre-tax comparison
    // Buy
    price: 50000,
    integrationPct: 0.25,
    maintenancePct: 0.08,
    softwarePerYear: 1500,
    insurancePct: 0.01,
    downtimePct: 0.03,
    resalePct: 0.20,
    firstYearWriteOffPct: 1.0,
    grant: 0,
    // Lease
    leasePayment: 980,
    leaseFees: 500,
    leaseInAdvance: true,
    leaseEnd: 'buyout',       // 'buyout' or 'return'
    leaseBuyout: 1,
    leaseIncludesMaintenance: false,
    leaseIntegrationByYou: true,
    // Pay per result (RaaS)
    raasBasis: 'month',       // 'month', 'hour' or 'task'
    raasPrice: 1800,
    raasSetupFee: 2000,
    raasMinMonths: 12,
    raasEscalatorPct: 0.03,
    raasUptimePct: 0.95
  };

  var ROUTES = ['buy', 'lease', 'raas'];
  var ROUTE_NAMES = { buy: 'Buy', lease: 'Lease', raas: 'Pay per result' };

  function withDefaults(input) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (input) for (var j in input) if (input[j] !== undefined && input[j] !== null && input[j] !== '') o[j] = input[j];
    return o;
  }

  function monthlyRate(annual) { return Math.pow(1 + annual, 1 / 12) - 1; }

  function presentValue(flows, annualRate) {
    var m = monthlyRate(annualRate), s = 0;
    for (var t = 0; t < flows.length; t++) if (flows[t]) s += flows[t] / Math.pow(1 + m, t);
    return s;
  }

  function annuityFactor(r, years) {
    if (Math.abs(r) < 1e-9) return 1 / years;
    return r / (1 - Math.pow(1 + r, -years));
  }

  function zeros(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; }

  // Year (1-based) in which a month's cost is deducted for tax. Month 0 counts in year 1.
  function taxYearOf(month) { return month === 0 ? 1 : Math.ceil(month / 12); }

  // Tax write-down of a capital cost: first-year share, rest spread evenly over the remaining years.
  function allowances(base, firstPct, years) {
    var a = zeros(years + 1); // index = year
    if (base <= 0) return a;
    if (years <= 1) { a[1] = base; return a; }
    a[1] = base * firstPct;
    var rest = base * (1 - firstPct) / (years - 1);
    for (var y = 2; y <= years; y++) a[y] += rest;
    return a;
  }

  // Adds tax relief to a flow array. deductible[m] = cost deductible in month m,
  // capital[y] = write-down in year y, taxable[m] = taxable income in month m (resale).
  function applyTax(flows, deductible, capital, taxable, taxRate, years) {
    if (!taxRate) return;
    var perYear = zeros(years + 1);
    for (var m = 0; m < deductible.length; m++) if (deductible[m]) perYear[Math.min(taxYearOf(m), years)] += deductible[m];
    for (var y = 1; y <= years; y++) perYear[y] += capital[y] || 0;
    for (var y2 = 1; y2 <= years; y2++) flows[12 * y2] -= perYear[y2] * taxRate;
    for (var m2 = 0; m2 < taxable.length; m2++) if (taxable[m2]) flows[m2] += taxable[m2] * taxRate;
  }

  function productiveHours(o, route) {
    var down = o.downtimePct;
    if (route === 'raas') down = Math.min(down, 1 - o.raasUptimePct);
    return o.hoursPerYear * (1 - down);
  }

  function buyFlows(o) {
    var N = o.termYears * 12, f = zeros(N + 1), ded = zeros(N + 1), inc = zeros(N + 1);
    var integration = o.price * o.integrationPct;
    var capitalCost = Math.max(0, o.price + integration - o.grant);
    f[0] = capitalCost;
    var running = (o.price * o.maintenancePct + o.softwarePerYear + o.price * o.insurancePct) / 12;
    for (var m = 1; m <= N; m++) { f[m] += running; ded[m] += running; }
    var resale = o.price * o.resalePct;
    f[N] -= resale; inc[N] += resale;
    applyTax(f, ded, allowances(capitalCost, o.firstYearWriteOffPct, o.termYears), inc, o.taxRate, o.termYears);
    return f;
  }

  function leaseFlows(o) {
    var N = o.termYears * 12, f = zeros(N + 1), ded = zeros(N + 1), inc = zeros(N + 1);
    var integration = o.leaseIntegrationByYou ? o.price * o.integrationPct : 0;
    f[0] += integration + o.leaseFees;
    ded[0] += o.leaseFees;
    var start = o.leaseInAdvance ? 0 : 1;
    for (var m = start; m < start + N; m++) { f[m] += o.leasePayment; ded[m] += o.leasePayment; }
    var running = ((o.leaseIncludesMaintenance ? 0 : o.price * o.maintenancePct) + o.softwarePerYear + o.price * o.insurancePct) / 12;
    for (var m2 = 1; m2 <= N; m2++) { f[m2] += running; ded[m2] += running; }
    if (o.leaseEnd === 'buyout') {
      var resale = o.price * o.resalePct;
      f[N] += o.leaseBuyout - resale; ded[N] += o.leaseBuyout; inc[N] += resale;
    }
    applyTax(f, ded, allowances(integration, o.firstYearWriteOffPct, o.termYears), inc, o.taxRate, o.termYears);
    return f;
  }

  function raasMonthlyCharge(o, yearIndex) {
    var hrs = productiveHours(o, 'raas') / 12;
    var p = o.raasPrice * Math.pow(1 + o.raasEscalatorPct, yearIndex);
    if (o.raasBasis === 'hour') return p * hrs;
    if (o.raasBasis === 'task') return p * o.tasksPerHour * hrs;
    return p;
  }

  function raasFlows(o) {
    var N = o.termYears * 12;
    var months = Math.max(N, o.raasMinMonths);
    var f = zeros(Math.max(N, months) + 1), ded = zeros(f.length), inc = zeros(f.length);
    f[0] += o.raasSetupFee; ded[0] += o.raasSetupFee;
    for (var m = 0; m < months; m++) { var c = raasMonthlyCharge(o, Math.floor(m / 12)); f[m] += c; ded[m] += c; }
    var years = Math.ceil((f.length - 1) / 12);
    while (f.length < years * 12 + 1) { f.push(0); ded.push(0); inc.push(0); }
    applyTax(f, ded, [], inc, o.taxRate, years);
    return f;
  }

  // Interest rate inside the lease, as an APR (monthly rate x 12, the way lenders quote it).
  // You receive the robot (worth the price) and pay fees, payments and, at the end,
  // either the buyout price or the robot's resale value that you hand back.
  function leaseAPR(o) {
    var N = o.termYears * 12;
    var flows = zeros(N + 1);
    flows[0] = o.price - o.leaseFees;
    var start = o.leaseInAdvance ? 0 : 1;
    for (var m = start; m < start + N; m++) flows[m] -= o.leasePayment;
    flows[N] -= (o.leaseEnd === 'buyout') ? o.leaseBuyout : o.price * o.resalePct;
    function pv(r) { var s = 0; for (var t = 0; t < flows.length; t++) s += flows[t] / Math.pow(1 + r, t); return s; }
    var lo = -0.05, hi = 0.25, plo = pv(lo), phi = pv(hi);
    if (plo * phi > 0) return null;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2, pm = pv(mid);
      if ((pm > 0) === (plo > 0)) { lo = mid; plo = pm; } else { hi = mid; }
    }
    return ((lo + hi) / 2) * 12;
  }

  function yearly(flows, years) {
    var out = zeros(years + 1);
    for (var m = 0; m < flows.length; m++) out[m === 0 ? 0 : Math.min(Math.ceil(m / 12), years)] += flows[m];
    return out;
  }

  function paybackMonth(flows, o, route) {
    if (!o.labourPerHour) return null;
    var saving = o.labourPerHour * productiveHours(o, route) / 12;
    var cum = 0;
    for (var m = 0; m < flows.length; m++) {
      cum += (m === 0 ? 0 : saving) - flows[m];
      if (m > 0 && cum >= 0) return m;
    }
    return -1; // not within the term
  }

  function validate(o) {
    var errors = [];
    if (!(o.termYears >= 1 && o.termYears <= 15)) errors.push('Comparison term must be between 1 and 15 years.');
    if (!(o.hoursPerYear > 0 && o.hoursPerYear <= 8760)) errors.push('Hours of use must be between 1 and 8,760 a year.');
    if (!(o.costOfCapital >= 0 && o.costOfCapital < 1)) errors.push('Cost of capital must be between 0% and 100%.');
    if (o.raasBasis === 'task' && !(o.tasksPerHour > 0)) errors.push('Enter tasks per hour to price pay per result by the task.');
    if (o.downtimePct < 0 || o.downtimePct >= 1) errors.push('Downtime must be between 0% and 99%.');
    if (o.firstYearWriteOffPct < 0 || o.firstYearWriteOffPct > 1) errors.push('First-year write-off must be between 0% and 100%.');
    return errors;
  }

  function core(o) {
    var flows = { buy: buyFlows(o), lease: leaseFlows(o), raas: raasFlows(o) };
    var npv = {};
    ROUTES.forEach(function (r) { npv[r] = presentValue(flows[r], o.costOfCapital); });
    return { flows: flows, npv: npv };
  }

  function winnerOf(npv) {
    return ROUTES.slice().sort(function (a, b) { return npv[a] - npv[b]; })[0];
  }

  function compute(input) {
    var o = withDefaults(input);
    var errors = validate(o);
    if (errors.length) return { ok: false, errors: errors };
    var c = core(o), years = o.termYears;
    var af = annuityFactor(o.costOfCapital, years);
    var routes = {};
    ROUTES.forEach(function (r) {
      var f = c.flows[r];
      var hrs = productiveHours(o, r);
      var eac = c.npv[r] * af;
      var total = 0; for (var m = 0; m < f.length; m++) total += f[m];
      routes[r] = {
        name: ROUTE_NAMES[r],
        npv: c.npv[r],
        totalCash: total,
        eac: eac,
        productiveHours: hrs,
        costPerHour: eac / hrs,
        costPerTask: o.tasksPerHour > 0 ? eac / (hrs * o.tasksPerHour) : null,
        dayOne: f[0],
        byYear: yearly(f, Math.ceil((f.length - 1) / 12)),
        paybackMonth: paybackMonth(f, o, r)
      };
    });
    var ranked = ROUTES.slice().sort(function (a, b) { return c.npv[a] - c.npv[b]; });
    return {
      ok: true,
      inputs: o,
      routes: routes,
      ranked: ranked,
      winner: ranked[0],
      margin: c.npv[ranked[1]] - c.npv[ranked[0]],
      leaseAPR: leaseAPR(o),
      breakEvenHours: breakEvenHours(o),
      flips: whatFlips(o),
      hoursCurve: hoursCurve(o)
    };
  }

  function bisect(fn, lo, hi) {
    var flo = fn(lo), fhi = fn(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2, fm = fn(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  // Hours a year at which an owned or leased robot costs the same as usage-priced RaaS.
  function breakEvenHours(o) {
    if (o.raasBasis === 'month') return null;
    var out = {};
    ['buy', 'lease'].forEach(function (r) {
      out[r] = bisect(function (h) {
        var x = withDefaults(o); x.hoursPerYear = h;
        var c = core(x); return c.npv[r] - c.npv.raas;
      }, 1, 8760);
    });
    return out;
  }

  // Cost per productive hour for each route across a range of yearly hours (for the chart).
  function hoursCurve(o) {
    var pts = [];
    var af = annuityFactor(o.costOfCapital, o.termYears);
    for (var h = 1000; h <= 8750; h += 250) {
      var x = withDefaults(o); x.hoursPerYear = h;
      var c = core(x), p = { hours: h };
      ROUTES.forEach(function (r) { p[r] = c.npv[r] * af / productiveHours(x, r); });
      pts.push(p);
    }
    return pts;
  }

  var FLIP_VARS = [
    { key: 'hoursPerYear', label: 'hours of use a year', lo: 1, hi: 8760, kind: 'hours' },
    { key: 'resalePct', label: 'resale value', lo: 0, hi: 0.9, kind: 'pct' },
    { key: 'costOfCapital', label: 'cost of capital', lo: 0, hi: 0.4, kind: 'pct' },
    { key: 'price', label: 'purchase price', lo: 0.2, hi: 4, kind: 'money', relative: true },
    { key: 'leasePayment', label: 'monthly lease payment', lo: 0.2, hi: 4, kind: 'money', relative: true },
    { key: 'raasPrice', label: 'pay-per-result price', lo: 0.2, hi: 4, kind: 'money', relative: true },
    { key: 'maintenancePct', label: 'yearly maintenance', lo: 0, hi: 0.4, kind: 'pct' }
  ];

  // For each input, the nearest value at which a different route becomes cheapest.
  function whatFlips(o) {
    var base = winnerOf(core(o).npv);
    var found = [];
    FLIP_VARS.forEach(function (v) {
      var cur = o[v.key];
      var lo = v.relative ? cur * v.lo : v.lo, hi = v.relative ? cur * v.hi : v.hi;
      if (!(hi > lo)) return;
      function winAt(val) { var x = withDefaults(o); x[v.key] = val; return winnerOf(core(x).npv); }
      var best = null, steps = 60;
      for (var i = 0; i <= steps; i++) {
        var val = lo + (hi - lo) * i / steps;
        var w = winAt(val);
        if (w !== base) {
          var dist = Math.abs(val - cur);
          if (!best || dist < best.dist) best = { val: val, dist: dist, winner: w };
        }
      }
      if (!best) return;
      // Narrow the boundary between the current value and the nearest flipped point.
      var a = cur, b = best.val;
      for (var k = 0; k < 60; k++) {
        var mid = (a + b) / 2;
        if (winAt(mid) === base) a = mid; else b = mid;
      }
      found.push({
        key: v.key, label: v.label, kind: v.kind,
        current: cur, threshold: b, direction: b > cur ? 'above' : 'below',
        newWinner: winAt(b),
        closeness: cur === 0 ? Math.abs(b) : Math.abs(b - cur) / Math.abs(cur)
      });
    });
    found.sort(function (x, y) { return x.closeness - y.closeness; });
    return found.slice(0, 3).map(function (f) { f.newWinnerName = ROUTE_NAMES[f.newWinner]; return f; });
  }

  return {
    DEFAULTS: DEFAULTS,
    ROUTE_NAMES: ROUTE_NAMES,
    compute: compute,
    _internal: { presentValue: presentValue, annuityFactor: annuityFactor, leaseAPR: leaseAPR,
      buyFlows: buyFlows, leaseFlows: leaseFlows, raasFlows: raasFlows, allowances: allowances, withDefaults: withDefaults }
  };
});
