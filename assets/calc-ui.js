/* roboticscost.com calculator page: reads the form, calls RobotCalc.compute, draws results. */
(function () {
  'use strict';
  var form = document.getElementById('calc-form');
  if (!form || !window.RobotCalc) return;
  var $ = function (id) { return document.getElementById(id); };
  var ROUTES = ['buy', 'hp', 'lease', 'raas'];
  var NAMES = window.RobotCalc.ROUTE_NAMES;
  var cur = '$';
  var initial = {};
  form.querySelectorAll('input, select').forEach(function (el) {
    initial[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });

  function fmt(n, dp) {
    if (n === null || n === undefined || !isFinite(n)) return '–';
    var neg = n < 0;
    var s = Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
    return (neg ? '−' : '') + cur + s;
  }
  function pct(x, dp) { return (x * 100).toLocaleString('en-GB', { maximumFractionDigits: dp === undefined ? 1 : dp }) + '%'; }
  function num(n) { return Math.round(n).toLocaleString('en-GB'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function readInputs() {
    var o = {};
    form.querySelectorAll('[data-key]').forEach(function (el) {
      var k = el.getAttribute('data-key'), v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.hasAttribute('data-bool')) v = el.value === 'true';
      else if (el.tagName === 'SELECT') v = el.value;
      else {
        if (el.value.trim() === '') { v = el.placeholder && el.hasAttribute('placeholder') ? 0 : undefined; }
        else v = parseFloat(el.value);
        if (v !== undefined && el.hasAttribute('data-pct')) v = v / 100;
      }
      if (v !== undefined && !(typeof v === 'number' && isNaN(v))) o[k] = v;
    });
    return o;
  }

  function setCurrency() {
    cur = $('currency').value;
    document.querySelectorAll('.cur').forEach(function (s) { s.textContent = cur; });
  }

  function updateRaasLabel() {
    var b = $('raasBasis').value;
    $('raasPriceLabel').textContent = b === 'hour' ? 'Price per working hour' : b === 'task' ? 'Price per task' : 'Monthly fee';
  }

  function render() {
    setCurrency(); updateRaasLabel();
    var r = window.RobotCalc.compute(readInputs());
    var errBox = $('errors');
    if (!r.ok) {
      errBox.hidden = false;
      errBox.innerHTML = '<strong>Check these inputs:</strong><ul>' + r.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
      return;
    }
    errBox.hidden = true;
    var o = r.inputs, w = r.routes[r.winner], second = r.routes[r.ranked[1]];
    var close = r.margin < 0.02 * second.npv;

    // Verdict
    $('verdict').innerHTML = close
      ? '<p class="big">Too close to call: ' + esc(w.name) + ' and ' + esc(second.name) + ' are within ' + fmt(r.margin) + ' of each other over ' + o.termYears + ' years.</p>' +
        '<p class="sub">A small change to your figures could reverse the answer. Look at what would flip it, below, and at the terms that matter to you beyond cost.</p>'
      : '<p class="big">' + esc(w.name) + ' costs least: about ' + fmt(r.margin) + ' less than ' + esc(second.name.toLowerCase()) + ' over ' + o.termYears + ' years, in today\'s money.</p>' +
        '<p class="sub">That is ' + fmt(w.costPerHour, 2) + ' per working hour, against ' + fmt(second.costPerHour, 2) + '.</p>';

    // Route cards
    $('routes').innerHTML = ROUTES.map(function (k) {
      var x = r.routes[k], win = k === r.winner;
      var rows = [
        ['Cost in today\'s money', fmt(x.npv), true],
        ['Cost per working hour', fmt(x.costPerHour, 2)],
        x.costPerTask !== null ? ['Cost per task', fmt(x.costPerTask, 3)] : null,
        ['Yearly equivalent cost', fmt(x.eac)],
        ['Cash needed on day one', fmt(x.dayOne)],
        k === 'hp' ? ['Monthly payment', fmt(r.hpPayment)] : k === 'lease' ? ['Monthly payment', fmt(o.leasePayment)] : null,
        ['Total cash over the period', fmt(x.totalCash)]
      ].filter(Boolean);
      return '<article class="route r-' + k + (win ? ' win' : '') + '"><h3>' + esc(x.name) + (win ? '<span class="badge">Lowest</span>' : '') + '</h3><dl>' +
        rows.map(function (row) { return '<div><dt>' + row[0] + '</dt><dd' + (row[2] ? ' class="key"' : '') + '>' + row[1] + '</dd></div>'; }).join('') +
        '</dl></article>';
    }).join('');

    // Lease rate
    var apr = r.leaseAPR, lp = $('leasePanel');
    if (apr === null) {
      lp.innerHTML = '<h3>Interest rate inside the lease</h3><p>We couldn\'t work out a rate from these figures. Check the payment and price.</p>';
    } else {
      var diff = apr - o.costOfCapital;
      lp.innerHTML = '<h3>Interest rate inside the lease: <span class="num">' + pct(apr) + '</span> a year</h3>' +
        '<p>' + (diff > 0.005
          ? 'That is ' + pct(diff) + ' above your cost of capital of ' + pct(o.costOfCapital) + '. Unless you can\'t raise the money another way, this lease is expensive finance.'
          : diff < -0.005
            ? 'That is below your cost of capital of ' + pct(o.costOfCapital) + ', so the lease is cheap finance. Check what you give up for it.'
            : 'That is close to your cost of capital of ' + pct(o.costOfCapital) + ', so leasing is roughly the same as borrowing to buy.') + '</p>' +
        '<p class="muted">Worked out from the price, payments, fees, payment timing and ' + (o.leaseEnd === 'buyout' ? 'the buy-out price' : 'the resale value you hand back with the robot') + '. ' +
        'Your hire purchase rate is ' + pct(o.hpRate) + (apr > o.hpRate + 0.0005 ? ', so hire purchase is the cheaper loan.' : apr < o.hpRate - 0.0005 ? ', so the lease is the cheaper loan.' : ', about the same.') +
        ' Hire purchase also lets you claim any grant and the tax write-down, because you own the robot.</p>';
    }

    // What flips it
    var fp = $('flipsPanel');
    if (!r.flips.length) {
      fp.innerHTML = '<h3>What would change the answer</h3><p>None of the main inputs flips the result within a realistic range. ' + esc(w.name) + ' wins comfortably.</p>';
    } else {
      fp.innerHTML = '<h3>What would change the answer</h3><ul>' + r.flips.map(function (f) {
        var val = f.kind === 'pct' ? pct(f.threshold) : f.kind === 'hours' ? num(f.threshold) + ' hours' : fmt(f.threshold, f.threshold < 100 ? 2 : 0);
        var now = f.kind === 'pct' ? pct(f.current) : f.kind === 'hours' ? num(f.current) + ' hours' : fmt(f.current, f.current < 100 ? 2 : 0);
        return '<li><strong>' + esc(f.newWinnerName) + '</strong> becomes cheapest if the ' + esc(f.label) + ' is ' + f.direction + ' <span class="num">' + val + '</span> (now ' + now + ').</li>';
      }).join('') + '</ul>';
    }

    // Hours chart note
    var hn = $('hoursNote');
    if (r.breakEvenHours) {
      var b = r.breakEvenHours.buy, l = r.breakEvenHours.lease, h = r.breakEvenHours.hp;
      hn.textContent = 'Paying per ' + (o.raasBasis === 'hour' ? 'hour' : 'task') + ' gets dearer the more you use the robot. ' +
        (b ? 'Buying becomes cheaper above about ' + num(b) + ' hours a year. ' : 'Buying doesn\'t overtake it at any level of use. ') +
        (h ? 'Hire purchase becomes cheaper above about ' + num(h) + ' hours. ' : '') +
        (l ? 'Leasing becomes cheaper above about ' + num(l) + ' hours.' : '');
    } else {
      hn.textContent = 'With a fixed monthly fee, more use lowers the cost per hour for every option, so the ranking doesn\'t depend on hours. Switch the pay-per-result charge to per hour to see a break-even point.';
    }
    drawLines($('hoursChart'), r.hoursCurve, o.hoursPerYear);
    drawBars($('yearChart'), r);
    yearTable(r);

    // Payback
    var pb = $('paybackPanel');
    if (o.labourPerHour > 0) {
      pb.hidden = false;
      pb.innerHTML = '<h3>Payback from labour savings</h3><ul>' + ROUTES.map(function (k) {
        var m = r.routes[k].paybackMonth;
        return '<li>' + esc(NAMES[k]) + ': ' + (m === -1 ? 'doesn\'t pay back within ' + o.termYears + ' years' : m === 1 ? 'pays its way from the first month' : 'pays back in month ' + m) + '</li>';
      }).join('') + '</ul><p class="muted">Based on ' + fmt(o.labourPerHour, 2) + ' saved per working hour. Cash basis, not discounted.</p>';
    } else pb.hidden = true;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    var e = document.createElementNS(SVGNS, name);
    for (var a in attrs) e.setAttribute(a, attrs[a]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  // Round axis maximum up to 4 even steps of 1, 2, 2.5 or 5 x a power of ten.
  function niceMax(v) {
    if (v <= 0) return 4;
    var raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    return step * 4;
  }
  function short(v) {
    var a = Math.abs(v), s;
    if (a >= 1e6) s = (a / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'm';
    else if (a >= 1e3) s = (a / 1e3).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'k';
    else s = a.toLocaleString('en-GB', { maximumFractionDigits: a < 10 ? 2 : 0 });
    return (v < 0 ? '−' : '') + cur + s;
  }
  var COLORS = { buy: 'var(--buy)', hp: 'var(--hp)', lease: 'var(--lease)', raas: 'var(--raas)' };

  function drawLines(svg, pts, nowHours) {
    svg.innerHTML = '';
    var W = 640, H = 300, L = 64, R = 16, T = 16, B = 40;
    // Clip the y-axis so very low usage doesn't flatten the interesting range.
    var vals = []; pts.forEach(function (p) { ROUTES.forEach(function (k) { vals.push(p[k]); }); });
    var ymax = niceMax(Math.max.apply(null, vals));
    var x = function (h) { return L + (h - 1000) / (8750 - 1000) * (W - L - R); };
    var y = function (v) { return T + (1 - Math.min(v, ymax) / ymax) * (H - T - B); };
    for (var i = 0; i <= 4; i++) {
      var v = ymax * i / 4;
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), 'class': 'grid' }));
      svg.appendChild(el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, short(v)));
    }
    [1000, 2000, 4000, 6000, 8760].forEach(function (h) {
      svg.appendChild(el('text', { x: x(Math.min(h, 8750)), y: H - B + 20, 'text-anchor': 'middle' }, num(h)));
    });
    svg.appendChild(el('text', { x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, 'Hours of use a year'));
    if (nowHours >= 1000 && nowHours <= 8760) {
      var nx = x(Math.min(nowHours, 8750));
      svg.appendChild(el('line', { x1: nx, x2: nx, y1: T, y2: H - B, stroke: 'var(--muted)', 'stroke-dasharray': '4 4', 'stroke-width': 1 }));
      svg.appendChild(el('text', { x: nx + 6, y: T + 12 }, 'You'));
    }
    ROUTES.forEach(function (k) {
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.hours).toFixed(1) + ' ' + y(p[k]).toFixed(1); }).join(' ');
      svg.appendChild(el('path', { d: d, fill: 'none', stroke: COLORS[k], 'stroke-width': 3, 'stroke-linejoin': 'round' }));
    });
  }

  function drawBars(svg, r) {
    svg.innerHTML = '';
    var W = 640, H = 300, L = 64, R = 16, T = 16, B = 34;
    var years = r.routes.buy.byYear.length;
    ROUTES.forEach(function (k) { years = Math.max(years, r.routes[k].byYear.length); });
    var all = []; ROUTES.forEach(function (k) { all = all.concat(r.routes[k].byYear); });
    var hi = niceMax(Math.max(0, Math.max.apply(null, all)));
    var loRaw = Math.min(0, Math.min.apply(null, all));
    var lo = 0;
    if (loRaw < 0) { var st = hi / 4; lo = -Math.ceil(-loRaw / st) * st; }
    var y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var step = hi / 4, n = Math.round((hi - lo) / step);
    for (var i = 0; i <= n; i++) {
      var v = lo + step * i;
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), 'class': 'grid' }));
      svg.appendChild(el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, short(v)));
    }
    svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), 'class': 'axis' }));
    var gw = (W - L - R) / years, bw = Math.min(18, (gw - 8) / 4);
    for (var yr = 0; yr < years; yr++) {
      var gx = L + gw * yr + (gw - bw * 4) / 2;
      ROUTES.forEach(function (k, j) {
        var v = r.routes[k].byYear[yr] || 0;
        var y0 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
        var rect = el('rect', { x: gx + j * bw, y: y0, width: bw - 2, height: Math.max(h, 0.5), fill: COLORS[k] });
        rect.appendChild(el('title', {}, NAMES[k] + ', year ' + yr + ': ' + fmt(v)));
        svg.appendChild(rect);
      });
      svg.appendChild(el('text', { x: L + gw * yr + gw / 2, y: H - B + 20, 'text-anchor': 'middle' }, 'Yr ' + yr));
    }
  }

  function yearTable(r) {
    var years = 0; ROUTES.forEach(function (k) { years = Math.max(years, r.routes[k].byYear.length); });
    var h = '<table class="data-table"><thead><tr><th>Year</th>' + ROUTES.map(function (k) { return '<th>' + NAMES[k] + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var y = 0; y < years; y++) h += '<tr><td>' + y + '</td>' + ROUTES.map(function (k) { return '<td>' + fmt(r.routes[k].byYear[y] || 0) + '</td>'; }).join('') + '</tr>';
    $('yearTable').innerHTML = h + '</tbody></table>';
  }

  function setAdvanced(on) {
    document.querySelectorAll('.adv').forEach(function (e) { e.hidden = !on; });
    try { localStorage.setItem('rc-adv', on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  }
  $('showAdvanced').addEventListener('change', function (e) { setAdvanced(e.target.checked); });
  try { if (localStorage.getItem('rc-adv') === '1') { $('showAdvanced').checked = true; setAdvanced(true); } } catch (e) { /* ignore */ }

  form.querySelectorAll('[data-hours]').forEach(function (b) {
    b.addEventListener('click', function () { $('hoursPerYear').value = b.getAttribute('data-hours'); render(); });
  });
  $('resetBtn').addEventListener('click', function () {
    form.querySelectorAll('input, select').forEach(function (el) {
      if (el.id === 'showAdvanced') return;
      if (el.type === 'checkbox') el.checked = initial[el.id]; else el.value = initial[el.id];
    });
    render();
  });
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  render();
})();
