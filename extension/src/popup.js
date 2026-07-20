(function () {
	var TC = window.PSHelper.TypeChart;
	var selectedTypes = [];

	function typeBadge(type) {
		var color = TC.COLORS[type] || "#68A090";
		var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
		var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		var textColor = luminance > 0.6 ? "#1a1a1a" : "#ffffff";
		return '<span class="psh-badge" style="background:' + color + ";color:" + textColor + '">' + type + "</span>";
	}

	function renderGrid() {
		var types = TC.TYPES;
		var html = '<table class="p-grid"><thead><tr><th></th>';
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
		html += "</tbody></table>";
		document.getElementById("grid-container").innerHTML = html;
	}

	function renderPicker() {
		var html = TC.TYPES.map(function (t) {
			var sel = selectedTypes.indexOf(t) !== -1 ? " selected" : "";
			return '<button class="' + sel.trim() + '" data-type="' + t + '" style="border-color:' + TC.COLORS[t] + '">' + t + "</button>";
		}).join("");
		document.getElementById("type-picker").innerHTML = html;
		document.querySelectorAll("#type-picker button").forEach(function (btn) {
			btn.addEventListener("click", function () {
				var t = btn.getAttribute("data-type");
				var idx = selectedTypes.indexOf(t);
				if (idx !== -1) {
					selectedTypes.splice(idx, 1);
				} else {
					if (selectedTypes.length >= 2) selectedTypes.shift();
					selectedTypes.push(t);
				}
				renderPicker();
				renderLookup();
			});
		});
	}

	function renderLookup() {
		var el = document.getElementById("lookup-result");
		if (!selectedTypes.length) {
			el.innerHTML = '<p class="p-hint">Pick 1 or 2 types above.</p>';
			return;
		}
		var profile = TC.getDefensiveProfile(selectedTypes);
		function row(label, arr) {
			if (!arr.length) return "";
			return '<div class="p-row"><span class="p-row-label">' + label + "</span>" + arr.map(typeBadge).join(" ") + "</div>";
		}
		el.innerHTML =
			'<p class="p-hint">A Pokemon that is <strong>' + selectedTypes.join(" / ") + "</strong> as its defending type(s):</p>" +
			row("Takes 4x from", profile.quad) +
			row("Takes 2x from", profile.double) +
			row("Takes 0.5x from", profile.half) +
			row("Takes 0.25x from", profile.quarter) +
			row("Immune to", profile.immune);
	}

	function renderGlossary() {
		var html = TC.GLOSSARY.map(function (e) {
			return "<dt>" + e.term + "</dt><dd>" + e.body + "</dd>";
		}).join("");
		document.getElementById("glossary-list").innerHTML = html;
	}

	function initTabs() {
		document.querySelectorAll(".p-tab").forEach(function (tab) {
			tab.addEventListener("click", function () {
				document.querySelectorAll(".p-tab").forEach(function (t) { t.classList.remove("active"); });
				document.querySelectorAll(".p-panel").forEach(function (p) { p.hidden = true; });
				tab.classList.add("active");
				document.getElementById("tab-" + tab.getAttribute("data-tab")).hidden = false;
			});
		});
	}

	initTabs();
	renderGrid();
	renderPicker();
	renderLookup();
	renderGlossary();
})();
