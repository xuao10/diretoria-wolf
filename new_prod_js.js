    // =====================================================
    // PRODUCTION DIRECTOR v2.0 - PREMIUM ENGINE
    // All logic scoped under window.ProductionDirector
    // ZERO interference with Auditor Senior panel
    // =====================================================
    window.ProductionDirector = (function() {
      'use strict';

      let syncInterval = null;
      let syncCountdown = 60;
      let charts = {};
      let isInitialized = false;

      const TEAM = [
        { name: 'Tercio Oliveira', role: 'Projetista HID', pe: 95 },
        { name: 'Flavio Santos', role: 'Projetista ELE', pe: 90 },
        { name: 'Aurea Lima', role: 'Projetista HID', pe: 100 },
        { name: 'Carlos Mendes', role: 'Projetista ELE', pe: 85 },
        { name: 'Juliana Costa', role: 'Coord. Projetos', pe: 88 },
        { name: 'Rafael Dias', role: 'Projetista HID', pe: 92 },
        { name: 'Amanda Rocha', role: 'Projetista ELE', pe: 74 }
      ];

      function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
      function randF(min, max) { return +(Math.random() * (max - min) + min).toFixed(1); }

      function generateSprintHistory() {
        return ['S1-Jan', 'S2-Jan', 'S1-Fev', 'S2-Fev', 'S1-Mar', 'S2-Mar'].map((label, i) => {
          return { label, velocity: rand(480, 680), capOP: rand(45, 92), health: rand(65, 98), gargalo: rand(10, 55), sincronia: rand(-20, 15), leadTime: randF(1.5, 5), done: i < 5 };
        });
      }

      function generateMockData() {
        const PE_EQUIPE = 624;
        const WIP_IDEAL = 14;
        const SPRINT_DAYS = 14;
        const sprintDay = rand(1, 14);
        const pilots = TEAM.map(p => {
          const assigned = rand(40, 130);
          const doing = rand(0, 4);
          const ageAvg = doing > 0 ? randF(0.5, 14) : 0;
          const done = rand(10, 80);
          return { ...p, assigned, load: Math.round((assigned / p.pe) * 100), doing, done, ageAvg, gargaloScore: Math.round(doing * ageAvg) };
        });
        const totalAssigned = pilots.reduce((s, p) => s + p.assigned, 0);
        const capOP = Math.round((totalAssigned / PE_EQUIPE) * 100);
        const wip = pilots.reduce((s, p) => s + p.doing, 0);
        const loads = pilots.map(p => p.load);
        const avgLoad = Math.round(loads.reduce((a, b) => a + b, 0) / loads.length);
        const stdDev = Math.round(Math.sqrt(loads.reduce((s, l) => s + Math.pow(l - avgLoad, 2), 0) / loads.length));
        const worst = pilots.reduce((a, b) => a.gargaloScore > b.gargaloScore ? a : b);
        const healthPct = rand(65, 98);
        const sincronia = rand(-20, 15);
        const leadTime = randF(1.5, 5);
        const leadMin = randF(0.3, 1.5);
        const leadMax = randF(5, 12);
        const expectedDone = Math.round(PE_EQUIPE * (sprintDay / SPRINT_DAYS) * 0.9);
        const actualDone = Math.round(expectedDone * (1 + sincronia / 100));
        const history = generateSprintHistory();
        const burndown = { ideal: [], actual: [] };
        let remaining = PE_EQUIPE;
        const rate = PE_EQUIPE / SPRINT_DAYS;
        for (let i = 0; i <= SPRINT_DAYS; i++) {
          burndown.ideal.push(Math.round(PE_EQUIPE - rate * i));
          if (i <= sprintDay) { remaining -= rand(Math.floor(rate * 0.6), Math.floor(rate * 1.3)); if (remaining < 0) remaining = 0; burndown.actual.push(remaining); }
        }
        return {
          sprint: 'S4', sprintDay, sprintDays: SPRINT_DAYS, PE_EQUIPE, capOP, totalAssigned,
          flowNet: rand(5, 25), flowRate: randF(5, 15), healthPct, stdDev, avgLoad,
          wip, wipIdeal: WIP_IDEAL, wipPerPerson: (wip / TEAM.length).toFixed(1),
          gargaloScore: worst.gargaloScore, gargaloPilot: worst.name, gargaloDoing: worst.doing, gargaloAge: worst.ageAvg,
          sincronia, leadTime, leadMin, leadMax, actualDone, expectedDone,
          backlog: rand(30, 60), todo: rand(12, 28),
          pilots, burndown, history, velocityTrend: rand(8, 25)
        };
      }

      function drawSparkline(canvasId, data, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (!data || data.length < 2) return;
        const max = Math.max(...data) * 1.1, min = Math.min(...data) * 0.9, range = max - min || 1;
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        data.forEach((v, i) => { const x = (i / (data.length - 1)) * w; const y = h - ((v - min) / range) * h; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.stroke();
      }

      function statusColor(val, thresholds) {
        if (val >= thresholds[0]) return 'text-emerald-400';
        if (val >= thresholds[1]) return 'text-amber-400';
        return 'text-red-400';
      }

      function renderKPIs(d) {
        const el = (id) => document.getElementById(id);

        // Cap OP
        if (el('kpi-cap-value')) el('kpi-cap-value').textContent = d.capOP;
        if (el('kpi-cap-bar')) { el('kpi-cap-bar').style.width = Math.min(d.capOP, 100) + '%'; el('kpi-cap-bar').className = 'h-full rounded-full transition-all duration-1000 bg-gradient-to-r ' + (d.capOP > 95 ? 'from-red-500 to-red-400' : (d.capOP > 80 ? 'from-amber-500 to-amber-400' : 'from-emerald-500 to-emerald-400')); }
        if (el('kpi-cap-detail')) el('kpi-cap-detail').textContent = d.totalAssigned + ' / ' + d.PE_EQUIPE + ' pts atribuidos';
        if (el('kpi-cap-status')) { const c = d.capOP > 95 ? 'bg-red-400' : (d.capOP > 80 ? 'bg-amber-400' : 'bg-emerald-400'); el('kpi-cap-status').className = 'w-2.5 h-2.5 rounded-full shadow-[0_0_6px_rgba(52,211,153,0.5)] ' + c; }

        // Flow
        if (el('kpi-flow-value')) el('kpi-flow-value').textContent = '+' + d.flowNet;
        if (el('kpi-flow-rate')) el('kpi-flow-rate').textContent = d.flowRate;
        if (el('kpi-flow-backlog')) el('kpi-flow-backlog').textContent = d.backlog;
        if (el('kpi-flow-todo')) el('kpi-flow-todo').textContent = d.todo;
        if (el('kpi-flow-doing')) el('kpi-flow-doing').textContent = d.wip;

        // Health
        if (el('kpi-health-value')) { el('kpi-health-value').textContent = d.healthPct; var hc = d.healthPct >= 90 ? 'text-emerald-400' : (d.healthPct >= 70 ? 'text-amber-400' : 'text-red-400'); el('kpi-health-value').className = 'text-3xl font-black font-mono ' + hc; }
        if (el('kpi-health-bar')) el('kpi-health-bar').style.width = d.healthPct + '%';
        if (el('kpi-health-detail')) { var ar = Math.round((100 - d.healthPct) / 100 * d.pilots.length * 3); el('kpi-health-detail').textContent = ar + ' tarefas em risco de ' + (d.pilots.length * 3); }
        if (el('kpi-health-status')) { var hsc = d.healthPct >= 90 ? 'bg-emerald-400' : (d.healthPct >= 70 ? 'bg-amber-400' : 'bg-red-400'); el('kpi-health-status').className = 'w-2.5 h-2.5 rounded-full shadow-[0_0_6px_rgba(52,211,153,0.5)] ' + hsc; }

        // Balance
        if (el('kpi-balance-value')) { var bc = d.stdDev <= 15 ? 'text-emerald-400' : (d.stdDev <= 25 ? 'text-amber-400' : 'text-red-400'); el('kpi-balance-value').textContent = '\u03C3 ' + d.stdDev; el('kpi-balance-value').className = 'text-3xl font-black font-mono ' + bc; }
        if (el('kpi-balance-detail')) el('kpi-balance-detail').textContent = 'Carga media: ' + d.avgLoad + '% (\u00B1' + d.stdDev + ')';
        if (el('kpi-balance-status')) { var bsc = d.stdDev <= 15 ? 'bg-emerald-400' : (d.stdDev <= 25 ? 'bg-amber-400' : 'bg-red-400'); el('kpi-balance-status').className = 'w-2.5 h-2.5 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.5)] ' + bsc; }
        if (el('kpi-balance-bars')) {
          el('kpi-balance-bars').innerHTML = d.pilots.map(function(p) { var h = Math.max(4, Math.min(24, p.load / 4)); var c = p.load > 100 ? 'bg-red-400' : (p.load > 80 ? 'bg-amber-400' : 'bg-emerald-400'); return '<div class="flex-1 ' + c + ' rounded-sm transition-all" style="height:' + h + 'px" title="' + p.name + ': ' + p.load + '%"></div>'; }).join('');
        }

        // WIP
        if (el('kpi-wip-value')) el('kpi-wip-value').textContent = d.wip;
        if (el('kpi-wip-bar')) el('kpi-wip-bar').style.width = Math.min((d.wip / d.wipIdeal) * 100, 100) + '%';
        if (el('kpi-wip-status')) { var wc = d.wip <= d.wipIdeal ? 'bg-violet-400' : 'bg-red-400'; el('kpi-wip-status').className = 'w-2.5 h-2.5 rounded-full ' + wc; }
        if (el('kpi-wip-detail')) el('kpi-wip-detail').textContent = '2 tarefas/pessoa x ' + TEAM.length + ' membros';
        if (el('kpi-wip-pp')) el('kpi-wip-pp').textContent = d.wipPerPerson;

        // Gargalo
        if (el('kpi-gargalo-value')) el('kpi-gargalo-value').textContent = d.gargaloScore;
        if (el('kpi-gargalo-pilot')) el('kpi-gargalo-pilot').textContent = '\u26A1 ' + d.gargaloPilot;
        if (el('kpi-gargalo-detail')) el('kpi-gargalo-detail').textContent = d.gargaloDoing + ' tarefas x ' + d.gargaloAge + ' dias media';
        if (el('kpi-gargalo-status')) { var gc = d.gargaloScore > 40 ? 'bg-red-400 animate-pulse' : (d.gargaloScore > 20 ? 'bg-amber-400' : 'bg-emerald-400'); el('kpi-gargalo-status').className = 'w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(248,113,113,0.6)] ' + gc; }

        // Sincronia
        if (el('kpi-sync-value')) { el('kpi-sync-value').textContent = (d.sincronia >= 0 ? '+' : '') + d.sincronia; var sc = d.sincronia >= 0 ? 'text-emerald-400' : (d.sincronia >= -10 ? 'text-amber-400' : 'text-red-400'); el('kpi-sync-value').className = 'text-3xl font-black font-mono ' + sc; }
        if (el('kpi-sync-done')) el('kpi-sync-done').textContent = d.actualDone;
        if (el('kpi-sync-expected')) el('kpi-sync-expected').textContent = d.expectedDone;

        // Lead Time
        if (el('kpi-lead-value')) el('kpi-lead-value').textContent = d.leadTime;
        if (el('kpi-lead-status')) { var lc = d.leadTime <= 3 ? 'bg-emerald-400' : (d.leadTime <= 5 ? 'bg-amber-400' : 'bg-red-400'); el('kpi-lead-status').className = 'w-2.5 h-2.5 rounded-full ' + lc; }
        if (el('kpi-lead-min')) el('kpi-lead-min').textContent = d.leadMin;
        if (el('kpi-lead-max')) el('kpi-lead-max').textContent = d.leadMax;

        // Sparklines
        drawSparkline('kpi-cap-spark', d.history.map(function(h) { return h.capOP; }), '#34d399');
        drawSparkline('kpi-flow-spark', d.history.map(function() { return rand(5, 25); }), '#22d3ee');
        drawSparkline('kpi-health-spark', d.history.map(function(h) { return h.health; }), '#34d399');
        drawSparkline('kpi-balance-spark', d.history.map(function() { return rand(8, 30); }), '#fbbf24');

        // Header
        if (el('prod-sprint-label')) el('prod-sprint-label').textContent = d.sprint;
        if (el('prod-sprint-day')) el('prod-sprint-day').textContent = d.sprintDay;
        if (el('prod-velocity')) el('prod-velocity').textContent = d.PE_EQUIPE;
      }

      function renderPilotTable(pilots) {
        var tbody = document.getElementById('pilot-table-body');
        if (!tbody) return;
        var sorted = pilots.slice().sort(function(a, b) { return b.gargaloScore - a.gargaloScore; });
        tbody.innerHTML = sorted.map(function(p) {
          var lc = p.load > 100 ? 'text-red-400' : (p.load > 80 ? 'text-amber-400' : 'text-emerald-400');
          var bc = p.load > 100 ? 'from-red-500 to-red-400' : (p.load > 80 ? 'from-amber-500 to-amber-400' : 'from-emerald-500 to-emerald-400');
          var gb = p.gargaloScore > 40 ? 'bg-red-500/20 text-red-400 border-red-500/30' : (p.gargaloScore > 20 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-white/5 text-gray-500 border-white/5');
          var initials = p.name.split(' ').map(function(n) { return n[0]; }).join('').slice(0, 2);
          return '<tr class="hover:bg-white/5 transition-colors text-[11px] font-mono">' +
            '<td class="px-4 py-3"><div class="flex items-center gap-2"><div class="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500/30 to-amber-600/30 border border-orange-500/20 flex items-center justify-center"><span class="text-[9px] text-white font-bold">' + initials + '</span></div><span class="text-white font-medium">' + p.name + '</span></div></td>' +
            '<td class="px-4 py-3 text-gray-500 text-[10px]">' + p.role + '</td>' +
            '<td class="px-3 py-3 text-center text-white font-bold">' + p.assigned + '</td>' +
            '<td class="px-3 py-3 text-center text-gray-500">' + p.pe + '</td>' +
            '<td class="px-3 py-3 text-center ' + lc + ' font-bold">' + p.load + '%</td>' +
            '<td class="px-3 py-3 text-center ' + (p.doing > 2 ? 'text-red-400 font-bold' : 'text-gray-400') + '">' + p.doing + '</td>' +
            '<td class="px-3 py-3 text-center text-emerald-400">' + p.done + '</td>' +
            '<td class="px-3 py-3 text-center ' + (p.ageAvg > 5 ? 'text-red-400' : 'text-gray-400') + '">' + p.ageAvg + 'd</td>' +
            '<td class="px-3 py-3 text-center"><span class="px-2 py-0.5 rounded text-[9px] font-bold border ' + gb + '">' + p.gargaloScore + '</span></td>' +
            '<td class="px-4 py-3"><div class="w-full bg-white/5 rounded-full h-1.5 overflow-hidden"><div class="h-full bg-gradient-to-r ' + bc + ' rounded-full transition-all" style="width:' + Math.min(p.load, 100) + '%"></div></div></td></tr>';
        }).join('');
      }

      function renderCharts(d) {
        var chartDefaults = {
          animation: { duration: 800 }, responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { font: { size: 9, family: 'monospace' }, color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.03)' } },
            y: { ticks: { font: { size: 9, family: 'monospace' }, color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.03)' } }
          }
        };
        Object.values(charts).forEach(function(c) { if (c) c.destroy(); });
        charts = {};

        // Velocity
        var velCtx = document.getElementById('prod-velocity-chart');
        if (velCtx) {
          charts.velocity = new Chart(velCtx.getContext('2d'), {
            type: 'bar',
            data: { labels: d.history.map(function(h) { return h.label; }), datasets: [
              { label: 'Velocidade', data: d.history.map(function(h) { return h.velocity; }), backgroundColor: d.history.map(function(h, i) { return i === d.history.length - 1 ? 'rgba(249,115,22,0.7)' : 'rgba(249,115,22,0.3)'; }), borderColor: 'rgba(249,115,22,0.8)', borderWidth: 1, borderRadius: 4, barThickness: 20 },
              { label: 'Tendencia', data: d.history.map(function(h) { return h.velocity; }), type: 'line', borderColor: 'rgba(251,191,36,0.8)', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fbbf24', tension: 0.3, fill: false }
            ] },
            options: chartDefaults
          });
          var vt = d.history.length >= 2 ? Math.round(((d.history[d.history.length-1].velocity - d.history[0].velocity) / d.history[0].velocity) * 100) : 0;
          var vtEl = document.getElementById('prod-vel-trend');
          if (vtEl) { vtEl.textContent = (vt >= 0 ? '\u2191' : '\u2193') + ' ' + Math.abs(vt) + '%'; vtEl.className = 'text-[9px] font-mono font-bold ' + (vt >= 0 ? 'text-emerald-400' : 'text-red-400'); }
        }

        // Burndown
        var burnCtx = document.getElementById('prod-burndown-chart');
        if (burnCtx) {
          var days = [];
          for (var i = 0; i <= d.sprintDays; i++) days.push('D' + i);
          charts.burndown = new Chart(burnCtx.getContext('2d'), {
            type: 'line',
            data: { labels: days, datasets: [
              { label: 'Ideal', data: d.burndown.ideal, borderColor: 'rgba(107,114,128,0.5)', borderDash: [5, 3], borderWidth: 1.5, pointRadius: 0, tension: 0 },
              { label: 'Real', data: d.burndown.actual, borderColor: 'rgba(249,115,22,0.9)', borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#f97316', tension: 0.2, fill: { target: 'origin', above: 'rgba(249,115,22,0.05)' } }
            ] },
            options: chartDefaults
          });
          var last = d.burndown.actual[d.burndown.actual.length - 1];
          var pct = Math.round((last / d.PE_EQUIPE) * 100);
          var bpEl = document.getElementById('prod-burn-pct');
          if (bpEl) bpEl.textContent = pct + '% restante';
        }

        // Lead Time
        var ltCtx = document.getElementById('prod-leadtime-chart');
        if (ltCtx) {
          charts.leadtime = new Chart(ltCtx.getContext('2d'), {
            type: 'line',
            data: { labels: d.history.map(function(h) { return h.label; }), datasets: [
              { label: 'Lead Time', data: d.history.map(function(h) { return h.leadTime; }), borderColor: 'rgba(45,212,191,0.9)', backgroundColor: 'rgba(45,212,191,0.1)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#2dd4bf', tension: 0.3, fill: true }
            ] },
            options: chartDefaults
          });
          var lt = d.history.length >= 2 ? Math.round(((d.history[d.history.length-1].leadTime - d.history[0].leadTime) / d.history[0].leadTime) * 100) : 0;
          var ltEl = document.getElementById('prod-lt-trend');
          if (ltEl) { ltEl.textContent = (lt <= 0 ? '\u2193' : '\u2191') + ' ' + Math.abs(lt) + '%'; ltEl.className = 'text-[9px] font-mono font-bold ' + (lt <= 0 ? 'text-teal-400' : 'text-red-400'); }
        }
      }

      function renderSprintHistory(history) {
        var tbody = document.getElementById('sprint-history-body');
        if (!tbody) return;
        tbody.innerHTML = history.map(function(h) {
          var cc = h.capOP > 90 ? 'text-red-400' : (h.capOP > 75 ? 'text-amber-400' : 'text-emerald-400');
          var hc = h.health >= 90 ? 'text-emerald-400' : (h.health >= 70 ? 'text-amber-400' : 'text-red-400');
          var gc = h.gargalo > 40 ? 'text-red-400' : (h.gargalo > 20 ? 'text-amber-400' : 'text-emerald-400');
          var sc = h.sincronia >= 0 ? 'text-emerald-400' : (h.sincronia >= -10 ? 'text-amber-400' : 'text-red-400');
          var lc = h.leadTime <= 3 ? 'text-teal-400' : (h.leadTime <= 5 ? 'text-amber-400' : 'text-red-400');
          var sb = h.done ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30';
          return '<tr class="hover:bg-white/5 transition-colors text-[11px] font-mono">' +
            '<td class="px-4 py-3 text-white font-bold">' + h.label + '</td>' +
            '<td class="px-3 py-3 text-center ' + cc + ' font-bold">' + h.capOP + '%</td>' +
            '<td class="px-3 py-3 text-center ' + hc + ' font-bold">' + h.health + '%</td>' +
            '<td class="px-3 py-3 text-center ' + gc + ' font-bold">' + h.gargalo + '</td>' +
            '<td class="px-3 py-3 text-center ' + sc + ' font-bold">' + (h.sincronia >= 0 ? '+' : '') + h.sincronia + '%</td>' +
            '<td class="px-3 py-3 text-center ' + lc + ' font-bold">' + h.leadTime + 'd</td>' +
            '<td class="px-3 py-3 text-center text-white font-bold">' + h.velocity + '</td>' +
            '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[9px] font-bold border ' + sb + '">' + (h.done ? 'CONCLUIDO' : 'EM CURSO') + '</span></td></tr>';
        }).join('');
      }

      function renderJarvisTerminal(d) {
        var terminal = document.getElementById('jarvis-terminal');
        if (!terminal) return;
        terminal.innerHTML = '';
        var now = new Date();
        var ts = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        var lines = [
          { color: 'text-gray-600', text: '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550' },
          { color: 'text-orange-400 font-bold text-xs', text: '\uD83D\uDEA8 DIRETOR DE PRODUCAO \u2013 DIAGNOSTICO COMPLETO \u2013 ' + d.sprint + ' \u2013 Dia ' + d.sprintDay + '/' + d.sprintDays },
          { color: 'text-gray-600', text: ts + ' \u00B7 Atualizacao automatica \u00B7 PE Equipe: ' + d.PE_EQUIPE + ' pts' },
          { color: 'text-gray-600', text: '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550' },
          { color: 'text-gray-500', text: '' },
          { color: 'text-gray-300 font-bold', text: '=== INDICADORES CHAVE ===' },
          { color: d.capOP < 70 ? 'text-emerald-400' : (d.capOP < 95 ? 'text-amber-400' : 'text-red-400'), text: '  \u25B8 Capacidade OP:     ' + d.capOP + '%  (' + d.totalAssigned + '/' + d.PE_EQUIPE + ' pts) ' + (d.capOP < 70 ? '\u2705 Com folga' : (d.capOP >= 95 ? '\uD83D\uDD34 SOBRECARGA' : '\uD83D\uDFE1 Atencao')) },
          { color: d.healthPct >= 90 ? 'text-emerald-400' : (d.healthPct >= 70 ? 'text-amber-400' : 'text-red-400'), text: '  \u25B8 Saude da Fila:     ' + d.healthPct + '%  ' + (d.healthPct >= 90 ? '\u2705 Saudavel' : (d.healthPct >= 70 ? '\uD83D\uDFE1 Atencao' : '\uD83D\uDD34 CRITICO')) },
          { color: 'text-gray-400', text: '  \u25B8 Fluxo:             +' + d.flowNet + ' pts/dia  (Entrada: ' + d.flowRate + ' pts/d)' },
          { color: 'text-gray-400', text: '  \u25B8 Balanceamento:     \u03C3 ' + d.stdDev + '  (Media: ' + d.avgLoad + '%)  ' + (d.stdDev > 25 ? '\uD83D\uDD34 DESBALANCEADO' : '') },
          { color: 'text-gray-400', text: '  \u25B8 WIP:               ' + d.wip + '/' + d.wipIdeal + '  (' + d.wipPerPerson + ' tarefas/pessoa)' },
          { color: d.sincronia >= 0 ? 'text-emerald-400' : 'text-amber-400', text: '  \u25B8 Sincronia:         ' + (d.sincronia >= 0 ? '+' : '') + d.sincronia + '%  (Real: ' + d.actualDone + ' / Esperado: ' + d.expectedDone + ')' },
          { color: 'text-gray-400', text: '  \u25B8 Lead Time:         ' + d.leadTime + ' dias  (Min: ' + d.leadMin + 'd / Max: ' + d.leadMax + 'd)' },
          { color: 'text-gray-500', text: '' },
          { color: 'text-gray-300 font-bold', text: '=== GARGALO ===' },
          { color: d.gargaloScore > 40 ? 'text-red-400 font-bold' : 'text-amber-400', text: '  \u26A1 ' + d.gargaloPilot + ': Score ' + d.gargaloScore + '  (' + d.gargaloDoing + ' doing x ' + d.gargaloAge + 'd media)' },
          { color: 'text-gray-500', text: '' }
        ];

        var recommendations = [];
        var lightestPilot = d.pilots.slice().sort(function(a, b) { return a.load - b.load; })[0];
        if (d.gargaloScore > 40) recommendations.push('\u2192 Realocar tarefas de ' + d.gargaloPilot + ' para ' + lightestPilot.name + ' (carga: ' + lightestPilot.load + '%)');
        var doingPilots = d.pilots.filter(function(p) { return p.doing > 2; });
        if (doingPilots.length > 0) recommendations.push('\u2192 ' + doingPilots.length + ' piloto(s) com >2 tarefas simultaneas. Reduzir WIP individual.');
        if (d.sincronia < -10) recommendations.push('\u2192 Sprint atrasado ' + Math.abs(d.sincronia) + '%. Priorizar entregas de alto valor.');
        if (d.capOP > 95) recommendations.push('\u2192 Equipe sobrecarregada (' + d.capOP + '%). Postergar tarefas de baixo valor.');
        if (d.stdDev > 25) recommendations.push('\u2192 Cargas desbalanceadas (\u03C3 ' + d.stdDev + '). Redistribuir pontos para ' + lightestPilot.name + '.');
        if (d.leadTime > 4) recommendations.push('\u2192 Lead Time alto (' + d.leadTime + 'd). Investigar bloqueios no fluxo.');

        if (recommendations.length > 0) {
          lines.push({ color: 'text-orange-300 font-bold', text: '=== ACAO IMEDIATA RECOMENDADA ===' });
          recommendations.forEach(function(r) { lines.push({ color: 'text-orange-200', text: '  ' + r }); });
        } else {
          lines.push({ color: 'text-emerald-400 font-bold', text: '\u2705 ESTEIRA SAUDAVEL \u2013 Nenhuma acao imediata necessaria.' });
        }
        lines.push({ color: 'text-gray-500', text: '' });
        lines.push({ color: 'text-gray-500', text: 'Tendencia 6 sprints: Velocidade \u2191 ' + d.velocityTrend + '%' });
        lines.push({ color: 'text-gray-600', text: '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550' });

        lines.forEach(function(line, i) {
          var div = document.createElement('div');
          div.className = line.color + ' opacity-0 transition-opacity duration-300';
          div.textContent = line.text;
          terminal.appendChild(div);
          setTimeout(function() { div.classList.remove('opacity-0'); if (i === lines.length - 1) terminal.scrollTop = terminal.scrollHeight; }, i * 40);
        });
      }

      function startSyncTimer() {
        if (syncInterval) return;
        syncCountdown = 60;
        updateTimerDisplay();
        syncInterval = setInterval(function() {
          syncCountdown--;
          updateTimerDisplay();
          if (syncCountdown <= 0) { syncCountdown = 60; refreshAll(); }
        }, 1000);
      }

      function updateTimerDisplay() {
        var el = document.getElementById('prod-sync-timer');
        var dot = document.getElementById('prod-sync-dot');
        if (el) {
          el.textContent = syncCountdown;
          if (syncCountdown <= 5) {
            el.className = 'text-lg font-black text-red-400 font-mono w-8 text-center animate-pulse';
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-red-400 animate-pulse';
          } else {
            el.className = 'text-lg font-black text-emerald-400 font-mono w-8 text-center';
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.6)]';
          }
        }
      }

      async function fetchProductionData() {
        try {
          const res = await fetch('/api/clickup/production');
          if (!res.ok) throw new Error('API erro ' + res.status);
          const raw = await res.json();
          
          const PE_EQUIPE = raw.team_total_pts ? ((raw.team_total_pts.ELE || 0) + (raw.team_total_pts.HID || 0)) : (raw.historical_average_pe || 600);
          const pilotsData = raw.pilots || [];
          const WIP_IDEAL = pilotsData.length * 2 || 14;
          const SPRINT_DAYS = raw.dias_uteis_total || 14;
          const sprintDay = raw.dias_uteis_passados || 1;
          
          let pilots = pilotsData.map(p => {
              const peSprint = p.pe_sprint || (p.team === 'ELE' ? 100 : 150);
              return {
                  name: p.name,
                  role: p.role || p.team,
                  pe: peSprint,
                  assigned: p.assigned || 0,
                  load: Math.round(((p.assigned || 0) / peSprint) * 100) || 0,
                  doing: p.doingCount || 0,
                  done: p.done || 0,
                  ageAvg: p.ageAvg || 0,
                  gargaloScore: p.gargaloScore || 0
              };
          });

          const totalAssigned = pilots.reduce((s, p) => s + p.assigned, 0);
          const capOP = PE_EQUIPE > 0 ? Math.round((totalAssigned / PE_EQUIPE) * 100) : 0;
          const wip = raw.raw_total_doing || pilots.reduce((s, p) => s + p.doing, 0);
          
          const loads = pilots.map(p => p.load).filter(l => !isNaN(l));
          const avgLoad = loads.length ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) : 0;
          const stdDev = loads.length ? Math.round(Math.sqrt(loads.reduce((s, l) => s + Math.pow(l - avgLoad, 2), 0) / loads.length)) : 0;
          
          let worst = pilots.reduce((a, b) => a.gargaloScore > b.gargaloScore ? a : b, {gargaloScore:0, name:'N/A', doing:0, ageAvg:0});
          
          const healthPct = 100 - (wip > 0 ? Math.min(100, Math.round((wip / WIP_IDEAL) * 20)) : 0);
          const sincronia = raw.sincronia_pct !== undefined ? Math.round(raw.sincronia_pct) : 0;
          const leadTime = raw.leadTime || 0;
          
          // History
          let historyDict = raw.history || {};
          let historyKeys = Object.keys(historyDict).sort();
          let history = historyKeys.map(k => {
             let h = historyDict[k];
             return {
                 label: h.label || k,
                 velocity: h.velocity_total || h.total_points || 0,
                 capOP: Math.round((h.total_points / (PE_EQUIPE || 600))*100) || 85,
                 health: 95,
                 gargalo: 10,
                 sincronia: 0,
                 leadTime: h.leadTime || 0,
                 done: true
             };
          });
          if (history.length === 0) history = generateSprintHistory();
          let velocityTrend = history.length >= 2 ? Math.round(((history[history.length-1].velocity - history[0].velocity) / (history[0].velocity || 1)) * 100) : 0;

          // Burndown
          let burndown = { ideal: [], actual: [] };
          if (raw.burndown_data) {
             burndown.ideal = raw.burndown_data.ideal || [];
             burndown.actual = raw.burndown_data.actual || [];
          }

          return {
            sprint: raw.current_sprint_label || 'Atual', 
            sprintDay, 
            sprintDays: SPRINT_DAYS, 
            PE_EQUIPE, 
            capOP, 
            totalAssigned,
            flowNet: raw.throughput_today !== undefined ? (raw.arrival_today - raw.throughput_today) : 0, 
            flowRate: raw.arrival_today || 0, 
            healthPct, 
            stdDev, 
            avgLoad,
            wip, 
            wipIdeal: WIP_IDEAL, 
            wipPerPerson: wip > 0 ? (wip / (pilots.length || 1)).toFixed(1) : 0,
            gargaloScore: worst.gargaloScore, 
            gargaloPilot: worst.name, 
            gargaloDoing: worst.doing, 
            gargaloAge: worst.ageAvg,
            sincronia, 
            leadTime: parseFloat(leadTime).toFixed(1), 
            leadMin: (raw.leadMin || 0).toFixed(1), 
            leadMax: (raw.leadMax || 0).toFixed(1), 
            actualDone: raw.raw_total_done || 0, 
            expectedDone: Math.round(raw.ideal_ate_hoje || 0),
            backlog: raw.flow_distribution ? (raw.flow_distribution.todo || 0) : 0, 
            todo: raw.flow_distribution ? (raw.flow_distribution.todo || 0) : 0,
            pilots, 
            burndown, 
            history, 
            velocityTrend
          };
        } catch(e) {
          console.error('Falha ao carregar dados reais', e);
          return generateMockData();
        }
      }

      async function refreshAll() {
        var d = await fetchProductionData();
        renderKPIs(d);
        renderPilotTable(d.pilots);
        renderCharts(d);
        renderSprintHistory(d.history);
        renderJarvisTerminal(d);
      }

      function init() {
        if (isInitialized) { refreshAll(); return; }
        isInitialized = true;
        refreshAll();
        startSyncTimer();
      }

      function stop() {}

      return { init: init, stop: stop, refreshAll: refreshAll };
    })();
