// Isolated-world content script. Injects inject.js into the page so it can
// read the live Showdown client state, then renders a floating helper panel
// (in its own Shadow DOM, so it never fights with the page's own CSS).
(function () {
	var TC = window.PSHelper.TypeChart;
	var SM = window.PSHelper.StatMath;
	var STORAGE_KEY = "psh-collapsed";

	// Volatiles worth surfacing to a beginner (they constrain move choice or
	// matter tactically) - not every internal volatile id is display-worthy.
	var VISIBLE_VOLATILES = [
		"encore", "taunt", "torment", "disable", "substitute", "confusion",
		"attract", "leechseed", "curse", "yawn", "imprison", "flashfire",
		"perishsong", "saltcure", "nightmare"
	];

	function textColorFor(hex) {
		var r = parseInt(hex.slice(1, 3), 16);
		var g = parseInt(hex.slice(3, 5), 16);
		var b = parseInt(hex.slice(5, 7), 16);
		var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
	}

	function typeBadge(type) {
		var color = TC.COLORS[type] || "#68A090";
		var textColor = textColorFor(color);
		return '<span class="psh-badge" style="background:' + color + ";color:" + textColor + '">' + type + "</span>";
	}

	function hpBarColor(pct) {
		if (pct === null || pct === undefined) return "#888";
		if (pct > 50) return "#4caf50";
		if (pct > 20) return "#ff9800";
		return "#f44336";
	}

	function pokeSummary(poke, label) {
		if (!poke) return '<div class="psh-mon psh-mon-empty">' + label + ": —</div>";
		var hpPct = poke.hpPercent;
		var hpHtml = "";
		if (hpPct !== null && hpPct !== undefined && !poke.fainted) {
			hpHtml = '<div class="psh-hpbar"><div class="psh-hpfill" style="width:' + hpPct + "%;background:" + hpBarColor(hpPct) + '"></div></div>' +
				'<span class="psh-hptext">' + hpPct + "%</span>";
		}
		var statusHtml = poke.status ? '<span class="psh-status">' + poke.status.toUpperCase() + "</span>" : "";
		var faintedHtml = poke.fainted ? '<span class="psh-status psh-fainted">FNT</span>' : "";
		var teraHtml = poke.terastallized ? '<span class="psh-tera">Tera</span>' : "";
		var abilityHtml = poke.ability ? '<span class="psh-ability-tag" title="Ability">' + escapeHtml(poke.ability) + "</span>" : "";
		var itemHtml = poke.item ? '<span class="psh-item-tag" title="Held item">' + escapeHtml(poke.item) + "</span>" : "";
		var volatileHtml = (poke.volatiles || []).filter(function (v) {
			return VISIBLE_VOLATILES.indexOf(v) !== -1;
		}).map(function (v) {
			return '<span class="psh-volatile-tag">' + escapeHtml(v.charAt(0).toUpperCase() + v.slice(1)) + "</span>";
		}).join("");
		return (
			'<div class="psh-mon">' +
			'<div class="psh-mon-row1"><strong>' + escapeHtml(poke.name) + "</strong>" + teraHtml + faintedHtml + statusHtml + "</div>" +
			'<div class="psh-mon-row2">' + poke.types.map(typeBadge).join(" ") + "</div>" +
			'<div class="psh-mon-row3">' + hpHtml + "</div>" +
			(abilityHtml || itemHtml ? '<div class="psh-mon-row4">' + abilityHtml + itemHtml + "</div>" : "") +
			(volatileHtml ? '<div class="psh-mon-row4">' + volatileHtml + "</div>" : "") +
			"</div>"
		);
	}

	function escapeHtml(s) {
		return String(s || "").replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}

	function defensiveWarnings(myTypes, ability, item) {
		if (!myTypes || !myTypes.length) return "";
		var profile = TC.getDefensiveProfileWithAbility(myTypes, ability, item);
		var notes = profile.notes || {};
		function withNote(list) {
			return list.map(function (t) {
				return typeBadge(t) + (notes[t] ? ' <span class="psh-move-note">(' + escapeHtml(notes[t]) + ")</span>" : "");
			}).join(" ");
		}
		var parts = [];
		if (profile.quad.length) parts.push('<div class="psh-warn psh-warn-bad">4x weak to: ' + withNote(profile.quad) + "</div>");
		if (profile.double.length) parts.push('<div class="psh-warn psh-warn-bad">2x weak to: ' + withNote(profile.double) + "</div>");
		if (profile.immune.length) parts.push('<div class="psh-warn psh-warn-good">Immune to: ' + withNote(profile.immune) + "</div>");
		if (!parts.length) parts.push('<div class="psh-warn">No major type weaknesses right now.</div>');
		return parts.join("");
	}

	var SPEED_VERDICT_TEXT = {
		outspeed: "You outspeed — you move first (barring priority).",
		outsped: "Opponent outspeeds — they move first (barring priority).",
		tie: "Speed tie — true coin flip.",
		uncertain: "Speed order uncertain — opponent's exact EVs/nature are unknown."
	};

	// Opponent's real stats (EVs/nature) are hidden info, same as in a real
	// battle - only a possible min/max range can ever be computed for them.
	// Only the verdict is shown, never a fabricated opponent number.
	function speedSection(myActive, farActive) {
		if (!myActive || !farActive || myActive.fainted || farActive.fainted) return "";
		if (!myActive.exactStats || !myActive.exactStats.spe) return "";
		if (!farActive.baseStats || !farActive.baseStats.spe) return "";
		var mySpeed = SM.computeExactSpeed(myActive.exactStats.spe, myActive.boosts.spe, myActive.status);
		var oppRange = SM.computeSpeedRange(farActive.baseStats.spe, farActive.level, farActive.boosts.spe, farActive.status);
		var verdict = SM.compareSpeed(mySpeed, oppRange);
		return '<div class="psh-section-title">Speed</div>' +
			'<div class="psh-speed-row psh-speed-' + verdict + '">' + SPEED_VERDICT_TEXT[verdict] + "</div>";
	}

	function moveRow(move, opponentTypes, opponentAbility, opponentItem) {
		var effHtml = "";
		var stabHtml = "";
		if (move.category === "Status") {
			effHtml = '<span class="psh-eff psh-eff-status">Status</span>';
		} else if (move.type && opponentTypes && opponentTypes.length) {
			var result = TC.getMultiplierWithAbility(move.type, opponentTypes, opponentAbility, opponentItem);
			effHtml = '<span class="psh-eff ' + TC.effectivenessClass(result.mult) + '">' + TC.effectivenessLabel(result.mult) + "</span>";
			if (result.note) effHtml += ' <span class="psh-move-note">(' + escapeHtml(result.note) + ")</span>";
		}
		var myTypes = window.__pshLastSnapshot && window.__pshLastSnapshot.mySide && window.__pshLastSnapshot.mySide.active[0]
			? window.__pshLastSnapshot.mySide.active[0].types : [];
		if (move.type && myTypes.indexOf(move.type) !== -1) {
			stabHtml = '<span class="psh-stab" title="Same Type Attack Bonus: +50% damage">STAB</span>';
		}
		var disabledClass = move.disabled ? " psh-move-disabled" : "";
		return (
			'<div class="psh-move' + disabledClass + '">' +
			'<div class="psh-move-top">' + (move.type ? typeBadge(move.type) : '<span class="psh-badge psh-badge-none">???</span>') +
			"<span class=\"psh-move-name\">" + escapeHtml(move.name) + "</span>" + stabHtml + "</div>" +
			'<div class="psh-move-bottom">' + effHtml + '<span class="psh-pp">' + move.pp + "/" + move.maxpp + " PP</span></div>" +
			"</div>"
		);
	}

	var RISK_RANK = { quad: 0, double: 1, neutral: 2, half: 3, quarter: 4, immune: 5 };
	var RISK_LABEL = { quad: "4x weak", double: "2x weak", half: "resists", quarter: "resists x2", immune: "immune" };
	var RISK_CLASS = { quad: "psh-risk-bad", double: "psh-risk-bad", half: "psh-risk-good", quarter: "psh-risk-good", immune: "psh-risk-good" };

	// Worst-case bucket across every threat type - "am I going to get one-shot
	// by SOMETHING this opponent has," not just the average matchup.
	function worstRiskBucket(types, ability, item, threatTypes) {
		if (!threatTypes || !threatTypes.length) return null;
		var profile = TC.getDefensiveProfileWithAbility(types, ability, item);
		var worst = null;
		threatTypes.forEach(function (t) {
			var bucket = ["quad", "double", "neutral", "half", "quarter", "immune"].filter(function (b) {
				return profile[b] && profile[b].indexOf(t) !== -1;
			})[0] || "neutral";
			if (worst === null || RISK_RANK[bucket] < RISK_RANK[worst]) worst = bucket;
		});
		return worst;
	}

	function teamRow(team, recommendedName, threatTypes) {
		if (!team || !team.length) return "";
		return '<div class="psh-team-row">' + team.map(function (p) {
			if (!p) return "";
			var faint = p.fainted ? " psh-team-fainted" : "";
			var recommended = recommendedName && p.name === recommendedName ? " psh-team-recommended" : "";
			var activeTag = p.isActive ? '<span class="psh-status">OUT</span>' : "";
			var riskHtml = "";
			if (!p.fainted && !p.isActive) {
				var bucket = worstRiskBucket(p.types, p.ability, p.item, threatTypes);
				if (bucket && bucket !== "neutral") {
					riskHtml = '<div class="psh-team-risk ' + RISK_CLASS[bucket] + '">' + RISK_LABEL[bucket] + "</div>";
				}
			}
			return '<div class="psh-team-mon' + faint + recommended + '" title="' + escapeHtml(p.name) + " (" + p.types.join("/") + ')">' +
				'<div class="psh-team-name">' + escapeHtml(p.name) + activeTag + "</div>" +
				'<div>' + p.types.map(typeBadge).join(" ") + "</div>" + riskHtml + "</div>";
		}).join("") + "</div>";
	}

	function recommendationBanner(rec) {
		if (!rec || rec.action === "none") return "";
		var cls = rec.action === "tera-move" ? "psh-recommend-tera" : rec.action === "switch" ? "psh-recommend-switch" : "psh-recommend-move";
		var html = '<div class="psh-recommend ' + cls + '">' +
			'<div class="psh-recommend-headline">' + escapeHtml(rec.headline) + "</div>";
		if (rec.reason) html += '<div class="psh-recommend-reason">' + escapeHtml(rec.reason) + "</div>";
		if (rec.tip) html += '<div class="psh-recommend-tip">' + escapeHtml(rec.tip) + "</div>";
		if (rec.estimateNote) html += '<div class="psh-recommend-tip">' + escapeHtml(rec.estimateNote) + "</div>";
		html += "</div>";
		return html;
	}

	function renderBody(snapshot) {
		if (!snapshot || !snapshot.inBattle) {
			return '<div class="psh-idle">Not in a battle yet. Start or open a battle to see live type hints here.<br>' +
				'Click the extension icon in your toolbar any time for the full type chart and glossary.</div>';
		}

		var myActive = snapshot.mySide && snapshot.mySide.active[0];
		var farActive = snapshot.farSide && snapshot.farSide.active[0];

		var html = "";

		if (snapshot.teamPreview) {
			html += '<div class="psh-section-title">Team Preview — Your Team</div>';
			html += teamRow(snapshot.mySide && snapshot.mySide.team);
			if (snapshot.farSide && snapshot.farSide.team && snapshot.farSide.team.length) {
				html += '<div class="psh-section-title">Opponent (revealed)</div>';
				html += teamRow(snapshot.farSide.team);
			}
			return html;
		}

		var rec = window.PSHelper.Recommend.recommend(snapshot);
		html += recommendationBanner(rec);

		html += '<div class="psh-section-title">Matchup</div>';
		if (snapshot.forceSwitch) {
			html += '<div class="psh-warn">Your Pokemon fainted — choose a replacement.</div>';
		}
		html += '<div class="psh-matchup">' + pokeSummary(myActive, "You") + pokeSummary(farActive, "Opponent") + "</div>";

		html += speedSection(myActive, farActive);

		if (myActive && !myActive.fainted) {
			html += '<div class="psh-section-title">Your risk this turn</div>';
			html += defensiveWarnings(myActive.types, myActive.ability, myActive.item);
		}

		if (farActive && !farActive.fainted) {
			html += '<div class="psh-section-title">Opponent\'s weaknesses</div>';
			html += defensiveWarnings(farActive.types, farActive.ability, farActive.item);

			var threatTypes = window.PSHelper.Recommend.opponentThreatTypes(farActive);
			html += '<div class="psh-section-title">Opponent\'s strengths</div>';
			html += '<div class="psh-warn">Attacks as: ' + threatTypes.map(typeBadge).join(" ") +
				'<span class="psh-move-note"> (types they threaten with — watch for these on switches)</span></div>';
		}

		if (farActive && farActive.revealedMoves && farActive.revealedMoves.length) {
			html += '<div class="psh-section-title">Opponent\'s revealed moves</div>';
			html += '<div class="psh-revealed-moves">' + farActive.revealedMoves.map(function (m) {
				return '<div class="psh-revealed-move">' + (m.type ? typeBadge(m.type) : "") + " " + escapeHtml(m.name) + "</div>";
			}).join("") + "</div>";
		}

		if (snapshot.choices && snapshot.choices.moves && snapshot.choices.moves.length && myActive && !myActive.fainted) {
			html += '<div class="psh-section-title">Your moves vs ' + (farActive ? escapeHtml(farActive.name) : "opponent") + "</div>";
			html += '<div class="psh-movelist">' + snapshot.choices.moves.map(function (m) {
				return moveRow(m, farActive ? farActive.types : [], farActive ? farActive.ability : "", farActive ? farActive.item : "");
			}).join("") + "</div>";
		}

		if (snapshot.mySide && snapshot.mySide.team && snapshot.mySide.team.length) {
			html += '<div class="psh-section-title">Your team</div>';
			html += teamRow(
				snapshot.mySide.team,
				rec.action === "switch" && rec.target ? rec.target.name : null,
				farActive ? window.PSHelper.Recommend.opponentThreatTypes(farActive) : []
			);
		}

		return html;
	}

	function buildPanel() {
		var host = document.createElement("div");
		host.id = "psh-host";
		document.documentElement.appendChild(host);
		var root = host.attachShadow({ mode: "open" });

		var style = document.createElement("style");
		style.textContent = PANEL_CSS;
		root.appendChild(style);

		var collapsed = localStorage.getItem(STORAGE_KEY) === "1";

		var wrap = document.createElement("div");
		wrap.className = "psh-wrap" + (collapsed ? " psh-collapsed" : "");
		wrap.innerHTML =
			'<div class="psh-header">' +
			'<span class="psh-title">Type Coach</span>' +
			'<button class="psh-btn" data-action="glossary" title="Glossary of terms">?</button>' +
			'<button class="psh-btn" data-action="grid" title="Full type chart">Grid</button>' +
			'<button class="psh-btn" data-action="toggle" title="Collapse/expand">' + (collapsed ? "▲" : "▼") + "</button>" +
			"</div>" +
			'<div class="psh-body"></div>' +
			'<div class="psh-modal-backdrop" hidden><div class="psh-modal"><button class="psh-btn psh-modal-close" data-action="close-modal">×</button><div class="psh-modal-content"></div></div></div>';
		root.appendChild(wrap);

		var bodyEl = wrap.querySelector(".psh-body");
		var modalBackdrop = wrap.querySelector(".psh-modal-backdrop");
		var modalContent = wrap.querySelector(".psh-modal-content");

		wrap.addEventListener("click", function (e) {
			var btn = e.target.closest("[data-action]");
			if (!btn) return;
			var action = btn.getAttribute("data-action");
			if (action === "toggle") {
				var isCollapsed = wrap.classList.toggle("psh-collapsed");
				localStorage.setItem(STORAGE_KEY, isCollapsed ? "1" : "0");
				btn.textContent = isCollapsed ? "▲" : "▼";
			} else if (action === "grid") {
				modalContent.innerHTML = renderTypeGrid();
				modalBackdrop.hidden = false;
			} else if (action === "glossary") {
				modalContent.innerHTML = renderGlossary();
				modalBackdrop.hidden = false;
			} else if (action === "close-modal") {
				modalBackdrop.hidden = true;
			}
		});
		modalBackdrop.addEventListener("click", function (e) {
			if (e.target === modalBackdrop) modalBackdrop.hidden = true;
		});

		return bodyEl;
	}

	function renderTypeGrid() {
		var types = TC.TYPES;
		var html = '<h2 class="psh-modal-h">Type Chart — attacker (rows) vs defender (columns)</h2>';
		html += '<div class="psh-grid-scroll"><table class="psh-grid"><thead><tr><th></th>';
		types.forEach(function (t) { html += "<th>" + typeBadge(t) + "</th>"; });
		html += "</tr></thead><tbody>";
		types.forEach(function (atk) {
			html += "<tr><th>" + typeBadge(atk) + "</th>";
			types.forEach(function (def) {
				var mult = TC.getMultiplier(atk, [def]);
				var label = mult === 0 ? "0" : mult === 0.5 ? "½" : mult === 2 ? "2" : "";
				html += '<td class="' + TC.effectivenessClass(mult) + '">' + label + "</td>";
			});
			html += "</tr>";
		});
		html += "</tbody></table></div>";
		html += '<p class="psh-hint">Blank = normal damage (1x). Look up a move\'s type on the left, the target\'s type across the top.</p>';
		return html;
	}

	function renderGlossary() {
		var html = '<h2 class="psh-modal-h">Beginner glossary</h2><dl class="psh-glossary">';
		TC.GLOSSARY.forEach(function (entry) {
			html += "<dt>" + escapeHtml(entry.term) + "</dt><dd>" + escapeHtml(entry.body) + "</dd>";
		});
		html += "</dl>";
		return html;
	}

	var PANEL_CSS =
		":host{all:initial;}" +
		'.psh-wrap{position:fixed;bottom:16px;right:16px;width:300px;max-height:70vh;overflow:hidden;display:flex;flex-direction:column;' +
		"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#222;" +
		"background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.25);z-index:2147483000;}" +
		".psh-header{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#3b4cca;color:#fff;border-radius:10px 10px 0 0;cursor:default;}" +
		".psh-title{font-weight:700;flex:1;}" +
		".psh-btn{background:rgba(255,255,255,0.18);color:#fff;border:none;border-radius:5px;padding:3px 7px;cursor:pointer;font-size:12px;}" +
		".psh-btn:hover{background:rgba(255,255,255,0.32);}" +
		".psh-body{overflow-y:auto;padding:8px 10px 12px;}" +
		".psh-collapsed .psh-body{display:none;}" +
		".psh-collapsed{width:180px;}" +
		".psh-section-title{font-weight:700;margin:10px 0 4px;color:#3b4cca;font-size:12px;text-transform:uppercase;letter-spacing:.03em;}" +
		".psh-section-title:first-child{margin-top:0;}" +
		".psh-idle{color:#555;line-height:1.4;padding:6px 0;}" +
		".psh-matchup{display:flex;gap:8px;}" +
		".psh-mon{flex:1;background:#f4f5fb;border-radius:8px;padding:6px 8px;min-width:0;}" +
		".psh-mon-empty{color:#999;background:none;padding:6px 0;}" +
		".psh-mon-row1{display:flex;align-items:center;gap:4px;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
		".psh-mon-row2{margin-top:3px;display:flex;gap:3px;flex-wrap:wrap;}" +
		".psh-mon-row3{margin-top:4px;display:flex;align-items:center;gap:5px;}" +
		".psh-badge{display:inline-block;padding:1px 6px;border-radius:9px;font-size:10.5px;font-weight:700;letter-spacing:.02em;}" +
		".psh-badge-none{background:#ddd;color:#555;}" +
		".psh-hpbar{flex:1;height:6px;border-radius:3px;background:#ddd;overflow:hidden;}" +
		".psh-hpfill{height:100%;}" +
		".psh-hptext{font-size:10.5px;color:#666;}" +
		".psh-status{background:#e0a800;color:#fff;font-size:9.5px;font-weight:700;border-radius:4px;padding:1px 4px;}" +
		".psh-fainted{background:#777;}" +
		".psh-tera{background:#40b5c4;color:#fff;font-size:9.5px;font-weight:700;border-radius:4px;padding:1px 4px;}" +
		".psh-warn{padding:4px 0;font-size:12px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;}" +
		".psh-warn-bad{color:#a32222;}" +
		".psh-warn-good{color:#1e7d32;}" +
		".psh-movelist{display:flex;flex-direction:column;gap:5px;}" +
		".psh-move{border:1px solid #e2e2ea;border-radius:7px;padding:5px 7px;}" +
		".psh-move-disabled{opacity:.45;}" +
		".psh-move-top{display:flex;align-items:center;gap:5px;}" +
		".psh-move-name{font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
		".psh-stab{background:#333;color:#fff;font-size:9px;font-weight:700;border-radius:4px;padding:1px 4px;}" +
		".psh-move-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:3px;}" +
		".psh-eff{font-size:11.5px;font-weight:700;}" +
		".psh-eff-status{color:#888;font-weight:400;}" +
		".psh-superb{color:#1e7d32;}" +
		".psh-neutral{color:#555;}" +
		".psh-resisted{color:#a32222;}" +
		".psh-immune{color:#a32222;text-decoration:underline;}" +
		".psh-pp{color:#888;font-size:11px;}" +
		".psh-move-note{color:#777;font-weight:400;font-size:10.5px;}" +
		".psh-speed-row{font-size:12px;font-weight:600;padding:2px 0;}" +
		".psh-speed-outspeed{color:#1e7d32;}" +
		".psh-speed-outsped{color:#a32222;}" +
		".psh-speed-tie{color:#e0a800;}" +
		".psh-speed-uncertain{color:#777;font-weight:400;}" +
		".psh-revealed-moves{display:flex;flex-direction:column;gap:3px;}" +
		".psh-revealed-move{font-size:11.5px;}" +
		".psh-mon-row4{margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;}" +
		".psh-ability-tag,.psh-item-tag{font-size:10px;background:#eef0fa;color:#3b4cca;border-radius:4px;padding:1px 5px;}" +
		".psh-volatile-tag{font-size:10px;background:#fff0e0;color:#a3600a;border-radius:4px;padding:1px 5px;margin-right:3px;}" +
		".psh-recommend{border-radius:8px;padding:8px 10px;margin-bottom:10px;color:#fff;}" +
		".psh-recommend-move{background:#3b4cca;}" +
		".psh-recommend-switch{background:#a32222;}" +
		".psh-recommend-tera{background:#40b5c4;}" +
		".psh-recommend-headline{font-weight:700;font-size:13.5px;}" +
		".psh-recommend-reason{font-size:11.5px;opacity:.92;margin-top:2px;}" +
		".psh-recommend-tip{font-size:10.5px;opacity:.85;margin-top:3px;font-style:italic;}" +
		".psh-team-recommended{outline:2px solid #1e7d32;}" +
		".psh-team-risk{font-size:9.5px;font-weight:700;border-radius:4px;padding:1px 4px;margin-top:3px;display:inline-block;}" +
		".psh-risk-bad{background:#fdecec;color:#a32222;}" +
		".psh-risk-good{background:#e3f4e6;color:#1e7d32;}" +
		".psh-team-row{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;}" +
		".psh-team-mon{background:#f4f5fb;border-radius:6px;padding:4px 6px;font-size:11px;max-width:90px;}" +
		".psh-team-fainted{opacity:.4;}" +
		".psh-team-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;}" +
		".psh-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center;z-index:2147483001;}" +
		".psh-modal-backdrop:not([hidden]){display:flex;}" +
		".psh-modal{background:#fff;border-radius:10px;max-width:92vw;max-height:86vh;overflow:auto;padding:16px 18px;position:relative;box-shadow:0 8px 30px rgba(0,0,0,.35);}" +
		".psh-modal-close{position:absolute;top:10px;right:10px;background:#eee;color:#333;width:26px;height:26px;border-radius:50%;font-size:16px;line-height:1;}" +
		".psh-modal-h{margin:0 0 10px;font-size:15px;}" +
		".psh-grid-scroll{overflow:auto;max-width:80vw;}" +
		".psh-grid{border-collapse:collapse;font-size:11px;}" +
		".psh-grid th,.psh-grid td{border:1px solid #eee;padding:2px 4px;text-align:center;white-space:nowrap;}" +
		".psh-grid td.psh-superb{background:#e3f4e6;}" +
		".psh-grid td.psh-resisted{background:#fdecec;}" +
		".psh-grid td.psh-immune{background:#f6d6d6;font-weight:700;}" +
		".psh-hint{color:#777;font-size:11.5px;margin-top:8px;}" +
		".psh-glossary dt{font-weight:700;margin-top:8px;color:#3b4cca;}" +
		".psh-glossary dd{margin:2px 0 0;line-height:1.4;}";

	function init() {
		var script = document.createElement("script");
		script.src = chrome.runtime.getURL("src/inject.js");
		(document.head || document.documentElement).appendChild(script);
		script.onload = function () { script.remove(); };

		var bodyEl = buildPanel();
		document.addEventListener("psh-battle-snapshot", function (e) {
			window.__pshLastSnapshot = e.detail;
			bodyEl.innerHTML = renderBody(e.detail);
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
