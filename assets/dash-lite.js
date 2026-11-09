/*
 * dash-lite: a tiny stand-in for the Claude dashboard runtime, so the same page
 * runs as a plain static site. It loads data/<id>.json, works out every
 * dash.calc in dependency order, then runs dash.onData listeners and dash.draw
 * drawings, exactly as the dashboard does.
 */
(function () {
  'use strict';
  var DATASETS = ['batting', 'bowling', 'fielding', 'results', 'innings', 'spells', 'match_fielding'];
  var store = {};
  var calcs = [];
  var draws = {};
  var listeners = [];

  DATASETS.forEach(function (id) { store[id] = { status: 'loading', data: [] }; });

  function run(name) {
    var fn = draws[name];
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach(function (el) {
      try { fn(el); } catch (e) { console.error('drawing ' + name, e); }
    });
  }

  function renderAll() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error('onData', e); } });
    Object.keys(draws).forEach(run);
  }

  function compute() {
    var pending = calcs.slice();
    var progress = true;
    while (pending.length && progress) {
      progress = false;
      for (var i = 0; i < pending.length; i++) {
        var c = pending[i];
        var ready = c.inputs.every(function (k) { return store[k] && store[k].status === 'ok'; });
        var failed = c.inputs.some(function (k) { return store[k] && store[k].status === 'error'; });
        if (ready || failed) {
          if (ready) {
            try {
              store[c.id] = { status: 'ok', data: c.fn.apply(null, c.inputs.map(function (k) { return store[k].data; })) };
            } catch (e) {
              console.error('calc ' + c.id, e);
              store[c.id] = { status: 'error', data: [], message: String(e) };
            }
          } else {
            store[c.id] = { status: 'error', data: [] };
          }
          pending.splice(i, 1);
          i--;
          progress = true;
        }
      }
    }
    pending.forEach(function (c) { store[c.id] = { status: 'error', data: [] }; });
  }

  function load() {
    var v = document.documentElement.getAttribute('data-version') || '';
    return Promise.all(DATASETS.map(function (id) {
      return fetch('data/' + id + '.json' + (v ? '?v=' + encodeURIComponent(v) : ''), { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { store[id] = { status: 'ok', data: Array.isArray(j) ? j : (j.rows || j.data || j.results || []) }; })
        .catch(function (e) { console.error('load ' + id, e); store[id] = { status: 'error', data: [] }; });
    })).then(function () {
      compute();
      document.documentElement.setAttribute('data-loaded', 'true');
      renderAll();
    });
  }

  window.dash = {
    calc: function (id, o) {
      calcs.push({ id: id, inputs: o.inputs || [], fn: o.fn });
      store[id] = { status: 'loading', data: [] };
    },
    data: function (id) { return store[id] || { status: 'missing', data: [] }; },
    draw: function (name, fn) {
      if (typeof fn === 'function') { draws[name] = fn; return; }
      run(name);
    },
    onData: function (fn) { listeners.push(fn); },
  };

  document.addEventListener('DOMContentLoaded', function () { renderAll(); load(); });
  var lastWidth = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    renderAll();
  });
})();
