

    function switchView(viewId) {

      // Hide all views

      document.querySelectorAll('.view-section').forEach(el => {

        el.classList.remove('active');

      });



      // Remove active state from all buttons

      document.querySelectorAll('aside > div').forEach(el => {

        if (el.id && el.id.startsWith('btn-')) {

          el.classList.remove('ring-2', 'ring-white/20');

          el.classList.add('opacity-70');

        }

      });



      // Show target view

      const activeView = document.getElementById(viewId);

      if (activeView) {

        activeView.classList.add('active');

      }



      // Highlight active button

      const activeBtnId = viewId.replace('view-', 'btn-');

      const activeBtn = document.getElementById(activeBtnId);

      if (activeBtn) {

        activeBtn.classList.remove('opacity-70');

        activeBtn.classList.add('ring-2', 'ring-white/20');

      }

    }



    // Helper Functions for Disciplines
    window.isHID = function(disc) {
      if (!disc) return true;
      const d = String(disc).toUpperCase();
      return !d.includes('ELE') && !d.includes('ELÉ');
    };

    window.isELE = function(disc) {
      if (!disc) return false;
      const d = String(disc).toUpperCase();
      return d.includes('ELE') || d.includes('ELÉ');
    };


    // Setup Global de Gráficos (Dark Mode & Fontes)

    Chart.defaults.color = '#9ca3af';

    Chart.defaults.font.family = "'Inter', sans-serif";



    // Store raw issues globally for tooltips

    window.wolfIssues = [];

    window.activeWeightFilters = []; // Global for weight filters

    let complianceTrendChart = null; // V6 Trend Chart



    // =============================================

    // GUARDIÃO DE CONTRATO (ADVANCED V2) LOGIC

    // =============================================

    window.checklistDataV2 = { predictive: [], critical_ranking_v3: { "HIDROSSANITÁRIO": [], "ELÉTRICO": [] }, raw_logs: [], summary_logs: [] };

    window.activeWeightFilters = []; // For Issues (Integers)

    window.activeChecklistWeightFilters = []; // For Checklists (Decimals)



    async function fetchChecklistData() {

      try {

        console.log("📡 fetchChecklistData: Requesting...");

        const res = await fetch('/api/checklists');

        const data = await res.json();

        console.log("📡 fetchChecklistData: Response status =", data.status);

        if (data.status === "success") {

          console.log(`✅ Checklists Loaded. Summary Logs: ${data.summary_logs?.length || 0}`);

          window.checklistDataV2 = data;

          renderAdvancedChecklistUI();

          renderChecklistConsole(); 

          

          // Re-render Scoreboard and Metrics now that we have Checklist data

          renderV5Scoreboard();

          if (window.wolfIssues) renderOverviewMetrics(window.wolfIssues);

        }

      } catch (err) {

        console.warn("⚠▪ Error fetching V2 checklists:", err);

      }

    }



    function renderTripleGauges() {

      // Metric injection disabled to allow Volumetria Math (Issues/Proj) cards to persist.

      console.log("ℹ▪ renderTripleGauges: Redundant injection bypassed.");

    }



    function renderAdvancedChecklistUI() {

      renderCriticalBars();

      renderGamificationLeagues();

      renderV5Scoreboard();

      // renderTripleGauges() removed to prevent overwriting Volumetria cards.

    }



    window.toggleProjectStatus = function (projeto, maxDateStr, forceAction) {

      const key = `override_status_${projeto}`;

      localStorage.setItem(key, JSON.stringify({ status: forceAction, last_date: maxDateStr }));

      // Re-render

      renderSurvivalAlerts(window.checklistDataV2.summary_logs);

    };



    function renderSurvivalAlerts(filteredLogs) {

      const container = document.getElementById('survival-alerts-container');

      const acervoHeader = document.getElementById('acervo-wolf-header');

      const acervoContainer = document.getElementById('acervo-wolf-container');

      if (!container) return;

      if (!filteredLogs || !Array.isArray(filteredLogs)) {

        filteredLogs = (window.checklistDataV2 && window.checklistDataV2.summary_logs) || [];

      }



      const activeProjects = [...new Set(filteredLogs.map(l => l.Projeto || l.Nome_Projeto))];

      const predictive = (window.checklistDataV2 && window.checklistDataV2.predictive) || [];

      const alerts = predictive.filter(p => activeProjects.includes(p.projeto));



      if (alerts.length === 0) {

        container.innerHTML = `<div class="col-span-full py-10 text-center text-gray-500 font-mono text-[9px] uppercase tracking-[0.5em] border border-dashed border-white/5 rounded-2xl">ORÁCULO SEM ALERTAS NO PERÍODO</div>`;

        if (acervoContainer) acervoContainer.style.display = 'none';

        if (acervoHeader) acervoHeader.style.display = 'none';

        return;

      }



      let htmlActive = [];

      let htmlAcervo = [];



      alerts.forEach(p => {

        const finished = parseInt(p.finalizados.split('/')[0]);

        const total = parseInt(p.finalizados.split('/')[1]) || 3;

        const remaining = total - finished;

        const naturallyCompleted = remaining <= 0;



        // Determine max date for this project to check inactivity

        const projLogs = filteredLogs.filter(l => l.Projeto === p.projeto);

        let maxDate = 0;

        let maxDateStr = "";

        projLogs.forEach(l => {

          const d = new Date(l.Data_Referencia);

          if (!isNaN(d.getTime()) && d.getTime() > maxDate) {

            maxDate = d.getTime();

            maxDateStr = l.Data_Referencia;

          }

        });



        // Current Date

        const now = new Date().getTime();

        const daysInactive = maxDate > 0 ? (now - maxDate) / (1000 * 3600 * 24) : 0;



        let isCompletedStatus = naturallyCompleted && daysInactive > 15;



        // Check Override

        const overrideItem = localStorage.getItem(`override_status_${p.projeto}`);

        if (overrideItem) {

          try {

            const override = JSON.parse(overrideItem);

            // Verify if a newer file arrived since override

            const overrideDateMs = new Date(override.last_date).getTime();

            if (maxDate > overrideDateMs) {

              // Remove override, new data arrived

              localStorage.removeItem(`override_status_${p.projeto}`);

            } else {

              isCompletedStatus = override.status === 'Concluído';

            }

          } catch (e) { }

        }



        // Toggle Buttons Logic

        const forceAction = isCompletedStatus ? 'Ativo' : 'Concluído';

        const toggleIcon = isCompletedStatus ? '↶ REATIVAR' : '✓ FINALIZAR';

        const toggleBtn = `<button onclick="toggleProjectStatus('${p.projeto}', '${maxDateStr}', '${forceAction}')" class="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded border border-white/10 text-[7px] font-bold tracking-widest uppercase transition-colors">${toggleIcon}</button>`;



        // Compute human-readable targets

        const sumScores = p.media_atual * finished;

        const need90Total = (90 * total) - sumScores;

        const need80Total = (80 * total) - sumScores;

        const avgNeed90 = remaining > 0 ? Math.round(need90Total / remaining * 10) / 10 : 0;

        const avgNeed80 = remaining > 0 ? Math.round(need80Total / remaining * 10) / 10 : 0;



        const isCritical = !isCompletedStatus && !naturallyCompleted && (avgNeed90 > 100 || p.media_atual < 80);

        const isWarning = !isCompletedStatus && !naturallyCompleted && !isCritical && avgNeed90 > 90;



        let statusColor, statusBg, statusText, statusDot, glowColor;

        const currentScore = p.media_atual;



        if (isCompletedStatus) {

           statusColor = 'text-emerald-400';

           statusBg = 'border-emerald-500/20 bg-emerald-950/10 grayscale-[30%]';

           statusText = '📦 ACERVO WOLF';

           statusDot = 'bg-emerald-500';

           glowColor = 'rgba(16, 185, 129, 0.15)';

        } else if (currentScore >= 90) {

           statusColor = 'text-emerald-400';

           statusBg = 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10';

           statusText = '✨ DENTRO DA META';

           statusDot = 'bg-emerald-500';

           glowColor = 'rgba(16, 185, 129, 0.25)';

        } else if (currentScore >= 81) {

           statusColor = 'text-yellow-400';

           statusBg = 'border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10';

           statusText = '🔶 ATENÇÃO REQUERIDA';

           statusDot = 'bg-yellow-500';

           glowColor = 'rgba(234, 179, 8, 0.25)';

        } else {

           statusColor = 'text-red-500';

           statusBg = 'border-red-500/40 bg-red-950/20 hover:bg-red-500/10';

           statusText = isCritical ? '🚨 RISCO DE GLOSA' : '⚠️ ALTA DIVERGÊNCIA';

           statusDot = 'bg-red-500';

           glowColor = 'rgba(239, 68, 68, 0.3)';

        }



        // --- PREPARE STAGE BREAKDOWN CARD ---
        const stageBreakdownHtml = `
          <div class="bg-white/5 px-4 py-3 rounded-2xl border border-white/10 mb-4 mt-3 shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-sm relative overflow-hidden group">
            <div class="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <div class="absolute -inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
            
            <span class="text-[9px] text-gray-500 uppercase font-black tracking-[0.2em] block mb-2 opacity-70">Média Atual Estimada</span>
            <div class="flex items-center justify-between">
              <div class="flex items-baseline gap-2">
                <span class="text-3xl font-black text-white tracking-tighter drop-shadow-lg">${p.media_atual.toFixed(1)}%</span>
              </div>
              <div class="flex flex-col items-end">
                <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">${finished}/${total} ETAPAS</span>
                <div class="w-12 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                   <div class="h-full bg-white/40" style="width: ${(finished/total)*100}%"></div>
                </div>
              </div>
            </div>

            <!-- STAGE BREAKDOWN LIST -->
            <div class="mt-4 pt-3 border-t border-white/5 space-y-2">
              ${(p.stages || []).map(st => {
                const stColor = st.score >= 90 ? 'text-emerald-400' : (st.score >= 80 ? 'text-yellow-400' : 'text-red-400');
                const stName = String(st.etapa).split('_').pop().toUpperCase();
                return `
                  <div class="flex items-center justify-between text-[9px] font-bold group/st transition-all">
                    <span class="text-gray-500 uppercase tracking-widest group-hover/st:text-gray-300 transition-colors">${stName}</span>
                    <div class="flex items-center gap-2">
                      <span class="${stColor} font-mono">${parseFloat(st.score).toFixed(1)}%</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;

        const globalStage = window.currentGlobalStage || "";

        let narrative = '';

        let isolScore = null;



        if (globalStage !== "" && !isCompletedStatus && !naturallyCompleted) {

          // Isolate the stage score for current project

          const projLogs = filteredLogs.filter(l => l.Projeto === p.projeto && String(l.Etapa).toUpperCase().includes(globalStage));

          if (projLogs.length > 0) {

            // Calculate isolated average for just this stage

            let sumIso = 0;

            projLogs.forEach(l => sumIso += parseFloat(l.Score || 0));

            isolScore = sumIso / projLogs.length;



            const miss90 = (90 * 3) - isolScore;

            const req90 = miss90 / 2;



            const miss80 = (80 * 3) - isolScore;

            const req80 = miss80 / 2;



            narrative = `Nota atual da fase (${globalStage}): <strong class="text-white">${isolScore.toFixed(1)}%</strong>.<br>Abaixo o impacto dessa nota no saldo final (2 etapas restantes):<br>`;



            if (req90 > 100) narrative += `<span class="text-red-400">Meta Ouro (90%) matematicamente impossível.</span> `;

            else narrative += `Ouro: requer média <strong class="text-emerald-400">${req90.toFixed(1)}%</strong> no futuro. `;



            if (req80 > 100) narrative += `<span class="text-red-500 font-black">Meta Segurança (80%) inatingível. Glosa iminente.</span>`;

            else narrative += `Segurança: requer média <strong class="text-orange-400">${req80.toFixed(1)}%</strong> no futuro.`;

          } else {

            narrative = `Projeto sem nota lançada para a fase de ${globalStage}.`;

          }

        } else {

          // Normal Overall View Logic

          if (isCompletedStatus || naturallyCompleted) {
            narrative = stageBreakdownHtml + `Projeto finalizado com média de <strong class="text-white">${p.media_atual.toFixed(1)}%</strong>. ${p.media_atual >= 90 ? 'Meta Ouro atingida!' : p.media_atual >= 80 ? 'Dentro do patamar de segurança.' : 'Abaixo do limiar de glosa.'}`;
          } else {
            const etapaText = remaining === 1 ? 'a próxima nota precisa ser' : `as próximas ${remaining} notas precisam ter média de`;
            narrative = stageBreakdownHtml;

            if (avgNeed90 > 100) {

              narrative += `<span class="text-red-400">Meta 90% impossível.</span> `;

            } else {

              narrative += `Para <strong class="text-emerald-400">90%</strong>, ${etapaText} <strong class="text-emerald-400">${avgNeed90.toFixed(1)}%</strong>. `;

            }

            if (avgNeed80 > 100) {

              narrative += `<span class="text-red-500 font-black">Meta 80% impossível — risco de glosa iminente.</span>`;

            } else {

              narrative += `Para <strong class="text-orange-400">80%</strong>, ${etapaText} <strong class="text-orange-400">${avgNeed80.toFixed(1)}%</strong>.`;

            }

          }

        }



        const cardHtml = `

             <div class="glass-panel p-5 rounded-2xl border ${statusBg} group transition-all duration-500 overflow-hidden relative shadow-lg hover:shadow-[0_0_30px_${glowColor}]">

              <div class="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none"></div>

              <div class="absolute -right-10 -top-10 w-32 h-32 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-all duration-700"></div>

              

              <div class="flex justify-between items-start mb-4 relative z-10">

                 <div class="flex flex-col flex-1">

                    <span class="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1 leading-none">PROJETO</span>

                    <span class="text-[11px] font-black text-white tracking-wide uppercase truncate max-w-[180px]">${p.projeto}</span>

                    <span class="text-[9px] text-cyan-400 font-mono font-bold">${p.disciplina}</span>

                    <span class="text-[7px] text-gray-600 font-mono mt-1">Último doc: ${maxDateStr}</span>

                 </div>

                 <div class="flex flex-col items-end gap-2">

                   <div class="bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/10 text-center">

                      <span class="text-[7px] text-gray-500 font-mono block leading-none mb-1 uppercase tracking-widest font-black">ETAPA</span>

                      <span class="text-sm font-black text-white font-mono leading-none">${p.finalizados}</span>

                   </div>

                   ${toggleBtn}

                 </div>

              </div>



              <div class="flex items-center gap-2 mb-4 relative z-10">

                <span class="flex h-2 w-2 relative">

                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${statusDot} opacity-75"></span>

                  <span class="relative inline-flex rounded-full h-2 w-2 ${statusDot}"></span>

                </span>

                <p class="text-[9px] font-black ${statusColor} tracking-widest uppercase">${statusText}</p>

              </div>



              <div class="mt-4 border-t border-white/5 pt-4 relative z-10">

                 <p class="text-[10px] text-gray-400 leading-relaxed font-mono">${narrative}</p>

              </div>

            </div>

          `;



        if (isCompletedStatus) htmlAcervo.push(cardHtml);

        else htmlActive.push(cardHtml);

      });



      container.innerHTML = htmlActive.length ? htmlActive.join('') : `<div class="col-span-full py-10 text-center text-gray-500 font-mono text-[9px] uppercase tracking-[0.5em] border border-dashed border-white/5 rounded-2xl">NENHUM PROJETO ATIVO</div>`;



      if (acervoContainer && acervoHeader) {

        if (htmlAcervo.length > 0) {

          acervoHeader.style.display = 'flex';

          acervoContainer.style.display = 'grid';

          acervoContainer.innerHTML = htmlAcervo.join('');

        } else {

          acervoHeader.style.display = 'none';

          acervoContainer.style.display = 'none';

          acervoContainer.innerHTML = '';

        }

      }

    }



    function toggleAccordion(id) {

      const el = document.getElementById(id);

      const icon = document.getElementById('icon-' + id);

      if (el) {

        el.classList.toggle('hidden');

        if (icon) icon.classList.toggle('rotate-180');

      }

    }



    window.activeWeightFilters = [];



    function toggleRaioXWeightFilter(weight) {
      const idx = window.activeWeightFilters.indexOf(weight);
      if (idx > -1) {
        window.activeWeightFilters.splice(idx, 1);
      } else {
        window.activeWeightFilters.push(weight);
      }
      renderCriticalBars();
    }



    function renderCriticalBars() {

      const crv3 = window.checklistDataV2.critical_ranking_v3 || {};

      console.warn("DEBUG Raio-X crv3 keys:", Object.keys(crv3));

      const hDataRaw = crv3["HIDROSSANITÁRIO"] || [];

      const eDataRaw = crv3["ELÉTRICO"] || [];

      console.warn(`DEBUG Raio-X Array Sizes -> HID: ${hDataRaw.length}, ELE: ${eDataRaw.length}`);



      // Get all available weights for chips

      const allWeights = [...new Set([...hDataRaw, ...eDataRaw].map(d => parseFloat(d.peso).toFixed(1)))].sort((a, b) => b - a);

      const chipContainer = document.getElementById('console-weight-chips');

      if (chipContainer) {

        chipContainer.innerHTML = allWeights.map(w => {

          const isActive = window.activeWeightFilters.includes(w);

          const colorClass = parseFloat(w) >= 2.0 ? (isActive ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20')

            : (isActive ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20');

          return `
            <button onclick="toggleRaioXWeightFilter('${w}')" 
              class="px-2 py-0.5 rounded text-[9px] font-bold border transition-all whitespace-nowrap ${colorClass}">
              P ${w}
            </button>
          `;

        }).join('') + `

          <button onclick="window.activeWeightFilters = []; renderCriticalBars();" 

            class="px-2 py-0.5 rounded text-[9px] font-bold border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all">

            Limpar

          </button>

        `;

      }



      const applyWeightFilter = (data) => {

        if (window.activeWeightFilters.length === 0) return data;

        return data.filter(d => window.activeWeightFilters.includes(parseFloat(d.peso).toFixed(1)));

      };



      const hData = applyWeightFilter(hDataRaw);

      const eData = applyWeightFilter(eDataRaw);



      const renderList = (data, containerId, discipline) => {

        const container = document.getElementById(containerId);

        if (!container) return;



        if (data.length === 0) {

          container.innerHTML = '<p class="text-[9px] text-gray-600 font-mono italic p-4 text-center">Nenhuma divergência encontrada no filtro selecionado.</p>';

          return;

        }



        const maxVal = Math.max(...data.map(d => d.total || 0), 1);

        container.innerHTML = data.map(r => {

          const width = (r.total / maxVal) * 100;

          const pesoColor = r.peso >= 2.0 ? 'bg-red-500/20 text-red-500 border-red-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30';



          // Precisão Cirúrgica: Get the first prob_id for a quick preview

          let firstProb = null;

          try {

            const pids = r.details && r.details[0] ? r.details[0].prob_ids : null;

            if (pids && pids !== "N/A") {

              firstProb = String(pids).split(',')[0].trim();

            }

          } catch (e) { /* safe fallback */ }

          const causaText = firstProb ? `Causa: Issue #${firstProb}` : "Sem Issue Vinculada";



          return `

              <div class="group cursor-pointer" onclick="openDrillDown('${r.item}', '${discipline}')">

                 <div class="flex justify-between items-center mb-1 gap-3">

                    <div class="flex flex-col gap-0.5 truncate flex-1">

                       <div class="flex items-center gap-2">

                          <span class="px-1.5 py-0.5 rounded text-[8px] font-bold border ${pesoColor}">P ${r.peso.toFixed(1)}</span>

                          <span class="text-[10px] text-gray-400 group-hover:text-white transition-colors uppercase font-mono truncate">${r.item}</span>

                       </div>

                       <span class="text-[8px] text-cyan-500/60 font-mono tracking-tighter group-hover:text-cyan-400 transition-colors uppercase">${causaText}</span>

                    </div>

                    <span class="text-[10px] text-red-500 font-bold font-mono whitespace-nowrap">${r.total}x</span>

                 </div>

                 <div class="h-1 bg-white/5 rounded-full overflow-hidden">

                    <div class="h-full bg-gradient-to-r from-red-500/40 to-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" style="width: ${width}%"></div>

                 </div>

              </div>

            `;

        }).join('');

      };



      renderList(hData, 'critical-bars-hid', 'HIDROSSANITÁRIO');

      renderList(eData, 'critical-bars-ele', 'ELÉTRICO');

    }



    function openDrillDown(itemKey, discipline) {

      const panel = document.getElementById('drilldown-panel');

      const title = document.getElementById('drilldown-title');

      const body = document.getElementById('drilldown-body');



      const discData = window.checklistDataV2.critical_ranking_v3[discipline] || [];

      const failure = discData.find(x => x.item === itemKey);

      if (!failure) return;



      if (panel) panel.classList.remove('hidden');

      if (title) title.innerText = `Detalhamento: ${itemKey}`;



      const telemetryContainer = document.getElementById('drilldown-telemetry-container');

      if (telemetryContainer) {

          let alertTriggered = false;

          let blocksHtml = '';



          if (failure.telemetry && failure.telemetry.length > 0) {

              let previousWasFailed = false;



              failure.telemetry.forEach(t => {

                  let colorClass = 'bg-gray-500/30'; 

                  let statusStatus = t.status || '';

                  

                  if (statusStatus === 'CORRETO') {

                      colorClass = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]';

                      previousWasFailed = false;

                  } else if (statusStatus === 'INCORRETO') {

                      colorClass = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]';

                      if (previousWasFailed) alertTriggered = true;

                      previousWasFailed = true;

                  } else if (statusStatus === 'NÃO SE APLICA' || statusStatus === 'NAO SE APLICA') {

                      colorClass = 'bg-gray-600/50 border-gray-500 shadow-[0_0_8px_rgba(156,163,175,0.2)]';

                      previousWasFailed = false; 

                  } else {

                      previousWasFailed = false; 

                  }



                  const tooltipContent = `Data: ${t.data || 'N/D'} | Projeto: ${t.projeto || 'N/D'} | Etapa: ${t.etapa || 'N/D'} | Analista: ${t.analista || 'N/D'}`;

                  

                  blocksHtml += `

                      <div class="group relative inline-block w-[14px] h-[14px] rounded-[3px] border border-black/50 mr-[3px] mb-[3px] cursor-crosshair transition-all hover:scale-150 hover:z-10 ${colorClass}">

                          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[280px] bg-gray-900 text-gray-300 text-[10px] font-mono p-2.5 rounded-md border border-white/10 z-50 pointer-events-none whitespace-pre-wrap shadow-xl"><strong>Raio-X do Erro:</strong><br/>${tooltipContent}</div>

                      </div>

                  `;

              });

          } else {

              blocksHtml = '<span class="text-[9px] text-gray-600 font-mono italic">Sem dados históricos.</span>';

          }



          let alertHtml = '';

          if (alertTriggered) {

              alertHtml = `

                  <div class="inline-flex items-center gap-2 px-3 py-1.5 mt-3 bg-red-500/20 border border-red-500/50 rounded-lg animate-pulse w-fit">

                      <span class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_red]"></span>

                      <span class="text-[10px] font-black tracking-widest text-red-500 uppercase">[ ALERTA DE CADEIA: TREINAMENTO EXIGIDO ]</span>

                  </div>

              `;

          }



          telemetryContainer.innerHTML = `

            <div class="flex flex-col gap-1 p-4 bg-black/40 rounded-xl border border-white/5 shadow-inner">

                <span class="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-2">Telemetria de Recorrência (Cadeia Histórica)</span>

                <div class="flex flex-wrap items-center">

                    ${blocksHtml || '<span class="text-[9px] text-gray-600 font-mono italic">Sem dados históricos.</span>'}

                </div>

                ${alertHtml}

            </div>

          `;

      }



      if (body) {

        const globalStage = window.currentGlobalStage || "";



        // Filter details by the global stage first (if any)

        const relevantDetails = failure.details.filter(d => {

          if (!globalStage) return true;

          return String(d.etapa).toUpperCase().includes(globalStage);

        });



        if (relevantDetails.length === 0) {

          body.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-gray-500 font-mono text-[10px]">Nenhuma falha deste tipo registrada para a etapa de ${globalStage}.</td></tr>`;

        } else {

          body.innerHTML = relevantDetails.map(d => {

            const rawPids = d.prob_ids;

            const probIds = rawPids && rawPids !== "N/A" ? String(rawPids).split(',').map(id => `

                 <button class="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 px-2 py-0.5 rounded text-[8px] font-mono transition-all">

                   #${id.trim()}

                 </button>

               `).join(' ') : '<span class="opacity-30">---</span>';



            return `

               <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">

                 <td class="py-2 px-4 uppercase">${d.projeto}</td>

                 <td class="py-2 px-4 uppercase font-bold text-gray-400">${d.etapa}</td>

                 <td class="py-2 px-4 text-emerald-400 uppercase">${d.analista}</td>

                 <td class="py-2 px-4 font-mono">P ${parseFloat(d.peso).toFixed(1)}</td>

                 <td class="py-2 px-4">${probIds}</td>

               </tr>

             `;

          }).join('');

        }

      }



      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

    }



    function renderGamificationLeagues() {
      const p = window.checklistDataV2?.predictive || [];

      const mapLeague = (disc, type) => {
        let filtered = p.filter(x => x.disciplina.includes(disc));
        if (type === 'TOP') filtered.sort((a, b) => b.media_atual - a.media_atual);
        else filtered.sort((a, b) => a.media_atual - b.media_atual);
        
        return filtered.slice(0, 10).map((x, idx) => {
          const rank = idx + 1;
          const score = parseFloat(x.media_atual).toFixed(1);
          let rankStyle = "bg-white/5 text-gray-400 border-white/10";
          let icon = `<span class="text-[9px] font-bold">#${rank}</span>`;
          
          if (type === 'TOP') {
            if (rank === 1) {
              rankStyle = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 shadow-[0_0_10px_rgba(234,179,8,0.2)]";
              icon = `<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
            } else if (rank === 2) {
              rankStyle = "bg-slate-300/20 text-slate-300 border-slate-300/30";
            } else if (rank === 3) {
              rankStyle = "bg-orange-500/20 text-orange-400 border-orange-500/30";
            }
          } else {
             rankStyle = "bg-red-500/10 text-red-400 border-red-500/20";
          }

          return `
            <div class="group flex items-center justify-between p-3 rounded-2xl bg-[#07080B]/60 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all duration-300">
               <div class="flex items-center gap-4">
                  <div class="w-7 h-7 rounded-full border ${rankStyle} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110">
                    ${icon}
                  </div>
                  <div class="flex flex-col">
                    <span class="text-[10px] text-gray-200 font-bold uppercase truncate w-32 tracking-wider">${x.projeto}</span>
                    <span class="text-[8px] text-gray-500 font-mono uppercase">${disc} UNIT</span>
                  </div>
               </div>
               <div class="flex flex-col items-end">
                 <span class="text-xs font-black font-mono ${x.media_atual >= 90 ? 'text-emerald-400' : (x.media_atual >= 80 ? 'text-yellow-400' : 'text-red-400')} drop-shadow-[0_0_8px_currentColor]">${score}%</span>
                 <div class="w-12 h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                    <div class="h-full ${x.media_atual >= 90 ? 'bg-emerald-500' : (x.media_atual >= 80 ? 'bg-yellow-500' : 'bg-red-500')}" style="width: ${x.media_atual}%"></div>
                 </div>
               </div>
            </div>
          `;
        }).join('');
      };

      const sectors = [
        { id: 'rank-top-hid', disc: 'HID', type: 'TOP' },
        { id: 'rank-bottom-hid', disc: 'HID', type: 'BOTTOM' },
        { id: 'rank-top-ele', disc: 'ELE', type: 'TOP' },
        { id: 'rank-bottom-ele', disc: 'ELE', type: 'BOTTOM' }
      ];

      sectors.forEach(s => {
        const el = document.getElementById(s.id);
        if (el) el.innerHTML = mapLeague(s.disc, s.type);
      });
    }




    // Globais para o Gráfico Histórico

    window.histChartInstance = null;
    window.currentBucket = 'DAY';

    // ESTADO GLOBAL DE FILTROS (V5)
    window.selectedYear = "";
    window.selectedQuarter = "";
    window.selectedMonth = "";
    window.selectedEtapa = "";

    function applyGlobalFilter(type, val) {
      console.log(`🐺 applyGlobalFilter: ${type} = ${val}`);
      
      if (type === 'year') {
        window.selectedYear = val ? parseInt(val) : "";
        window.selectedQuarter = "";
        window.selectedMonth = "";
      } else if (type === 'quarter') {
        window.selectedQuarter = val;
        window.selectedMonth = "";
      } else if (type === 'month') {
        window.selectedMonth = val;
      } else if (type === 'etapa') {
        window.selectedEtapa = val;
      }

      // Atualizar UI dos botões (High Contrast)
      const groups = {
        'year': 'global-filter-year',
        'quarter': 'global-filter-quarter',
        'month': 'global-filter-month',
        'etapa': 'global-filter-etapa'
      };

      const container = document.getElementById(groups[type]);
      if (container) {
        const btns = container.querySelectorAll('button');
        btns.forEach(b => {
          const bVal = b.getAttribute('data-val');
          if (bVal === String(val)) {
            b.className = "px-4 py-1.5 text-[10px] font-mono font-bold rounded-lg bg-white/10 text-white transition-all";
          } else {
            b.className = "px-4 py-1.5 text-[10px] font-mono font-bold rounded-lg text-gray-500 hover:text-white transition-all";
          }
        });
      }

      updateActiveFilterTag();
      renderV5Scoreboard();
    }



    // Helper: Resilient Date Parsing for MRV formats (Bilingual pt/en)

    function parseWolfDate(rawDateStr) {

      if (!rawDateStr) return null;

      let dateObj = new Date(rawDateStr);



      // Se o construtor nativo do JS falhar, entra o parser hiper-resiliente

      if (isNaN(dateObj.getTime())) {

        const mesesStr = {

          "jan": 0, "fev": 1, "mar": 2, "abr": 3, "mai": 4, "jun": 5,

          "jul": 6, "ago": 7, "set": 8, "out": 9, "nov": 10, "dez": 11,

          "may": 4, "aug": 7, "sep": 8, "oct": 9, "dec": 11 // Fallback EN

        };

        const rawLower = rawDateStr.toLowerCase().replace(/,/g, '');



        // Formato BR: "25 de jul de 2025"

        if (rawLower.includes(' de ')) {

          let parts = rawLower.split(' de ');

          if (parts.length === 3) {

            dateObj = new Date(parseInt(parts[2]), mesesStr[parts[1].trim()], parseInt(parts[0]));

          }

        }

        // Formato EN: "jul 25 2025" or "25 jul 2025"

        else if (/[a-z]/.test(rawLower)) {

          let parts = rawLower.split(' ');

          if (parts.length >= 3) {

            let month = isNaN(parseInt(parts[0])) ? parts[0] : parts[1];

            let day = isNaN(parseInt(parts[0])) ? parts[1] : parts[0];

            let year = parts[2];



            // Tenta parear o mês

            let monthIdx = 0;

            for (const [key, val] of Object.entries(mesesStr)) {

              if (month.includes(key)) monthIdx = val;

            }

            dateObj = new Date(parseInt(year), monthIdx, parseInt(day));

          }

        }

        else {

          // Fallback final DD/MM/YYYY

          let slashParts = rawLower.split(' ')[0].split('/');

          if (slashParts.length === 3) {

            dateObj = new Date(parseInt(slashParts[2]), parseInt(slashParts[1]) - 1, parseInt(slashParts[0]));

          }

        }

      }

      return isNaN(dateObj.getTime()) ? null : dateObj;

    }



    // Helper: Formatar String de Data para o Bucket desejado

    function getBucketLabel(rawDateStr, bucket) {

      if (!rawDateStr) return "Desconhecido";



      // MRV format "28 de out de 2025" or ISO "2025-10-28"

      // Tentativa de parse (como é confuso, vamos focar no ISO que nosso backend pode limpar, ou fallback)

      // O script python deveria mandar ISO se possível, mas vamos lidar com o que temos

      let dateObj = new Date(rawDateStr);

      if (isNaN(dateObj.getTime())) {

        // Fallback para datas brasileiras do pdfplumber "28 de out de 2025"

        const mesesStr = { "jan": 0, "fev": 1, "mar": 2, "abr": 3, "mai": 4, "jun": 5, "jul": 6, "ago": 7, "set": 8, "out": 9, "nov": 10, "dez": 11 };

        let parts = rawDateStr.toLowerCase().split(' de ');

        if (parts.length === 3) {

          dateObj = new Date(parseInt(parts[2]), mesesStr[parts[1].trim()], parseInt(parts[0]));

        } else {

          return rawDateStr.slice(0, 11); // Fallback do raw

        }

      }



      let y = dateObj.getFullYear();

      let m = String(dateObj.getMonth() + 1).padStart(2, '0');

      let d = String(dateObj.getDate()).padStart(2, '0');



      if (bucket === 'DAY') return `${y}-${m}-${d}`;

      if (bucket === 'MONTH') return `${y}-${m}`;

      if (bucket === 'QUARTER') {

        let q = Math.ceil((dateObj.getMonth() + 1) / 3);

        return `${y}-Q${q}`;

      }

      if (bucket === 'WEEK') {

        // Aproximação simples de semana para agrupamento

        let start = new Date(dateObj.getFullYear(), 0, 1);

        let days = Math.floor((dateObj - start) / (24 * 60 * 60 * 1000));

        let wk = Math.ceil(days / 7);

        return `${y}-W${String(wk).padStart(2, '0')}`;

      }

      return `${y}-${m}-${d}`;

    }



    // Helper: Simple Moving Average

    function calculateSMA(data, period) {

      let sma = [];

      for (let i = 0; i < data.length; i++) {

        if (i < period - 1) {

          sma.push(null); // Não hay datos suficientes aún

          continue;

        }

        let sum = 0;

        for (let j = 0; j < period; j++) {

          sum += data[i - j];

        }

        sma.push(sum / period);

      }

      return sma;

    }



    window.updateTimeBucket = function (bucketType) {

      // Atualiza UI dos bots (DIA e SEM removidos conforme solicitação)

      ['MONTH', 'QUARTER'].forEach(b => {

        let btn = document.getElementById('btn-' + b);

        if (!btn) return;

        if (b === bucketType) {

          btn.className = "px-3 py-1 text-[9px] font-mono rounded bg-white/10 text-white transition-all";

        } else {

          btn.className = "px-3 py-1 text-[9px] font-mono rounded text-gray-400 hover:text-white transition-all";

        }

      });

      window.currentBucket = bucketType;

      renderHistoricalChart();

    };



    function renderHistoricalChart() {

      let issues = window.wolfIssues || [];

      if (issues.length === 0) return;



      const etapa = document.getElementById('select-etapa').value;



      let dateMap = {}; // { 'YYYY-MM-DD': { 'Hidro': 0, 'Eletrica': 0, raw: [] } }



      issues.forEach(issue => {

        // Apply Global Stage Filter to Chart

        if (etapa !== "") {

          const isStage = String(issue.Etapa || issue.etapa || '').toUpperCase();

          let match = false;

          if (etapa === "ESTUDO") match = isStage.includes("ESTUDO");

          else if (etapa === "MODELAGEM") match = isStage.includes("MODEL");

          else if (etapa === "DOCUMENTAÇÃO") match = isStage.includes("DOC");

          if (!match) return;

        }



        let dKey = getBucketLabel(issue.Criado_Em, window.currentBucket);



        if (!dateMap[dKey]) {

          dateMap[dKey] = { Hidro: 0, Eletrica: 0, raw: [] };

        }



        let disc = (issue.Disciplina || "").toUpperCase();

        if (disc.includes("HIDRO")) dateMap[dKey].Hidro++;

        else if (disc.includes("ELÉT") || disc.includes("ELET")) dateMap[dKey].Eletrica++;



        dateMap[dKey].raw.push(issue);

      });



      // Ordenar cronologicamente

      let labels = Object.keys(dateMap).sort();

      let hidroData = labels.map(l => dateMap[l].Hidro);

      let eletricaData = labels.map(l => dateMap[l].Eletrica);



      // Calcular Médias Móveis (Tendência)

      let smaPeriod = window.currentBucket === 'DAY' ? 7 : (window.currentBucket === 'WEEK' ? 4 : 3);

      let hidroSMA = calculateSMA(hidroData, smaPeriod);

      let eletricaSMA = calculateSMA(eletricaData, smaPeriod);



      const ctxHist = document.getElementById('historicalChart').getContext('2d');

      // Destruir instância anterior se existir para evitar sobreposição

      if (window.histChartInstance) {

        window.histChartInstance.destroy();

      }



      // Gradientes

      let gradHidro = ctxHist.createLinearGradient(0, 0, 0, 400);

      gradHidro.addColorStop(0, 'rgba(59, 130, 246, 0.6)');

      gradHidro.addColorStop(1, 'rgba(59, 130, 246, 0.05)');



      let gradEletrica = ctxHist.createLinearGradient(0, 0, 0, 400);

      gradEletrica.addColorStop(0, 'rgba(249, 115, 22, 0.6)');

      gradEletrica.addColorStop(1, 'rgba(249, 115, 22, 0.05)');



      window.histChartInstance = new Chart(ctxHist, {

        type: 'line',

        data: {

          labels: labels,

          datasets: [

            {

              label: 'Hidrossanitário (Volume)',

              data: hidroData,

              borderColor: '#3b82f6',

              backgroundColor: gradHidro,

              borderWidth: 2,

              fill: true,

              tension: 0.4,

              pointBackgroundColor: '#030307',

              pointBorderColor: '#3b82f6',

              pointRadius: 4,

              pointHoverRadius: 6,

              order: 3

            },

            {

              label: `SMA Hidro (${smaPeriod})`,

              data: hidroSMA,

              borderColor: '#60a5fa', // Lighter blue

              borderWidth: 2,

              borderDash: [5, 5],

              fill: false,

              tension: 0.4,

              pointRadius: 0, // Esconder os pontos da média

              order: 1

            },

            {

              label: 'Elétrica (Volume)',

              data: eletricaData,

              borderColor: '#f97316',

              backgroundColor: gradEletrica,

              borderWidth: 2,

              fill: true,

              tension: 0.4,

              pointBackgroundColor: '#030307',

              pointBorderColor: '#f97316',

              pointRadius: 4,

              pointHoverRadius: 6,

              order: 4

            },

            {

              label: `SMA Elétrica (${smaPeriod})`,

              data: eletricaSMA,

              borderColor: '#fb923c', // Lighter orange

              borderWidth: 2,

              borderDash: [5, 5],

              fill: false,

              tension: 0.4,

              pointRadius: 0,

              order: 2

            }

          ]

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          onClick: (evt, element) => {

            const chart = Chart.getChart(document.getElementById('historicalChart'));

            if (element.length > 0) {

              const index = element[0].index;

              const datasetIndex = element[0].datasetIndex;

              const discipline = chart.data.datasets[datasetIndex].label.includes('Hidrossanitária') ? 'HID' : 'ELE';

              filterAuditConsole(null, discipline, null);

            }

          },

          interaction: {

            mode: 'index',

            intersect: false,

          },

          scales: {

            y: {

              stacked: false, // Desabilitar stacked visual para permitir que linhas de Média Móvel flutuem livremente

              grid: { color: 'rgba(255,255,255,0.05)' },

              beginAtZero: true

            },

            x: {

              grid: { display: false }

            }

          },

          plugins: {

            legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },

            zoom: {

              pan: {

                enabled: true,

                mode: 'x'

              },

              zoom: {

                wheel: { enabled: true },

                pinch: { enabled: true },

                mode: 'x',

              }

            },

            tooltip: {

              backgroundColor: 'rgba(12, 14, 22, 0.95)',

              titleColor: '#6366f1',

              bodyColor: '#e5e7eb',

              borderColor: 'rgba(59, 130, 246, 0.3)',

              borderWidth: 1,

              padding: 12,

              callbacks: {

                afterBody: function (context) {

                  let dateLabel = context[0].label;

                  if (!dateMap[dateLabel]) return "";

                  let pointIssues = dateMap[dateLabel].raw;



                  let autores = [...new Set(pointIssues.map(i => i.Criado_Por))].filter(Boolean);

                  let exemplo = pointIssues[0]?.Descricao || "S/ Descrição";

                  let truncEx = exemplo.length > 50 ? exemplo.substring(0, 50) + "..." : exemplo;



                  return `\n🕵▪ Analistas: ${autores.join(', ') || 'N/A'}\n▪ Exemplo: "${truncEx}"`;

                }

              }

            }

          }

        }

      });

    }

    // --- GLOBAL FILTER ENGINE ---

    window.applyGlobalFilter = function(type, value) {

      console.log(`🎯 Global Filter: ${type} = ${value}`);

      

      // Update Shadow Legacy Selectors (for compatibility with existing logic)

      const el = document.getElementById(`select-${type}`);

      if (el) el.value = value;



      // Handle logic dependencies

      if (type === 'year') {

         // Reset other filters to TODOS when year changes

         applyGlobalFilter('quarter', '');

         applyGlobalFilter('month', '');

      } else if (type === 'quarter') {

         applyGlobalFilter('month', '');

      }



      // Update UI Buttons (Segmented Look)

      const containerId = `global-filter-${type}`;

      const container = document.getElementById(containerId);

      if (container) {

        const buttons = container.querySelectorAll('button');

        buttons.forEach(btn => {

          if (btn.getAttribute('data-val') === String(value)) {

            btn.className = "px-3 py-1.5 text-[10px] font-mono font-bold rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-all shadow-[0_0_15px_rgba(59,130,246,0.2)]";

          } else {

            btn.className = "px-3 py-1.5 text-[10px] font-mono font-bold rounded-lg text-gray-500 hover:text-white transition-all";

          }

        });

      }



      // Update the "Visão Ativa" Tag

      updateActiveFilterTag();



      // Trigger re-renders

      renderV5Scoreboard();

      // Overview metrics will be triggered by V5Scoreboard internal calls usually, 

      // but let's be explicit if needed.

      if (window.wolfIssues) renderOverviewMetrics(window.wolfIssues);

      renderHistoricalChart();

    };



    function updateActiveFilterTag() {
      const year = window.selectedYear;
      const quarter = window.selectedQuarter;
      const month = window.selectedMonth;
      const etapa = window.selectedEtapa;

      

      const monNames = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

      let text = year ? `ANO ${year}` : 'VISÃO GERAL';
      const yearText = year ? year : 'GERAL';

      if (month) text = `${monNames[month].toUpperCase()} / ${yearText}`;

      else if (quarter) text = `${quarter}º TRIMESTRE / ${yearText}`;



      if (etapa) text += ` (${etapa})`;



      const tag = document.getElementById('active-filter-tag');

      if (tag) tag.innerText = text;

    }



    // =============================================

    // SCOREBOARD V5: CYBER-NEON & FINANCIAL LIGHTS

    // =============================================

    function updateScoreboardYear() {

      const year = document.getElementById('select-year').value;

      const qSelect = document.getElementById('select-quarter');

      const mSelect = document.getElementById('select-month');



      qSelect.value = "";

      mSelect.value = "";



      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

      mSelect.innerHTML = '<option value="">TODOS MESES</option>';

      months.forEach((m, i) => {

        const opt = document.createElement('option');

        opt.value = i + 1;

        opt.textContent = m;

        mSelect.appendChild(opt);

      });



      renderV5Scoreboard();

    }



    function updateScoreboardQuarter() {

      document.getElementById('select-month').value = "";

      renderV5Scoreboard();

    }



    function updateScoreboardMonth() {

      renderV5Scoreboard();

    }



    function syncTemporalFilters(type, value) {

      if (type === 'year') {

        document.getElementById('select-year').value = value;

        document.getElementById('select-year-top').value = value;

        updateScoreboardYear();

      } else if (type === 'quarter') {

        document.getElementById('select-quarter').value = value;

        document.getElementById('select-quarter-top').value = value;

        updateScoreboardQuarter();

      } else if (type === 'month') {

        document.getElementById('select-month').value = value;

        document.getElementById('select-month-top').value = value;

        updateScoreboardMonth();

      }

    }



    function updateScoreboardStage() {

      renderV5Scoreboard();

    }



    function getFinancialStatus(score) {
      if (score >= 90) return { color: '#00FF99', label: 'ELITE', glow: 'neon-glow-cyan', pulse: false };
      if (score >= 81) return { color: '#FFCC00', label: 'ALERTA', glow: 'neon-glow-orange', pulse: false };
      return { color: '#FF003C', label: 'CRÍTICO', glow: 'neon-glow-red', pulse: true };
    }



    function renderV5Scoreboard() {
      if (!window.checklistDataV2) {
        console.warn("⚠▪ Scoreboard: window.checklistDataV2 not yet loaded.");
        return;
      }
      const logs = window.checklistDataV2.summary_logs || [];
      const failLogs = window.checklistDataV2.raw_logs || [];

      // Get States from Global window
      const year = window.selectedYear;
      const quarter = window.selectedQuarter;
      const month = window.selectedMonth;
      const etapa = window.selectedEtapa;



      // Track if a specific stage was filtered for titles

      window.currentGlobalStage = etapa;



      // Filter Summary Logs by Date AND global Stage

      const filtered = logs.filter(l => {

        const d = parseWolfDate(l.Data_Referencia);

        if (!d) return false; 



        // 1. Check Date Match

        let matchDate = (!year || isNaN(year) || d.getFullYear() === year);

        if (quarter) {
          const q = Math.ceil((d.getMonth() + 1) / 3);
          matchDate = matchDate && q === parseInt(quarter);
        }

        if (month) {

          matchDate = matchDate && (d.getMonth() + 1) === parseInt(month);

        }



        // 2. Check Stage Match (if not "TODAS")

        let matchStage = true;

        if (etapa !== "") {

          const logEtapa = String(l.Etapa || '').toUpperCase();

          if (etapa === "ESTUDO") matchStage = logEtapa.includes("ESTUDO");

          else if (etapa === "MODELAGEM") matchStage = logEtapa.includes("MODEL");

          else if (etapa === "DOCUMENTAÇÃO") matchStage = logEtapa.includes("DOC");

          else matchStage = false;

        }



        return matchDate && matchStage;

      });



      const calcAvgScore = (data) => {

        if (!data || data.length === 0) return 0;

        let sum = 0;

        data.forEach(l => sum += parseFloat(l.Score || 0));

        return sum / data.length;

      };



      const filteredHID = filtered.filter(l => window.isHID(l.Disciplina));

      const filteredELE = filtered.filter(l => window.isELE(l.Disciplina));



      const scoreHid = calcAvgScore(filteredHID);

      const scoreEle = calcAvgScore(filteredELE);

      

      // --- PADRÃO WOLF: MÉDIA GERAL (50/50) ---

      // Se uma disciplina não tem dados, assume-se 0% para manter o peso.

      const scoreGeral = (scoreHid + scoreEle) / 2;



      console.log(`📊 Result: HID=${scoreHid}(n=${filteredHID.length}), ELE=${scoreEle}(n=${filteredELE.length}) => GERAL=${scoreGeral}`);



      // Update Header & Sidebar

      const headerScore = document.getElementById('header-checklist-avg');

      if (headerScore) headerScore.innerText = `${Math.round(scoreGeral)}%`;



      const headerHid = document.getElementById('header-checklist-hid');

      if (headerHid) headerHid.innerText = `${Math.round(scoreHid)}%`;



      const headerEle = document.getElementById('header-checklist-ele');

      if (headerEle) headerEle.innerText = `${Math.round(scoreEle)}%`;



      const sideHid = document.getElementById('sidebar-checklist-hid');

      if (sideHid) sideHid.innerText = `${Math.round(scoreHid)}%`;



      const sideEle = document.getElementById('sidebar-checklist-ele');

      if (sideEle) sideEle.innerText = `${Math.round(scoreEle)}%`;



      if (filtered.length === 0 && logs.length > 0) {

        console.warn("⚠▪ Scoreboard: Logs available but all filtered out for year", year);

      }



      // Update Values

      const setVal = (id, val) => {

        const el = document.getElementById(id);

        if (el) el.innerText = val;

      };



      setVal('val-master', Math.round(scoreGeral) + '%');

      setVal('val-sat-hid', Math.round(scoreHid) + '%');

      setVal('val-sat-ele', Math.round(scoreEle) + '%');



      // Render Gauges

      renderV5Gauge('gauge-master', scoreGeral, 64, 10);

      renderV5Gauge('gauge-sat-hid', scoreHid, 45, 8);

      renderV5Gauge('gauge-sat-ele', scoreEle, 45, 8);



      // Update Integrity & Title

      updateIntegrityCounters(filtered);

      updateScoreboardTitle(year, quarter, month);



      // Render Conformity Trend (Line Chart) - MUST obey the Stage filter

      const logsFilteredByStage = logs.filter(l => {

        if (etapa === "") return true;

        const logEtapa = String(l.Etapa).toUpperCase();

        if (etapa === "ESTUDO") return logEtapa.includes("ESTUDO");

        if (etapa === "MODELAGEM") return logEtapa.includes("MODELAGEM");

        if (etapa === "DOCUMENTAÇÃO") return logEtapa.includes("DOC");

        return false;

      });

      renderComplianceTrendChart(logsFilteredByStage, year, quarter, month);



      // Update Survival Alerts

      renderSurvivalAlerts(filtered);



      // --- VOLUMETRIA SYNC: Atualiza cards de topo sempre que os filtros mudarem ---

      if (window.wolfIssues) {

        renderOverviewMetrics(window.wolfIssues);

      }

    }







    // Global chart view mode

    window.chartViewMode = 'trimestre';



    function setChartView(mode) {

      window.chartViewMode = mode;

      // Update button styles

      const btnTri = document.getElementById('btn-chart-tri');

      const btnMes = document.getElementById('btn-chart-mes');

      if (btnTri && btnMes) {

        if (mode === 'trimestre') {

          btnTri.className = 'px-3 py-1 text-[8px] font-bold font-mono uppercase tracking-widest transition-all bg-cyan-500/20 text-cyan-300 border-r border-white/10';

          btnMes.className = 'px-3 py-1 text-[8px] font-bold font-mono uppercase tracking-widest transition-all text-gray-500 hover:text-gray-300';

        } else {

          btnTri.className = 'px-3 py-1 text-[8px] font-bold font-mono uppercase tracking-widest transition-all text-gray-500 hover:text-gray-300 border-r border-white/10';

          btnMes.className = 'px-3 py-1 text-[8px] font-bold font-mono uppercase tracking-widest transition-all bg-cyan-500/20 text-cyan-300';

        }

      }

      // Re-render chart

      const logs = window.checklistDataV2.summary_logs || [];

      const year = parseInt(document.getElementById('select-year').value);

      const quarter = document.getElementById('select-quarter').value;

      const month = document.getElementById('select-month').value;

      renderComplianceTrendChart(logs, year, quarter, month);

    }



    function renderComplianceTrendChart(logs, year, quarter, month) {

      const ctx = document.getElementById('complianceTrendChart');

      if (!ctx) return;



      if (complianceTrendChart) complianceTrendChart.destroy();



      // (isHID and isELE now use global scope definitions)



      const calcAvg = (data) => {

        if (!data || data.length === 0) return null;

        let sum = 0;

        data.forEach(l => sum += parseFloat(l.Score || 0));

        return Math.round((sum / data.length) * 10) / 10;

      };



      // Build time axis labels and data points for all 3 lines

      let labels = [];

      let dpGeral = [], dpHID = [], dpELE = [];

      let rawGeral = [], rawHID = [], rawELE = [];



      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

      const viewMode = window.chartViewMode || 'trimestre';



      if (viewMode === 'trimestre') {

        // Quarter View: Show T1-T4

        const yearLabel = year ? year : 'GERAL';
        labels = [`T1/${yearLabel}`, `T2/${yearLabel}`, `T3/${yearLabel}`, `T4/${yearLabel}`];

        for (let q = 1; q <= 4; q++) {
          const periodLogs = logs.filter(l => {
            const d = parseWolfDate(l.Data_Referencia);
            const isYearMatch = (!year || isNaN(year) || d.getFullYear() === year);
            return d && isYearMatch && Math.ceil((d.getMonth() + 1) / 3) === q;
          });

          const hVal = calcAvg(periodLogs.filter(l => window.isHID(l.Disciplina)));

          const eVal = calcAvg(periodLogs.filter(l => window.isELE(l.Disciplina)));

          

          // Se não houver nenhum dado no período, mantém como null para não quebrar o gráfico

          if (hVal === null && eVal === null) {

              dpGeral.push(null);

          } else {

              dpGeral.push(((hVal || 0) + (eVal || 0)) / 2);

          }

          dpHID.push(hVal);

          dpELE.push(eVal);

          

          rawGeral.push(periodLogs);

          rawHID.push(periodLogs.filter(l => window.isHID(l.Disciplina)));

          rawELE.push(periodLogs.filter(l => window.isELE(l.Disciplina)));

        }

      } else {

        // Quarter or Month View: Show monthly

        const yearLabel = year ? year : 'GERAL';
        labels = monthNames.map(m => `${m}/${yearLabel}`);

        for (let m = 0; m < 12; m++) {
          const periodLogs = logs.filter(l => {
            const d = parseWolfDate(l.Data_Referencia);
            const isYearMatch = (!year || isNaN(year) || d.getFullYear() === year);
            return d && isYearMatch && d.getMonth() === m;
          });

          const hVal = calcAvg(periodLogs.filter(l => window.isHID(l.Disciplina)));

          const eVal = calcAvg(periodLogs.filter(l => window.isELE(l.Disciplina)));

          

          if (hVal === null && eVal === null) {

              dpGeral.push(null);

          } else {

              dpGeral.push(((hVal || 0) + (eVal || 0)) / 2);

          }

          dpHID.push(hVal);

          dpELE.push(eVal);



          rawGeral.push(periodLogs);

          rawHID.push(periodLogs.filter(l => window.isHID(l.Disciplina)));

          rawELE.push(periodLogs.filter(l => window.isELE(l.Disciplina)));

        }

      }



      complianceTrendChart = new Chart(ctx, {

        type: 'line',

        data: {

          labels: labels,

          datasets: [

            {

              label: 'Meta Ouro (90%)',

              data: labels.map(() => 90),

              borderColor: 'rgba(16, 185, 129, 0.5)',

              borderWidth: 1.5,

              borderDash: [8, 4],

              pointRadius: 0,

              fill: false,

              tension: 0,

              order: 3

            },

            {

              label: 'Risco Glosa (80%)',

              data: labels.map(() => 80),

              borderColor: 'rgba(239, 68, 68, 0.5)',

              borderWidth: 1.5,

              borderDash: [8, 4],

              pointRadius: 0,

              fill: false,

              tension: 0,

              order: 3

            },

            {

              label: 'Média Geral',

              data: dpGeral,

              borderColor: '#FFFFFF',

              borderWidth: 3,

              fill: false,

              tension: 0.35,

              pointBackgroundColor: '#FFFFFF',

              pointBorderColor: '#040814',

              pointBorderWidth: 2,

              pointRadius: 5,

              pointHoverRadius: 8,

              spanGaps: true,

              order: 0

            },

            {

              label: 'Hidrossanitário',

              data: dpHID,

              borderColor: '#60A5FA',

              borderWidth: 2,

              fill: false,

              tension: 0.35,

              pointBackgroundColor: '#60A5FA',

              pointBorderColor: '#040814',

              pointBorderWidth: 2,

              pointRadius: 4,

              pointHoverRadius: 7,

              spanGaps: true,

              order: 1

            },

            {

              label: 'Elétrico',

              data: dpELE,

              borderColor: '#34D399',

              borderWidth: 2,

              fill: false,

              tension: 0.35,

              pointBackgroundColor: '#34D399',

              pointBorderColor: '#040814',

              pointBorderWidth: 2,

              pointRadius: 4,

              pointHoverRadius: 7,

              spanGaps: true,

              order: 2

            }

          ]

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          layout: { padding: { top: 10, bottom: 5, left: 5, right: 10 } },

          scales: {

            y: {

              min: 0,

              max: 100,

              grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },

              ticks: {

                font: { size: 9, family: 'monospace', weight: 'bold' },

                color: 'rgba(255,255,255,0.25)',

                stepSize: 10,

                padding: 8,

                callback: v => v + '%'

              }

            },

            x: {

              grid: { display: false },

              ticks: {

                font: { size: 9, family: 'monospace', weight: 'bold' },

                color: 'rgba(255,255,255,0.25)',

                padding: 8

              }

            }

          },

          plugins: {

            legend: { display: false },

            tooltip: {

              backgroundColor: 'rgba(4, 8, 20, 0.95)',

              titleFont: { size: 10, weight: 'bold', family: 'Inter' },

              bodyFont: { size: 11, family: 'monospace', weight: 'bold' },

              padding: 12,

              borderColor: 'rgba(0, 245, 255, 0.3)',

              borderWidth: 1,

              cornerRadius: 10,

              callbacks: {

                label: (context) => {

                  if (context.dataset.label === 'Meta Ouro (90%)' || context.dataset.label === 'Risco Glosa (80%)') return null;

                  return ` ${context.dataset.label}: ${context.raw}%`;

                },

                afterBody: (context) => {

                  const idx = context[0].dataIndex;

                  const dsLabel = context[0].dataset.label;

                  if (dsLabel === 'Meta Ouro (90%)' || dsLabel === 'Risco Glosa (80%)') return null;



                  let refArray = [];

                  if (dsLabel === 'Média Geral') refArray = rawGeral[idx];

                  else if (dsLabel === 'Hidrossanitário') refArray = rawHID[idx];

                  else if (dsLabel === 'Elétrico') refArray = rawELE[idx];



                  if (!refArray || refArray.length === 0) return '\n⚠▪ Nenhum checklist no período.';



                  let lines = ['\nDETALHES DA COMPOSIÇÃO:'];

                  // Sort by score ascending to show worse projects first

                  refArray.sort((a, b) => parseFloat(a.Score) - parseFloat(b.Score));



                  // Group multiple occurrences (distinct stages) or just list them all

                  refArray.forEach(l => {

                    let pName = String(l.Projeto).replace('_MRV', '');

                    let indicator = parseFloat(l.Score) >= 90 ? '✅' : (parseFloat(l.Score) >= 80 ? '⚠▪' : '🚨');

                    lines.push(` ${indicator} [${l.Etapa}] ${pName}: ${parseFloat(l.Score).toFixed(1)}%`);

                  });

                  return lines.join('\n');

                }

              }

            }

          }

        }

      });

    }



    function renderV5Gauge(containerId, score, radius, stroke) {

      const container = document.getElementById(containerId);

      if (!container) return;



      const status = getFinancialStatus(score);

      const dashArray = 2 * Math.PI * radius;

      const dashOffset = dashArray - (dashArray * (score || 0) / 100);

      const isMaster = containerId === 'gauge-master';



      container.innerHTML = `

            <svg viewBox="0 0 140 140" class="w-full h-full transform -rotate-90 ${status.pulse ? 'animate-pulse-fast' : ''}">

              <defs>

                <filter id="neon-glow-${containerId}" x="-50%" y="-50%" width="200%" height="200%">

                  <feGaussianBlur stdDeviation="${isMaster ? '2.5' : '2'}" result="glow" />

                  <feMerge>

                    <feMergeNode in="glow" />

                    <feMergeNode in="SourceGraphic" />

                  </feMerge>

                </filter>

                <linearGradient id="grad-${containerId}" x1="0%" y1="0%" x2="100%" y2="100%">

                  <stop offset="0%" style="stop-color:${status.color};stop-opacity:1" />

                  <stop offset="100%" style="stop-color:${status.color};stop-opacity:0.4" />

                </linearGradient>

              </defs>

              <!-- Background Ring -->

              <circle cx="70" cy="70" r="${radius}" 

                      stroke="#0A101D" stroke-width="${stroke + 2}" fill="transparent" />

              <!-- Glow Layer -->

              <circle cx="70" cy="70" r="${radius}" 

                      stroke="${status.color}" stroke-width="${stroke + 1}" fill="transparent" 

                      stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" 

                      filter="url(#neon-glow-${containerId})" opacity="0.4" class="gauge-ring-v5" />

              <!-- Active Power Ring -->

              <circle cx="70" cy="70" r="${radius}" 

                      stroke="url(#grad-${containerId})" stroke-width="${stroke}" fill="transparent" 

                      stroke-linecap="round"

                      stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" 

                      class="gauge-ring-v5" style="transition: stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1);" />

            </svg>

        `;

    }



    function updateIntegrityCounters(filteredLogs) {

      const discMap = { "HID": "hid", "ELE": "ele" };



      ["HID", "ELE"].forEach(discKey => {

        const discLogs = filteredLogs.filter(l => String(l.Disciplina).toUpperCase().includes(discKey));

        const projects = [...new Set(discLogs.map(l => l.Projeto))];



        // Count how many projects have 3 stages in this specific filtered period

        let finishedCount = 0;

        projects.forEach(p => {

          const pLogs = discLogs.filter(l => l.Projeto === p);

          if (pLogs.length >= 3) finishedCount++;

        });



        const totalCount = projects.length || 0;

        const el = document.getElementById(`integrity-${discMap[discKey]}`);

        if (el) el.innerText = `${finishedCount}/${totalCount}`;

      });

    }



    function updateScoreboardTitle(year, quarter, month) {

      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

      let periodText = "";

      if (month) periodText = `${months[month - 1]} de `;

      else if (quarter) periodText = `${quarter}º TRI de `;

      else periodText = "ANO DE ";



      const title = `AUDIT SCORE (CHECKLIST) - ${periodText}${year}`;

      const subBottom = document.getElementById('score-subtitle');

      if (subBottom) subBottom.innerText = title;

    }

    function isELE(disc) {
      if (!disc) return false;
      const d = String(disc).toUpperCase();
      return d.includes('ELE') || d.includes('ELÉ');
    }

    function renderCharts(issues)

    {

      window.wolfIssues = issues; // CRITICAL: Restore for Volumetria Chart

      localStorage.setItem('wolf_issues_cache', JSON.stringify(issues));

      

      // 1. Overview Metrics (Top Auditor Cards)

      renderOverviewMetrics(issues);



      // 2. Main Charts

      renderHistoricalChart();

      renderV5Scoreboard(); // Use V5 Logic for bottom section



      // ======= PRODUÇÃO: Alimentar Console de Auditoria com dados REAIS =======

      console.log("🐺 renderCharts: Transforming issues to console data...");
      auditConsoleData = transformAPItoConsole(issues);
      console.log(`🐺 renderCharts: auditConsoleData populated with ${auditConsoleData.length} items.`);
      populateProjectFilter(auditConsoleData);
      renderAuditConsole();



      // 3. Chart Comparativo (Performance Analítica - Cyber-BI Solid Stack)

      const stages = ["01_ESTUDO", "02_MODELAGEM", "03_DOCUMENTACAO"];

      const stageLabels = {

        "01_ESTUDO": "Estudo",

        "02_MODELAGEM": "Modelagem",

        "03_DOCUMENTACAO": "Documentação"

      };



      let groupedData = {}; // { 'PROJETO • DISC': { 'STAGE': count } }



      issues.forEach(is => {

        let proj = (is.Nome_Projeto || "Desconhecido").replace('_MRV', '').replace(/_/g, ' ');

        let rawDisc = (is.Disciplina || "HIDROSSANITÁRIO").toUpperCase();

        // REGRA NÍVEL VERMELHO: Binário ELE ou HID. Nunca OUT.

        let discSuffix = (rawDisc.includes("ELÉT") || rawDisc.includes("ELET") || rawDisc.includes("ELETRIC")) ? "ELE" : "HID";



        let rowLabel = `${proj} • ${discSuffix}`;

        let stage = is.Etapa || "01_ESTUDO"; // Fallback



        if (!groupedData[rowLabel]) {

          groupedData[rowLabel] = { "01_ESTUDO": 0, "02_MODELAGEM": 0, "03_DOCUMENTACAO": 0 };

        }

        if (groupedData[rowLabel].hasOwnProperty(stage)) {

          groupedData[rowLabel][stage]++;

        } else {

          // Map dynamic stages if they come with different names

          if (stage.includes("ESTUDO")) groupedData[rowLabel]["01_ESTUDO"]++;

          else if (stage.includes("MODEL")) groupedData[rowLabel]["02_MODELAGEM"]++;

          else groupedData[rowLabel]["03_DOCUMENTACAO"]++;

        }

      });



      let rowLabels = Object.keys(groupedData).sort();



      // Reactive Interaction Data

      const chartClickHandler = (evt, element, chart) => {

        if (element.length > 0) {

          const index = element[0].index;

          const datasetIndex = element[0].datasetIndex;

          const label = chart.data.labels[index];

          const datasetLabel = chart.data.datasets[datasetIndex].label;



          // Extract PROJECT from label (e.g., "VILA RUBI • HID" -> "VILA RUBI")

          const project = label.split(' • ')[0];

          const discipline = label.split(' • ')[1];



          filterAuditConsole(project, discipline, datasetLabel);

        }

      };



      const ctxComp = document.getElementById('comparativeChart').getContext('2d');



      // Cyber-BI Continuous Gradients

      let gradEstudo = ctxComp.createLinearGradient(0, 0, 300, 0);

      gradEstudo.addColorStop(0, 'rgba(255, 0, 60, 0.4)'); // Neon Red faded

      gradEstudo.addColorStop(1, 'rgba(255, 0, 60, 0.9)'); // Neon Red solid



      let gradModel = ctxComp.createLinearGradient(0, 0, 300, 0);

      gradModel.addColorStop(0, 'rgba(59, 130, 246, 0.4)'); // Blue faded

      gradModel.addColorStop(1, 'rgba(59, 130, 246, 0.9)'); // Blue solid



      let gradDoc = ctxComp.createLinearGradient(0, 0, 300, 0);

      gradDoc.addColorStop(0, 'rgba(168, 85, 247, 0.4)'); // Purple faded

      gradDoc.addColorStop(1, 'rgba(168, 85, 247, 0.9)'); // Purple solid



      const stageColors = {

        "01_ESTUDO": gradEstudo,

        "02_MODELAGEM": gradModel,

        "03_DOCUMENTACAO": gradDoc

      };



      let datasetsComp = stages.map(stage => {

        return {

          label: stageLabels[stage],

          data: rowLabels.map(row => groupedData[row][stage]),

          backgroundColor: stageColors[stage],

          borderWidth: 0, // Solid dense bar, no borders inside

          borderRadius: 4, // Slight dense roundness

          borderSkipped: false,

          barThickness: 16, // Thicker solid blocks

          categoryPercentage: 0.9,

          barPercentage: 1.0

        };

      });



      // Inline Plugin for Glowing End Values

      const drawCyberValuesPlugin = {

        id: 'drawCyberValues',

        afterDatasetsDraw(chart, args, pluginOptions) {

          const { ctx, data, scales: { x, y } } = chart;

          ctx.save();

          ctx.font = 'bold 11px font-mono'; // "tipografia luminosa de painel de controle"

          ctx.textAlign = 'left';

          ctx.textBaseline = 'middle';



          data.labels.forEach((label, i) => {

            let total = 0;

            data.datasets.forEach(dataset => {

              total += dataset.data[i];

            });



            if (total > 0) {

              const xPos = x.getPixelForValue(total);

              const meta = chart.getDatasetMeta(0); // Use the Y position of the first dataset

              if (meta.data[i]) {

                const yPos = meta.data[i].y;



                // Draw glow text

                ctx.fillStyle = '#ffffff';

                ctx.shadowColor = 'rgba(255, 255, 255, 0.8)'; // Neutral white glow

                ctx.shadowBlur = 8;

                ctx.fillText(total, xPos + 8, yPos);

                // Double layer for intensity

                ctx.shadowBlur = 2;

                ctx.fillText(total, xPos + 8, yPos);

              }

            }

          });

          ctx.restore();

        }

      };



      new Chart(ctxComp, {

        type: 'bar',

        data: {

          labels: rowLabels,

          datasets: datasetsComp

        },

        options: {

          indexAxis: 'y', // Horizontal

          responsive: true,

          maintainAspectRatio: false,

          onClick: (evt, element) => chartClickHandler(evt, element, Chart.getChart(ctxComp.canvas)),

          layout: {

            padding: { right: 35 } // Space for the text

          },

          scales: {

            x: {

              stacked: true,

              grid: { display: false },

              ticks: { display: false } // Hide X numbers to keep the Cyber-BI look clean

            },

            y: {

              stacked: true,

              grid: {

                color: 'rgba(255,255,255,0.03)', // Very subtle demarcation per project

                drawBorder: false

              },

              ticks: {

                color: '#ffffff', // Clean white bright typography

                font: { size: 10, weight: 'bold', family: 'Manrope' }

              }

            }

          },

          plugins: {

            legend: {

              position: 'top',

              labels: {

                color: '#cbd5e1',

                usePointStyle: true,

                boxWidth: 8,

                font: { size: 10, family: 'Manrope' }

              }

            },

            tooltip: {

              backgroundColor: 'rgba(10, 15, 30, 0.95)',

              titleColor: '#ffffff',

              borderColor: 'rgba(255, 255, 255, 0.2)',

              borderWidth: 1,

              callbacks: {

                label: function (context) {

                  return ` ${context.dataset.label}: ${context.raw} ocorrências`;

                }

              }

            }

          }

        },

        plugins: [drawCyberValuesPlugin]

      });

    }



    // =================================================================

    // WOLF NLP ENGINE (Frontend) — Rigor Score Calculator

    // Ported from oompa_loompa.py calculate_rigor_score()

    // Regra: Desempate SEMPRE favorece o Peso Maior.

    // =================================================================

    function calculateRigorScore(descricao, ragMatch = true) {

      const text = (descricao || '').toLowerCase();

      let score = 1; // Default: Otimização



      // 🔵 PESO 1 (Sugestão / Otimização)

      if (['sugestão', 'possibilidade de otimizar', 'poderíamos alterar'].some(x => text.includes(x))) score = Math.max(score, 1);



      // 🟢 PESO 3 (Clash / Interferência)

      if (['cruzamento', 'atravessando viga', 'interferência física', 'tubulação passando por', 'bate no pilar', 'clash'].some(x => text.includes(x))) score = Math.max(score, 3);



      // 🟡 PESO 5 (Erro de Parâmetro/Incompletude)

      if (['tag', 'tabela', 'falta informação', 'parâmetro vazio', 'não preenchido', 'nomenclatura', 'falta indicar'].some(x => text.includes(x))) score = Math.max(score, 5);



      // 🟡 PESO 6 (Erro de Coordenadas/Federação)

      if (['coordenadas compartilhadas', 'origem', 'deslocado', 'link', 'sobreposição geral', 'ponto base'].some(x => text.includes(x))) score = Math.max(score, 6);



      // 🟠 PESO 8 (Padronização MRV)

      if (['manual', 'padrão mrv', 'briefing', 'guia de projetos', 'não segue o padrão'].some(x => text.includes(x))) score = Math.max(score, 8);



      // 🔴 PESO 9 (Divergência de Aprovativo)

      if (['projeto aprovativo', 'aprovado na prefeitura', 'projeto legal', 'diverge do aprovado'].some(x => text.includes(x))) score = Math.max(score, 9);



      // 🔴 PESO 10 (Norma ABNT e Legislação) — CRÍTICO

      if (['nbr', 'norma', 'bombeiros', 'prefeitura', 'segurança', 'risco estrutural', 'dimensionamento crítico'].some(x => text.includes(x))) score = Math.max(score, 10);



      // 🛡▪ REBAIXAMENTO RAG: Se for Peso 8 ou 10 e NÃO houver match na base de conhecimento

      if ((score >= 8) && !ragMatch) {

        console.warn("⚠▪ Rebaixamento RAG acionado: Issue sem base normativa detectada.");

        score = 3; // Rebaixado para Interferência/Clash

      }



      return score;

    }



    // =================================================================

    // AUDIT CONSOLE — Dados Reais (Pipeline de Produção)

    // =================================================================

    let activeConsoleFilter = null;

    window.auditConsoleData = []; // Populado pela API em tempo real



    /**

     * Transforma os registros brutos da API no formato de console.

     * Preserva 100% do texto original da Descrição (Fidelidade Absoluta).

     */

    function transformAPItoConsole(apiRecords) {
      console.log("🐺 transformAPItoConsole: Processing records...", apiRecords?.length);
      if (!apiRecords || apiRecords.length === 0) return [];

      return apiRecords.map(record => {

        // Disciplina: simplificar para ELE/HID/OUT

        const rawDisc = (record.Disciplina || '').toUpperCase();

        // REGRA NÍVEL VERMELHO: Binário ELE ou HID. Fallback para HID se indefinido.

        let disc = 'HID';

        if (rawDisc.includes('ELÉT') || rawDisc.includes('ELET') || rawDisc.includes('ELETRIC')) disc = 'ELE';

        else disc = 'HID'; 



        // Etapa: mapear para labels legíveis

        const rawStage = (record.Etapa || '').toUpperCase();

        let stage = 'Estudo';

        if (rawStage.includes('MODEL')) stage = 'Modelagem';

        else if (rawStage.includes('DOCUM')) stage = 'Documentação';



        // Projeto: limpar sufixo _MRV e underscores

        const project = (record.Nome_Projeto || 'Desconhecido').replace('_MRV', '').replace(/_/g, ' ');



        // Analista: extrair primeiro nome + sobrenome do "Criado por"

        let analyst = record.Criado_Por || 'Não Identificado';

        // Remove o "(MRV & CO)" ou similar

        analyst = analyst.replace(/\s*\(.*?\)\s*/g, '').trim();



        return {

          id: String(record.ID_Issue || ''),

          project: project,

          desc: record.Descricao || '', // TEXTO BRUTO 100% FIEL AO PDF

          disc: disc,

          stage: stage,

          analyst: analyst,

          peso: calculateRigorScore(record.Descricao || '', record.rag_match !== false),

          criado_em: record.Criado_Em || '',

          rag: {

            match: record.rag_match !== false,

            source: record.rag_source || 'Nenhuma base encontrada',

            text: record.rag_text || 'O sistema não localizou uma diretriz normativa ou padrão MRV que sustente este apontamento como Crítico.',

            level: record.rag_level || 'SUGESTÃO'

          },

          raw_project: record.Nome_Projeto // Original for API calls

        };

      });

    }



    /**

     * Popula o dropdown de projetos dinamicamente a partir dos dados reais.

     */

    function populateProjectFilter(data) {

      const select = document.getElementById('filter-project');

      if (!select) return;

      const projects = [...new Set(data.map(d => d.project))].sort();

      // Limpa opções existentes (exceto a primeira "TODOS")

      select.innerHTML = '<option value="">TODOS PROJETOS</option>';

      projects.forEach(p => {

        const opt = document.createElement('option');

        opt.value = p;

        opt.textContent = p;

        select.appendChild(opt);

      });

    }



    // AI Helper: Toggle Audit Consoles

    window.toggleConsole = function(targetId, btnId) {

      const content = document.getElementById(targetId);

      const btn = document.getElementById(btnId);

      if (content.classList.contains('hidden')) {

        content.classList.remove('hidden');

        btn.innerHTML = `

          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">

            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />

          </svg>

          MINIMIZAR

        `;

      } else {

        content.classList.add('hidden');

        btn.innerHTML = `

          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">

            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />

          </svg>

          EXPANDIR

        `;

      }

    };



    function renderAuditConsole(filterStr = "") {
      const tbody = document.getElementById('audit-console-body');
      console.log("🐺 renderAuditConsole: Called. Data size:", auditConsoleData?.length);
      if (!tbody) { console.error("🐺 renderAuditConsole: tbody NOT FOUND!"); return; }



      const baseLogs = [...auditConsoleData];



      // 1. Sort by Peso (Descending) - CORE REQUIREMENT

      baseLogs.sort((a, b) => b.peso - a.peso);



      // 2. Resolve Current Filters

      const searchVal = document.getElementById('console-search')?.value.toLowerCase() || "";

      const projVal = document.getElementById('filter-project')?.value || "";

      const stageVal = document.getElementById('filter-stage')?.value || "";

      const discVal = activeConsoleFilter?.discipline || "";



      const allWeights = [10, 9, 8, 6, 5, 3, 0];



      const consoleChips = document.getElementById('console-weight-chips');

      if (consoleChips) {

        consoleChips.innerHTML = allWeights.map(w => {

          const isActive = window.activeWeightFilters.includes(String(w));

          const colorClass = isActive ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20';

          return `<button onclick="toggleAuditWeightFilter('${w}')" class="px-3 py-1 rounded-full text-[9px] font-bold border transition-all whitespace-nowrap ${colorClass}">P ${w}</button>`;

        }).join('') + `<button onclick="window.activeWeightFilters = []; renderAuditConsole();" class="px-3 py-1 rounded-full text-[9px] font-bold border border-white/10 text-gray-500 hover:text-white transition-all">LIMPAR</button>`;

      }



      const getWeights = window.activeWeightFilters;

      const data = baseLogs.filter(item => {

        let m = true;

        if (activeConsoleFilter) {

          if (activeConsoleFilter.project) m = m && item.project === activeConsoleFilter.project;

          if (activeConsoleFilter.discipline) m = m && item.disc.includes(activeConsoleFilter.discipline);

          if (activeConsoleFilter.stage) m = m && item.stage.includes(activeConsoleFilter.stage);

        }



        if (projVal) m = m && item.project === projVal;

        if (stageVal) m = m && item.stage.includes(stageVal);

        const currentDisc = document.getElementById('filter-discipline')?.value || discVal;

        if (currentDisc) m = m && item.disc === currentDisc;



        if (getWeights.length > 0) {

          const itemWeightStr = String(Math.floor(item.peso || 0));

          m = m && getWeights.includes(itemWeightStr);

        }



        if (searchVal) {

          m = m && (

            item.desc.toLowerCase().includes(searchVal) ||

            item.id.includes(searchVal) ||

            item.project.toLowerCase().includes(searchVal)

          );

        }

        return m;

      });



      // 3. Update UI Indicators

      const hasFilter = activeConsoleFilter || projVal || stageVal || searchVal;

      if (hasFilter) {

        document.getElementById('filter-indicator').classList.remove('hidden');

        document.getElementById('filter-indicator').classList.add('flex');

        let textValue = `Filtros: ${projVal || activeConsoleFilter?.project || ''} ${document.getElementById('filter-discipline')?.value || discVal || ''} ${stageVal || activeConsoleFilter?.stage || ''}`.trim();

        document.getElementById('filter-text').innerText = textValue || "Filtro Ativo";

      } else {

        document.getElementById('filter-indicator').classList.add('hidden');

      }



      const getPesoColor = (p) => {

        if (p >= 9) return "bg-red-500/20 text-red-400 border-red-500/30";

        if (p >= 6) return "bg-orange-500/20 text-orange-400 border-orange-500/30";

        if (p >= 3) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";

        return "bg-blue-500/20 text-blue-400 border-blue-500/30";

      };



      tbody.innerHTML = data.map(item => {

        const urgencyClass = item.peso >= 9 ? 'row-urgency-high' : (item.peso >= 8 ? 'row-urgency-medium' : '');

        

        // Tag de Hierarquia (NotebookLM Style)

        let levelTag = "";

        if (item.rag.level === "NORMA") levelTag = `<span class="px-2 py-0.5 rounded text-[8px] font-black bg-red-500/20 text-red-400 border border-red-500/30 mr-2 shadow-[0_0_8px_rgba(239,68,68,0.2)]">NORMA</span>`;

        else if (item.rag.level === "PADRÃO") levelTag = `<span class="px-2 py-0.5 rounded text-[8px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 mr-2">PADRÃO</span>`;

        else levelTag = `<span class="px-2 py-0.5 rounded text-[8px] font-bold bg-white/5 text-gray-400 border border-white/10 mr-2">SUGESTÃO</span>`;



        return `

            <tr onclick="openRAGPanel('${item.id}')" class="group hover:bg-white/5 transition-all border-b border-white/5 cursor-pointer ${urgencyClass}">

                <td class="px-6 py-4">

                   <div class="flex items-center gap-2">

                       <span class="px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${getPesoColor(item.peso)}">

                          PESO ${item.peso}

                       </span>

                       ${item.peso >= 9 ? '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>' : ''}

                   </div>

                </td>

                <td class="px-6 py-4">

                   <div class="flex flex-col">

                      <div class="flex items-center mb-1">

                         ${levelTag}

                         <span class="text-xs font-bold text-white">#${item.id}</span>

                      </div>

                      <span class="text-[9px] text-gray-500 font-mono uppercase tracking-tighter">${item.project}</span>

                   </div>

                </td>

                <td class="px-6 py-4">

                   <p class="text-[11px] text-gray-400 leading-relaxed group-hover:text-gray-200 transition-colors whitespace-normal break-words">

                      ${item.desc}

                   </p>

                </td>

                <td class="px-6 py-4 font-mono">

                   <div class="flex items-center gap-2">

                      <span class="text-[10px] text-gray-300 font-bold">${item.disc}</span>

                      <span class="text-[10px] text-gray-500">/</span>

                      <span class="text-[10px] text-gray-400">${item.stage}</span>

                   </div>

                </td>

                <td class="px-6 py-4">

                   <span class="text-[10px] text-gray-500 font-mono">${item.analyst}</span>

                </td>

                <td class="px-6 py-4 text-center">

                   <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                      <button class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white px-2 py-1 rounded text-[9px] font-bold border border-emerald-600/40 transition-all">Aceitar</button>

                      <button class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-2 py-1 rounded text-[9px] font-bold border border-red-600/40 transition-all">Contestar</button>

                   </div>

                </td>

            </tr>

        `;

      }).join('');
    }

    function renderOverviewMetrics(issues) {
      if (!issues || issues.length === 0) {
        console.warn("⚠ renderOverviewMetrics: No issues provided yet.");
        return;
      }

      // UI Selection for global filters (synced with the header)
      const year = window.selectedYear || "";
      const quarter = window.selectedQuarter || "";
      const month = window.selectedMonth || "";
      const etapa = window.selectedEtapa || "";

      const monthsNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      let periodLabel = year || "Histórico";
      if (month) periodLabel = `${monthsNames[month - 1]}/${year}`;
      else if (quarter) periodLabel = `Q${quarter} ${year}`;
      if (etapa) periodLabel += ` (${etapa})`;

      const setUIWithLabel = (id, val, periodId, pLabel) => {
         const el = document.getElementById(id);
         if (el) el.innerText = val;
         const pEl = document.getElementById(periodId);
         if (pEl) pEl.innerText = pLabel;
      };

      // 1. Filter Issues
      const filteredIssues = issues.filter(is => {
        // Use the ROBUST parser defined upstream (around line 4545)
        const d = parseWolfDate(is.Criado_Em || is.Data_Abertura);
        
        // If we want a specific year but date is unparseable, exclude
        if (year && !d) return false;
        // If no year filter, include all
        if (!year) return true;

        let matchDate = (d.getFullYear() === parseInt(year));
        if (quarter) {
          const q = Math.ceil((d.getMonth() + 1) / 3);
          matchDate = matchDate && q === parseInt(quarter);
        }
        if (month) {
          matchDate = matchDate && (d.getMonth() + 1) === parseInt(month);
        }

        let stageText = String(is.Etapa || '').toUpperCase();
        let matchStage = true;
        if (etapa === "ESTUDO") matchStage = stageText.includes("ESTUDO");
        else if (etapa === "MODELAGEM") matchStage = stageText.includes("MODEL");
        else if (etapa === "DOCUMENTAÇÃO") matchStage = stageText.includes("DOC");

        return matchDate && matchStage;
      });

      // 2. Filter Checklists
      const logs = (window.checklistDataV2 && window.checklistDataV2.summary_logs) || [];
      const filteredLogs = logs.filter(l => {
        const d = parseWolfDate(l.Data_Referencia);
        if (year && !d) return false;
        if (!year) return true;

        let matchDate = (d.getFullYear() === parseInt(year));
        if (quarter) {
          const q = Math.ceil((d.getMonth() + 1) / 3);
          matchDate = matchDate && q === parseInt(quarter);
        }
        if (month) {
          matchDate = matchDate && (d.getMonth() + 1) === parseInt(month);
        }

        let stageText = String(l.Etapa || '').toUpperCase();
        let matchStage = true;
        if (etapa === "ESTUDO") matchStage = stageText.includes("ESTUDO");
        else if (etapa === "MODELAGEM") matchStage = stageText.includes("MODEL");
        else if (etapa === "DOCUMENTAÇÃO") matchStage = stageText.includes("DOC");

        return matchDate && matchStage;
      });

      const getReportCount = (data) => {
        if (!data || data.length === 0) return 1;
        const unique = new Set(data.map(d => {
            const p = d.Nome_Projeto || d.project_name || d.project || 'UNK';
            const e = d.Etapa || d.etapa || 'UNK';
            const disc = d.Disciplina || 'UNK';
            const dt = d.Criado_Em || d.Data_Abertura || d.Data_Referencia || 'UNK';
            return `${p}|${e}|${disc}|${dt}`;
        }));
        return unique.size || 1;
      };

      // isHID and isELE are already defined globally

      const hidIssues = filteredIssues.filter(is => isHID(is.Disciplina)).length;
      const eleIssues = filteredIssues.filter(is => isELE(is.Disciplina)).length;
      const totalIssuesCount = filteredIssues.length;

      const hidReports = getReportCount(filteredIssues.filter(is => isHID(is.Disciplina)));
      const eleReports = getReportCount(filteredIssues.filter(is => isELE(is.Disciplina)));
      const totalReports = getReportCount(filteredIssues);

      const mHid = (hidIssues / hidReports);
      const mEle = (eleIssues / eleReports);
      const mGeral = (totalIssuesCount / totalReports);

      setUIWithLabel('m-geral', mGeral.toFixed(1), 'm-geral-period', `Período: ${periodLabel}`);
      setUIWithLabel('m-ele', mEle.toFixed(1), 'm-ele-period', `Volume Bruto Elétrica (${periodLabel})`);
      setUIWithLabel('m-hid', mHid.toFixed(1), 'm-hid-period', `Volume Bruto Hidrossanitário (${periodLabel})`);

      if (document.getElementById('header-issues-avg')) document.getElementById('header-issues-avg').innerText = mGeral.toFixed(1);
      if (document.getElementById('header-issues-period')) document.getElementById('header-issues-period').innerText = `(${periodLabel})`;
      if (document.getElementById('sidebar-issues-avg')) document.getElementById('sidebar-issues-avg').innerText = mGeral.toFixed(1);

      // Calculate Checklist Averages
      let avgChecklistGeral = '--%';
      let avgChecklistHid = '--%';
      let avgChecklistEle = '--%';
      if (filteredLogs && filteredLogs.length > 0) {
        const sumGeral = filteredLogs.reduce((acc, curr) => acc + (parseFloat(curr.Score) || 0), 0);
        avgChecklistGeral = (sumGeral / filteredLogs.length).toFixed(1) + '%';
        
        const hidLogs = filteredLogs.filter(l => isHID(l.Disciplina));
        if (hidLogs.length > 0) {
          const sumHid = hidLogs.reduce((acc, curr) => acc + (parseFloat(curr.Score) || 0), 0);
          avgChecklistHid = (sumHid / hidLogs.length).toFixed(1) + '%';
        }
        
        const eleLogs = filteredLogs.filter(l => isELE(l.Disciplina));
        if (eleLogs.length > 0) {
          const sumEle = eleLogs.reduce((acc, curr) => acc + (parseFloat(curr.Score) || 0), 0);
          avgChecklistEle = (sumEle / eleLogs.length).toFixed(1) + '%';
        }
      }
      
      if (document.getElementById('header-checklist-avg')) document.getElementById('header-checklist-avg').innerText = avgChecklistGeral;
      if (document.getElementById('header-checklist-hid')) document.getElementById('header-checklist-hid').innerText = avgChecklistHid;
      if (document.getElementById('header-checklist-ele')) document.getElementById('header-checklist-ele').innerText = avgChecklistEle;

      // Benchmarking logic
      const histGeralReports = getReportCount(issues);
      const histGeralAvg = issues.length / histGeralReports;
      const diff = ((mGeral - histGeralAvg) / (histGeralAvg || 1)) * 100;
      const benchCont = document.getElementById('m-geral-bench-container');
      if (benchCont) {
        const isUp = diff > 0;
        const color = isUp ? 'text-rose-400' : 'text-emerald-400';
        const arrow = isUp ? '↑' : '↓';
        benchCont.className = `text-xs ${color} flex items-center gap-1 font-mono`;
        benchCont.innerHTML = `<span>${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
      }
    }






    function toggleAuditWeightFilter(weight) {
      const w = String(weight);
      const idx = window.activeWeightFilters.indexOf(w);
      if (idx === -1) {
        window.activeWeightFilters.push(w);
      } else {
        window.activeWeightFilters.splice(idx, 1);
      }
      renderAuditConsole();
    }



    function toggleChecklistWeightFilter(weight) {

      const w = parseFloat(weight).toFixed(1);

      const idx = window.activeChecklistWeightFilters.indexOf(w);

      if (idx === -1) {

        window.activeChecklistWeightFilters.push(w);

      } else {

        window.activeChecklistWeightFilters.splice(idx, 1);

      }

      renderChecklistConsole();

    }



    function renderChecklistConsole() {

      const body = document.getElementById('checklist-console-body');

      if (!body) return;



      const hData = window.checklistDataV2?.critical_ranking_v3?.["HIDROSSANITÁRIO"] || [];

      const eData = window.checklistDataV2?.critical_ranking_v3?.["ELÉTRICO"] || [];

      const allData = [...hData, ...eData];



      // Dynamic Weights

      const weights = [...new Set(allData.map(d => parseFloat(d.peso).toFixed(1)))].sort((a, b) => b - a);

      const chips = document.getElementById('checklist-weight-chips');

      if (chips) {

        chips.innerHTML = weights.map(w => {

          const isActive = window.activeChecklistWeightFilters.includes(w);

          const colorClass = isActive ? 'bg-cyan-500 text-white border-cyan-400' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20';

          return `<button onclick="toggleChecklistWeightFilter('${w}')" class="px-3 py-1 rounded-full text-[9px] font-bold border transition-all whitespace-nowrap ${colorClass}">P ${w}</button>`;

        }).join('') + `<button onclick="window.activeChecklistWeightFilters = []; renderChecklistConsole();" class="px-3 py-1 rounded-full text-[9px] font-bold border border-white/10 text-gray-500 hover:text-white transition-all">LIMPAR</button>`;

      }



      // Filter Logic

      const proj = document.getElementById('filter-checklist-project')?.value;

      const stage = document.getElementById('filter-checklist-stage')?.value;

      const disc = document.getElementById('filter-checklist-discipline')?.value;



      const filtered = allData.filter(item => {

        let m = true;

        if (proj) m = m && item.projeto === proj;

        if (stage) m = m && item.etapa === stage;

        if (disc) {

          if (disc === 'HID') m = m && item.disc.includes('HID');

          if (disc === 'ELE') m = m && item.disc.includes('ELE');

        }

        if (window.activeChecklistWeightFilters.length > 0) {

          m = m && window.activeChecklistWeightFilters.includes(parseFloat(item.peso).toFixed(1));

        }

        return m;

      });



      body.innerHTML = filtered.map(item => `

        <tr class="hover:bg-white/5 transition-colors">
          <td class="px-6 py-4 font-mono font-bold">
            <span class="px-2 py-1 rounded ${parseFloat(item.peso || 0) >= 2.0 ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'text-cyan-400'}">
              P ${parseFloat(item.peso || 0).toFixed(1)}
            </span>
          </td>
          <td class="px-6 py-4">
            <div class="text-[10px] font-black uppercase text-white">${item.produto || 'MASTER'}</div>
            <div class="text-[9px] text-gray-500 font-mono">${item.projeto || 'N/A'}</div>
          </td>
          <td class="px-6 py-4 text-[10px] uppercase">${item.item || 'ITEM SEM DESCRIÇÃO'}</td>
          <td class="px-6 py-4">
            <span class="px-2 py-0.5 rounded text-[9px] font-bold border ${String(item.disc || item.disciplina || '').includes('HID') ? 'bg-blue-500/20 text-blue-400 border-blue-400/30' : (String(item.disc || item.disciplina || '').includes('ELE') ? 'bg-orange-950/40 text-orange-400 border-orange-500/30' : 'bg-white/5 text-gray-500 border-white/5')}">
              ${item.disc || item.disciplina || 'HID'}
            </span>
            <div class="text-[8px] text-gray-500 mt-1">${item.etapa || 'GERAL'}</div>
          </td>

          <td class="px-6 py-4 text-[9px] font-mono text-gray-500">${new Date().toLocaleDateString('pt-BR')}</td>

        </tr>

      `).join('');



      // Populate Project Filter if empty

      const projSelect = document.getElementById('filter-checklist-project');

      if (projSelect && projSelect.options.length <= 1) {

        const projs = [...new Set(allData.map(d => d.projeto))].sort();

        projs.forEach(p => {

          const opt = document.createElement('option');

          opt.value = p;

          opt.textContent = p;

          projSelect.appendChild(opt);

        });

      }

    }



    function applyTacticalFilters() {

      renderAuditConsole();

    }



    function searchInConsole(val) { applyTacticalFilters(); }



    function filterAuditConsole(project, discipline, stage) {

      activeConsoleFilter = { project, discipline, stage: stage ? stage.replace('01_', '').replace('02_', '').replace('03_', '') : null };



      // Update dropdowns to match chart selection if possible

      if (document.getElementById('filter-project')) document.getElementById('filter-project').value = project || "";

      if (document.getElementById('filter-discipline')) document.getElementById('filter-discipline').value = discipline || "";

      if (document.getElementById('filter-stage')) {

        const cleanStage = stage ? (stage.includes("Estudo") ? "Estudo" : (stage.includes("Model") ? "Modelagem" : "Documentação")) : "";

        document.getElementById('filter-stage').value = cleanStage;

      }



      renderAuditConsole();

    }



    function clearRigorFilters() {

      activeConsoleFilter = null;

      if (document.getElementById('filter-project')) document.getElementById('filter-project').value = "";

      if (document.getElementById('filter-stage')) document.getElementById('filter-stage').value = "";

      if (document.getElementById('filter-discipline')) document.getElementById('filter-discipline').value = "";

      if (document.getElementById('console-search')) document.getElementById('console-search').value = "";

      renderAuditConsole();

    }



    function exportAuditResumo() {

      alert("Relatório Tático de Auditoria gerado com sucesso. Verifique o download.");

    }



    // Inicializar Motor ao carregar

    // High-Fidelity switchView

    function switchView(viewId) {

      // Toggle view sections

      const views = document.querySelectorAll('.view-section');

      views.forEach(v => {

        v.classList.remove('active');

        v.style.display = 'none';

      });



      const activeView = document.getElementById(viewId);

      if (activeView) {

        activeView.classList.add('active');

        activeView.style.display = 'flex';

      }



      // Toggle buttons visibility

      const btnIds = ['btn-chat', 'btn-auditor', 'btn-producao', 'btn-marketing', 'btn-financas'];

      btnIds.forEach(id => {

        const btn = document.getElementById(id);

        if (btn) {

          btn.classList.remove('bg-white/10', 'border-white/30', 'opacity-100');

          btn.classList.add('opacity-70');

        }

      });



      const idMap = {

        'view-chat': 'btn-chat',

        'view-auditor': 'btn-auditor',

        'view-producao': 'btn-producao',

        'view-marketing': 'btn-marketing',

        'view-financas': 'btn-financas'

      };

      const currentBtn = document.getElementById(idMap[viewId]);

      if (currentBtn) {

        currentBtn.classList.add('bg-white/10', 'border-white/30', 'opacity-100');

        currentBtn.classList.remove('opacity-70');

      }

      // 🏭 PRODUCTION DIRECTOR HOOK: Init when navigating to Produção
      if (viewId === 'view-producao' && window.ProductionDirector) {
        window.ProductionDirector.init();
      }

    }



    // =============================================

    // RADAR DE COMPORTAMENTO (ANALISTAS)

    // =============================================

    const analystProfiles = {

      'ana-clara': {

        name: 'Ana Clara',

        rigor: 8.7,

        riskLevel: 'Alto Risco',

        profile: 'Criteriosa Extrema / Normativa',

        disc: { ele: 85, hid: 15 },

        radar: { Norma: 10, Aprovativo: 9, Padronização: 6, Coordenadas: 4, Parâmetros: 7, Clashes: 3 },

        color: 'rgba(239, 68, 68, 0.5)',

        borderColor: '#ef4444',

        checklist: [

          '⚡ Revise SPDA: anéis, descidas e aterramento conforme NBR 5419.',

          '📋 Cruze modelo BIM com Projeto Aprovativo: sem divergências legais.',

          '🔌 Verifique dimensionamento de quadros e circuitos (NBR 5410).',

          '▪ Confirme cotas de eletrodutos em relação ao projeto legal aprovado.',

          '🚨 Atenção redobrada em áreas comuns e guaritas.'

        ]

      },

      'bruna-dias': {

        name: 'Bruna Dias',

        rigor: 4.2,

        riskLevel: 'Risco Médio',

        profile: 'Otimizadora de Processos / Padronização',

        disc: { hid: 90, ele: 10 },

        radar: { Norma: 4, Aprovativo: 3, Padronização: 8, Coordenadas: 5, Parâmetros: 6, Clashes: 4 },

        color: 'rgba(249, 115, 22, 0.4)',

        borderColor: '#f97316',

        checklist: [

          '🚿 Confirme inclinação mínima de redes de esgoto (NBR 8160).',

          '▪ Padronize nomenclatura de links e famílias Revit (Manual MRV).',

          '🔧 Verifique profundidade de caixas de passagem.',

          '🗺▪ Otimize traçado de tubulação para reduzir conexões.',

          '✅ Siga padrão MRV de identificação de prumadas.'

        ]

      },

      'paulo': {

        name: 'Paulo',

        rigor: 3.1,

        riskLevel: 'Risco Operacional',

        profile: 'Inspetor Visual',

        disc: { hid: 55, ele: 45 },

        radar: { Norma: 3, Aprovativo: 2, Padronização: 4, Coordenadas: 7, Parâmetros: 3, Clashes: 9 },

        color: 'rgba(16, 185, 129, 0.4)',

        borderColor: '#10b981',

        checklist: [

          '▪ Execute Clash Detection completo antes de enviar.',

          '▪ Verifique cruzamentos hidráulica x estrutura.',

          '🧱 Confira distâncias mínimas entre tubulações e vigas.',

          '🔄 Revise interferências em shafts e passagens de laje.',

          '📊 Gere relatório visual de clashes resolvidos.'

        ]

      }

    };



    const radarChartInstances = {};



    function toggleAnalystCard(id) {

      const content = document.getElementById(`expand-${id}`);

      const chevron = document.getElementById(`chevron-${id}`);

      const isOpen = content.classList.contains('open');



      // Close all cards first

      document.querySelectorAll('.analyst-expanded-content').forEach(el => el.classList.remove('open'));

      document.querySelectorAll('[id^="chevron-"]').forEach(el => el.style.transform = 'rotate(0deg)');



      if (!isOpen) {

        content.classList.add('open');

        chevron.style.transform = 'rotate(180deg)';

        // Render radar chart after expansion animation starts

        setTimeout(() => renderAnalystRadar(id), 100);

      }

    }



    function renderAnalystRadar(id) {

      const profile = analystProfiles[id];

      if (!profile) return;



      const canvasId = `radar-${id}`;

      const canvas = document.getElementById(canvasId);

      if (!canvas) return;



      // Destroy previous instance if exists

      if (radarChartInstances[id]) {

        radarChartInstances[id].destroy();

      }



      const ctx = canvas.getContext('2d');

      const labels = Object.keys(profile.radar);

      const data = Object.values(profile.radar);



      radarChartInstances[id] = new Chart(ctx, {

        type: 'radar',

        data: {

          labels: labels,

          datasets: [{

            label: profile.name,

            data: data,

            backgroundColor: profile.color,

            borderColor: profile.borderColor,

            borderWidth: 2,

            pointBackgroundColor: profile.borderColor,

            pointBorderColor: '#fff',

            pointBorderWidth: 1,

            pointRadius: 4,

            pointHoverRadius: 6

          }]

        },

        options: {

          responsive: true,

          maintainAspectRatio: true,

          scales: {

            r: {

              beginAtZero: true,

              max: 10,

              ticks: {

                stepSize: 2,

                color: 'rgba(255,255,255,0.3)',

                backdropColor: 'transparent',

                font: { size: 9 }

              },

              grid: {

                color: 'rgba(6, 182, 212, 0.1)',

                lineWidth: 1

              },

              angleLines: {

                color: 'rgba(6, 182, 212, 0.15)',

                lineWidth: 1

              },

              pointLabels: {

                color: '#cbd5e1',

                font: { size: 10, weight: 'bold', family: 'Manrope' }

              }

            }

          },

          plugins: {

            legend: { display: false },

            tooltip: {

              backgroundColor: 'rgba(10, 15, 30, 0.95)',

              titleColor: '#06b6d4',

              borderColor: 'rgba(6, 182, 212, 0.3)',

              borderWidth: 1,

              callbacks: {

                label: (ctx) => ` ${ctx.label}: ${ctx.raw}/10`

              }

            }

          }

        }

      });

    }



    function generateDefenseBriefing() {

      // ... (existing code)

      const projFilter = document.getElementById('filter-project')?.value || 'TODOS';

      let briefing = `▪ WOLF FACTORY — BRIEFING DE DEFESA PREDITIVA\n`;

      briefing += `▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪\n`;

      briefing += `📋 Projeto: ${projFilter || 'TODOS OS PROJETOS'}\n`;

      briefing += `📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n\n`;



      Object.entries(analystProfiles).forEach(([id, profile]) => {

        const riskIcon = profile.rigor >= 7 ? '🔴' : (profile.rigor >= 4 ? '🟡' : '🟢');

        briefing += `${riskIcon} ${profile.name.toUpperCase()} (Score ${profile.rigor} — ${profile.riskLevel})\n`;

        briefing += `   Perfil: ${profile.profile}\n`;

        briefing += `   Checklist de Defesa:\n`;

        profile.checklist.forEach(item => {

          briefing += `   ${item}\n`;

        });

        briefing += `\n`;

      });



      briefing += `▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪\n`;

      briefing += `🛡▪ Gerado automaticamente por Wolf Factory HQ`;



      // Show in a styled modal-like alert

      const modal = document.createElement('div');

      modal.id = 'defense-briefing-modal';

      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);';

      modal.innerHTML = `

        <div style="max-width:700px;width:90%;max-height:85vh;overflow-y:auto;background:linear-gradient(135deg,#0B1426 0%,#030307 100%);border:1px solid rgba(6,182,212,0.3);border-radius:16px;padding:32px;box-shadow:0 0 60px rgba(6,182,212,0.15);">

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">

            <h2 style="color:#06b6d4;font-size:14px;font-weight:bold;text-transform:uppercase;letter-spacing:3px;font-family:Manrope,sans-serif;">🛡▪ Briefing de Defesa Preditiva</h2>

            <button onclick="document.getElementById('defense-briefing-modal').remove()" style="color:#9ca3af;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-family:monospace;">✕ FECHAR</button>

          </div>

          <pre style="color:#e2e8f0;font-size:12px;line-height:1.8;white-space:pre-wrap;font-family:'Inter',monospace;">${briefing}</pre>

          <div style="margin-top:20px;display:flex;gap:12px;">

            <button onclick="navigator.clipboard.writeText(document.querySelector('#defense-briefing-modal pre').textContent);this.textContent='✅ COPIADO!'" style="flex:1;background:linear-gradient(135deg,rgba(6,182,212,0.3),rgba(59,130,246,0.3));border:1px solid rgba(6,182,212,0.4);color:#06b6d4;padding:10px;border-radius:10px;cursor:pointer;font-size:11px;font-weight:bold;letter-spacing:1px;font-family:Manrope,sans-serif;">📋 COPIAR BRIEFING</button>

          </div>

        </div>

      `;

      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    }



    // =============================================

    // RAG SLIDE-OVER CONTROL

    // =============================================

    function openRAGPanel(issueId) {

      const issue = auditConsoleData.find(i => i.id === issueId);

      if (!issue) return;



      const overlay = document.getElementById('rag-overlay');

      const panel = document.getElementById('rag-panel');



      // Update Panel Content

      document.getElementById('rag-source-title').innerText = issue.rag.source;

      document.getElementById('rag-source-text').innerText = `"${issue.rag.text}"`;



      const weightLock = document.getElementById('rag-weight-lock');

      if (issue.rag.match) {

        weightLock.className = "flex items-center gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5";

        weightLock.innerHTML = `

          <div class="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">

            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>

          </div>

          <div>

            <p class="text-xs font-bold text-white uppercase tracking-wider">Peso Validado pela IA</p>

            <p class="text-[10px] text-emerald-400/80 font-mono">Correspondência Semântica Real Encontrada</p>

          </div>

        `;

      } else {

        weightLock.className = "flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5";

        weightLock.innerHTML = `

          <div class="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">

            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>

          </div>

          <div>

            <p class="text-xs font-bold text-white uppercase tracking-wider">REBAIXAMENTO DE PESO</p>

            <p class="text-[10px] text-red-400/80 font-mono italic">Alucinação Detectada: Sem base normativa.</p>

          </div>

        `;

      }



      // Update Rigor Label

      const levelEl = document.getElementById('rag-level-badge');

      if (levelEl) {

        levelEl.innerText = issue.rag.level;

        if (issue.rag.level === "NORMA") levelEl.className = "px-2 py-1 rounded bg-red-500/20 text-red-500 text-[9px] font-black border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]";

        else if (issue.rag.level === "PADRÃO") levelEl.className = "px-2 py-1 rounded bg-blue-500/20 text-blue-500 text-[9px] font-black border border-blue-500/40";

        else levelEl.className = "px-2 py-1 rounded bg-white/5 text-gray-400 text-[9px] font-bold border border-white/10";

      }



      // Store current issue for contestation

      panel.dataset.currentId = issueId;



      // Show

      overlay.classList.add('open');

      panel.classList.add('open');

    }



    function closeRAGPanel() {

      document.getElementById('rag-overlay').classList.remove('open');

      document.getElementById('rag-panel').classList.remove('open');

    }



    function consultarOraculo() {

      const panel = document.getElementById('rag-panel');

      const issueId = panel.dataset.currentId;

      const issue = auditConsoleData.find(i => i.id === issueId);

      if (!issue) return;



      const url = `/api/export-dossier?id=${issueId}&project=${encodeURIComponent(issue.raw_project)}`;

      window.open(url, '_blank');

      

      const btn = document.getElementById('btn-oraculo');

      const original = btn.innerHTML;

      btn.innerHTML = `<svg class="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> PREPARANDO DOSSIÊ...`;

      setTimeout(() => { btn.innerHTML = original; }, 3000);

    }



    function gerarContestacao() {

      const panel = document.getElementById('rag-panel');

      const issueId = panel.dataset.currentId;

      const issue = auditConsoleData.find(i => i.id === issueId);

      if (!issue) return;



      const template = `Prezado analista, sua solicitação diverge da padronização oficial. Conforme o ${issue.rag.source}, a diretriz correta é: "${issue.rag.text}". Seguir sua sugestão geraria não-conformidade. Solicitamos revisão do apontamento.`;



      navigator.clipboard.writeText(template).then(() => {

        const btn = event.currentTarget || document.querySelector('button[onclick="gerarContestacao()"]');

        const originalText = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg> GERAR CONTESTAÇÃO`;

        btn.innerHTML = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> CONTESTAÇÃO COPIADA!`;

        btn.classList.replace('bg-indigo-600', 'bg-emerald-600');

        setTimeout(() => {

          btn.innerHTML = originalText;

          btn.classList.replace('bg-emerald-600', 'bg-indigo-600');

        }, 3000);

      });

    }


    // --- GLOBAL DATA STATE ---
    window.WOLF_API_BASE = "";
    window.wolfIssues = [];
    window.checklistDataV2 = { predictive: [], critical_ranking_v3: {}, summary_logs: [], raw_logs: [] };
    window.activeWeightFilters = [];
    window.activeChecklistWeightFilters = [];
    
    // --- API BRIDGE ---
    class WolfDataBridge {
      constructor() {
        this.basePubUrl = "https://docs.google.com/spreadsheets/d/1QfleXe-cdFwZ4NXr7zEYIGSlaBlEPHKjW2cLUjSDu5A/gviz/tq?tqx=out:json";
        this.apiBase = window.WOLF_API_BASE;
      }

      async fetchSheetDataJSONP(sheetName) {
        return new Promise((resolve, reject) => {
          const callbackName = 'callback_' + Math.floor(Math.random() * 1000000);
          window[callbackName] = (jsonData) => {
            delete window[callbackName];
            try { document.body.removeChild(script); } catch(e){}
            if (!jsonData || !jsonData.table) {
              return resolve([]);
            }
            const headers = jsonData.table.cols.map(col => col.label || col.id);
            const rows = jsonData.table.rows.map(row => {
              let obj = {};
              row.c.forEach((cell, i) => {
                obj[headers[i]] = cell ? (cell.f || cell.v) : '';
              });
              return obj;
            });
            resolve(rows);
          };
          const script = document.createElement('script');
          script.src = this.basePubUrl + "&sheet=" + encodeURIComponent(sheetName) + "&tq=&responseHandler=" + callbackName;
          script.onerror = (err) => {
             delete window[callbackName];
             try { document.body.removeChild(script); } catch(e){}
             reject(new Error("Falha na injeção do script JSONP"));
          };
          document.body.appendChild(script);
        });
      }

      async getIssues() {
        try {
          console.log("🐺 Fetch: Getting Issues...");
          const res = await fetch(`${this.apiBase}/api/issues`); // USE ABSOLUTE PATH
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const json = await res.json();
          console.log(`🐺 Fetch: Received ${json.data?.length || 0} issues.`);
          return json.data;
        } catch (e) {
          console.warn('API local issues falhando. Buscando fallback Cloud...', e);
          return await this.fetchSheetDataJSONP('PRODUÇÃO');
        }
      }

      async getChecklists() {
         try {
          console.log("🐺 Fetch: Getting Checklists...");
          const res = await fetch(`${this.apiBase}/api/checklists`); // USE ABSOLUTE PATH
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const json = await res.json();
          console.log(`🐺 Fetch: Received checklists summary.`);
          return json;
        } catch (e) {
          console.warn('API local checklists falhando. Buscando fallback Cloud...', e);
          try {
            const rawScores = await this.fetchSheetDataJSONP('CHECKLIST_SCORES');
            return {
               status: "success_cloud",
               summary_logs: rawScores || [],
               predictive: [], 
               critical_ranking_v3: { "HIDROSSANITÁRIO": [], "ELÉTRICO": [] },
               raw_logs: []
            };
          } catch (er) {
             return { summary_logs: [], predictive: [], critical_ranking_v3: {} };
          }
        }
      }
    }

    const bridge = new WolfDataBridge();

    async function bootWolfFactoryAPI() {
      console.log("🐺 Boot: Sequence Started.");
      const activeView = document.querySelector('.view-section.active');
      if(activeView) activeView.style.opacity = '0.5';

      const overlay = document.getElementById('wolf-boot-overlay');
      const statusText = document.getElementById('boot-status-text');
      const progressBar = document.getElementById('boot-progress-bar');
      const retryBtn = document.getElementById('boot-retry-btn');
      
      if(overlay) {
          overlay.classList.remove('hidden');
          overlay.style.opacity = '1';
          retryBtn.classList.add('hidden');
          statusText.className = "text-[10px] text-indigo-400 font-mono uppercase tracking-wider animate-pulse h-4";
      }

      const updateBootUI = (msg, progress, isError = false) => {
          if(statusText) statusText.innerText = msg;
          if(progressBar) progressBar.style.width = `${progress}%`;
          if(isError && statusText) {
              statusText.className = "text-[10px] text-rose-400 font-mono uppercase tracking-wider h-4";
              if(progressBar) progressBar.className = "h-full bg-rose-500 rounded-full transition-all duration-500 w-full shadow-[0_0_15px_rgba(244,63,94,0.8)]";
              if(retryBtn) retryBtn.classList.remove('hidden');
          }
      };

      try {
          updateBootUI("Verificando status do motor...", 10);
          
          // Poll /api/status until loaded=true
          let isLoaded = false;
          let retries = 0;
          const MAX_RETRIES = 60; // 3 minutes max

          while (!isLoaded && retries < MAX_RETRIES) {
              try {
                  const statusRes = await fetch(`${window.WOLF_API_BASE}/api/status`);
                  if (statusRes.ok) {
                      const status = await statusRes.json();
                      if (status.loaded) {
                          isLoaded = true;
                          updateBootUI("Base sincronizada. Baixando telemetria...", 50);
                          break;
                      } else {
                          // Processing
                          updateBootUI(`Processando arquivos em background... (${status.issues_count} issues, ${status.checklists_count} checklists)`, 30 + (retries % 20));
                      }
                  }
              } catch (e) {
                  console.warn("Status poll failed:", e);
                  updateBootUI("Motor offline. Tentando reconectar...", 10);
              }
              await new Promise(r => setTimeout(r, 3000));
              retries++;
          }

          if (!isLoaded) {
              throw new Error("Timeout aguardando processamento inicial do backend.");
          }

          // Fetch actual data
          updateBootUI("Construindo painéis...", 70);
          const issues = await bridge.getIssues().catch(e => { console.error("Issues fetch failed:", e); return []; });
          
          updateBootUI("Preenchendo rankings esportivos...", 85);
          const checklists = await bridge.getChecklists().catch(e => { console.error("Checklists fetch failed:", e); return null; });
          
          window.wolfIssues = issues || [];
          window.checklistDataV2 = checklists || { predictive: [], critical_ranking_v3: {}, summary_logs: [], raw_logs: [] };
          
          console.log(`🐺 Boot: Fetched ${window.wolfIssues.length} issues and ${window.checklistDataV2.summary_logs?.length || 0} checklists.`);

          updateBootUI("Renderizando HUD...", 95);
          try { renderCharts(window.wolfIssues); } catch(e) { console.error("renderCharts failed:", e); }
          try { renderAuditConsole(); } catch(e) { console.error("renderAuditConsole failed:", e); }
          try { renderChecklistConsole(); } catch(e) { console.error("renderChecklistConsole failed:", e); }
          try { renderGamificationLeagues(); } catch(e) { console.error("renderGamificationLeagues failed:", e); }
          try { renderCriticalBars(); } catch(e) { console.error("renderCriticalBars failed:", e); }

          updateBootUI("Sistemas Online.", 100);
          
          // Hide overlay smoothly
          if(overlay) {
              setTimeout(() => {
                  overlay.style.opacity = '0';
                  setTimeout(() => overlay.classList.add('hidden'), 1000);
              }, 500);
          }

      } catch (err) {
          console.error("🐺 Boot FATAL:", err);
          updateBootUI(`ERRO CRÍTICO: ${err.message}`, 100, true);
      } finally {
          if(activeView) activeView.style.opacity = '1';
          console.log("🐺 Boot: Finished.");
      }
    }



    // =====================================================
    // 🏭 PRODUCTION DIRECTOR - GUARDIÃO DA ESTEIRA v2.0
    // All logic scoped under window.ProductionDirector
    // ZERO interference with Auditor Sênior panel
    // =====================================================
    window.ProductionDirector = (function() {
      'use strict';

      let syncInterval = null;
      let syncCountdown = 60;
      let burndownChart = null;
      let isInitialized = false;

      // === CLICKUP API DATA ENGINE ===
      let rawClickUpData = null;
      let currentFilterLabel = 'Todos';
      
      async function fetchClickUpData() {
         try {
             const sprintLabel = document.getElementById('prod-sprint-label');
             if(sprintLabel) sprintLabel.textContent = "SYNCING...";
             
             const res = await fetch(`${window.WOLF_API_BASE}/api/clickup/production`);
             const data = await res.json();
             
             if(data.status === 'success' && data.pilots) {
                 rawClickUpData = data;
                 recalculateKPIs();
             } else {
                 console.error("ClickUp API err:", data);
             }
         } catch(e) { console.error('Error fetching clickup data:', e); }
      }
      
      function setTeamFilter(label) {
          currentFilterLabel = label;
          const btns = document.querySelectorAll('#prod-team-filter button');
          btns.forEach(b => b.className = 'px-3 py-1 text-[9px] font-mono font-bold rounded text-gray-500 hover:text-white transition-all');
          const maxBtn = Array.from(btns).find(b => b.textContent === label.toUpperCase());
          if (maxBtn) maxBtn.className = 'px-3 py-1 text-[9px] font-mono font-bold rounded bg-orange-500/20 text-orange-400 transition-all';
          !rawClickUpData ? fetchClickUpData() : recalculateKPIs();
      }

      function recalculateKPIs() {
          if (!rawClickUpData || !rawClickUpData.pilots) return;
          let filteredPilots = rawClickUpData.pilots;
          if (currentFilterLabel === 'Academy') filteredPilots = rawClickUpData.pilots.filter(p => p.isAcademy);
          else if (currentFilterLabel === 'HID') filteredPilots = rawClickUpData.pilots.filter(p => String(p.disc).toUpperCase().includes('HID'));
          else if (currentFilterLabel === 'ELE') filteredPilots = rawClickUpData.pilots.filter(p => String(p.disc).toUpperCase().includes('ELE'));
          
          const SPRINT_DAYS = 14, sprintDay = 7, sprintProgress = sprintDay / SPRINT_DAYS;
          const totalAssigned = filteredPilots.reduce((s, p) => s + p.assigned, 0);
          const totalDoing = filteredPilots.reduce((s, p) => s + p.doing, 0);
          const totalDone = filteredPilots.reduce((s, p) => s + p.done, 0);
          const loads = filteredPilots.map(p => p.load);
          const avgLoad = loads.length ? loads.reduce((s, l) => s + l, 0) / loads.length : 0;
          const stdDev = loads.length ? Math.round(Math.sqrt(loads.reduce((s, l) => s + Math.pow(l - avgLoad, 2), 0) / loads.length)) : 0;
          const worstPilot = filteredPilots.length ? filteredPilots.reduce((a, b) => a.gargaloScore > b.gargaloScore ? a : b) : { name: "N/A", gargaloScore: 0 };
          
          let targetPE = currentFilterLabel === 'Todos' ? 624 : (totalDone + totalAssigned);
          if (targetPE <= 0) targetPE = 100;
          const capOP = Math.round((totalAssigned / targetPE) * 100);
          const ideal = Math.round(targetPE * sprintProgress);
          const sync = ideal > 0 ? Math.round(((totalDone * 1.5) / ideal) * 100) - 100 : 0;
          
          const d = {
            sprint: 'Sprints 2 & 3', sprintDay, sprintDays: SPRINT_DAYS, pe: targetPE, capOP: Math.min(capOP, 150),
            flowRate: Math.round(targetPE / SPRINT_DAYS), flowNet: Math.round(sync / 2), healthPct: Math.max(0, 100 - (filteredPilots.filter(p => p.ageAvg > 2.5).length * 10)),
            stdDev, wip: totalDoing, wipIdeal: Math.max(3, filteredPilots.length * 2), gargaloScore: worstPilot.gargaloScore, gargaloPilot: worstPilot.name,
            sincronia: sync, leadTime: 3.2, pilots: filteredPilots, velocity: targetPE, velocityTrend: 5
          };
          renderKPIs(d); renderPilots(d.pilots); renderJarvisTerminal(d); renderBurndown(d);
      }

      // === KPI STATUS COLOR LOGIC ===
      function statusColor(val, thresholds) {
        // thresholds: { green: [min, max], amber: [min, max] }
        if (val >= thresholds.green[0] && val <= thresholds.green[1]) return 'bg-emerald-400';
        if (val >= thresholds.amber[0] && val <= thresholds.amber[1]) return 'bg-amber-400';
        return 'bg-red-400';
      }

      // === RENDER KPIs ===
      function renderKPIs(d) {
        // 1. Capacidade OP
        const capEl = document.getElementById('kpi-cap-value');
        if (!capEl) return; // Guard: only run if Production view exists in DOM
        capEl.textContent = d.capOP;
        document.getElementById('kpi-cap-bar').style.width = Math.min(d.capOP, 100) + '%';
        const capColor = d.capOP < 70 ? 'bg-emerald-400' : (d.capOP < 95 ? 'bg-amber-400' : 'bg-red-400');
        document.getElementById('kpi-cap-status').className = `w-2 h-2 rounded-full ${capColor}`;
        // Color the bar
        const capBar = document.getElementById('kpi-cap-bar');
        capBar.className = capBar.className.replace(/from-\S+/g, '').replace(/to-\S+/g, '');
        if (d.capOP >= 95) capBar.classList.add('from-red-500', 'to-red-400');
        else if (d.capOP >= 70) capBar.classList.add('from-amber-500', 'to-amber-400');
        else capBar.classList.add('from-emerald-500', 'to-emerald-400');

        // 2. Flow
        document.getElementById('kpi-flow-value').textContent = (d.flowNet >= 0 ? '+' : '') + d.flowNet;
        document.getElementById('kpi-flow-rate').textContent = d.flowRate;
        document.getElementById('kpi-flow-status').className = `w-2 h-2 rounded-full ${d.flowNet > 15 ? 'bg-amber-400' : 'bg-cyan-400'}`;

        // 3. Health
        document.getElementById('kpi-health-value').textContent = d.healthPct;
        document.getElementById('kpi-health-value').className = `text-2xl font-bold font-mono ${d.healthPct >= 90 ? 'text-emerald-400' : (d.healthPct >= 70 ? 'text-amber-400' : 'text-red-400')}`;
        document.getElementById('kpi-health-bar').style.width = d.healthPct + '%';
        document.getElementById('kpi-health-status').className = `w-2 h-2 rounded-full ${d.healthPct >= 90 ? 'bg-emerald-400' : (d.healthPct >= 70 ? 'bg-amber-400' : 'bg-red-400')}`;

        // 4. Balance
        document.getElementById('kpi-balance-value').textContent = `σ ${d.stdDev}`;
        const balColor = d.stdDev < 15 ? 'text-emerald-400' : (d.stdDev < 25 ? 'text-amber-400' : 'text-red-400');
        document.getElementById('kpi-balance-value').className = `text-2xl font-bold font-mono ${balColor}`;
        document.getElementById('kpi-balance-status').className = `w-2 h-2 rounded-full ${balColor.replace('text-', 'bg-')}`;

        // 5. WIP
        document.getElementById('kpi-wip-value').textContent = d.wip;
        document.getElementById('kpi-wip-bar').style.width = Math.round((d.wip / d.wipIdeal) * 100) + '%';
        const wipColor = d.wip <= d.wipIdeal ? 'bg-emerald-400' : (d.wip <= d.wipIdeal * 1.3 ? 'bg-amber-400' : 'bg-red-400');
        document.getElementById('kpi-wip-status').className = `w-2 h-2 rounded-full ${wipColor}`;

        // 6. Gargalo
        document.getElementById('kpi-gargalo-value').textContent = d.gargaloScore;
        document.getElementById('kpi-gargalo-pilot').textContent = d.gargaloPilot;
        const garColor = d.gargaloScore > 40 ? 'bg-red-400 animate-pulse' : (d.gargaloScore > 20 ? 'bg-amber-400' : 'bg-emerald-400');
        document.getElementById('kpi-gargalo-status').className = `w-2 h-2 rounded-full ${garColor}`;
        const garCard = document.getElementById('kpi-gargalo-card');
        garCard.style.borderColor = d.gargaloScore > 40 ? 'rgba(239,68,68,0.3)' : '';

        // 7. Sincronia
        document.getElementById('kpi-sync-value').textContent = (d.sincronia >= 0 ? '+' : '') + d.sincronia;
        const syncColor = d.sincronia >= 0 ? 'text-emerald-400' : (d.sincronia >= -15 ? 'text-amber-400' : 'text-red-400');
        document.getElementById('kpi-sync-value').className = `text-2xl font-bold font-mono ${syncColor}`;
        document.getElementById('kpi-sync-status').className = `w-2 h-2 rounded-full ${syncColor.replace('text-', 'bg-')}`;

        // 8. Lead Time
        document.getElementById('kpi-lead-value').textContent = d.leadTime;
        const ltColor = d.leadTime < 3 ? 'bg-emerald-400' : (d.leadTime < 5 ? 'bg-amber-400' : 'bg-red-400');
        document.getElementById('kpi-lead-status').className = `w-2 h-2 rounded-full ${ltColor}`;

        // Header labels
        document.getElementById('prod-sprint-label').textContent = d.sprint;
        document.getElementById('prod-sprint-day').textContent = d.sprintDay;
        document.getElementById('prod-velocity').textContent = d.velocity;
      }

      // === RENDER PILOT CARDS ===
      function renderPilots(pilots) {
        const container = document.getElementById('pilot-cards-container');
        if (!container) return;
        container.innerHTML = '';

        // Sort by load descending (highest first = most at risk)
        const sorted = [...pilots].sort((a, b) => b.load - a.load);

        sorted.forEach(p => {
          const loadColor = p.load > 100 ? 'text-red-400 border-red-500/30' :
                           (p.load > 80 ? 'text-amber-400 border-amber-500/20' : 'text-emerald-400 border-emerald-500/20');
          const barColor = p.load > 100 ? 'from-red-500 to-red-400' :
                          (p.load > 80 ? 'from-amber-500 to-amber-400' : 'from-emerald-500 to-emerald-400');
          const glow = p.gargaloScore > 30 ? 'shadow-[0_0_10px_rgba(239,68,68,0.15)]' : '';

          const card = document.createElement('div');
          card.className = `bg-black/30 border border-white/5 ${loadColor.split(' ')[1] || ''} rounded-lg p-2.5 ${glow} transition-all hover:bg-white/5`;
          card.innerHTML = `
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <span class="text-[8px] text-white font-bold">${p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                </div>
                <div class="min-w-0">
                  <p class="text-[10px] text-white font-medium truncate">${p.name}</p>
                  <p class="text-[8px] text-gray-600 font-mono">${p.role}</p>
                </div>
              </div>
              <span class="text-sm font-bold font-mono ${loadColor.split(' ')[0]}">${p.load}%</span>
            </div>
            <div class="w-full bg-white/5 rounded-full h-0.5 overflow-hidden">
              <div class="h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700" style="width:${Math.min(p.load, 100)}%"></div>
            </div>
            <div class="flex justify-between mt-1">
              <span class="text-[8px] text-gray-600 font-mono">${p.assigned} pts · ${p.doing} doing</span>
              ${p.gargaloScore > 20 ? `<span class="text-[8px] text-red-400 font-mono">⚡ GS:${p.gargaloScore}</span>` : ''}
            </div>
          `;
          container.appendChild(card);
        });
      }

      // === J.A.R.V.I.S. DIAGNOSTIC TERMINAL ===
      function renderJarvisTerminal(d) {
        const terminal = document.getElementById('jarvis-terminal');
        if (!terminal) return;
        terminal.innerHTML = '';

        const now = new Date();
        const ts = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const lines = [
          { color: 'text-gray-600', text: `────────────────────────────────────────────────` },
          { color: 'text-orange-400', text: `🚨 DIRETOR DE PRODUÇÃO – ${d.sprint} – Dia ${d.sprintDay}/${d.sprintDays}` },
          { color: 'text-gray-600', text: `${ts} · Atualização automática` },
          { color: 'text-gray-600', text: `────────────────────────────────────────────────` },
          { color: 'text-gray-400', text: `` },
          { color: d.capOP < 70 ? 'text-emerald-400' : (d.capOP < 95 ? 'text-amber-400' : 'text-red-400'),
            text: `▸ Capacidade OP: ${d.capOP}% ${d.capOP < 70 ? '(ainda temos ' + (100 - d.capOP) + '% de folga)' : (d.capOP >= 95 ? '⚠ SOBRECARGA' : '(atenção)')}`
          },
          { color: d.healthPct >= 90 ? 'text-emerald-400' : 'text-amber-400',
            text: `▸ Saúde da Fila: ${d.healthPct}% ${d.healthPct >= 90 ? '🟢' : (d.healthPct >= 70 ? '🟡' : '🔴')}`
          },
          { color: d.gargaloScore > 40 ? 'text-red-400' : 'text-amber-400',
            text: `▸ Gargalo Score: ${d.gargaloPilot} (Score ${d.gargaloScore}) ${d.gargaloScore > 40 ? '← MAIOR RISCO' : ''}`
          },
          { color: d.sincronia >= 0 ? 'text-emerald-400' : 'text-amber-400',
            text: `▸ Sincronia: ${d.sincronia >= 0 ? '+' : ''}${d.sincronia}% ${d.sincronia < 0 ? 'abaixo da linha ideal' : 'acima da linha ideal'}`
          },
          { color: 'text-gray-400',
            text: `▸ WIP: ${d.wip} tarefas em Doing (ideal: ${d.wipIdeal})`
          },
          { color: 'text-gray-400',
            text: `▸ Lead Time Médio: ${d.leadTime} dias`
          },
          { color: 'text-gray-400', text: `` }
        ];

        // Generate smart recommendations
        const recommendations = [];
        if (d.gargaloScore > 40) {
          const lightestPilot = d.pilots.reduce((a, b) => a.load < b.load ? a : b);
          recommendations.push(`→ Realocar tarefas de ${d.gargaloPilot} para ${lightestPilot.name} (carga: ${lightestPilot.load}%)`);
        }
        const doingPilots = d.pilots.filter(p => p.doing > 2);
        if (doingPilots.length > 0) {
          recommendations.push(`→ ${doingPilots.length} piloto(s) com >2 tarefas simultâneas. Reduzir WIP individual.`);
        }
        if (d.sincronia < -10) {
          recommendations.push(`→ Sprint está ${Math.abs(d.sincronia)}% atrasado. Priorizar entregas de alto valor.`);
        }
        if (d.capOP > 95) {
          recommendations.push(`→ Equipe sobrecarregada (${d.capOP}%). Considerar postergar tarefas de baixo valor.`);
        }
        if (d.stdDev > 25) {
          recommendations.push(`→ Cargas muito desbalanceadas (σ ${d.stdDev}). Redistribuir pontos.`);
        }
        if (d.leadTime > 4) {
          recommendations.push(`→ Lead Time alto (${d.leadTime}d). Investigar bloqueios no fluxo.`);
        }

        if (recommendations.length > 0) {
          lines.push({ color: 'text-orange-300 font-bold', text: `AÇÃO IMEDIATA RECOMENDADA:` });
          recommendations.forEach(r => {
            lines.push({ color: 'text-orange-200', text: r });
          });
        } else {
          lines.push({ color: 'text-emerald-400 font-bold', text: `✅ ESTEIRA SAUDÁVEL – Nenhuma ação imediata necessária.` });
        }

        lines.push({ color: 'text-gray-400', text: `` });
        lines.push({ color: 'text-gray-500', text: `Tendência 3 sprints: Velocidade ↑ ${d.velocityTrend}%` });
        lines.push({ color: 'text-gray-600', text: `────────────────────────────────────────────────` });

        // Animate with typewriter effect
        lines.forEach((line, i) => {
          const div = document.createElement('div');
          div.className = `${line.color} opacity-0 transition-opacity duration-300`;
          div.textContent = line.text;
          terminal.appendChild(div);
          setTimeout(() => {
            div.style.opacity = '1';
            if (i === lines.length - 1) {
              terminal.scrollTop = terminal.scrollHeight;
            }
          }, i * 60);
        });
      }

      // === BURNDOWN CHART ===
      function renderBurndown(d) {
        const canvas = document.getElementById('prod-burndown-chart');
        if (!canvas) return;

        if (burndownChart) burndownChart.destroy();

        const days = Array.from({ length: d.sprintDays }, (_, i) => `D${i + 1}`);
        const idealLine = days.map((_, i) => Math.round(d.pe - (d.pe / d.sprintDays) * (i + 1)));
        const actualLine = [];
        let remaining = d.pe;
        for (let i = 0; i < d.sprintDays; i++) {
          if (i < d.sprintDay) {
            remaining -= rand(20, 70);
            remaining = Math.max(remaining, 0);
            actualLine.push(remaining);
          } else {
            actualLine.push(null);
          }
        }

        const ctx = canvas.getContext('2d');
        burndownChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: days,
            datasets: [
              {
                label: 'Ideal',
                data: idealLine,
                borderColor: 'rgba(255,255,255,0.15)',
                borderDash: [4, 4],
                borderWidth: 1,
                pointRadius: 0,
                fill: false,
                tension: 0
              },
              {
                label: 'Real',
                data: actualLine,
                borderColor: '#f97316',
                borderWidth: 2,
                pointRadius: 0,
                fill: {
                  target: 'origin',
                  above: 'rgba(249,115,22,0.05)'
                },
                tension: 0.3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: { font: { size: 8 }, color: '#4b5563' },
                grid: { color: 'rgba(255,255,255,0.03)' }
              },
              y: {
                ticks: { font: { size: 8 }, color: '#4b5563' },
                grid: { color: 'rgba(255,255,255,0.03)' }
              }
            }
          }
        });
      }

      // === SYNC TIMER ===
      function startSyncTimer() {
        if (syncInterval) clearInterval(syncInterval);
        syncCountdown = 60;
        updateTimerDisplay();

        syncInterval = setInterval(() => {
          syncCountdown--;
          updateTimerDisplay();

          if (syncCountdown <= 0) {
            syncCountdown = 60;
            refreshAll();
          }
        }, 1000);
      }

      function updateTimerDisplay() {
        const el = document.getElementById('prod-sync-timer');
        const dot = document.getElementById('prod-sync-dot');
        if (el) {
          el.textContent = syncCountdown;
          if (syncCountdown <= 5) {
            el.className = 'text-sm font-bold text-red-400 font-mono w-8 text-center animate-pulse';
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-red-400 animate-pulse';
          } else {
            el.className = 'text-sm font-bold text-emerald-400 font-mono w-8 text-center';
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
          }
        }
      }

      // === REFRESH ALL ===
      function refreshAll() {
        fetchClickUpData();
      }

      // === INIT (called when view is shown) ===
      function init() {
        if (isInitialized) {
          // Just refresh data on re-entry
          refreshAll();
          return;
        }
        isInitialized = true;
        refreshAll();
        startSyncTimer();
      }

      // === STOP (called when leaving view, to save resources) ===
      function stop() {
        // Don't stop the timer, keep it running for a seamless experience
      }

      return { init, stop, refreshAll, setTeamFilter };
    })();

    // Production Director hook is injected directly into the High-Fidelity switchView function above.

    bootWolfFactoryAPI();

    switchView('view-auditor');

  