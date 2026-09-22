/**
 * Private Sector Engagement — Harmonizing Indicators (static client)
 * Loads docs/data/indicators.json and filters/sorts/paginates in-browser.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var allIndicators = [];
  var defaultSourceLinks = {};
  var currentPage = 1;
  var orderCategory = "objective";
  var order = "asc";
  var perPage = 10;
  var filters = {
    spsd_categories: null, // MultiSelect instances
    program_areas: null,
    business_objectives: null,
    business_sources: null,
    sdg_goals: null,
  };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sdgLabel(goal, title) {
    return goal + ": " + title;
  }

  function sourceLinkFor(ind) {
    if (ind.source_reference) return ind.source_reference;
    var url = defaultSourceLinks[ind.source];
    return url || "";
  }

  function buildSearchBlob(ind) {
    return [
      ind.spsd_category_code,
      ind.spsd_category,
      ind.program_area,
      ind.fa_indicator_code,
      ind.fa_indicator,
      ind.engagement_objective,
      ind.business_code,
      ind.business_indicator,
      ind.source,
      ind.sdg_goal,
      ind.sdg_goal_title,
      ind.sdg_target_number,
      ind.sdg_target,
    ]
      .join(" ")
      .toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // MultiSelect component
  // ---------------------------------------------------------------------------
  function MultiSelect(container, opts) {
    this.container = typeof container === "string"
      ? document.querySelector(container)
      : container;
    this.placeholder = opts.placeholder || "Select";
    this.onChange = opts.onChange || function () {};
    this.options = []; // { value, label }
    this.selected = new Set();
    this.disabledValues = new Set();
    this.id = opts.id || ("ms-" + Math.random().toString(36).slice(2, 8));
    this._renderShell();
  }

  MultiSelect.prototype._renderShell = function () {
    this.container.innerHTML =
      '<div class="dropdown filter-ms" id="' + this.id + '">' +
        '<button class="btn dropdown-toggle" type="button" data-bs-toggle="dropdown" ' +
          'data-bs-auto-close="outside" aria-expanded="false">' +
          '<span class="ms-label">' + escapeHtml(this.placeholder) + "</span>" +
        "</button>" +
        '<div class="dropdown-menu">' +
          '<div class="ms-actions">' +
            '<button type="button" class="btn btn-sm btn-light ms-select-all">Select all</button>' +
            '<button type="button" class="btn btn-sm btn-light ms-reset">Reset</button>' +
          "</div>" +
          '<div class="ms-options"></div>' +
        "</div>" +
      "</div>";
    this.labelEl = this.container.querySelector(".ms-label");
    this.optionsEl = this.container.querySelector(".ms-options");
    var self = this;
    this.container.querySelector(".ms-select-all").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.options.forEach(function (o) {
        if (!self.disabledValues.has(o.value)) self.selected.add(o.value);
      });
      self._syncChecks();
      self._updateLabel();
      self.onChange();
    });
    this.container.querySelector(".ms-reset").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.selected.clear();
      self._syncChecks();
      self._updateLabel();
      self.onChange();
    });
  };

  MultiSelect.prototype.setOptions = function (options) {
    // options: array of {value, label} or strings
    this.options = options.map(function (o) {
      if (typeof o === "string") return { value: o, label: o };
      return o;
    });
    this._renderOptions();
    this._updateLabel();
  };

  MultiSelect.prototype._renderOptions = function () {
    var self = this;
    var html = this.options
      .map(function (o) {
        var checked = self.selected.has(o.value) ? " checked" : "";
        var disabled = self.disabledValues.has(o.value);
        var cls = "dropdown-item-check" + (disabled ? " disabled-option" : "");
        return (
          '<label class="' + cls + '">' +
            '<input type="checkbox" value="' + escapeHtml(o.value) + '"' +
              checked + (disabled ? " disabled" : "") + " />" +
            escapeHtml(o.label) +
          "</label>"
        );
      })
      .join("");
    this.optionsEl.innerHTML = html;
    this.optionsEl.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener("change", function () {
        if (cb.disabled) return;
        if (cb.checked) self.selected.add(cb.value);
        else self.selected.delete(cb.value);
        self._updateLabel();
        self.onChange();
      });
    });
  };

  MultiSelect.prototype._syncChecks = function () {
    var self = this;
    this.optionsEl.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.checked = self.selected.has(cb.value);
      var disabled = self.disabledValues.has(cb.value);
      cb.disabled = disabled;
      cb.parentElement.classList.toggle("disabled-option", disabled);
    });
  };

  MultiSelect.prototype._updateLabel = function () {
    var n = this.selected.size;
    if (n === 0) {
      this.labelEl.textContent = this.placeholder;
    } else if (n === 1) {
      var only = Array.from(this.selected)[0];
      var opt = this.options.find(function (o) { return o.value === only; });
      this.labelEl.textContent = opt ? opt.label : only;
    } else {
      this.labelEl.textContent = n + " selected";
    }
  };

  MultiSelect.prototype.getSelected = function () {
    return Array.from(this.selected);
  };

  MultiSelect.prototype.clear = function () {
    this.selected.clear();
    this._syncChecks();
    this._updateLabel();
  };

  MultiSelect.prototype.setDisabled = function (enabledValues) {
    // enabledValues: Set or array of values that SHOULD be enabled
    var enableSet = enabledValues instanceof Set
      ? enabledValues
      : new Set(enabledValues);
    this.disabledValues = new Set();
    var self = this;
    this.options.forEach(function (o) {
      if (!enableSet.has(o.value)) self.disabledValues.add(o.value);
    });
    // Drop selections that became disabled
    Array.from(this.selected).forEach(function (v) {
      if (self.disabledValues.has(v)) self.selected.delete(v);
    });
    this._syncChecks();
    this._updateLabel();
  };

  // ---------------------------------------------------------------------------
  // Filtering / sorting / pagination
  // ---------------------------------------------------------------------------
  function getPhrase() {
    var el = document.getElementById("search-phrase-input");
    return (el && el.value ? el.value : "").trim().toLowerCase();
  }

  function matchesPhrase(ind, phrase) {
    if (!phrase) return true;
    return ind._search.indexOf(phrase) !== -1;
  }

  function applyFilters(excludeFacet) {
    var phrase = getPhrase();
    var selected = {
      spsd_categories: filters.spsd_categories.getSelected(),
      program_areas: filters.program_areas.getSelected(),
      business_objectives: filters.business_objectives.getSelected(),
      business_sources: filters.business_sources.getSelected(),
      sdg_goals: filters.sdg_goals.getSelected(),
    };

    return allIndicators.filter(function (ind) {
      if (!matchesPhrase(ind, phrase)) return false;

      if (excludeFacet !== "spsd_categories" && selected.spsd_categories.length) {
        if (selected.spsd_categories.indexOf(ind.spsd_category) === -1) return false;
      }
      if (excludeFacet !== "program_areas" && selected.program_areas.length) {
        if (selected.program_areas.indexOf(ind.program_area) === -1) return false;
      }
      if (excludeFacet !== "business_objectives" && selected.business_objectives.length) {
        if (selected.business_objectives.indexOf(ind.engagement_objective) === -1) return false;
      }
      if (excludeFacet !== "business_sources" && selected.business_sources.length) {
        if (selected.business_sources.indexOf(ind.source) === -1) return false;
      }
      if (excludeFacet !== "sdg_goals" && selected.sdg_goals.length) {
        var label = sdgLabel(ind.sdg_goal, ind.sdg_goal_title);
        if (selected.sdg_goals.indexOf(label) === -1) return false;
      }
      return true;
    });
  }

  function sortKey(ind) {
    switch (orderCategory) {
      case "objective":
        return (ind.spsd_category_code || "").toLowerCase();
      case "indicator":
        return (ind.fa_indicator_code || "").toLowerCase();
      case "business_objective":
        return (ind.engagement_objective || "").toLowerCase();
      case "program-area":
        return (ind.program_area || "").toLowerCase();
      case "business-indicator":
        return (ind.business_indicator || "").toLowerCase();
      case "source":
        return (ind.source || "").toLowerCase();
      case "sdg-goal":
        return ind.sdg_goal == null ? 999 : Number(ind.sdg_goal);
      default:
        return "";
    }
  }

  function sortIndicators(list) {
    var dir = order === "desc" ? -1 : 1;
    // Stable sort: decorate with original index
    return list
      .map(function (ind, i) { return { ind: ind, i: i, k: sortKey(ind) }; })
      .sort(function (a, b) {
        if (a.k < b.k) return -1 * dir;
        if (a.k > b.k) return 1 * dir;
        return a.i - b.i;
      })
      .map(function (x) { return x.ind; });
  }

  function pageList(current, total) {
    // Port of Django views.py pages ellipsis algorithm
    var pages = [];
    var i;
    for (i = current - 3; i < current + 4; i++) {
      if (i > 0 && i <= total) {
        if (i === current - 3 && i > 2) {
          pages.push("...");
          continue;
        }
        if (i === current + 3 && i < total - 2) {
          pages.push("...");
          continue;
        }
        pages.push(i);
      }
    }
    if (pages.indexOf(1) === -1) pages.unshift(1);
    if (total >= 1 && pages.indexOf(total) === -1) pages.push(total);
    return pages;
  }

  function updateFacetAvailability() {
    var facetKeys = [
      ["spsd_categories", function (ind) { return ind.spsd_category; }],
      ["program_areas", function (ind) { return ind.program_area; }],
      ["business_objectives", function (ind) { return ind.engagement_objective; }],
      ["business_sources", function (ind) { return ind.source; }],
      ["sdg_goals", function (ind) { return sdgLabel(ind.sdg_goal, ind.sdg_goal_title); }],
    ];
    facetKeys.forEach(function (pair) {
      var key = pair[0];
      var getter = pair[1];
      var subset = applyFilters(key);
      var enabled = new Set();
      subset.forEach(function (ind) {
        var v = getter(ind);
        if (v != null && v !== "") enabled.add(v);
      });
      filters[key].setDisabled(enabled);
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function sortIcon(cat) {
    if (orderCategory !== cat) return "";
    var icon = order === "asc" ? "fa-long-arrow-alt-down" : "fa-long-arrow-alt-up";
    return ' <i class="fas ' + icon + ' float-end"></i>';
  }

  function renderRow(ind) {
    var srcPopover = escapeHtml(ind.source) + " : " + (sourceLinkFor(ind) || "");
    var goalPopover =
      "<b>Goal " + escapeHtml(ind.sdg_goal) + "</b>: " + escapeHtml(ind.sdg_goal_title);
    var goalNum = ind.sdg_goal;
    var sdgImg =
      goalNum >= 1 && goalNum <= 17
        ? '<img src="images/sdg_images/sdg-' + goalNum + '.png" width="60" height="60" class="img-15" alt="SDG ' + goalNum + '" />'
        : "";

    return (
      "<tr>" +
        "<td><span class=\"bold\">" + escapeHtml(ind.spsd_category_code) + ":</span> " +
          escapeHtml(ind.spsd_category) + "</td>" +
        "<td>" + escapeHtml(ind.program_area) + "</td>" +
        "<td><div><b>" + escapeHtml(ind.fa_indicator_code) + ":</b> " +
          escapeHtml(ind.fa_indicator) + "</div></td>" +
        "<td>" + escapeHtml(ind.engagement_objective) + "</td>" +
        "<td>" +
          '<span data-bs-toggle="popover" data-bs-placement="left" data-bs-html="true" ' +
            'data-bs-content="' + escapeHtml(srcPopover) + '">' +
            '<b class="bussines-code">' + escapeHtml(ind.business_code) + ":</b>" +
          "</span> " +
          escapeHtml(ind.business_indicator) + " " +
          '<span data-bs-toggle="popover" data-bs-placement="left" data-bs-html="true" ' +
            'data-bs-content="' + escapeHtml(srcPopover) + '">' +
            '<i id="info-circle" class="fa fa-info-circle"></i>' +
          "</span>" +
        "</td>" +
        '<td><div class="row g-0 align-items-center">' +
          '<div class="col-auto pe-2">' +
            '<span data-bs-toggle="popover" data-bs-placement="left" data-bs-html="true" ' +
              'data-bs-content="' + escapeHtml(goalPopover) + '">' +
              sdgImg +
            "</span>" +
          "</div>" +
          '<div class="col">' +
            "<b>" + escapeHtml(ind.sdg_target_number) + ":</b> " +
            escapeHtml(ind.sdg_target) +
          "</div>" +
        "</div></td>" +
      "</tr>"
    );
  }

  function renderResults() {
    var filtered = sortIndicators(applyFilters(null));
    var totalCount = filtered.length;
    var totalPages = Math.max(1, Math.ceil(totalCount / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    var start = (perPage * currentPage) - perPage;
    var end = Math.min(perPage * currentPage, totalCount);
    var pageItems = filtered.slice(start, end);
    var pages = pageList(currentPage, totalPages);

    var results = document.getElementById("results");
    if (totalCount === 0) {
      results.innerHTML =
        '<p class="stats-line table-size">No results returned with your filter parameters.  Broaden your filters to find more results.</p>';
      updateFacetAvailability();
      return;
    }

    var pageLinks = pages
      .map(function (p) {
        if (p === "...") {
          return '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
        var active = p === currentPage ? " active" : "";
        return (
          '<li class="page-item' + active + '">' +
            '<a class="page-link" href="#" data-page="' + p + '">' + p + "</a>" +
          "</li>"
        );
      })
      .join("");

    results.innerHTML =
      '<div class="row">' +
        '<div class="col-6">' +
          '<p class="stats-line">Showing ' + (start + 1) + " to " + end +
            " of " + totalCount + " indicators</p>" +
        "</div>" +
        '<div class="col-6 text-end">' +
          '<div class="dropdown" style="position: relative; top: -10px;">' +
            '<button class="btn btn-success dropdown-toggle" type="button" ' +
              'data-bs-toggle="dropdown" aria-expanded="false">' +
              '<i class="fas fa-download" id="csv-download-icon"></i>' +
              '<i class="fas fa-spin fa-spinner" style="display: none;" id="csv-downloading-icon"></i> CSV' +
            "</button>" +
            '<ul class="dropdown-menu dropdown-menu-end">' +
              '<li><a class="dropdown-item" href="#" id="download-search-results">' +
                '<i class="fas fa-search"></i> Search Results</a></li>' +
              '<li><a class="dropdown-item" href="#" id="download-entire-set">' +
                '<i class="fas fa-download"></i> Complete Dataset</a></li>' +
            "</ul>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="table-responsive">' +
        '<table class="table table-striped table-hi">' +
          '<thead class="table-dark"><tr>' +
            '<th scope="col" style="width:10%" class="pointer" data-order="objective">SPSD Category' +
              sortIcon("objective") + "</th>" +
            '<th scope="col" style="width:10%" class="pointer" data-order="program-area">SPSD Program Area' +
              sortIcon("program-area") + "</th>" +
            '<th scope="col" style="width:25%" class="pointer" data-order="indicator">' +
              'Foreign Assistance Standard Indicators ' +
              '<a title="Link to Foreign Assistance Resource Library" ' +
                'href="https://www.state.gov/foreign-assistance-resource-library/#managing" ' +
                'class="help-link" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
                '<i class="fas fa-question-circle"></i></a>' +
              sortIcon("indicator") + "</th>" +
            '<th scope="col" style="width:10%" class="pointer" data-order="business_objective">Engagement Objective' +
              sortIcon("business_objective") + "</th>" +
            '<th scope="col" style="width:25%" class="pointer" data-order="business-indicator">Business&nbsp;Indicator' +
              sortIcon("business-indicator") + "</th>" +
            '<th scope="col" style="width:20%" class="pointer" data-order="sdg-goal">SDG Goal and Target' +
              sortIcon("sdg-goal") + "</th>" +
          "</tr></thead>" +
          "<tbody>" + pageItems.map(renderRow).join("") + "</tbody>" +
        "</table>" +
      "</div>" +
      '<nav aria-label="Pagination and number of rows displayed">' +
        '<div class="row">' +
          '<div class="col-md-6 text-center text-md-start my-2">' +
            '<div>Show ' +
              '<select class="form-select form-select-sm small-drop-down d-inline-block" id="per_page">' +
                [5, 10, 25, 50].map(function (n) {
                  return '<option value="' + n + '"' +
                    (n === perPage ? " selected" : "") + ">" + n + "</option>";
                }).join("") +
              "</select> rows per page" +
            "</div>" +
          "</div>" +
          '<div class="col-md-6 my-2">' +
            '<ul class="pagination pagination-sm justify-content-center justify-content-md-end mb-0">' +
              '<li class="page-item' + (currentPage === 1 ? " disabled" : "") + '">' +
                '<a class="page-link" href="#" data-page="' + (currentPage - 1) + '">Previous</a>' +
              "</li>" +
              pageLinks +
              '<li class="page-item' + (currentPage === totalPages ? " disabled" : "") + '">' +
                '<a class="page-link" href="#" data-page="' + (currentPage + 1) + '">Next</a>' +
              "</li>" +
            "</ul>" +
          "</div>" +
        "</div>" +
      "</nav>";

    // Bind events on freshly rendered content
    results.querySelectorAll("th.pointer").forEach(function (th) {
      th.addEventListener("click", function () {
        setOrder(th.getAttribute("data-order"));
      });
    });
    results.querySelectorAll("a.page-link[data-page]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        if (a.parentElement.classList.contains("disabled")) return;
        setPage(parseInt(a.getAttribute("data-page"), 10));
      });
    });
    var perPageEl = document.getElementById("per_page");
    if (perPageEl) {
      perPageEl.addEventListener("change", function () {
        perPage = parseInt(perPageEl.value, 10) || 10;
        currentPage = 1;
        renderResults();
      });
    }
    var dlSearch = document.getElementById("download-search-results");
    if (dlSearch) {
      dlSearch.addEventListener("click", function (e) {
        e.preventDefault();
        downloadCsv(sortIndicators(applyFilters(null)), "PrivateSectorEngagement_SearchResults.csv");
      });
    }
    var dlAll = document.getElementById("download-entire-set");
    if (dlAll) {
      dlAll.addEventListener("click", function (e) {
        e.preventDefault();
        downloadCsv(allIndicators, "PrivateSectorEngagement_CompleteSet.csv");
      });
    }

    initPopovers(results);
    updateFacetAvailability();
  }

  function initPopovers(root) {
    var triggers = root.querySelectorAll('[data-bs-toggle="popover"]');
    triggers.forEach(function (el) {
      // Dispose any prior instance if re-rendering
      var existing = bootstrap.Popover.getInstance(el);
      if (existing) existing.dispose();
      new bootstrap.Popover(el, {
        trigger: "click",
        sanitize: true,
        container: "body",
      });
    });
  }

  // Close popovers when clicking outside
  document.addEventListener("click", function (e) {
    var t = e.target;
    var isTrigger =
      t.closest && t.closest('[data-bs-toggle="popover"]');
    if (!isTrigger) {
      document.querySelectorAll('[data-bs-toggle="popover"]').forEach(function (el) {
        var inst = bootstrap.Popover.getInstance(el);
        if (inst) inst.hide();
      });
    } else {
      // Hide others when opening one
      document.querySelectorAll('[data-bs-toggle="popover"]').forEach(function (el) {
        if (el !== isTrigger && !isTrigger.contains(el)) {
          var inst = bootstrap.Popover.getInstance(el);
          if (inst) inst.hide();
        }
      });
    }
  });

  function setPage(value) {
    currentPage = value;
    renderResults();
  }

  function setOrder(category) {
    if (category === orderCategory) {
      order = order === "asc" ? "desc" : "asc";
    } else {
      orderCategory = category;
      order = "asc";
    }
    renderResults();
  }

  function onFilterChange() {
    currentPage = 1;
    renderResults();
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------
  var CSV_HEADERS = [
    "SPSD Category",
    "SPSD Program Area",
    "Foreign Assistance Standard Indicators",
    "Engagement Objective",
    "Business Indicator",
    "Source",
    "SDG Goal",
    "SDG Target",
  ];

  function csvEscape(val) {
    var s = val == null ? "" : String(val);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function rowToCsv(ind) {
    return [
      (ind.spsd_category_code ? ind.spsd_category_code + ": " : "") + ind.spsd_category,
      ind.program_area,
      (ind.fa_indicator_code ? ind.fa_indicator_code + ": " : "") + ind.fa_indicator,
      ind.engagement_objective,
      (ind.business_code ? ind.business_code + ": " : "") + ind.business_indicator,
      ind.source,
      (ind.sdg_goal != null ? ind.sdg_goal + ": " : "") + (ind.sdg_goal_title || ""),
      (ind.sdg_target_number ? ind.sdg_target_number + ": " : "") + (ind.sdg_target || ""),
    ]
      .map(csvEscape)
      .join(",");
  }

  function downloadCsv(rows, filename) {
    var icon = document.getElementById("csv-download-icon");
    var spin = document.getElementById("csv-downloading-icon");
    if (icon) icon.style.display = "none";
    if (spin) spin.style.display = "inline-block";

    var lines = [CSV_HEADERS.join(",")].concat(rows.map(rowToCsv));
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (spin) spin.style.display = "none";
    if (icon) icon.style.display = "inline-block";
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function uniqueSorted(arr, keyFn) {
    var seen = new Set();
    var out = [];
    arr.forEach(function (item) {
      var v = keyFn ? keyFn(item) : item;
      if (v == null || v === "") return;
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    });
    out.sort(function (a, b) {
      return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
    });
    return out;
  }

  function initFilters() {
    filters.spsd_categories = new MultiSelect("#filter-spsd-categories", {
      id: "ms-spsd",
      placeholder: "SPSD Categories",
      onChange: onFilterChange,
    });
    filters.program_areas = new MultiSelect("#filter-program-areas", {
      id: "ms-program",
      placeholder: "SPSD Program Area",
      onChange: onFilterChange,
    });
    filters.business_objectives = new MultiSelect("#filter-business-objectives", {
      id: "ms-objective",
      placeholder: "Engagement Objective",
      onChange: onFilterChange,
    });
    filters.business_sources = new MultiSelect("#filter-business-sources", {
      id: "ms-source",
      placeholder: "Business Indicator Source",
      onChange: onFilterChange,
    });
    filters.sdg_goals = new MultiSelect("#filter-sdg-goals", {
      id: "ms-sdg",
      placeholder: "SDG Goal",
      onChange: onFilterChange,
    });

    filters.spsd_categories.setOptions(
      uniqueSorted(allIndicators, function (i) { return i.spsd_category; })
    );
    filters.program_areas.setOptions(
      uniqueSorted(allIndicators, function (i) { return i.program_area; })
    );
    filters.business_objectives.setOptions(
      uniqueSorted(allIndicators, function (i) { return i.engagement_objective; })
    );
    filters.business_sources.setOptions(
      uniqueSorted(allIndicators, function (i) { return i.source; })
    );

    // SDG goals: sort by goal number, label as "N: Title"
    var goalMap = {};
    allIndicators.forEach(function (i) {
      if (i.sdg_goal != null && !goalMap[i.sdg_goal]) {
        goalMap[i.sdg_goal] = i.sdg_goal_title;
      }
    });
    var sdgOpts = Object.keys(goalMap)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .map(function (g) {
        return { value: sdgLabel(g, goalMap[g]), label: sdgLabel(g, goalMap[g]) };
      });
    filters.sdg_goals.setOptions(sdgOpts);
  }

  function bindChrome() {
    document.getElementById("search-phrase-btn").addEventListener("click", function () {
      currentPage = 1;
      renderResults();
    });
    document.getElementById("clear-search-btn").addEventListener("click", function () {
      document.getElementById("search-phrase-input").value = "";
      currentPage = 1;
      renderResults();
    });
    document.getElementById("search-phrase-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        currentPage = 1;
        renderResults();
      }
    });
    document.getElementById("reset_button").addEventListener("click", function (e) {
      e.preventDefault();
      document.getElementById("search-phrase-input").value = "";
      Object.keys(filters).forEach(function (k) {
        if (filters[k]) filters[k].clear();
      });
      currentPage = 1;
      orderCategory = "objective";
      order = "asc";
      renderResults();
    });
  }

  function boot() {
    fetch("data/indicators.json")
      .then(function (r) {
        if (!r.ok) throw new Error("Failed to load indicators.json (" + r.status + ")");
        return r.json();
      })
      .then(function (data) {
        defaultSourceLinks = data.default_source_links || {};
        allIndicators = (data.indicators || []).map(function (ind) {
          ind._search = buildSearchBlob(ind);
          return ind;
        });
        initFilters();
        bindChrome();
        renderResults();
      })
      .catch(function (err) {
        document.getElementById("results").innerHTML =
          '<p class="stats-line text-danger">Could not load indicator data: ' +
          escapeHtml(err.message) +
          ". Serve this folder over HTTP (e.g. <code>python3 -m http.server -d docs</code>).</p>";
        console.error(err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
